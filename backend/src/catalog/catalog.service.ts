import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

type ImportRow = {
  local: string;
  operation: string;
  code: string;
  description: string;
};

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  private normalizeKey(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private normalizeNullable(value: string): string {
    return (value || '').trim();
  }

  private parseDelimitedLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result.map((item) => item.replace(/^"|"$/g, '').trim());
  }

  private mapHeaderIndexes(headers: string[]) {
    const headerMap = new Map<string, number>();
    headers.forEach((header, index) => {
      headerMap.set(this.normalizeKey(header), index);
    });

    const findIndex = (candidates: string[]) => {
      for (const candidate of candidates) {
        const idx = headerMap.get(this.normalizeKey(candidate));
        if (idx !== undefined) return idx;
      }
      return -1;
    };

    const localIdx = findIndex(['Local', 'Setor']);
    const operationIdx = findIndex(['Operacao', 'Operação', 'Subsecao', 'Subseção']);
    const codeIdx = findIndex(['Codigo Nimbi', 'Código Nimbi', 'Codigo', 'Código']);
    const descriptionIdx = findIndex([
      'Descricao dos Equipamentos',
      'Descrição dos Equipamentos',
      'Descricao',
      'Descrição',
      'Equipamento',
    ]);

    if (localIdx < 0 || operationIdx < 0 || descriptionIdx < 0) {
      throw new BadRequestException(
        'Cabecalho invalido. Colunas obrigatorias: Local, Operacao e Descricao dos Equipamentos. Codigo Nimbi e opcional.',
      );
    }

    return { localIdx, operationIdx, codeIdx, descriptionIdx };
  }

  private parseCsvRows(buffer: Buffer): ImportRow[] {
    const content = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return [];

    const firstLine = lines[0];
    const delimiter =
      (firstLine.match(/\t/g) || []).length >= (firstLine.match(/;/g) || []).length
        ? '\t'
        : (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length
          ? ';'
          : ',';

    const headers = this.parseDelimitedLine(lines[0], delimiter);
    const indexes = this.mapHeaderIndexes(headers);

    const rows: ImportRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseDelimitedLine(lines[i], delimiter);
      rows.push({
        local: this.normalizeNullable(cols[indexes.localIdx] || ''),
        operation: this.normalizeNullable(cols[indexes.operationIdx] || ''),
        code: this.normalizeNullable(indexes.codeIdx >= 0 ? cols[indexes.codeIdx] || '' : ''),
        description: this.normalizeNullable(cols[indexes.descriptionIdx] || ''),
      });
    }

    return rows;
  }

  private async parseXlsxRows(buffer: Buffer): Promise<ImportRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const headerValues = (sheet.getRow(1).values as any[]).slice(1).map((value) => String(value ?? '').trim());
    const indexes = this.mapHeaderIndexes(headerValues);

    const rows: ImportRow[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const values = (row.values as any[]).slice(1).map((value) => String(value ?? '').trim());

      const local = this.normalizeNullable(values[indexes.localIdx] || '');
      const operation = this.normalizeNullable(values[indexes.operationIdx] || '');
      const code = this.normalizeNullable(indexes.codeIdx >= 0 ? values[indexes.codeIdx] || '' : '');
      const description = this.normalizeNullable(values[indexes.descriptionIdx] || '');

      if (!local && !operation && !description && !code) continue;

      rows.push({ local, operation, code, description });
    }

    return rows;
  }

  private async parseImportRows(fileName: string, buffer: Buffer): Promise<ImportRow[]> {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
      return this.parseCsvRows(buffer);
    }
    if (lower.endsWith('.xlsx')) {
      return this.parseXlsxRows(buffer);
    }
    throw new BadRequestException('Formato nao suportado. Use CSV ou XLSX.');
  }

  async importCatalog(fileName: string, buffer: Buffer) {
    const rows = await this.parseImportRows(fileName, buffer);
    if (rows.length === 0) {
      throw new BadRequestException('Arquivo sem dados validos para importacao.');
    }

    let localsCreated = 0;
    let operationsCreated = 0;
    let equipmentsCreated = 0;
    let equipmentsUpdated = 0;
    let rowsSkipped = 0;
    const errors: string[] = [];

    for (let index = 0; index < rows.length; index++) {
      const rowNumber = index + 2;
      const row = rows[index];

      if (!row.local || !row.operation || !row.description) {
        rowsSkipped++;
        errors.push(`Linha ${rowNumber}: local, operacao ou descricao ausente.`);
        continue;
      }

      try {
        const localNorm = this.normalizeKey(row.local);
        const operationNorm = this.normalizeKey(row.operation);
        const codeNorm = this.normalizeKey(row.code);
        const descNorm = this.normalizeKey(row.description);

        const existingLocals = await this.prisma.localCatalog.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        });
        let local = existingLocals.find((item) => this.normalizeKey(item.name) === localNorm);
        if (!local) {
          const maxLocalOrder = await this.prisma.localCatalog.aggregate({ _max: { sortOrder: true } });
          local = await this.prisma.localCatalog.create({
            data: {
              name: row.local,
              sortOrder: (maxLocalOrder._max.sortOrder ?? -1) + 1,
              isActive: true,
            },
          });
          localsCreated++;
        }

        const existingOperations = await this.prisma.operationCatalog.findMany({
          where: { localId: local.id, isActive: true },
          orderBy: { sortOrder: 'asc' },
        });
        let operation = existingOperations.find((item) => this.normalizeKey(item.name) === operationNorm);
        if (!operation) {
          const maxOperationOrder = await this.prisma.operationCatalog.aggregate({
            _max: { sortOrder: true },
            where: { localId: local.id },
          });
          operation = await this.prisma.operationCatalog.create({
            data: {
              localId: local.id,
              name: row.operation,
              sortOrder: (maxOperationOrder._max.sortOrder ?? -1) + 1,
              isActive: true,
            },
          });
          operationsCreated++;
        }

        const existingEquipments = await this.prisma.equipmentCatalog.findMany({
          where: { operationId: operation.id },
          orderBy: { sortOrder: 'asc' },
        });

        const equipment = existingEquipments.find((item) => {
          const itemCode = this.normalizeKey(item.code || '');
          const itemDesc = this.normalizeKey(item.description || '');
          if (codeNorm) {
            return itemCode === codeNorm;
          }
          return itemCode === '' && itemDesc === descNorm;
        });

        if (!equipment) {
          const maxEquipmentOrder = await this.prisma.equipmentCatalog.aggregate({
            _max: { sortOrder: true },
            where: { operationId: operation.id },
          });
          await this.prisma.equipmentCatalog.create({
            data: {
              operationId: operation.id,
              code: row.code || '',
              description: row.description,
              baseQuantity: 0,
              autoConfigFieldId: null,
              autoMultiplier: 1,
              sortOrder: (maxEquipmentOrder._max.sortOrder ?? -1) + 1,
              isActive: true,
            },
          });
          equipmentsCreated++;
        } else {
          await this.prisma.equipmentCatalog.update({
            where: { id: equipment.id },
            data: {
              code: row.code || equipment.code || '',
              description: row.description,
              isActive: true,
            },
          });
          equipmentsUpdated++;
        }
      } catch (error) {
        rowsSkipped++;
        errors.push(`Linha ${rowNumber}: erro ao importar.`);
      }
    }

    return {
      rowsProcessed: rows.length,
      rowsSkipped,
      localsCreated,
      operationsCreated,
      equipmentsCreated,
      equipmentsUpdated,
      errors: errors.slice(0, 50),
    };
  }

  async getTree() {
    return this.prisma.localCatalog.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        operations: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            equipments: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                autoConfigField: {
                  select: { id: true, label: true },
                },
              },
            },
          },
        },
      },
    });
  }

  async findLocals() {
    return this.prisma.localCatalog.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        operations: {
          orderBy: { sortOrder: 'asc' },
          include: {
            equipments: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });
  }

  async createLocal(data: { name: string }) {
    const name = data?.name?.trim();
    if (!name) throw new BadRequestException('Nome do local e obrigatorio.');

    const maxOrder = await this.prisma.localCatalog.aggregate({ _max: { sortOrder: true } });
    const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    return this.prisma.localCatalog.create({
      data: { name, sortOrder: nextOrder, isActive: true },
    });
  }

  async updateLocal(id: string, data: { name?: string; isActive?: boolean }) {
    const current = await this.prisma.localCatalog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Local nao encontrado.');

    const payload: { name?: string; isActive?: boolean } = {};
    if (typeof data.name === 'string') {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('Nome do local e obrigatorio.');
      payload.name = name;
    }
    if (typeof data.isActive === 'boolean') payload.isActive = data.isActive;

    return this.prisma.localCatalog.update({
      where: { id },
      data: payload,
    });
  }

  async removeLocal(id: string) {
    const current = await this.prisma.localCatalog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Local nao encontrado.');

    return this.prisma.localCatalog.delete({ where: { id } });
  }

  async createOperation(data: { localId: string; name: string }) {
    const name = data?.name?.trim();
    if (!name) throw new BadRequestException('Nome da operacao e obrigatorio.');

    const local = await this.prisma.localCatalog.findUnique({ where: { id: data.localId } });
    if (!local) throw new NotFoundException('Local nao encontrado.');

    const maxOrder = await this.prisma.operationCatalog.aggregate({
      _max: { sortOrder: true },
      where: { localId: data.localId },
    });
    const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    return this.prisma.operationCatalog.create({
      data: {
        localId: data.localId,
        name,
        sortOrder: nextOrder,
        isActive: true,
      },
    });
  }

  async updateOperation(id: string, data: { name?: string; isActive?: boolean }) {
    const current = await this.prisma.operationCatalog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Operacao nao encontrada.');

    const payload: { name?: string; isActive?: boolean } = {};
    if (typeof data.name === 'string') {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('Nome da operacao e obrigatorio.');
      payload.name = name;
    }
    if (typeof data.isActive === 'boolean') payload.isActive = data.isActive;

    return this.prisma.operationCatalog.update({
      where: { id },
      data: payload,
    });
  }

  async removeOperation(id: string) {
    const current = await this.prisma.operationCatalog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Operacao nao encontrada.');

    return this.prisma.operationCatalog.delete({ where: { id } });
  }

  async createEquipment(data: {
    operationId: string;
    code: string;
    description: string;
    baseQuantity?: number;
    autoConfigFieldId?: string | null;
    autoMultiplier?: number;
  }) {
    const code = data?.code?.trim() || '';
    const description = data?.description?.trim();
    if (!description) throw new BadRequestException('Descricao do equipamento e obrigatoria.');

    const operation = await this.prisma.operationCatalog.findUnique({ where: { id: data.operationId } });
    if (!operation) throw new NotFoundException('Operacao nao encontrada.');

    if (data.autoConfigFieldId) {
      const field = await this.prisma.projectHeaderField.findUnique({ where: { id: data.autoConfigFieldId } });
      if (!field) throw new NotFoundException('Campo de configuracao nao encontrado.');
    }

    const maxOrder = await this.prisma.equipmentCatalog.aggregate({
      _max: { sortOrder: true },
      where: { operationId: data.operationId },
    });
    const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    return this.prisma.equipmentCatalog.create({
      data: {
        operationId: data.operationId,
        code,
        description,
        baseQuantity: Number(data.baseQuantity ?? 0),
        autoConfigFieldId: data.autoConfigFieldId || null,
        autoMultiplier: Number(data.autoMultiplier ?? 1),
        sortOrder: nextOrder,
        isActive: true,
      },
      include: {
        autoConfigField: {
          select: { id: true, label: true },
        },
      },
    });
  }

  async updateEquipment(
    id: string,
    data: {
      code?: string;
      description?: string;
      baseQuantity?: number;
      autoConfigFieldId?: string | null;
      autoMultiplier?: number;
      isActive?: boolean;
    },
  ) {
    const current = await this.prisma.equipmentCatalog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Equipamento nao encontrado.');

    if (data.autoConfigFieldId) {
      const field = await this.prisma.projectHeaderField.findUnique({ where: { id: data.autoConfigFieldId } });
      if (!field) throw new NotFoundException('Campo de configuracao nao encontrado.');
    }

    const payload: {
      code?: string;
      description?: string;
      baseQuantity?: number;
      autoConfigFieldId?: string | null;
      autoMultiplier?: number;
      isActive?: boolean;
    } = {};

    if (typeof data.code === 'string') payload.code = data.code.trim();
    if (typeof data.description === 'string') {
      const description = data.description.trim();
      if (!description) throw new BadRequestException('Descricao do equipamento e obrigatoria.');
      payload.description = description;
    }
    if (typeof data.baseQuantity === 'number') payload.baseQuantity = Number(data.baseQuantity);
    if (data.autoConfigFieldId !== undefined) payload.autoConfigFieldId = data.autoConfigFieldId || null;
    if (typeof data.autoMultiplier === 'number') payload.autoMultiplier = Number(data.autoMultiplier);
    if (typeof data.isActive === 'boolean') payload.isActive = data.isActive;

    return this.prisma.equipmentCatalog.update({
      where: { id },
      data: payload,
      include: {
        autoConfigField: {
          select: { id: true, label: true },
        },
      },
    });
  }

  async removeEquipment(id: string) {
    const current = await this.prisma.equipmentCatalog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Equipamento nao encontrado.');

    return this.prisma.equipmentCatalog.delete({ where: { id } });
  }
}

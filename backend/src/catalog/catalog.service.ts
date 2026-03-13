import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import * as math from 'mathjs';

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

  private normalizeCode(value: string): string {
    const normalized = this.normalizeNullable(value);
    const upper = normalized.toUpperCase();
    if (!normalized || upper === 'NULL' || upper === 'NULO' || normalized === '-') {
      return '';
    }
    return normalized;
  }

  private normalizeFormulaExpression(formula?: string | null): string | null {
    const normalized = this.normalizeNullable(formula || '');
    if (!normalized) return null;

    const withIf = normalized
      .replace(/\bse\s*\(/gi, 'if(')
      .replace(/\bou\s*\(/gi, 'or(')
      .replace(/\be\s*\(/gi, 'and(')
      .replace(/;/g, ',');
    const withEq = withIf.replace(/(?<![<>=!])=(?!=)/g, '==');
    return this.rewriteEqualityOperators(withEq);
  }

  private rewriteEqualityOperators(expression: string): string {
    const operand =
      '(?:__token_\\d+|[A-Za-z_][A-Za-z0-9_]*|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|-?\\d+(?:\\.\\d+)?)';

    const neqRegex = new RegExp(`(${operand})\\s*!=\\s*(${operand})`, 'g');
    const eqRegex = new RegExp(`(${operand})\\s*==\\s*(${operand})`, 'g');

    return expression.replace(neqRegex, 'neq($1,$2)').replace(eqRegex, 'eq($1,$2)');
  }

  private validateFormulaExpression(formula: string) {
    const withPlaceholders = formula.replace(/\{\{\s*[^}]+\s*\}\}|\{\s*[^{}]+\s*\}/g, '1');
    try {
      math.parse(withPlaceholders);
    } catch (error: any) {
      const details = String(error?.message || 'erro de sintaxe');
      const hasUnexpectedComma = /Unexpected operator ,/i.test(details);
      const hint = hasUnexpectedComma
        ? ' Use: Se(condicao, valor_se_verdadeiro, valor_se_falso).'
        : '';
      throw new BadRequestException(`Formula de auto preenchimento invalida: ${details}.${hint}`);
    }
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
      return null;
    }

    return { localIdx, operationIdx, codeIdx, descriptionIdx } as const;
  }

  private parseCsvContent(contentRaw: string): ImportRow[] {
    const content = contentRaw.replace(/^\uFEFF/, '');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return [];

    const sample = lines.slice(0, Math.min(lines.length, 5)).join('\n');
    const delimiterScores = [
      { delimiter: '\t', score: (sample.match(/\t/g) || []).length },
      { delimiter: ';', score: (sample.match(/;/g) || []).length },
      { delimiter: ',', score: (sample.match(/,/g) || []).length },
    ];
    delimiterScores.sort((a, b) => b.score - a.score);
    const delimiter = delimiterScores[0].delimiter;

    let headerLineIndex = -1;
    let indexes: ReturnType<typeof this.mapHeaderIndexes> = null;

    // Alguns CSVs possuem linhas antes do cabecalho (ex.: "sep=,").
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const headers = this.parseDelimitedLine(lines[i], delimiter);
      const mapped = this.mapHeaderIndexes(headers);
      if (mapped) {
        headerLineIndex = i;
        indexes = mapped;
        break;
      }
    }

    if (!indexes) {
      throw new BadRequestException(
        'Cabecalho invalido. Colunas obrigatorias: Local, Operacao e Descricao dos Equipamentos. Codigo Nimbi e opcional.',
      );
    }

    const rows: ImportRow[] = [];
    for (let i = headerLineIndex + 1; i < lines.length; i++) {
      const cols = this.parseDelimitedLine(lines[i], delimiter);
      rows.push({
        local: this.normalizeNullable(cols[indexes.localIdx] || ''),
        operation: this.normalizeNullable(cols[indexes.operationIdx] || ''),
        code: this.normalizeCode(indexes.codeIdx >= 0 ? cols[indexes.codeIdx] || '' : ''),
        description: this.normalizeNullable(cols[indexes.descriptionIdx] || ''),
      });
    }

    return rows;
  }

  private parseCsvRows(buffer: Buffer): ImportRow[] {
    const attempts = ['utf8', 'latin1'] as const;
    let lastError: unknown;

    for (const encoding of attempts) {
      try {
        const content = buffer.toString(encoding);
        const rows = this.parseCsvContent(content);
        if (rows.length > 0) return rows;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new BadRequestException('Nao foi possivel ler o CSV. Verifique a codificacao do arquivo.');
  }

  private async parseXlsxRows(buffer: Buffer): Promise<ImportRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    let headerRowIndex = -1;
    let indexes: ReturnType<typeof this.mapHeaderIndexes> = null;

    for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
      const headerValues = (sheet.getRow(r).values as any[]).slice(1).map((value) => String(value ?? '').trim());
      const mapped = this.mapHeaderIndexes(headerValues);
      if (mapped) {
        headerRowIndex = r;
        indexes = mapped;
        break;
      }
    }

    if (!indexes) {
      throw new BadRequestException(
        'Cabecalho invalido. Colunas obrigatorias: Local, Operacao e Descricao dos Equipamentos. Codigo Nimbi e opcional.',
      );
    }

    const rows: ImportRow[] = [];
    for (let r = headerRowIndex + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const values = (row.values as any[]).slice(1).map((value) => String(value ?? '').trim());

      const local = this.normalizeNullable(values[indexes.localIdx] || '');
      const operation = this.normalizeNullable(values[indexes.operationIdx] || '');
      const code = this.normalizeCode(indexes.codeIdx >= 0 ? values[indexes.codeIdx] || '' : '');
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

  async clearCatalog() {
    const [localsCount, operationsCount, equipmentsCount] = await Promise.all([
      this.prisma.localCatalog.count(),
      this.prisma.operationCatalog.count(),
      this.prisma.equipmentCatalog.count(),
    ]);

    await this.prisma.localCatalog.deleteMany({});

    return {
      cleared: true,
      deletedLocals: localsCount,
      deletedOperations: operationsCount,
      deletedEquipments: equipmentsCount,
    };
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
    autoFormulaExpression?: string | null;
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

    const normalizedAutoFormula = this.normalizeFormulaExpression(data.autoFormulaExpression);
    if (normalizedAutoFormula) {
      this.validateFormulaExpression(normalizedAutoFormula);
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
        autoFormulaExpression: normalizedAutoFormula,
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
      autoFormulaExpression?: string | null;
      isActive?: boolean;
    },
  ) {
    const current = await this.prisma.equipmentCatalog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Equipamento nao encontrado.');

    if (data.autoConfigFieldId) {
      const field = await this.prisma.projectHeaderField.findUnique({ where: { id: data.autoConfigFieldId } });
      if (!field) throw new NotFoundException('Campo de configuracao nao encontrado.');
    }

    const normalizedAutoFormula =
      data.autoFormulaExpression === undefined
        ? undefined
        : this.normalizeFormulaExpression(data.autoFormulaExpression);
    if (normalizedAutoFormula) {
      this.validateFormulaExpression(normalizedAutoFormula);
    }

    const payload: {
      code?: string;
      description?: string;
      baseQuantity?: number;
      autoConfigFieldId?: string | null;
      autoMultiplier?: number;
      autoFormulaExpression?: string | null;
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
    if (normalizedAutoFormula !== undefined) payload.autoFormulaExpression = normalizedAutoFormula;
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

  private normalizeFieldAlias(label: string): string {
    return label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  private parseFormulaValue(value: unknown): string | number | boolean {
    if (typeof value === 'number' || typeof value === 'boolean') return value;

    const text = this.normalizeNullable(String(value ?? ''));
    if (!text) return '';

    const lower = text.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;

    const parsed = Number(text.replace(',', '.'));
    if (!Number.isNaN(parsed)) return parsed;

    return text;
  }

  private isEqual(left: unknown, right: unknown): boolean {
    const a = this.parseFormulaValue(left);
    const b = this.parseFormulaValue(right);

    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
    return String(a) === String(b);
  }

  private getFieldDefault(field: { defaultValue?: string | null; options?: unknown; type?: string }) {
    if (field.defaultValue && this.normalizeNullable(field.defaultValue)) {
      return this.parseFormulaValue(field.defaultValue);
    }

    if (field.type === 'SELECT' && Array.isArray(field.options) && field.options.length > 0) {
      return this.parseFormulaValue(field.options[0]);
    }

    return '';
  }

  async validateAutoFormula(formula: string, context: Record<string, unknown> = {}) {
    const normalized = this.normalizeFormulaExpression(formula);
    if (!normalized) {
      return {
        isValid: false,
        normalizedExpression: '',
        recognizedCommands: [],
        recognizedFields: [],
        unknownSymbols: [],
        canEvaluate: false,
        result: null,
        error: 'Formula vazia.',
      };
    }

    let syntaxError: string | null = null;
    try {
      this.validateFormulaExpression(normalized);
    } catch (error: any) {
      syntaxError = this.normalizeNullable(error?.message || 'erro de sintaxe');
    }

    const original = this.normalizeNullable(formula);
    const commands = new Set<string>();
    if (/\bse\s*\(/i.test(original) || /\bif\s*\(/i.test(normalized)) commands.add('se()');
    if (/\bou\s*\(/i.test(original) || /\bor\s*\(/i.test(normalized)) commands.add('ou()');
    if (/\be\s*\(/i.test(original) || /\band\s*\(/i.test(normalized)) commands.add('e()');

    const fields = await this.prisma.projectHeaderField.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        label: true,
        type: true,
        options: true,
        defaultValue: true,
      },
    });

    const fieldLookup = new Map<string, (typeof fields)[number]>();
    for (const field of fields) {
      const label = this.normalizeNullable(field.label);
      const lower = label.toLowerCase();
      const alias = this.normalizeFieldAlias(label);
      const aliasRaw = label
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

      fieldLookup.set(field.id, field);
      fieldLookup.set(label, field);
      fieldLookup.set(lower, field);
      if (alias) fieldLookup.set(alias, field);
      if (aliasRaw) fieldLookup.set(aliasRaw, field);
    }

    const scope: Record<string, unknown> = {
      if: (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),
      se: (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),
      and: (...args: unknown[]) => args.every((value) => Boolean(value)),
      e: (...args: unknown[]) => args.every((value) => Boolean(value)),
      or: (...args: unknown[]) => args.some((value) => Boolean(value)),
      ou: (...args: unknown[]) => args.some((value) => Boolean(value)),
      eq: (left: unknown, right: unknown) => this.isEqual(left, right),
      neq: (left: unknown, right: unknown) => !this.isEqual(left, right),
    };

    const resolveByField = (field: (typeof fields)[number]) => {
      const ctxCandidates = [
        field.id,
        field.label,
        field.label.toLowerCase(),
        this.normalizeFieldAlias(field.label),
        field.label
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, ''),
      ];

      for (const key of ctxCandidates) {
        if (key in context) {
          return this.parseFormulaValue(context[key]);
        }
      }

      return this.getFieldDefault(field);
    };

    const tokenBindings = new Map<string, unknown>();
    let tokenIndex = 0;
    const expressionWithTokens = normalized.replace(
      /\{\{\s*([^}]+)\s*\}\}|\{\s*([^{}]+)\s*\}/g,
      (_match, tokenDouble, tokenSingle) => {
        const key = this.normalizeNullable(tokenDouble ?? tokenSingle);
        const varName = `__token_${tokenIndex++}`;

        const directField =
          fieldLookup.get(key) ||
          fieldLookup.get(key.toLowerCase()) ||
          fieldLookup.get(this.normalizeFieldAlias(key));
        if (directField) {
          tokenBindings.set(varName, resolveByField(directField));
        } else if (key in context) {
          tokenBindings.set(varName, this.parseFormulaValue(context[key]));
        } else {
          tokenBindings.set(varName, '');
        }

        return varName;
      },
    );

    tokenBindings.forEach((value, key) => {
      scope[key] = value;
    });

    let ast: any = null;
    let parseError: string | null = null;
    try {
      ast = math.parse(expressionWithTokens);
    } catch (error: any) {
      parseError = this.normalizeNullable(error?.message || 'erro ao interpretar formula');
    }

    const symbols = new Set<string>();
    if (ast) {
      ast.traverse((node: any, _path: string, parent: any) => {
        if (!node?.isSymbolNode) return;

        const name = String(node.name || '');
        if (!name) return;

        const isFunctionNode = Boolean(parent?.isFunctionNode);
        const isFunctionName = isFunctionNode && parent?.fn === node;
        if (isFunctionName) return;

        if (['true', 'false', 'pi', 'e', 'Infinity', 'NaN'].includes(name)) return;
        if (name.startsWith('__token_')) return;

        symbols.add(name);
      });
    } else {
      const rawCandidates = expressionWithTokens.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
      const reserved = new Set([
        'if',
        'se',
        'and',
        'or',
        'e',
        'ou',
        'true',
        'false',
        'pi',
        'Infinity',
        'NaN',
      ]);

      for (const candidate of rawCandidates) {
        if (candidate.startsWith('__token_')) continue;
        if (reserved.has(candidate)) continue;
        symbols.add(candidate);
      }
    }

    const matchedFieldIds = new Set<string>();
    const unknownSymbols: string[] = [];

    for (const symbol of symbols) {
      const field =
        fieldLookup.get(symbol) ||
        fieldLookup.get(symbol.toLowerCase()) ||
        fieldLookup.get(this.normalizeFieldAlias(symbol));

      if (field) {
        matchedFieldIds.add(field.id);
        scope[symbol] = resolveByField(field);
        scope[this.normalizeFieldAlias(field.label)] = scope[symbol];
        continue;
      }

      if (symbol in context) {
        scope[symbol] = this.parseFormulaValue(context[symbol]);
        continue;
      }

      unknownSymbols.push(symbol);
    }

    let result: unknown = null;
    let evaluationError: string | null = null;

    if (!syntaxError && !parseError && unknownSymbols.length === 0) {
      try {
        const compiled = math.compile(expressionWithTokens);
        result = compiled.evaluate(scope as any);
      } catch (error: any) {
        evaluationError = error?.message || 'erro ao avaliar formula';
      }
    }

    const finalError = syntaxError || parseError || evaluationError;

    return {
      isValid: unknownSymbols.length === 0 && !finalError,
      normalizedExpression: normalized,
      recognizedCommands: Array.from(commands),
      recognizedFields: fields.filter((field) => matchedFieldIds.has(field.id)).map((field) => ({
        id: field.id,
        label: field.label,
      })),
      unknownSymbols,
      canEvaluate: !syntaxError && !parseError && unknownSymbols.length === 0,
      result,
      error: finalError,
    };
  }

  async removeEquipment(id: string) {
    const current = await this.prisma.equipmentCatalog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Equipamento nao encontrado.');

    return this.prisma.equipmentCatalog.delete({ where: { id } });
  }
}

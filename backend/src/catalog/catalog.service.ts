import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

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
    const code = data?.code?.trim();
    const description = data?.description?.trim();
    if (!code) throw new BadRequestException('Codigo do equipamento e obrigatorio.');
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

    if (typeof data.code === 'string') {
      const code = data.code.trim();
      if (!code) throw new BadRequestException('Codigo do equipamento e obrigatorio.');
      payload.code = code;
    }
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

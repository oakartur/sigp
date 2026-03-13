import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormulasService } from '../formulas/formulas.service';
import { Prisma, RequisitionItem } from '@prisma/client';

@Injectable()
export class RequisitionsService {
  constructor(
    private prisma: PrismaService,
    private formulasService: FormulasService,
  ) {}

  private normalizeVersion(version: string | undefined, fallback: string): string {
    const normalized = version?.trim();
    return normalized && normalized.length > 0 ? normalized : fallback;
  }

  private async buildDefaultVersion(projectId: string): Promise<string> {
    const count = await this.prisma.requisition.count({ where: { projectId } });
    return `V${count + 1}`;
  }

  private async syncProjectConfigs(
    tx: Prisma.TransactionClient,
    requisitionId: string,
    sourceRequisitionId?: string,
  ) {
    const headerFields = await tx.projectHeaderField.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (headerFields.length === 0) {
      return [];
    }

    const existingConfigs = await tx.requisitionProjectConfig.findMany({
      where: { requisitionId },
    });
    const existingFieldIds = new Set(existingConfigs.map((config: any) => config.fieldId));

    const sourceMap = new Map<string, string | null>();
    if (sourceRequisitionId) {
      const sourceConfigs = await tx.requisitionProjectConfig.findMany({
        where: { requisitionId: sourceRequisitionId },
      });
      sourceConfigs.forEach((sourceConfig: any) => {
        sourceMap.set(sourceConfig.fieldId, sourceConfig.value ?? null);
      });
    }

    const missingConfigs = headerFields
      .filter((field) => !existingFieldIds.has(field.id))
      .map((field) => ({
        requisitionId,
        fieldId: field.id,
        value: sourceMap.get(field.id) ?? '',
      }));

    if (missingConfigs.length > 0) {
      await tx.requisitionProjectConfig.createMany({
        data: missingConfigs,
      });
    }

    return tx.requisitionProjectConfig.findMany({
      where: {
        requisitionId,
        field: { isActive: true },
      },
      include: { field: true },
      orderBy: [{ field: { sortOrder: 'asc' } }],
    });
  }

  private async createItemsFromCatalog(tx: Prisma.TransactionClient, requisitionId: string) {
    const equipments = await tx.equipmentCatalog.findMany({
      where: {
        isActive: true,
        operation: {
          isActive: true,
          local: { isActive: true },
        },
      },
      include: {
        operation: {
          include: {
            local: true,
          },
        },
      },
    });

    if (equipments.length === 0) return;

    const orderedEquipments = [...equipments].sort((a, b) => {
      if (a.operation.local.sortOrder !== b.operation.local.sortOrder) {
        return a.operation.local.sortOrder - b.operation.local.sortOrder;
      }
      if (a.operation.sortOrder !== b.operation.sortOrder) {
        return a.operation.sortOrder - b.operation.sortOrder;
      }
      return a.sortOrder - b.sortOrder;
    });

    await tx.requisitionItem.createMany({
      data: orderedEquipments.map((equipment) => ({
        requisitionId,
        equipmentCatalogId: equipment.id,
        localName: equipment.operation.local.name,
        operationName: equipment.operation.name,
        equipmentCode: equipment.code,
        equipmentName: equipment.description,
        manualQuantity: equipment.baseQuantity,
        status: 'PENDING' as const,
      })),
    });
  }

  async createInitialRequisition(projectId: string, version?: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projeto nao encontrado.');

    const defaultVersion = await this.buildDefaultVersion(projectId);
    const normalizedVersion = this.normalizeVersion(version, defaultVersion);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const requisition = await tx.requisition.create({
        data: {
          projectId,
          version: normalizedVersion,
          status: 'FILLING',
        },
      });

      await this.syncProjectConfigs(tx, requisition.id);
      await this.createItemsFromCatalog(tx, requisition.id);
      return requisition;
    });
  }

  async completeRequisition(id: string, currentLock: number) {
    const req = await this.prisma.requisition.findUnique({ where: { id } });
    if (!req) throw new BadRequestException('Requisicao nao encontrada.');
    if (req.versionLock !== currentLock) {
      throw new ConflictException('Conflito de concorrencia. Atualize a tela.');
    }

    return this.prisma.requisition.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        isReadOnly: true,
        versionLock: { increment: 1 },
      },
    });
  }

  async createSnapshot(existingId: string, version?: string) {
    const req = await this.prisma.requisition.findUnique({
      where: { id: existingId },
      include: { items: true },
    });
    if (!req) throw new BadRequestException('Requisicao de origem nao encontrada.');

    const defaultVersion = await this.buildDefaultVersion(req.projectId);
    const normalizedVersion = this.normalizeVersion(version, defaultVersion);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newReq = await tx.requisition.create({
        data: {
          projectId: req.projectId,
          version: normalizedVersion,
          status: 'FILLING',
          isReadOnly: false,
        },
      });

      if (req.items.length > 0) {
        await tx.requisitionItem.createMany({
          data: req.items.map((item: RequisitionItem & {
            equipmentCatalogId?: string | null;
            localName?: string | null;
            operationName?: string | null;
            equipmentCode?: string | null;
            manualQuantity?: number | null;
          }) => ({
            requisitionId: newReq.id,
            equipmentCatalogId: item.equipmentCatalogId ?? null,
            localName: item.localName ?? null,
            operationName: item.operationName ?? null,
            equipmentCode: item.equipmentCode ?? null,
            equipmentName: item.equipmentName,
            manualQuantity: item.manualQuantity ?? null,
            formulaId: item.formulaId,
            variablesPayload: item.variablesPayload ?? undefined,
            calculatedValue: item.calculatedValue,
            overrideValue: item.overrideValue,
            status: 'PENDING' as const,
          })),
        });
      } else {
        await this.createItemsFromCatalog(tx, newReq.id);
      }

      await this.syncProjectConfigs(tx, newReq.id, req.id);
      return newReq;
    });
  }

  async updateVersion(id: string, version: string) {
    const normalizedVersion = version?.trim();
    if (!normalizedVersion) {
      throw new BadRequestException('Versao e obrigatoria.');
    }

    const requisition = await this.prisma.requisition.findUnique({ where: { id } });
    if (!requisition) throw new NotFoundException('Requisicao nao encontrada.');

    return this.prisma.requisition.update({
      where: { id },
      data: {
        version: normalizedVersion,
        versionLock: { increment: 1 },
      },
    });
  }

  async findItems(reqId: string) {
    return this.prisma.requisitionItem.findMany({
      where: { requisitionId: reqId },
      include: {
        equipmentCatalog: {
          include: {
            autoConfigField: { select: { id: true, label: true } },
          },
        },
      },
      orderBy: [{ localName: 'asc' }, { operationName: 'asc' }, { equipmentName: 'asc' }],
    });
  }

  async findProjectConfigs(reqId: string) {
    const requisition = await this.prisma.requisition.findUnique({ where: { id: reqId } });
    if (!requisition) throw new NotFoundException('Requisicao nao encontrada.');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return this.syncProjectConfigs(tx, reqId);
    });
  }

  async upsertProjectConfigs(reqId: string, configs: Array<{ fieldId: string; value: string }>) {
    const requisition = await this.prisma.requisition.findUnique({ where: { id: reqId } });
    if (!requisition) throw new NotFoundException('Requisicao nao encontrada.');
    if (requisition.isReadOnly) {
      throw new BadRequestException('Requisicao em modo somente leitura.');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const config of configs) {
        if (!config.fieldId) continue;

        await tx.requisitionProjectConfig.upsert({
          where: {
            requisitionId_fieldId: {
              requisitionId: reqId,
              fieldId: config.fieldId,
            },
          },
          create: {
            requisitionId: reqId,
            fieldId: config.fieldId,
            value: config.value ?? '',
          },
          update: {
            value: config.value ?? '',
          },
        });
      }
    });

    return this.findProjectConfigs(reqId);
  }

  async autoFillItemsFromProjectConfigs(reqId: string) {
    const requisition = await this.prisma.requisition.findUnique({ where: { id: reqId } });
    if (!requisition) throw new NotFoundException('Requisicao nao encontrada.');
    if (requisition.isReadOnly) {
      throw new BadRequestException('Requisicao em modo somente leitura.');
    }

    const configs = await this.prisma.requisitionProjectConfig.findMany({
      where: { requisitionId: reqId },
    });
    const configMap = new Map<string, number>();
    for (const config of configs) {
      if (!config.fieldId) continue;
      const parsed = Number(String(config.value ?? '').replace(',', '.'));
      if (!Number.isNaN(parsed)) {
        configMap.set(config.fieldId, parsed);
      }
    }

    const items = await this.prisma.requisitionItem.findMany({
      where: { requisitionId: reqId, equipmentCatalogId: { not: null } },
      include: { equipmentCatalog: true },
    });

    for (const item of items as any[]) {
      const catalog = item.equipmentCatalog;
      if (!catalog || !catalog.autoConfigFieldId) continue;

      const configValue = configMap.get(catalog.autoConfigFieldId);
      if (configValue === undefined) continue;

      const base = catalog.baseQuantity && catalog.baseQuantity !== 0 ? catalog.baseQuantity : 1;
      const multiplier = catalog.autoMultiplier ?? 1;
      const calculatedValue = configValue * base * multiplier;

      await this.prisma.requisitionItem.update({
        where: { id: item.id },
        data: {
          calculatedValue,
          versionLock: { increment: 1 },
        },
      });
    }

    return this.findItems(reqId);
  }

  async addItem(reqId: string, payload: any) {
    const req = await this.prisma.requisition.findUnique({ where: { id: reqId } });
    if (!req) throw new NotFoundException('Requisicao nao encontrada.');
    if (req.isReadOnly) throw new BadRequestException('Requisicao congelada (somente leitura).');

    let calculatedValue: number | null = null;
    if (payload.formulaId && payload.variables) {
      const formula = await this.prisma.formula.findUnique({ where: { id: payload.formulaId } });
      if (formula) {
        calculatedValue = this.formulasService.evaluateFormula(formula.expression, payload.variables);
      }
    }

    return this.prisma.requisitionItem.create({
      data: {
        requisitionId: reqId,
        localName: payload.localName,
        operationName: payload.operationName,
        equipmentCode: payload.equipmentCode,
        equipmentName: payload.equipmentName,
        manualQuantity: payload.manualQuantity ? Number(payload.manualQuantity) : null,
        formulaId: payload.formulaId,
        variablesPayload: payload.variables ? payload.variables : undefined,
        calculatedValue,
      },
    });
  }

  async updateItemQuantity(itemId: string, manualQuantity: number | null, currentLock: number) {
    const item = await this.prisma.requisitionItem.findUnique({
      where: { id: itemId },
      include: { requisition: true },
    });
    if (!item) throw new BadRequestException('Item nao encontrado.');
    if (item.versionLock !== currentLock) {
      throw new ConflictException('Conflito de edicao no item.');
    }
    if (item.requisition.isReadOnly) {
      throw new BadRequestException('Requisicao em modo somente leitura.');
    }

    return this.prisma.requisitionItem.update({
      where: { id: itemId },
      data: {
        manualQuantity: manualQuantity === null ? null : Number(manualQuantity),
        versionLock: { increment: 1 },
      },
    });
  }

  async adminOverrideItem(itemId: string, overrideValue: number, currentLock: number) {
    const item = await this.prisma.requisitionItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('Item nao encontrado.');
    if (item.versionLock !== currentLock) {
      throw new ConflictException('Conflito de edicao no item.');
    }
    return this.prisma.requisitionItem.update({
      where: { id: itemId },
      data: {
        overrideValue,
        versionLock: { increment: 1 },
      },
    });
  }

  async managerReceiveItem(itemId: string, managerId: string, observation: string, currentLock: number) {
    const item = await this.prisma.requisitionItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('Item nao encontrado.');
    if (item.versionLock !== currentLock) {
      throw new ConflictException('O item foi editado por outro usuario. Atualize a lista.');
    }
    return this.prisma.requisitionItem.update({
      where: { id: itemId },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
        receivedById: managerId,
        observation,
        versionLock: { increment: 1 },
      },
    });
  }
}

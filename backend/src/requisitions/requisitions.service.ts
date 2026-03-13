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
    const existingFieldIds = new Set(existingConfigs.map((config) => config.fieldId));

    const sourceMap = new Map<string, string | null>();
    if (sourceRequisitionId) {
      const sourceConfigs = await tx.requisitionProjectConfig.findMany({
        where: { requisitionId: sourceRequisitionId },
      });
      sourceConfigs.forEach((sourceConfig) => {
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
          data: req.items.map((item: RequisitionItem) => ({
            requisitionId: newReq.id,
            equipmentName: item.equipmentName,
            formulaId: item.formulaId,
            variablesPayload: item.variablesPayload ?? undefined,
            calculatedValue: item.calculatedValue,
            overrideValue: item.overrideValue,
            status: 'PENDING' as const,
          })),
        });
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
      orderBy: { equipmentName: 'asc' },
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
        equipmentName: payload.equipmentName,
        formulaId: payload.formulaId,
        variablesPayload: payload.variables ? payload.variables : undefined,
        calculatedValue,
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
      throw new ConflictException('O item foi editado pelo admin. Atualize a lista.');
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

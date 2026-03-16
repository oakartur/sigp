import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormulasService } from '../formulas/formulas.service';
import { Prisma, ProjectHeaderFieldType, ReqStatus, RequisitionItem } from '@prisma/client';
import * as math from 'mathjs';

type ConfigWithField = Prisma.RequisitionProjectConfigGetPayload<{
  include: { field: true };
}>;

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

  private normalizeText(value?: string | null): string {
    return String(value ?? '').trim();
  }

  private normalizeFieldAlias(label: string): string {
    return label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  private normalizeExpression(expression: string): string {
    const trimmed = this.normalizeText(expression);
    const withIf = trimmed
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

  private toComparable(value: unknown): string | number | boolean {
    if (typeof value === 'number' || typeof value === 'boolean') return value;

    const text = this.normalizeText(String(value ?? ''));
    const lower = text.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;

    const parsed = Number(text.replace(',', '.'));
    if (!Number.isNaN(parsed)) return parsed;

    return text;
  }

  private isEqual(left: unknown, right: unknown): boolean {
    const a = this.toComparable(left);
    const b = this.toComparable(right);

    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
    return String(a) === String(b);
  }

  private parseNumber(value?: string | null): number | null {
    const normalized = this.normalizeText(value);
    if (!normalized) return null;

    const parsed = Number(normalized.replace(',', '.'));
    if (Number.isNaN(parsed)) return null;
    return parsed;
  }

  private parseSelectOptions(rawOptions: unknown): string[] {
    if (!Array.isArray(rawOptions)) return [];

    const dedup = new Set<string>();
    const result: string[] = [];
    for (const option of rawOptions) {
      const normalized = this.normalizeText(String(option ?? ''));
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (dedup.has(key)) continue;
      dedup.add(key);
      result.push(normalized);
    }

    return result;
  }

  private normalizeLooseKey(value?: string | null): string {
    return this.normalizeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toLowerCase();
  }

  private isStatusProjectField(label: string): boolean {
    return this.normalizeLooseKey(label) === 'statusdarequisicao';
  }

  private parseReqStatusFromText(value?: string | null): ReqStatus | null {
    const key = this.normalizeLooseKey(value);
    if (!key) return null;

    const pending = new Set(['pending', 'pendente', 'aberta', 'aberto']);
    const filling = new Set(['filling', 'preenchimento', 'empreenchimento', 'andamento', 'emandamento']);
    const completed = new Set(['completed', 'concluida', 'concluido', 'finalizada', 'finalizado', 'completa']);

    if (pending.has(key)) return ReqStatus.PENDING;
    if (filling.has(key)) return ReqStatus.FILLING;
    if (completed.has(key)) return ReqStatus.COMPLETED;
    return null;
  }

  private toStatusFieldValue(status: ReqStatus, fieldOptions: unknown, currentValue?: string | null): string {
    const normalizedCurrent = this.normalizeText(currentValue);
    if (normalizedCurrent && this.parseReqStatusFromText(normalizedCurrent) === status) {
      return normalizedCurrent;
    }

    const options = this.parseSelectOptions(fieldOptions);
    for (const option of options) {
      if (this.parseReqStatusFromText(option) === status) {
        return option;
      }
    }

    if (status === ReqStatus.PENDING) return 'Pending';
    if (status === ReqStatus.FILLING) return 'Filling';
    return 'Completed';
  }

  private async syncRequisitionStatusWithProjectConfig(tx: Prisma.TransactionClient, requisitionId: string) {
    const requisition = await tx.requisition.findUnique({
      where: { id: requisitionId },
      select: { id: true, status: true, isReadOnly: true },
    });
    if (!requisition) {
      throw new NotFoundException('Requisicao nao encontrada.');
    }

    const configs = await tx.requisitionProjectConfig.findMany({
      where: { requisitionId, field: { isActive: true } },
      include: { field: true },
      orderBy: [{ field: { sortOrder: 'asc' } }],
    });

    const statusConfig = configs.find((config) => this.isStatusProjectField(config.field.label));
    if (!statusConfig) {
      return;
    }

    const statusFromConfig = this.parseReqStatusFromText(statusConfig.value);
    let currentStatus = requisition.status;

    if (statusFromConfig && statusFromConfig !== requisition.status) {
      await tx.requisition.update({
        where: { id: requisitionId },
        data: {
          status: statusFromConfig,
          ...(statusFromConfig === ReqStatus.COMPLETED ? { isReadOnly: true } : {}),
          ...(statusFromConfig !== ReqStatus.COMPLETED && requisition.status === ReqStatus.COMPLETED
            ? { isReadOnly: false }
            : {}),
        },
      });
      currentStatus = statusFromConfig;
    }

    const desiredConfigValue = this.toStatusFieldValue(currentStatus, statusConfig.field.options, statusConfig.value);
    if (this.normalizeText(statusConfig.value) !== this.normalizeText(desiredConfigValue)) {
      await tx.requisitionProjectConfig.update({
        where: { id: statusConfig.id },
        data: { value: desiredConfigValue },
      });
    }
  }

  private getFieldDefaultValue(field: {
    type: ProjectHeaderFieldType;
    defaultValue: string | null;
    options: unknown;
  }): string {
    if (field.type === ProjectHeaderFieldType.COMPUTED) {
      return '';
    }

    const normalizedDefault = this.normalizeText(field.defaultValue);
    if (normalizedDefault) {
      return normalizedDefault;
    }

    if (field.type === ProjectHeaderFieldType.SELECT) {
      const options = this.parseSelectOptions(field.options);
      return options[0] ?? '';
    }

    return '';
  }

  private buildFormulaScope(configs: ConfigWithField[]) {
    const scope: Record<string, string | number | boolean> = {
      if: (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),
      SE: (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),
      se: (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),
      and: (...args: unknown[]) => args.every((value) => Boolean(value)),
      or: (...args: unknown[]) => args.some((value) => Boolean(value)),
      E: (...args: unknown[]) => args.every((value) => Boolean(value)),
      OU: (...args: unknown[]) => args.some((value) => Boolean(value)),
      eq: (left: unknown, right: unknown) => this.isEqual(left, right),
      neq: (left: unknown, right: unknown) => !this.isEqual(left, right),
    } as any;

    const valuesByFieldId = new Map<string, string | number | boolean>();
    const valuesByAlias = new Map<string, string | number | boolean>();

    for (const config of configs) {
      const rawValue = this.normalizeText(config.value);
      const numericValue = this.parseNumber(rawValue);
      const normalizedLower = rawValue.toLowerCase();

      let typedValue: string | number | boolean = rawValue;
      if (
        config.field.type === ProjectHeaderFieldType.NUMBER ||
        config.field.type === ProjectHeaderFieldType.COMPUTED
      ) {
        typedValue = numericValue ?? 0;
      } else if (config.field.type === ProjectHeaderFieldType.TEXT && rawValue === '') {
        // Campo textual vazio participa de formulas numericas como zero.
        typedValue = 0;
      } else if (numericValue !== null) {
        typedValue = numericValue;
      } else if (normalizedLower === 'true') {
        typedValue = true;
      } else if (normalizedLower === 'false') {
        typedValue = false;
      }

      valuesByFieldId.set(config.fieldId, typedValue);
      const aliasRaw = config.field.label
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const alias = this.normalizeFieldAlias(config.field.label);

      if (aliasRaw && !(aliasRaw in scope)) {
        scope[aliasRaw] = typedValue;
      }
      if (alias && !valuesByAlias.has(alias)) {
        valuesByAlias.set(alias, typedValue);
      }
      if (alias && !(alias in scope)) {
        scope[alias] = typedValue;
      }

      const idAlias = `f_${config.fieldId.replace(/[^a-zA-Z0-9]+/g, '_')}`;
      scope[idAlias] = typedValue;
    }

    return {
      scope,
      resolveToken: (token: string) => {
        const directId = this.normalizeText(token);
        if (valuesByFieldId.has(directId)) {
          return valuesByFieldId.get(directId);
        }

        const alias = this.normalizeFieldAlias(token);
        if (alias && valuesByAlias.has(alias)) {
          return valuesByAlias.get(alias);
        }

        throw new BadRequestException(`Token de formula nao encontrado: ${token}`);
      },
    };
  }

  private evaluateExpression(expression: string, configs: ConfigWithField[], context: string) {
    const normalizedExpression = this.normalizeExpression(expression);
    if (!normalizedExpression) {
      throw new BadRequestException(`Formula vazia em ${context}.`);
    }

    const { scope, resolveToken } = this.buildFormulaScope(configs);

    let tokenIndex = 0;
    const expressionWithTokens = normalizedExpression.replace(
      /\{\{\s*([^}]+)\s*\}\}|\{\s*([^{}]+)\s*\}/g,
      (_match, tokenDouble, tokenSingle) => {
        const token = tokenDouble ?? tokenSingle;
        const varName = `__token_${tokenIndex++}`;
        scope[varName] = resolveToken(token) as any;
        return varName;
      },
    );

    try {
      const compiled = math.compile(expressionWithTokens);
      return compiled.evaluate(scope as any);
    } catch (error: any) {
      throw new BadRequestException(`Erro ao avaliar formula em ${context}: ${error?.message || 'erro desconhecido'}`);
    }
  }

  private serializeComputedValue(result: unknown): string {
    if (result === null || result === undefined) return '';
    if (typeof result === 'number') {
      if (!Number.isFinite(result)) {
        throw new BadRequestException('Formula calculada retornou numero invalido.');
      }
      return String(result);
    }
    if (typeof result === 'boolean') {
      return result ? '1' : '0';
    }
    if (typeof result === 'string') {
      return result;
    }

    return String(result);
  }

  private toNumericQuantity(result: unknown, context: string): number {
    if (typeof result === 'number') {
      if (!Number.isFinite(result)) {
        throw new BadRequestException(`Formula em ${context} retornou numero invalido.`);
      }
      return result;
    }

    if (typeof result === 'boolean') {
      return result ? 1 : 0;
    }

    const normalized = this.normalizeText(String(result ?? ''));
    if (!normalized) return 0;

    const parsed = Number(normalized.replace(',', '.'));
    if (Number.isNaN(parsed)) {
      throw new BadRequestException(`Formula em ${context} deve retornar numero.`);
    }

    return parsed;
  }

  private async recomputeComputedProjectConfigs(tx: Prisma.TransactionClient, requisitionId: string) {
    const configs = await tx.requisitionProjectConfig.findMany({
      where: {
        requisitionId,
        field: { isActive: true },
      },
      include: { field: true },
      orderBy: [{ field: { sortOrder: 'asc' } }],
    });

    const computedConfigs = configs.filter(
      (config) => config.field.type === ProjectHeaderFieldType.COMPUTED && this.normalizeText(config.field.formulaExpression),
    );

    if (computedConfigs.length === 0) {
      return;
    }

    const changed = new Map<string, string>();
    const formulaErrors = new Map<string, string>();

    for (let pass = 0; pass < configs.length; pass++) {
      let hasChanges = false;

      for (const config of computedConfigs) {
        const formula = this.normalizeText(config.field.formulaExpression);
        if (!formula) continue;

        let nextValue = '';
        try {
          const evaluated = this.evaluateExpression(formula, configs, `campo calculado '${config.field.label}'`);
          nextValue = this.serializeComputedValue(evaluated);
          formulaErrors.delete(config.id);
        } catch (error: any) {
          const message = this.normalizeText(error?.message || '');
          formulaErrors.set(config.id, message || 'erro de formula');
          // Nao derruba a tela de requisicao por erro em um campo calculado.
          continue;
        }

        const currentValue = this.normalizeText(config.value);

        if (nextValue !== currentValue) {
          config.value = nextValue;
          changed.set(config.id, nextValue);
          hasChanges = true;
        }
      }

      if (!hasChanges) {
        break;
      }
    }

    for (const [configId, value] of changed.entries()) {
      await tx.requisitionProjectConfig.update({
        where: { id: configId },
        data: { value },
      });
    }

    if (formulaErrors.size > 0) {
      for (const config of computedConfigs) {
        const errorMessage = formulaErrors.get(config.id);
        if (!errorMessage) continue;
        // Loga diagnostico sem interromper o fluxo.
        console.error(
          `[ProjectConfigFormula] requisition=${requisitionId} field=${config.field.label} error=${errorMessage}`,
        );
      }
    }
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
      .map((field) => {
        const sourceValue = sourceMap.get(field.id);
        const value = sourceValue !== undefined && sourceValue !== null ? sourceValue : this.getFieldDefaultValue(field);

        return {
          requisitionId,
          fieldId: field.id,
          value,
        };
      });

    if (missingConfigs.length > 0) {
      await tx.requisitionProjectConfig.createMany({
        data: missingConfigs,
      });
    }

    await this.recomputeComputedProjectConfigs(tx, requisitionId);
    await this.syncRequisitionStatusWithProjectConfig(tx, requisitionId);

    return tx.requisitionProjectConfig.findMany({
      where: {
        requisitionId,
        field: { isActive: true },
      },
      include: { field: true },
      orderBy: [{ field: { sortOrder: 'asc' } }],
    });
  }

  private async syncCatalogItemsForRequisition(tx: Prisma.TransactionClient, requisitionId: string) {
    const requisition = await tx.requisition.findUnique({
      where: { id: requisitionId },
      select: { id: true, status: true },
    });
    if (!requisition) throw new NotFoundException('Requisicao nao encontrada.');

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

    const existingItems = await tx.requisitionItem.findMany({
      where: {
        requisitionId,
        equipmentCatalogId: { not: null },
      },
      select: {
        id: true,
        equipmentCatalogId: true,
        localName: true,
        operationName: true,
        equipmentCode: true,
        equipmentName: true,
        manualQuantity: true,
      },
    });

    if (equipments.length === 0) {
      if (requisition.status === ReqStatus.PENDING && existingItems.length > 0) {
        await tx.requisitionItem.deleteMany({
          where: { id: { in: existingItems.map((item) => item.id) } },
        });
      }
      return;
    }

    const equipmentByCatalogId = new Map(equipments.map((equipment) => [equipment.id, equipment]));
    const existingCatalogIds = new Set(
      existingItems
        .map((item) => item.equipmentCatalogId)
        .filter((catalogId): catalogId is string => Boolean(catalogId)),
    );

    const missingEquipments = equipments
      .filter((equipment) => !existingCatalogIds.has(equipment.id))
      .sort((a, b) => {
        if (a.operation.local.sortOrder !== b.operation.local.sortOrder) {
          return a.operation.local.sortOrder - b.operation.local.sortOrder;
        }
        if (a.operation.sortOrder !== b.operation.sortOrder) {
          return a.operation.sortOrder - b.operation.sortOrder;
        }
        return a.sortOrder - b.sortOrder;
      });

    if (missingEquipments.length > 0) {
      await tx.requisitionItem.createMany({
        data: missingEquipments.map((equipment) => ({
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

    if (requisition.status !== ReqStatus.PENDING) {
      return;
    }

    const activeCatalogIds = new Set(equipments.map((equipment) => equipment.id));
    const staleItemIds = existingItems
      .filter((item) => item.equipmentCatalogId && !activeCatalogIds.has(item.equipmentCatalogId))
      .map((item) => item.id);

    if (staleItemIds.length > 0) {
      await tx.requisitionItem.deleteMany({
        where: { id: { in: staleItemIds } },
      });
    }

    for (const item of existingItems) {
      const catalogId = item.equipmentCatalogId;
      if (!catalogId || !activeCatalogIds.has(catalogId)) {
        continue;
      }

      const equipment = equipmentByCatalogId.get(catalogId);
      if (!equipment) continue;

      const shouldBackfillManualQuantity = item.manualQuantity === null;
      const nextManualQuantity = shouldBackfillManualQuantity ? equipment.baseQuantity : item.manualQuantity;

      const needsUpdate =
        item.localName !== equipment.operation.local.name ||
        item.operationName !== equipment.operation.name ||
        item.equipmentCode !== equipment.code ||
        item.equipmentName !== equipment.description ||
        (shouldBackfillManualQuantity && nextManualQuantity !== item.manualQuantity);

      if (!needsUpdate) continue;

      await tx.requisitionItem.update({
        where: { id: item.id },
        data: {
          localName: equipment.operation.local.name,
          operationName: equipment.operation.name,
          equipmentCode: equipment.code,
          equipmentName: equipment.description,
          ...(shouldBackfillManualQuantity ? { manualQuantity: nextManualQuantity } : {}),
          versionLock: { increment: 1 },
        },
      });
    }
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
      await this.syncCatalogItemsForRequisition(tx, requisition.id);
      return requisition;
    });
  }

  async completeRequisition(id: string, currentLock: number) {
    const req = await this.prisma.requisition.findUnique({ where: { id } });
    if (!req) throw new BadRequestException('Requisicao nao encontrada.');
    if (req.versionLock !== currentLock) {
      throw new ConflictException('Conflito de concorrencia. Atualize a tela.');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.requisition.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          isReadOnly: true,
          versionLock: { increment: 1 },
        },
      });

      await this.syncRequisitionStatusWithProjectConfig(tx, id);
      return updated;
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
      }

      await this.syncCatalogItemsForRequisition(tx, newReq.id);
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
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.syncCatalogItemsForRequisition(tx, reqId);
      return tx.requisitionItem.findMany({
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

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.syncProjectConfigs(tx, reqId);

      const fieldIds = Array.from(new Set(configs.map((config) => config.fieldId).filter(Boolean)));
      const fields = await tx.projectHeaderField.findMany({
        where: { id: { in: fieldIds }, isActive: true },
      });
      const fieldsById = new Map(fields.map((field) => [field.id, field]));

      for (const config of configs) {
        if (!config.fieldId) continue;

        const field = fieldsById.get(config.fieldId);
        if (!field) continue;

        if (field.type === ProjectHeaderFieldType.COMPUTED) {
          continue;
        }

        const normalizedValue = this.normalizeText(config.value);

        if (field.type === ProjectHeaderFieldType.NUMBER && normalizedValue) {
          const parsed = Number(normalizedValue.replace(',', '.'));
          if (Number.isNaN(parsed)) {
            throw new BadRequestException(`Campo '${field.label}' exige valor numerico.`);
          }
        }

        if (field.type === ProjectHeaderFieldType.SELECT && normalizedValue) {
          const options = this.parseSelectOptions(field.options);
          if (!options.includes(normalizedValue)) {
            throw new BadRequestException(`Campo '${field.label}' exige um valor da lista configurada.`);
          }
        }

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
            value: normalizedValue,
          },
          update: {
            value: normalizedValue,
          },
        });
      }

      return this.syncProjectConfigs(tx, reqId);
    });
  }

  async autoFillItemsFromProjectConfigs(reqId: string) {
    const requisition = await this.prisma.requisition.findUnique({ where: { id: reqId } });
    if (!requisition) throw new NotFoundException('Requisicao nao encontrada.');
    if (requisition.isReadOnly) {
      throw new BadRequestException('Requisicao em modo somente leitura.');
    }

    const configs = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.syncCatalogItemsForRequisition(tx, reqId);
      return this.syncProjectConfigs(tx, reqId);
    });

    const configByFieldId = new Map<string, string>();
    for (const config of configs) {
      configByFieldId.set(config.fieldId, this.normalizeText(config.value));
    }

    const items = await this.prisma.requisitionItem.findMany({
      where: { requisitionId: reqId, equipmentCatalogId: { not: null } },
      include: { equipmentCatalog: true },
    });

    for (const item of items as any[]) {
      const catalog = item.equipmentCatalog;
      if (!catalog) continue;

      let autoQuantity: number | null = null;

      if (this.normalizeText(catalog.autoFormulaExpression)) {
        const evaluated = this.evaluateExpression(
          catalog.autoFormulaExpression,
          configs,
          `auto formula do equipamento '${catalog.description}'`,
        );
        autoQuantity = this.toNumericQuantity(evaluated, `equipamento '${catalog.description}'`);
      } else if (catalog.autoConfigFieldId) {
        const configValueRaw = configByFieldId.get(catalog.autoConfigFieldId);
        const configValue = this.parseNumber(configValueRaw);
        if (configValue !== null) {
          const base = catalog.baseQuantity && catalog.baseQuantity !== 0 ? catalog.baseQuantity : 1;
          const multiplier = catalog.autoMultiplier ?? 1;
          autoQuantity = configValue * base * multiplier;
        }
      }

      if (autoQuantity === null) continue;

      // Requisito: auto preenchimento deve sobrepor a quantidade da requisicao.
      await this.prisma.requisitionItem.update({
        where: { id: item.id },
        data: {
          calculatedValue: autoQuantity,
          manualQuantity: autoQuantity,
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

  async remove(id: string) {
    const requisition = await this.prisma.requisition.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });
    if (!requisition) {
      throw new NotFoundException('Requisicao nao encontrada.');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.requisitionItem.deleteMany({ where: { requisitionId: id } });
      await tx.requisitionProjectConfig.deleteMany({ where: { requisitionId: id } });
      await tx.requisition.delete({ where: { id } });
    });

    return {
      deletedRequisitionId: id,
      projectId: requisition.projectId,
    };
  }
}

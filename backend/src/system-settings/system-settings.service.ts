import { BadRequestException, Injectable } from '@nestjs/common';
import { ItemStatus, Prisma, ProjectHeaderFieldType, QuantitySourceType, ReqStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ExportSelection = {
  includeCatalog: boolean;
  includeProjectHeaderFields: boolean;
  includeProjectsAndActiveVersions: boolean;
};

type ImportInput = ExportSelection & {
  payload: unknown;
};

type TxClient = Prisma.TransactionClient;
type UnknownRecord = Record<string, unknown>;
type LocalWithTree = Prisma.LocalCatalogGetPayload<{
  include: {
    operations: {
      include: {
        equipments: true;
      };
    };
  };
}>;
type ProjectWithRequisitions = Prisma.ProjectGetPayload<{
  include: {
    requisitions: true;
  };
}>;

@Injectable()
export class SystemSettingsService {
  constructor(private prisma: PrismaService) {}

  private hasValidSelection(selection: ExportSelection): boolean {
    return (
      selection.includeCatalog || selection.includeProjectHeaderFields || selection.includeProjectsAndActiveVersions
    );
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private normalizeKey(value: unknown): string {
    return this.normalizeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private asString(value: unknown): string {
    return this.normalizeText(value);
  }

  private asOptionalString(value: unknown): string | null {
    const normalized = this.normalizeText(value);
    return normalized.length > 0 ? normalized : null;
  }

  private asBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return fallback;
  }

  private asNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const normalized = this.normalizeText(value);
    if (!normalized) return fallback;

    const parsed = Number(normalized.replace(',', '.'));
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) return fallback;
    return parsed;
  }

  private asInteger(value: unknown, fallback: number): number {
    const parsed = Math.trunc(this.asNumber(value, fallback));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private asRecord(value: unknown): UnknownRecord | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    return value as UnknownRecord;
  }

  private asRecordArray(value: unknown): UnknownRecord[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => this.asRecord(item) !== null) as UnknownRecord[];
  }

  private parseFieldType(value: unknown): ProjectHeaderFieldType {
    const normalized = this.normalizeText(value).toUpperCase();
    if (normalized === ProjectHeaderFieldType.NUMBER) return ProjectHeaderFieldType.NUMBER;
    if (normalized === ProjectHeaderFieldType.SELECT) return ProjectHeaderFieldType.SELECT;
    if (normalized === ProjectHeaderFieldType.COMPUTED) return ProjectHeaderFieldType.COMPUTED;
    return ProjectHeaderFieldType.TEXT;
  }

  private parseRequisitionStatus(value: unknown): ReqStatus {
    const normalized = this.normalizeText(value).toUpperCase();
    if (normalized === ReqStatus.FILLING) return ReqStatus.FILLING;
    if (normalized === ReqStatus.COMPLETED) return ReqStatus.COMPLETED;
    return ReqStatus.PENDING;
  }

  private parseItemStatus(value: unknown): ItemStatus {
    const normalized = this.normalizeText(value).toUpperCase();
    if (normalized === ItemStatus.RECEIVED) return ItemStatus.RECEIVED;
    return ItemStatus.PENDING;
  }

  private parseQuantitySourceType(value: unknown): QuantitySourceType {
    const normalized = this.normalizeText(value).toUpperCase();
    if (normalized === QuantitySourceType.STOCK_AGP) return QuantitySourceType.STOCK_AGP;
    return QuantitySourceType.PURCHASE;
  }

  private parseOptions(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    const seen = new Set<string>();
    const options: string[] = [];
    for (const item of value) {
      const option = this.normalizeText(item);
      if (!option) continue;
      const key = this.normalizeKey(option);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(option);
    }

    return options;
  }

  private optionsEqual(left: unknown, right: string[]): boolean {
    const leftValues = this.parseOptions(left);
    if (leftValues.length !== right.length) return false;
    for (let i = 0; i < leftValues.length; i++) {
      if (leftValues[i] !== right[i]) return false;
    }
    return true;
  }

  private toInputJsonArray(values: string[]): Prisma.InputJsonValue {
    return values as unknown as Prisma.InputJsonValue;
  }

  private buildEquipmentKey(localName: unknown, operationName: unknown, code: unknown, description: unknown): string {
    return [
      this.normalizeKey(localName),
      this.normalizeKey(operationName),
      this.normalizeKey(code),
      this.normalizeKey(description),
    ].join('::');
  }

  private parseNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = this.asNumber(value, Number.NaN);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }

  private extractSourceFieldLabelMap(payload: UnknownRecord): Map<string, string> {
    const map = new Map<string, string>();
    const fields = this.asRecordArray(payload.projectHeaderFields);

    for (const field of fields) {
      const sourceId = this.asString(field.id);
      const label = this.asString(field.label);
      if (!sourceId || !label) continue;
      map.set(sourceId, label);
    }

    return map;
  }

  private resolveImportedFieldId(
    raw: UnknownRecord,
    fieldIdBySourceId: Map<string, string>,
    fieldIdByLabelKey: Map<string, string>,
    sourceFieldIdToLabel: Map<string, string>,
  ): string | null {
    const sourceFieldId = this.asString(raw.autoConfigFieldId);
    if (sourceFieldId && fieldIdBySourceId.has(sourceFieldId)) {
      return fieldIdBySourceId.get(sourceFieldId) ?? null;
    }

    if (sourceFieldId && sourceFieldIdToLabel.has(sourceFieldId)) {
      const sourceLabel = sourceFieldIdToLabel.get(sourceFieldId);
      if (sourceLabel) {
        return fieldIdByLabelKey.get(this.normalizeKey(sourceLabel)) ?? null;
      }
    }

    const nestedField = this.asRecord(raw.autoConfigField);
    if (nestedField) {
      const nestedId = this.asString(nestedField.id);
      if (nestedId && fieldIdBySourceId.has(nestedId)) {
        return fieldIdBySourceId.get(nestedId) ?? null;
      }

      const nestedLabel = this.asString(nestedField.label);
      if (nestedLabel) {
        return fieldIdByLabelKey.get(this.normalizeKey(nestedLabel)) ?? null;
      }
    }

    return null;
  }

  private resolveImportedConfigFieldId(
    configRaw: UnknownRecord,
    fieldIdBySourceId: Map<string, string>,
    fieldIdByLabelKey: Map<string, string>,
    sourceFieldIdToLabel: Map<string, string>,
  ): string | null {
    const sourceFieldId = this.asString(configRaw.fieldId);
    if (sourceFieldId && fieldIdBySourceId.has(sourceFieldId)) {
      return fieldIdBySourceId.get(sourceFieldId) ?? null;
    }

    const nestedField = this.asRecord(configRaw.field);
    if (nestedField) {
      const nestedId = this.asString(nestedField.id);
      if (nestedId && fieldIdBySourceId.has(nestedId)) {
        return fieldIdBySourceId.get(nestedId) ?? null;
      }

      const nestedLabel = this.asString(nestedField.label);
      if (nestedLabel) {
        return fieldIdByLabelKey.get(this.normalizeKey(nestedLabel)) ?? null;
      }
    }

    if (sourceFieldId && sourceFieldIdToLabel.has(sourceFieldId)) {
      const sourceLabel = sourceFieldIdToLabel.get(sourceFieldId);
      if (sourceLabel) {
        return fieldIdByLabelKey.get(this.normalizeKey(sourceLabel)) ?? null;
      }
    }

    return null;
  }

  private async importProjectHeaderFields(
    tx: TxClient,
    rawFields: unknown,
  ): Promise<{
    summary: { created: number; updated: number; skipped: number };
    fieldIdBySourceId: Map<string, string>;
    fieldIdByLabelKey: Map<string, string>;
  }> {
    const summary = { created: 0, updated: 0, skipped: 0 };
    const fieldIdBySourceId = new Map<string, string>();
    const fieldIdByLabelKey = new Map<string, string>();

    const importedFields = this.asRecordArray(rawFields);
    const existingFields = await tx.projectHeaderField.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    const existingByLabelKey = new Map<string, (typeof existingFields)[number]>();
    for (const field of existingFields) {
      existingByLabelKey.set(this.normalizeKey(field.label), field);
      fieldIdByLabelKey.set(this.normalizeKey(field.label), field.id);
    }

    let maxSortOrder = existingFields.reduce((max, field) => Math.max(max, field.sortOrder), -1);

    for (let index = 0; index < importedFields.length; index++) {
      const rawField = importedFields[index];
      const sourceId = this.asString(rawField.id);
      const label = this.asString(rawField.label);
      if (!label) {
        summary.skipped++;
        continue;
      }

      const labelKey = this.normalizeKey(label);
      const type = this.parseFieldType(rawField.type);
      const options = this.parseOptions(rawField.options);
      const isActive = this.asBoolean(rawField.isActive, true);
      const sortOrder = this.asInteger(rawField.sortOrder, maxSortOrder + 1 + index);
      maxSortOrder = Math.max(maxSortOrder, sortOrder);

      let defaultValue = this.asOptionalString(rawField.defaultValue);
      let formulaExpression = this.asOptionalString(rawField.formulaExpression);

      if (type === ProjectHeaderFieldType.SELECT) {
        if (options.length === 0) {
          summary.skipped++;
          continue;
        }

        if (defaultValue && !options.includes(defaultValue)) {
          defaultValue = options[0];
        }
      } else if (type === ProjectHeaderFieldType.NUMBER && defaultValue) {
        const parsedDefault = this.parseNullableNumber(defaultValue);
        defaultValue = parsedDefault === null ? null : String(parsedDefault);
      }

      if (type === ProjectHeaderFieldType.COMPUTED) {
        if (!formulaExpression) {
          summary.skipped++;
          continue;
        }
        defaultValue = null;
      } else {
        formulaExpression = null;
      }

      const optionsValue =
        type === ProjectHeaderFieldType.SELECT ? this.toInputJsonArray(options) : Prisma.JsonNull;

      const existing = existingByLabelKey.get(labelKey);
      if (!existing) {
        const created = await tx.projectHeaderField.create({
          data: {
            label,
            type,
            options: optionsValue,
            defaultValue,
            formulaExpression,
            sortOrder,
            isActive,
          },
        });

        summary.created++;
        existingByLabelKey.set(labelKey, created);
        fieldIdByLabelKey.set(labelKey, created.id);
        if (sourceId) fieldIdBySourceId.set(sourceId, created.id);
        continue;
      }

      const needsUpdate =
        existing.label !== label ||
        existing.type !== type ||
        existing.isActive !== isActive ||
        existing.sortOrder !== sortOrder ||
        existing.defaultValue !== defaultValue ||
        existing.formulaExpression !== formulaExpression ||
        !this.optionsEqual(existing.options, options);

      if (needsUpdate) {
        await tx.projectHeaderField.update({
          where: { id: existing.id },
          data: {
            label,
            type,
            options: optionsValue,
            defaultValue,
            formulaExpression,
            sortOrder,
            isActive,
          },
        });
        summary.updated++;
      } else {
        summary.skipped++;
      }

      fieldIdByLabelKey.set(labelKey, existing.id);
      if (sourceId) fieldIdBySourceId.set(sourceId, existing.id);
    }

    const latestFields = await tx.projectHeaderField.findMany();
    for (const field of latestFields) {
      fieldIdByLabelKey.set(this.normalizeKey(field.label), field.id);
    }

    return { summary, fieldIdBySourceId, fieldIdByLabelKey };
  }

  private async importCatalog(
    tx: TxClient,
    rawCatalog: unknown,
    fieldIdBySourceId: Map<string, string>,
    fieldIdByLabelKey: Map<string, string>,
    sourceFieldIdToLabel: Map<string, string>,
  ): Promise<{
    summary: { localsCreated: number; operationsCreated: number; equipmentsCreated: number; updated: number; skipped: number };
    equipmentIdBySourceId: Map<string, string>;
  }> {
    const summary = {
      localsCreated: 0,
      operationsCreated: 0,
      equipmentsCreated: 0,
      updated: 0,
      skipped: 0,
    };
    const equipmentIdBySourceId = new Map<string, string>();

    const importedLocals = this.asRecordArray(rawCatalog);
    const localTree = (await tx.localCatalog.findMany({
      include: {
        operations: {
          include: {
            equipments: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    })) as LocalWithTree[];

    let maxLocalSortOrder = localTree.reduce((max, local) => Math.max(max, local.sortOrder), -1);

    for (const localRaw of importedLocals) {
      const localName = this.asString(localRaw.name);
      if (!localName) {
        summary.skipped++;
        continue;
      }

      const localKey = this.normalizeKey(localName);
      const localSortOrder = this.asInteger(localRaw.sortOrder, maxLocalSortOrder + 1);
      const localIsActive = this.asBoolean(localRaw.isActive, true);

      let local = localTree.find((item) => this.normalizeKey(item.name) === localKey);
      if (!local) {
        local = (await tx.localCatalog.create({
          data: {
            name: localName,
            sortOrder: localSortOrder,
            isActive: localIsActive,
          },
          include: {
            operations: {
              include: {
                equipments: true,
              },
            },
          },
        })) as LocalWithTree;

        localTree.push(local);
        maxLocalSortOrder = Math.max(maxLocalSortOrder, localSortOrder);
        summary.localsCreated++;
      } else {
        const localNeedsUpdate =
          local.name !== localName || local.sortOrder !== localSortOrder || local.isActive !== localIsActive;

        if (localNeedsUpdate) {
          await tx.localCatalog.update({
            where: { id: local.id },
            data: {
              name: localName,
              sortOrder: localSortOrder,
              isActive: localIsActive,
            },
          });
          local.name = localName;
          local.sortOrder = localSortOrder;
          local.isActive = localIsActive;
          summary.updated++;
        }
      }

      const importedOperations = this.asRecordArray(localRaw.operations);
      let maxOperationSortOrder = local.operations.reduce((max, operation) => Math.max(max, operation.sortOrder), -1);

      for (const operationRaw of importedOperations) {
        const operationName = this.asString(operationRaw.name);
        if (!operationName) {
          summary.skipped++;
          continue;
        }

        const operationKey = this.normalizeKey(operationName);
        const operationSortOrder = this.asInteger(operationRaw.sortOrder, maxOperationSortOrder + 1);
        const operationIsActive = this.asBoolean(operationRaw.isActive, true);

        let operation = local.operations.find((item) => this.normalizeKey(item.name) === operationKey);
        if (!operation) {
          operation = await tx.operationCatalog.create({
            data: {
              localId: local.id,
              name: operationName,
              sortOrder: operationSortOrder,
              isActive: operationIsActive,
            },
            include: {
              equipments: true,
            },
          });

          local.operations.push(operation);
          maxOperationSortOrder = Math.max(maxOperationSortOrder, operationSortOrder);
          summary.operationsCreated++;
        } else {
          const operationNeedsUpdate =
            operation.name !== operationName ||
            operation.sortOrder !== operationSortOrder ||
            operation.isActive !== operationIsActive;

          if (operationNeedsUpdate) {
            await tx.operationCatalog.update({
              where: { id: operation.id },
              data: {
                name: operationName,
                sortOrder: operationSortOrder,
                isActive: operationIsActive,
              },
            });
            operation.name = operationName;
            operation.sortOrder = operationSortOrder;
            operation.isActive = operationIsActive;
            summary.updated++;
          }
        }

        const importedEquipments = this.asRecordArray(operationRaw.equipments);
        let maxEquipmentSortOrder = operation.equipments.reduce((max, equipment) => Math.max(max, equipment.sortOrder), -1);

        for (const equipmentRaw of importedEquipments) {
          const description = this.asString(equipmentRaw.description);
          if (!description) {
            summary.skipped++;
            continue;
          }

          const code = this.asString(equipmentRaw.code);
          const sourceEquipmentId = this.asString(equipmentRaw.id);
          const equipmentSortOrder = this.asInteger(equipmentRaw.sortOrder, maxEquipmentSortOrder + 1);
          const equipmentIsActive = this.asBoolean(equipmentRaw.isActive, true);
          const baseQuantity = this.asNumber(equipmentRaw.baseQuantity, 0);
          const autoMultiplier = this.asNumber(equipmentRaw.autoMultiplier, 1);
          const autoFormulaExpression = this.asOptionalString(equipmentRaw.autoFormulaExpression);
          const autoConfigFieldId = this.resolveImportedFieldId(
            equipmentRaw,
            fieldIdBySourceId,
            fieldIdByLabelKey,
            sourceFieldIdToLabel,
          );

          const equipmentKey = this.buildEquipmentKey(localName, operationName, code, description);
          const existingEquipment = operation.equipments.find(
            (item) =>
              this.buildEquipmentKey(localName, operationName, item.code, item.description) === equipmentKey,
          );

          if (!existingEquipment) {
            const created = await tx.equipmentCatalog.create({
              data: {
                operationId: operation.id,
                code,
                description,
                baseQuantity,
                autoConfigFieldId,
                autoMultiplier,
                autoFormulaExpression,
                sortOrder: equipmentSortOrder,
                isActive: equipmentIsActive,
              },
            });

            operation.equipments.push(created);
            maxEquipmentSortOrder = Math.max(maxEquipmentSortOrder, equipmentSortOrder);
            summary.equipmentsCreated++;
            if (sourceEquipmentId) equipmentIdBySourceId.set(sourceEquipmentId, created.id);
            continue;
          }

          const needsUpdate =
            existingEquipment.code !== code ||
            existingEquipment.description !== description ||
            existingEquipment.baseQuantity !== baseQuantity ||
            existingEquipment.autoConfigFieldId !== autoConfigFieldId ||
            existingEquipment.autoMultiplier !== autoMultiplier ||
            existingEquipment.autoFormulaExpression !== autoFormulaExpression ||
            existingEquipment.sortOrder !== equipmentSortOrder ||
            existingEquipment.isActive !== equipmentIsActive;

          if (needsUpdate) {
            await tx.equipmentCatalog.update({
              where: { id: existingEquipment.id },
              data: {
                code,
                description,
                baseQuantity,
                autoConfigFieldId,
                autoMultiplier,
                autoFormulaExpression,
                sortOrder: equipmentSortOrder,
                isActive: equipmentIsActive,
              },
            });
            existingEquipment.code = code;
            existingEquipment.description = description;
            existingEquipment.baseQuantity = baseQuantity;
            existingEquipment.autoConfigFieldId = autoConfigFieldId;
            existingEquipment.autoMultiplier = autoMultiplier;
            existingEquipment.autoFormulaExpression = autoFormulaExpression;
            existingEquipment.sortOrder = equipmentSortOrder;
            existingEquipment.isActive = equipmentIsActive;
            summary.updated++;
          } else {
            summary.skipped++;
          }

          if (sourceEquipmentId) equipmentIdBySourceId.set(sourceEquipmentId, existingEquipment.id);
        }
      }
    }

    return { summary, equipmentIdBySourceId };
  }

  private async importComputerAreasCatalog(
    tx: TxClient,
    rawAreas: unknown,
  ): Promise<{ created: number; updated: number; skipped: number }> {
    const summary = {
      created: 0,
      updated: 0,
      skipped: 0,
    };

    const importedAreas = this.asRecordArray(rawAreas);
    const existingAreas = await tx.computerAreaCatalog.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const existingByNameKey = new Map<string, (typeof existingAreas)[number]>();
    for (const area of existingAreas) {
      existingByNameKey.set(this.normalizeKey(area.name), area);
    }

    let maxSortOrder = existingAreas.reduce((max, area) => Math.max(max, area.sortOrder), -1);

    for (let index = 0; index < importedAreas.length; index++) {
      const rawArea = importedAreas[index];
      const name = this.asString(rawArea.name);
      if (!name) {
        summary.skipped++;
        continue;
      }

      const nameKey = this.normalizeKey(name);
      const sortOrder = this.asInteger(rawArea.sortOrder, maxSortOrder + 1 + index);
      const isActive = this.asBoolean(rawArea.isActive, true);
      maxSortOrder = Math.max(maxSortOrder, sortOrder);

      const existing = existingByNameKey.get(nameKey);
      if (!existing) {
        const created = await tx.computerAreaCatalog.create({
          data: {
            name,
            sortOrder,
            isActive,
          },
        });
        existingByNameKey.set(nameKey, created);
        summary.created++;
        continue;
      }

      const needsUpdate =
        existing.name !== name || existing.sortOrder !== sortOrder || existing.isActive !== isActive;
      if (!needsUpdate) {
        summary.skipped++;
        continue;
      }

      const updated = await tx.computerAreaCatalog.update({
        where: { id: existing.id },
        data: {
          name,
          sortOrder,
          isActive,
        },
      });
      existingByNameKey.set(nameKey, updated);
      summary.updated++;
    }

    return summary;
  }

  private async importBackofficeScaleAreasCatalog(
    tx: TxClient,
    rawAreas: unknown,
  ): Promise<{ created: number; updated: number; skipped: number }> {
    const summary = {
      created: 0,
      updated: 0,
      skipped: 0,
    };

    const importedAreas = this.asRecordArray(rawAreas);
    const existingAreas = await tx.backofficeScaleAreaCatalog.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const existingByNameKey = new Map<string, (typeof existingAreas)[number]>();
    for (const area of existingAreas) {
      existingByNameKey.set(this.normalizeKey(area.name), area);
    }

    let maxSortOrder = existingAreas.reduce((max, area) => Math.max(max, area.sortOrder), -1);

    for (let index = 0; index < importedAreas.length; index++) {
      const rawArea = importedAreas[index];
      const name = this.asString(rawArea.name);
      if (!name) {
        summary.skipped++;
        continue;
      }

      const nameKey = this.normalizeKey(name);
      const sortOrder = this.asInteger(rawArea.sortOrder, maxSortOrder + 1 + index);
      const isActive = this.asBoolean(rawArea.isActive, true);
      maxSortOrder = Math.max(maxSortOrder, sortOrder);

      const existing = existingByNameKey.get(nameKey);
      if (!existing) {
        const created = await tx.backofficeScaleAreaCatalog.create({
          data: {
            name,
            sortOrder,
            isActive,
          },
        });
        existingByNameKey.set(nameKey, created);
        summary.created++;
        continue;
      }

      const needsUpdate =
        existing.name !== name || existing.sortOrder !== sortOrder || existing.isActive !== isActive;
      if (!needsUpdate) {
        summary.skipped++;
        continue;
      }

      const updated = await tx.backofficeScaleAreaCatalog.update({
        where: { id: existing.id },
        data: {
          name,
          sortOrder,
          isActive,
        },
      });
      existingByNameKey.set(nameKey, updated);
      summary.updated++;
    }

    return summary;
  }

  private async buildEquipmentLookup(tx: TxClient): Promise<Map<string, string>> {
    const equipments = await tx.equipmentCatalog.findMany({
      include: {
        operation: {
          include: {
            local: true,
          },
        },
      },
    });

    const lookup = new Map<string, string>();
    for (const equipment of equipments) {
      const key = this.buildEquipmentKey(
        equipment.operation.local.name,
        equipment.operation.name,
        equipment.code,
        equipment.description,
      );
      lookup.set(key, equipment.id);
    }

    return lookup;
  }

  private async importProjectsAndRequisitions(
    tx: TxClient,
    rawProjects: unknown,
    fieldIdBySourceId: Map<string, string>,
    fieldIdByLabelKey: Map<string, string>,
    sourceFieldIdToLabel: Map<string, string>,
    equipmentIdBySourceId: Map<string, string>,
    equipmentLookup: Map<string, string>,
  ) {
    const summary = {
      projectsCreated: 0,
      projectsUpdated: 0,
      projectsSkipped: 0,
      requisitionsCreated: 0,
      requisitionsUpdated: 0,
      projectConfigsCreated: 0,
      projectConfigsUpdated: 0,
      projectConfigsSkipped: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      computerAreasCreated: 0,
      computerAreasUpdated: 0,
      computerAreasSkipped: 0,
      backofficeScaleAreasCreated: 0,
      backofficeScaleAreasUpdated: 0,
      backofficeScaleAreasSkipped: 0,
    };

    const importedProjects = this.asRecordArray(rawProjects);
    const existingProjects = (await tx.project.findMany({
      include: {
        requisitions: true,
      },
    })) as ProjectWithRequisitions[];
    const catalogAreas = await tx.computerAreaCatalog.findMany();
    const computerAreaIdBySourceId = new Map<string, string>();
    const computerAreaIdByNameKey = new Map<string, string>();
    for (const area of catalogAreas) {
      computerAreaIdBySourceId.set(area.id, area.id);
      computerAreaIdByNameKey.set(this.normalizeKey(area.name), area.id);
    }
    const backofficeCatalogAreas = await tx.backofficeScaleAreaCatalog.findMany();
    const backofficeScaleAreaIdBySourceId = new Map<string, string>();
    const backofficeScaleAreaIdByNameKey = new Map<string, string>();
    for (const area of backofficeCatalogAreas) {
      backofficeScaleAreaIdBySourceId.set(area.id, area.id);
      backofficeScaleAreaIdByNameKey.set(this.normalizeKey(area.name), area.id);
    }

    for (const projectRaw of importedProjects) {
      const projectName = this.asString(projectRaw.name);
      if (!projectName) {
        summary.projectsSkipped++;
        continue;
      }

      const projectKey = this.normalizeKey(projectName);
      let project = existingProjects.find((item) => this.normalizeKey(item.name) === projectKey);

      if (!project) {
        const created = await tx.project.create({
          data: { name: projectName },
          include: { requisitions: true },
        });
        project = created as ProjectWithRequisitions;
        existingProjects.push(project);
        summary.projectsCreated++;
      } else if (project.name !== projectName) {
        await tx.project.update({
          where: { id: project.id },
          data: { name: projectName },
        });
        project.name = projectName;
        summary.projectsUpdated++;
      }

      const importedRequisitions = this.asRecordArray(projectRaw.requisitions);
      for (const requisitionRaw of importedRequisitions) {
        const version = this.asString(requisitionRaw.version) || 'V1';
        const versionKey = this.normalizeKey(version);

        let requisition = project.requisitions.find((item) => this.normalizeKey(item.version) === versionKey);
        const status = this.parseRequisitionStatus(requisitionRaw.status);
        const isReadOnly = this.asBoolean(requisitionRaw.isReadOnly, status === ReqStatus.COMPLETED);

        if (!requisition) {
          requisition = await tx.requisition.create({
            data: {
              projectId: project.id,
              version,
              status,
              isReadOnly,
            },
          });
          project.requisitions.push(requisition);
          summary.requisitionsCreated++;
        } else {
          const needsUpdate =
            requisition.version !== version ||
            requisition.status !== status ||
            requisition.isReadOnly !== isReadOnly;

          if (needsUpdate) {
            requisition = await tx.requisition.update({
              where: { id: requisition.id },
              data: {
                version,
                status,
                isReadOnly,
              },
            });
            summary.requisitionsUpdated++;
          }
        }

        const existingConfigs = await tx.requisitionProjectConfig.findMany({
          where: { requisitionId: requisition.id },
        });
        const configByFieldId = new Map(existingConfigs.map((config) => [config.fieldId, config]));
        const importedConfigs = this.asRecordArray(requisitionRaw.projectConfigs);

        for (const configRaw of importedConfigs) {
          const fieldId = this.resolveImportedConfigFieldId(
            configRaw,
            fieldIdBySourceId,
            fieldIdByLabelKey,
            sourceFieldIdToLabel,
          );
          if (!fieldId) {
            summary.projectConfigsSkipped++;
            continue;
          }

          const value = this.asOptionalString(configRaw.value);
          const existingConfig = configByFieldId.get(fieldId);

          if (!existingConfig) {
            const createdConfig = await tx.requisitionProjectConfig.create({
              data: {
                requisitionId: requisition.id,
                fieldId,
                value,
              },
            });
            configByFieldId.set(fieldId, createdConfig);
            summary.projectConfigsCreated++;
            continue;
          }

          if (existingConfig.value !== value) {
            const updatedConfig = await tx.requisitionProjectConfig.update({
              where: { id: existingConfig.id },
              data: { value },
            });
            configByFieldId.set(fieldId, updatedConfig);
            summary.projectConfigsUpdated++;
          } else {
            summary.projectConfigsSkipped++;
          }
        }

        const existingItems = await tx.requisitionItem.findMany({
          where: { requisitionId: requisition.id },
        });
        const existingByCatalogId = new Map<string, (typeof existingItems)[number]>();
        const existingByCompositeKey = new Map<string, (typeof existingItems)[number]>();

        for (const item of existingItems) {
          if (item.equipmentCatalogId) {
            existingByCatalogId.set(item.equipmentCatalogId, item);
          }
          const key = this.buildEquipmentKey(item.localName, item.operationName, item.equipmentCode, item.equipmentName);
          existingByCompositeKey.set(key, item);
        }

        const importedItems = this.asRecordArray(requisitionRaw.items);
        for (const itemRaw of importedItems) {
          const equipmentName = this.asString(itemRaw.equipmentName);
          if (!equipmentName) {
            summary.itemsSkipped++;
            continue;
          }

          const localName = this.asOptionalString(itemRaw.localName);
          const operationName = this.asOptionalString(itemRaw.operationName);
          const equipmentCode = this.asOptionalString(itemRaw.equipmentCode);
          const sourceEquipmentId = this.asString(itemRaw.equipmentCatalogId);

          let equipmentCatalogId: string | null = null;
          if (sourceEquipmentId && equipmentIdBySourceId.has(sourceEquipmentId)) {
            equipmentCatalogId = equipmentIdBySourceId.get(sourceEquipmentId) ?? null;
          }
          if (!equipmentCatalogId) {
            const lookupKey = this.buildEquipmentKey(localName, operationName, equipmentCode, equipmentName);
            equipmentCatalogId = equipmentLookup.get(lookupKey) ?? null;
          }

          const itemStatus = this.parseItemStatus(itemRaw.status);
          const manualQuantity = this.parseNullableNumber(itemRaw.manualQuantity);
          const calculatedValue = this.parseNullableNumber(itemRaw.calculatedValue);
          const overrideValue = this.parseNullableNumber(itemRaw.overrideValue);
          const quantitySourceType = this.parseQuantitySourceType(itemRaw.quantitySourceType);
          const quantitySourceNote = this.asOptionalString(itemRaw.quantitySourceNote);
          const observation = this.asOptionalString(itemRaw.observation);

          const compositeKey = this.buildEquipmentKey(localName, operationName, equipmentCode, equipmentName);
          const existingItem = equipmentCatalogId
            ? (existingByCatalogId.get(equipmentCatalogId) ?? existingByCompositeKey.get(compositeKey))
            : existingByCompositeKey.get(compositeKey);

          if (!existingItem) {
            const createdItem = await tx.requisitionItem.create({
              data: {
                requisitionId: requisition.id,
                equipmentCatalogId,
                localName,
                operationName,
                equipmentCode,
                equipmentName,
                manualQuantity,
                calculatedValue,
                overrideValue,
                quantitySourceType,
                quantitySourceNote,
                status: itemStatus,
                observation,
              },
            });
            if (createdItem.equipmentCatalogId) {
              existingByCatalogId.set(createdItem.equipmentCatalogId, createdItem);
            }
            existingByCompositeKey.set(compositeKey, createdItem);
            summary.itemsCreated++;
            continue;
          }

          const needsUpdate =
            existingItem.equipmentCatalogId !== equipmentCatalogId ||
            existingItem.localName !== localName ||
            existingItem.operationName !== operationName ||
            existingItem.equipmentCode !== equipmentCode ||
            existingItem.equipmentName !== equipmentName ||
            existingItem.manualQuantity !== manualQuantity ||
            existingItem.calculatedValue !== calculatedValue ||
            existingItem.overrideValue !== overrideValue ||
            existingItem.quantitySourceType !== quantitySourceType ||
            existingItem.quantitySourceNote !== quantitySourceNote ||
            existingItem.status !== itemStatus ||
            existingItem.observation !== observation;

          if (needsUpdate) {
            const updatedItem = await tx.requisitionItem.update({
              where: { id: existingItem.id },
              data: {
                equipmentCatalogId,
                localName,
                operationName,
                equipmentCode,
                equipmentName,
                manualQuantity,
                calculatedValue,
                overrideValue,
                quantitySourceType,
                quantitySourceNote,
                status: itemStatus,
                observation,
              },
            });
            if (updatedItem.equipmentCatalogId) {
              existingByCatalogId.set(updatedItem.equipmentCatalogId, updatedItem);
            }
            existingByCompositeKey.set(compositeKey, updatedItem);
            summary.itemsUpdated++;
          } else {
            summary.itemsSkipped++;
          }
        }

        const existingComputerAreas = await tx.requisitionComputerArea.findMany({
          where: { requisitionId: requisition.id },
        });
        const existingComputerAreaByAreaId = new Map(existingComputerAreas.map((row) => [row.areaId, row]));
        const importedComputerAreas = this.asRecordArray(requisitionRaw.computerAreas);

        for (const rowRaw of importedComputerAreas) {
          const sourceAreaId = this.asString(rowRaw.areaId);
          let areaId =
            (sourceAreaId && computerAreaIdBySourceId.get(sourceAreaId)) ||
            null;

          if (!areaId) {
            const nestedArea = this.asRecord(rowRaw.area);
            const nestedAreaName = this.asString(nestedArea?.name);
            if (nestedAreaName) {
              areaId = computerAreaIdByNameKey.get(this.normalizeKey(nestedAreaName)) ?? null;
            }
          }

          if (!areaId) {
            summary.computerAreasSkipped++;
            continue;
          }

          const quantity = this.asNumber(rowRaw.quantity, 0);
          const existingRow = existingComputerAreaByAreaId.get(areaId);
          if (!existingRow) {
            const createdRow = await tx.requisitionComputerArea.create({
              data: {
                requisitionId: requisition.id,
                areaId,
                quantity,
              },
            });
            existingComputerAreaByAreaId.set(areaId, createdRow);
            summary.computerAreasCreated++;
            continue;
          }

          if (existingRow.quantity !== quantity) {
            const updatedRow = await tx.requisitionComputerArea.update({
              where: { id: existingRow.id },
              data: { quantity },
            });
            existingComputerAreaByAreaId.set(areaId, updatedRow);
            summary.computerAreasUpdated++;
          } else {
            summary.computerAreasSkipped++;
          }
        }

        const existingBackofficeScaleAreas = await tx.requisitionBackofficeScaleArea.findMany({
          where: { requisitionId: requisition.id },
        });
        const existingBackofficeScaleAreaByAreaId = new Map(
          existingBackofficeScaleAreas.map((row) => [row.areaId, row]),
        );
        const importedBackofficeScaleAreas = this.asRecordArray(requisitionRaw.backofficeScaleAreas);

        for (const rowRaw of importedBackofficeScaleAreas) {
          const sourceAreaId = this.asString(rowRaw.areaId);
          let areaId = (sourceAreaId && backofficeScaleAreaIdBySourceId.get(sourceAreaId)) || null;

          if (!areaId) {
            const nestedArea = this.asRecord(rowRaw.area);
            const nestedAreaName = this.asString(nestedArea?.name);
            if (nestedAreaName) {
              areaId = backofficeScaleAreaIdByNameKey.get(this.normalizeKey(nestedAreaName)) ?? null;
            }
          }

          if (!areaId) {
            summary.backofficeScaleAreasSkipped++;
            continue;
          }

          const quantity = this.asNumber(rowRaw.quantity, 0);
          const existingRow = existingBackofficeScaleAreaByAreaId.get(areaId);
          if (!existingRow) {
            const createdRow = await tx.requisitionBackofficeScaleArea.create({
              data: {
                requisitionId: requisition.id,
                areaId,
                quantity,
              },
            });
            existingBackofficeScaleAreaByAreaId.set(areaId, createdRow);
            summary.backofficeScaleAreasCreated++;
            continue;
          }

          if (existingRow.quantity !== quantity) {
            const updatedRow = await tx.requisitionBackofficeScaleArea.update({
              where: { id: existingRow.id },
              data: { quantity },
            });
            existingBackofficeScaleAreaByAreaId.set(areaId, updatedRow);
            summary.backofficeScaleAreasUpdated++;
          } else {
            summary.backofficeScaleAreasSkipped++;
          }
        }
      }
    }

    return summary;
  }

  async exportSettings(selection: ExportSelection) {
    if (!this.hasValidSelection(selection)) {
      throw new BadRequestException('Selecione pelo menos um bloco para exportacao.');
    }

    const payload: Record<string, unknown> = {
      schemaVersion: '1.0.0',
      exportedAtUtc: new Date().toISOString(),
      source: 'sigp',
      selection,
    };

    if (selection.includeCatalog) {
      payload.catalog = await this.prisma.localCatalog.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          operations: {
            orderBy: { sortOrder: 'asc' },
            include: {
              equipments: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  autoConfigField: {
                    select: {
                      id: true,
                      label: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      payload.computerAreasCatalog = await this.prisma.computerAreaCatalog.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

      payload.backofficeScaleAreasCatalog = await this.prisma.backofficeScaleAreaCatalog.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    }

    if (selection.includeProjectHeaderFields) {
      payload.projectHeaderFields = await this.prisma.projectHeaderField.findMany({
        orderBy: { sortOrder: 'asc' },
      });
    }

    if (selection.includeProjectsAndActiveVersions) {
      payload.projects = await this.prisma.project.findMany({
        orderBy: { name: 'asc' },
        include: {
          requisitions: {
            where: { status: { not: ReqStatus.COMPLETED } },
            orderBy: [{ createdAt: 'asc' }],
            include: {
              projectConfigs: {
                orderBy: [{ field: { sortOrder: 'asc' } }],
                include: {
                  field: true,
                },
              },
              computerAreas: {
                orderBy: [{ area: { sortOrder: 'asc' } }, { area: { name: 'asc' } }],
                include: {
                  area: true,
                },
              },
              backofficeScaleAreas: {
                orderBy: [{ area: { sortOrder: 'asc' } }, { area: { name: 'asc' } }],
                include: {
                  area: true,
                },
              },
              items: {
                orderBy: [{ localName: 'asc' }, { operationName: 'asc' }, { equipmentName: 'asc' }],
              },
            },
          },
        },
      });
    }

    return payload;
  }

  async importSettings(input: ImportInput) {
    if (!this.hasValidSelection(input)) {
      throw new BadRequestException('Selecione pelo menos um bloco para importacao.');
    }

    const payload = this.asRecord(input.payload);
    if (!payload) {
      throw new BadRequestException('Arquivo de importacao invalido.');
    }

    const sourceFieldIdToLabel = this.extractSourceFieldLabelMap(payload);

    return this.prisma.$transaction(async (tx: TxClient) => {
      const fieldsImport = input.includeProjectHeaderFields
        ? await this.importProjectHeaderFields(tx, payload.projectHeaderFields)
        : {
            summary: { created: 0, updated: 0, skipped: 0 },
            fieldIdBySourceId: new Map<string, string>(),
            fieldIdByLabelKey: new Map<string, string>(),
          };

      if (!input.includeProjectHeaderFields) {
        const existingFields = await tx.projectHeaderField.findMany();
        for (const field of existingFields) {
          fieldsImport.fieldIdByLabelKey.set(this.normalizeKey(field.label), field.id);
        }
      }

      for (const [sourceId, label] of sourceFieldIdToLabel.entries()) {
        const localFieldId = fieldsImport.fieldIdByLabelKey.get(this.normalizeKey(label));
        if (localFieldId) {
          fieldsImport.fieldIdBySourceId.set(sourceId, localFieldId);
        }
      }

      const catalogImport = input.includeCatalog
        ? await this.importCatalog(
            tx,
            payload.catalog,
            fieldsImport.fieldIdBySourceId,
            fieldsImport.fieldIdByLabelKey,
            sourceFieldIdToLabel,
          )
        : {
            summary: {
              localsCreated: 0,
              operationsCreated: 0,
              equipmentsCreated: 0,
              updated: 0,
              skipped: 0,
            },
            equipmentIdBySourceId: new Map<string, string>(),
          };

      const computerAreasImportSummary = input.includeCatalog
        ? await this.importComputerAreasCatalog(tx, payload.computerAreasCatalog)
        : {
            created: 0,
            updated: 0,
            skipped: 0,
          };
      const backofficeScaleAreasImportSummary = input.includeCatalog
        ? await this.importBackofficeScaleAreasCatalog(tx, payload.backofficeScaleAreasCatalog)
        : {
            created: 0,
            updated: 0,
            skipped: 0,
          };

      const equipmentLookup = await this.buildEquipmentLookup(tx);
      const projectsImport = input.includeProjectsAndActiveVersions
        ? await this.importProjectsAndRequisitions(
            tx,
            payload.projects,
            fieldsImport.fieldIdBySourceId,
            fieldsImport.fieldIdByLabelKey,
            sourceFieldIdToLabel,
            catalogImport.equipmentIdBySourceId,
            equipmentLookup,
          )
        : {
            projectsCreated: 0,
            projectsUpdated: 0,
            projectsSkipped: 0,
            requisitionsCreated: 0,
            requisitionsUpdated: 0,
            projectConfigsCreated: 0,
            projectConfigsUpdated: 0,
            projectConfigsSkipped: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            itemsSkipped: 0,
            computerAreasCreated: 0,
            computerAreasUpdated: 0,
            computerAreasSkipped: 0,
            backofficeScaleAreasCreated: 0,
            backofficeScaleAreasUpdated: 0,
            backofficeScaleAreasSkipped: 0,
          };

      return {
        schemaVersion: '1.0.0',
        importedAtUtc: new Date().toISOString(),
        selection: {
          includeCatalog: input.includeCatalog,
          includeProjectHeaderFields: input.includeProjectHeaderFields,
          includeProjectsAndActiveVersions: input.includeProjectsAndActiveVersions,
        },
        summary: {
          catalog: {
            ...catalogImport.summary,
            computerAreasCreated: computerAreasImportSummary.created,
            computerAreasUpdated: computerAreasImportSummary.updated,
            computerAreasSkipped: computerAreasImportSummary.skipped,
            backofficeScaleAreasCreated: backofficeScaleAreasImportSummary.created,
            backofficeScaleAreasUpdated: backofficeScaleAreasImportSummary.updated,
            backofficeScaleAreasSkipped: backofficeScaleAreasImportSummary.skipped,
          },
          projectHeaderFields: fieldsImport.summary,
          projectsAndActiveVersions: projectsImport,
        },
      };
    });
  }
}

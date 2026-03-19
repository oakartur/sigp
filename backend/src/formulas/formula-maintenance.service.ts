import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeFormulaForStorage } from './formula-normalizer';

@Injectable()
export class FormulaMaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(FormulaMaintenanceService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const enabled = String(process.env.FORMULA_AUTOFIX_ON_START ?? 'true').toLowerCase() !== 'false';
    if (!enabled) {
      this.logger.log('Auto-fix de formulas desativado por FORMULA_AUTOFIX_ON_START=false.');
      return;
    }

    try {
      const [projectFields, catalogEquipments, legacyFormulas] = await Promise.all([
        this.prisma.projectHeaderField.findMany({
          where: { formulaExpression: { not: null } },
          select: { id: true, formulaExpression: true },
        }),
        this.prisma.equipmentCatalog.findMany({
          where: { autoFormulaExpression: { not: null } },
          select: { id: true, autoFormulaExpression: true },
        }),
        this.prisma.formula.findMany({
          select: { id: true, expression: true },
        }),
      ]);

      let correctedProjectFieldCount = 0;
      for (const field of projectFields) {
        const current = String(field.formulaExpression ?? '').trim();
        const normalized = normalizeFormulaForStorage(current);
        if (!normalized || normalized === current) continue;

        await this.prisma.projectHeaderField.update({
          where: { id: field.id },
          data: { formulaExpression: normalized },
        });
        correctedProjectFieldCount++;
      }

      let correctedCatalogFormulaCount = 0;
      for (const equipment of catalogEquipments) {
        const current = String(equipment.autoFormulaExpression ?? '').trim();
        const normalized = normalizeFormulaForStorage(current);
        if (!normalized || normalized === current) continue;

        await this.prisma.equipmentCatalog.update({
          where: { id: equipment.id },
          data: { autoFormulaExpression: normalized },
        });
        correctedCatalogFormulaCount++;
      }

      let correctedLegacyFormulaCount = 0;
      for (const formula of legacyFormulas) {
        const current = String(formula.expression ?? '').trim();
        const normalized = normalizeFormulaForStorage(current);
        if (!normalized || normalized === current) continue;

        await this.prisma.formula.update({
          where: { id: formula.id },
          data: { expression: normalized },
        });
        correctedLegacyFormulaCount++;
      }

      if (correctedProjectFieldCount || correctedCatalogFormulaCount || correctedLegacyFormulaCount) {
        this.logger.log(
          `Auto-fix de formulas aplicado: projectFields=${correctedProjectFieldCount}, catalog=${correctedCatalogFormulaCount}, legacy=${correctedLegacyFormulaCount}.`,
        );
      } else {
        this.logger.log('Auto-fix de formulas: nenhuma correcao necessaria.');
      }
    } catch (error: any) {
      this.logger.warn(`Falha no auto-fix de formulas: ${error?.message || String(error)}`);
    }
  }
}


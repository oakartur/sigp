import { Module } from '@nestjs/common';
import { FormulasService } from './formulas.service';
import { FormulasController } from './formulas.controller';
import { FormulaMaintenanceService } from './formula-maintenance.service';

@Module({
  providers: [FormulasService, FormulaMaintenanceService],
  controllers: [FormulasController],
  exports: [FormulasService], // Exportar para o RequisitionsModule poder usar
})
export class FormulasModule {}

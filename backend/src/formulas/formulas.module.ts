import { Module } from '@nestjs/common';
import { FormulasService } from './formulas.service';
import { FormulasController } from './formulas.controller';

@Module({
  providers: [FormulasService],
  controllers: [FormulasController],
  exports: [FormulasService], // Exportar para o RequisitionsModule poder usar
})
export class FormulasModule {}

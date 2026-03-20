import { Module } from '@nestjs/common';
import { RequisitionsService } from './requisitions.service';
import { RequisitionsController } from './requisitions.controller';
import { FormulasModule } from '../formulas/formulas.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';

@Module({
  imports: [FormulasModule, SystemLogsModule], // Precisa importar para injetar FormulasService
  providers: [RequisitionsService],
  controllers: [RequisitionsController],
})
export class RequisitionsModule {}

import { Module } from '@nestjs/common';
import { UnitCostsController } from './unit-costs.controller';
import { UnitCostsService } from './unit-costs.service';

@Module({
  controllers: [UnitCostsController],
  providers: [UnitCostsService],
})
export class UnitCostsModule {}

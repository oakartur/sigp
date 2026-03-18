import { Module } from '@nestjs/common';
import { ComputerAreasController } from './computer-areas.controller';
import { ComputerAreasService } from './computer-areas.service';

@Module({
  controllers: [ComputerAreasController],
  providers: [ComputerAreasService],
  exports: [ComputerAreasService],
})
export class ComputerAreasModule {}

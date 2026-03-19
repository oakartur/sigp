import { Module } from '@nestjs/common';
import { BackofficeScalesController } from './backoffice-scales.controller';
import { BackofficeScalesService } from './backoffice-scales.service';

@Module({
  controllers: [BackofficeScalesController],
  providers: [BackofficeScalesService],
  exports: [BackofficeScalesService],
})
export class BackofficeScalesModule {}

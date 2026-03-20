import { Module } from '@nestjs/common';
import { SystemLogsService } from './system-logs.service';
import { SystemLogsController } from './system-logs.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SystemLogsController],
  providers: [SystemLogsService],
  exports: [SystemLogsService],
})
export class SystemLogsModule {}

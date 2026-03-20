import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
  imports: [PrismaModule, SystemLogsModule],
  controllers: [BackupsController],
  providers: [BackupsService],
})
export class BackupsModule {}

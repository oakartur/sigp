import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailProcessor } from './email.processor';
import { ExcelProcessor } from './excel.processor';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'emailQueue',
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000, // Começa com 5s de delay
        },
      },
    }),
    BullModule.registerQueue({
      name: 'excelQueue',
    }),
  ],
  providers: [EmailProcessor, ExcelProcessor, TasksService],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {}

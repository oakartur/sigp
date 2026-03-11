import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class TasksService {
  constructor(
    @InjectQueue('emailQueue') private emailQueue: Queue,
    @InjectQueue('excelQueue') private excelQueue: Queue,
  ) {}

  async dispatchEmail(to: string, subject: string, body: string) {
    return this.emailQueue.add('sendEmail', { to, subject, body });
  }

  async generateExcel(requisitionId: string) {
    return this.excelQueue.add('exportNimbi', { requisitionId });
  }
}

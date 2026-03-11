import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Processor('emailQueue', {
  concurrency: 5,
})
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);
  private transporter: nodemailer.Transporter;

  constructor(private prisma: PrismaService) {
    super();
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT) || 1025,
      // secure: true, // dependendo do ambiente
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Iniciando envio de e-mail (Job ${job.id}) para ${job.data.to}`);

    try {
      await this.transporter.sendMail({
        from: '"Equipe Obras/Quantificação" <no-reply@empresa.com>',
        to: job.data.to,
        subject: job.data.subject,
        html: job.data.body,
      });
      this.logger.log(`E-mail enviado com sucesso (Job ${job.id})`);
    } catch (error: any) {
      this.logger.error(`Falha ao enviar e-mail ${job.id}: ${error.message}`);
      
      // Se estourar os retries (bullmq gerencia exponential backoff na criação do job), joga o erro.
      const maxAttempts = (job.opts?.attempts ?? 5);
      if (job.attemptsMade >= maxAttempts - 1) {
        this.logger.error(`Limite de falhas excedido para Job ${job.id}. Registrando no BD.`);
        // Exemplo: Registrar no Banco de Dados para Auditoria. Neste schema hipotético, não criei a tabela de ErrorLogs, mas poderia:
        // await this.prisma.errorLog.create({ data: { ... } });
      }
      throw error;
    }
  }
}

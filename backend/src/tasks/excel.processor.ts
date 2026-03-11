import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';

@Processor('excelQueue')
export class ExcelProcessor extends WorkerHost {
  private readonly logger = new Logger(ExcelProcessor.name);

  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ requisitionId: string }, any, string>): Promise<any> {
    const { requisitionId } = job.data;
    this.logger.log(`Gerando excel on-the-fly para Requisição ${requisitionId}`);

    const reqData = await this.prisma.requisition.findUnique({
      where: { id: requisitionId },
      include: { 
        project: true,
        items: true
      }
    });

    if (!reqData) {
      throw new Error(`Requisição ${requisitionId} não encontrada`);
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('ExportNimbi');

    // Headers Nimbi (exemplo)
    sheet.columns = [
      { header: 'Projeto', key: 'project', width: 20 },
      { header: 'Versao', key: 'version', width: 10 },
      { header: 'Equipamento', key: 'equipment', width: 30 },
      { header: 'QuantidadeAprovada', key: 'quantity', width: 20 },
    ];

    for (const item of reqData.items) {
      // Regra de override: Se o Override existe, ele ganha; senão, o Calculado.
      const finalQtd = item.overrideValue ?? item.calculatedValue ?? 0;
      sheet.addRow({
        project: reqData.project.name,
        version: reqData.version,
        equipment: item.equipmentName,
        quantity: finalQtd,
      });
    }

    const outDir = path.join(__dirname, '../../exports');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const filePath = path.join(outDir, `req_${requisitionId}_v${reqData.version}.xlsx`);
    await workbook.xlsx.writeFile(filePath);
    
    this.logger.log(`Excel gerado com sucesso em ${filePath}.`);
    
    return { filePath };
  }
}

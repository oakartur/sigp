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
    this.logger.log(`Gerando excel para Requisicao ${requisitionId}`);

    const reqData = await this.prisma.requisition.findUnique({
      where: { id: requisitionId },
      include: {
        project: true,
        items: true,
      },
    });

    if (!reqData) {
      throw new Error(`Requisicao ${requisitionId} nao encontrada`);
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('ExportNimbi');

    sheet.columns = [
      { header: 'Projeto', key: 'project', width: 24 },
      { header: 'Versao', key: 'version', width: 14 },
      { header: 'Local', key: 'local', width: 24 },
      { header: 'Operacao', key: 'operation', width: 24 },
      { header: 'Codigo', key: 'code', width: 18 },
      { header: 'Equipamento', key: 'equipment', width: 40 },
      { header: 'QuantidadeAprovada', key: 'quantity', width: 22 },
    ];

    for (const item of reqData.items) {
      const finalQtd = item.manualQuantity ?? item.overrideValue ?? item.calculatedValue ?? 0;
      sheet.addRow({
        project: reqData.project.name,
        version: reqData.version,
        local: item.localName ?? '',
        operation: item.operationName ?? '',
        code: item.equipmentCode ?? '',
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

    this.logger.log(`Excel gerado em ${filePath}`);
    return { filePath };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UnitCostsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.equipmentUnitCost.findMany({
      orderBy: { code: 'asc' },
    });
  }

  async upsertCost(data: { code: string; description: string; cost: number }) {
    const code = data.code?.trim();
    if (!code) throw new BadRequestException('Codigo e obrigatorio.');

    return this.prisma.equipmentUnitCost.upsert({
      where: { code },
      update: {
        description: data.description,
        cost: Number(data.cost),
      },
      create: {
        code,
        description: data.description,
        cost: Number(data.cost),
      },
    });
  }

  async remove(id: string) {
    const current = await this.prisma.equipmentUnitCost.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Custo nao encontrado.');
    return this.prisma.equipmentUnitCost.delete({ where: { id } });
  }

  private parseCurrency(value: string): number {
    if (!value) return 0;
    const cleaned = value.replace(/[^\d.,-]/g, '');
    if (!cleaned) return 0;
    
    if (cleaned.includes(',') && cleaned.includes('.')) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    if (cleaned.includes(',')) {
      return parseFloat(cleaned.replace(',', '.'));
    }
    return parseFloat(cleaned);
  }

  private parseDelimitedLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result.map((item) => item.replace(/^"|"$/g, '').trim());
  }

  async importCsv(buffer: Buffer) {
    let content = '';
    try {
      content = buffer.toString('utf8').replace(/^\uFEFF/, '');
    } catch (e) {
      throw new BadRequestException('Falha ao ler o arquivo.');
    }

    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) throw new BadRequestException('Arquivo vazio.');

    const sample = lines.slice(0, 5).join('\n');
    const delimiterScores = [
      { delimiter: '\t', score: (sample.match(/\t/g) || []).length },
      { delimiter: ';', score: (sample.match(/;/g) || []).length },
      { delimiter: ',', score: (sample.match(/,/g) || []).length },
    ];
    delimiterScores.sort((a, b) => b.score - a.score);
    const delimiter = delimiterScores[0].delimiter;

    let codeIdx = -1;
    let descIdx = -1;
    let costIdx = -1;

    const headers = this.parseDelimitedLine(lines[0], delimiter).map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (h.includes('codigo')) codeIdx = i;
      if (h.includes('equipamento') || h.includes('descricao')) descIdx = i;
      if (h.includes('custo') || h.includes('valor')) costIdx = i;
    }

    if (codeIdx === -1 || costIdx === -1) {
      throw new BadRequestException('Cabecalho invalido. Necessario colunas "Codigo" e "Custo".');
    }

    let processed = 0;
    let errors = 0;

    for (let i = 1; i < lines.length; i++) {
      const parts = this.parseDelimitedLine(lines[i], delimiter);
      const code = parts[codeIdx] || '';
      const description = descIdx !== -1 ? (parts[descIdx] || 'Importado via CSV') : 'Importado via CSV';
      const costRaw = parts[costIdx] || '';

      if (!code || !costRaw) {
        errors++;
        continue;
      }

      const cost = this.parseCurrency(costRaw);

      await this.prisma.equipmentUnitCost.upsert({
        where: { code },
        update: { description, cost },
        create: { code, description, cost },
      });
      processed++;
    }

    return { processed, errors };
  }
}

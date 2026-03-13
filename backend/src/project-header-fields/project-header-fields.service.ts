import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectHeaderFieldsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.projectHeaderField.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(data: { label: string }) {
    // Atribui sortOrder = max + 1
    const maxField = await this.prisma.projectHeaderField.findFirst({
      orderBy: { sortOrder: 'desc' },
    });
    const nextOrder = (maxField?.sortOrder ?? -1) + 1;

    return this.prisma.projectHeaderField.create({
      data: {
        label: data.label,
        sortOrder: nextOrder,
      },
    });
  }

  async update(id: string, data: { label?: string; isActive?: boolean }) {
    const existing = await this.prisma.projectHeaderField.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campo não encontrado');

    return this.prisma.projectHeaderField.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.projectHeaderField.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campo não encontrado');

    return this.prisma.projectHeaderField.delete({ where: { id } });
  }

  async reorder(orderedIds: string[]) {
    const updates = orderedIds.map((id, index) =>
      this.prisma.projectHeaderField.update({
        where: { id },
        data: { sortOrder: index },
      }),
    );

    return this.prisma.$transaction(updates);
  }
}

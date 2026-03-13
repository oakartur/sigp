import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const label = data?.label?.trim();
    if (!label) {
      throw new BadRequestException('Nome do campo e obrigatorio.');
    }

    const existingField = await this.prisma.projectHeaderField.findFirst({
      where: { label: { equals: label, mode: 'insensitive' } },
    });
    if (existingField) {
      throw new ConflictException('Ja existe um campo com esse nome.');
    }

    const maxOrderResult = await this.prisma.projectHeaderField.aggregate({
      _max: { sortOrder: true },
    });
    const nextOrder = (maxOrderResult._max.sortOrder ?? -1) + 1;

    try {
      return await this.prisma.projectHeaderField.create({
        data: {
          label,
          sortOrder: nextOrder,
          isActive: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ja existe um campo com esse nome.');
      }
      throw error;
    }
  }

  async update(id: string, data: { label?: string; isActive?: boolean }) {
    const existing = await this.prisma.projectHeaderField.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campo nao encontrado');

    const normalizedData = { ...data };
    if (typeof normalizedData.label === 'string') {
      normalizedData.label = normalizedData.label.trim();
      if (!normalizedData.label) {
        throw new BadRequestException('Nome do campo e obrigatorio.');
      }
    }

    try {
      return await this.prisma.projectHeaderField.update({
        where: { id },
        data: normalizedData,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ja existe um campo com esse nome.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.projectHeaderField.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campo nao encontrado');

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

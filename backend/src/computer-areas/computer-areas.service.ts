import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ComputerAreasService {
  constructor(private prisma: PrismaService) {}

  private normalizeText(value?: string | null): string {
    return String(value ?? '').trim();
  }

  async findCatalog() {
    return this.prisma.computerAreaCatalog.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createArea(body: { name: string; sortOrder?: number }) {
    const name = this.normalizeText(body?.name);
    if (!name) throw new BadRequestException('Nome da area e obrigatorio.');
    const requestedSortOrder =
      body?.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))
        ? Math.trunc(Number(body.sortOrder))
        : null;

    const existing = await this.prisma.computerAreaCatalog.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('Ja existe uma area com esse nome.');
      }

      return this.prisma.computerAreaCatalog.update({
        where: { id: existing.id },
        data: {
          name,
          isActive: true,
          ...(requestedSortOrder !== null ? { sortOrder: requestedSortOrder } : {}),
        },
      });
    }

    const maxOrder = await this.prisma.computerAreaCatalog.aggregate({
      _max: { sortOrder: true },
    });
    const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    return this.prisma.computerAreaCatalog.create({
      data: {
        name,
        sortOrder: requestedSortOrder ?? nextOrder,
        isActive: true,
      },
    });
  }

  async updateArea(id: string, body: { name?: string; isActive?: boolean; sortOrder?: number }) {
    const current = await this.prisma.computerAreaCatalog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Area nao encontrada.');

    const nextName = body.name !== undefined ? this.normalizeText(body.name) : current.name;
    if (!nextName) throw new BadRequestException('Nome da area e obrigatorio.');

    const duplicated = await this.prisma.computerAreaCatalog.findFirst({
      where: {
        id: { not: id },
        name: { equals: nextName, mode: 'insensitive' },
      },
    });
    if (duplicated) {
      throw new ConflictException('Ja existe uma area com esse nome.');
    }

    return this.prisma.computerAreaCatalog.update({
      where: { id },
      data: {
        name: nextName,
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
        ...(body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))
          ? { sortOrder: Math.trunc(Number(body.sortOrder)) }
          : {}),
      },
    });
  }

  async removeArea(id: string) {
    const current = await this.prisma.computerAreaCatalog.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Area nao encontrada.');

    return this.prisma.computerAreaCatalog.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(data: { name: string }) {
    return this.prisma.project.create({ data });
  }

  async findAll() {
    return this.prisma.project.findMany();
  }

  async findOne(id: string) {
    return this.prisma.project.findUnique({
      where: { id },
      include: {
        requisitions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Projeto nao encontrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      const requisitions = await tx.requisition.findMany({
        where: { projectId: id },
        select: { id: true },
      });
      const requisitionIds = requisitions.map((item) => item.id);

      if (requisitionIds.length > 0) {
        await tx.requisitionItem.deleteMany({
          where: { requisitionId: { in: requisitionIds } },
        });
        await tx.requisitionProjectConfig.deleteMany({
          where: { requisitionId: { in: requisitionIds } },
        });
        await tx.requisition.deleteMany({
          where: { id: { in: requisitionIds } },
        });
      }

      await tx.project.delete({ where: { id } });

      return {
        deletedProjectId: id,
        deletedRequisitions: requisitionIds.length,
      };
    });
  }
}

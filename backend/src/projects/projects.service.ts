import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogsService } from '../system-logs/system-logs.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService, private systemLogsService: SystemLogsService) {}

  async create(userId: string, data: { name: string }) {
    const project = await this.prisma.project.create({ data });
    await this.systemLogsService.logAction(userId, 'CREATE', 'PROJECT', project.id, null, project as any);
    return project;
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

  async remove(userId: string, id: string) {
    const existing = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException('Projeto nao encontrado.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
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

    await this.systemLogsService.logAction(userId, 'DELETE', 'PROJECT', id, existing as any, null);

    return result;
  }
}

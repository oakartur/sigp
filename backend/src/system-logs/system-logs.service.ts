import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export type LogAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'BATCH_UPDATE';
export type LogEntity = 'PROJECT' | 'REQUISITION' | 'EQUIPMENT' | 'USER' | 'SETTINGS';

@Injectable()
export class SystemLogsService {
  constructor(private prisma: PrismaService) {}

  async logAction(
    userId: string | null,
    action: LogAction,
    entityType: LogEntity,
    entityId: string,
    oldValue?: Prisma.InputJsonValue | null,
    newValue?: Prisma.InputJsonValue | null,
  ) {
    // Avoid storing the entire object graph if it's too nested, although Prisma JSON accepts it.
    await this.prisma.systemLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        oldValue: oldValue ? (oldValue as any) : undefined,
        newValue: newValue ? (newValue as any) : undefined,
      },
    });
  }

  async findAll(filters: { userId?: string; entityType?: string; action?: string; skip?: number; take?: number }) {
    const where: Prisma.SystemLogWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.action) where.action = filters.action;

    const skip = filters.skip ? Number(filters.skip) : 0;
    const take = filters.take ? Number(filters.take) : 50;

    const [total, items] = await Promise.all([
      this.prisma.systemLog.count({ where }),
      this.prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    return {
      total,
      skip,
      take,
      items,
    };
  }
}

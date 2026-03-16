import { BadRequestException, Injectable } from '@nestjs/common';
import { ReqStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ExportSelection = {
  includeCatalog: boolean;
  includeProjectHeaderFields: boolean;
  includeProjectsAndActiveVersions: boolean;
};

@Injectable()
export class SystemSettingsService {
  constructor(private prisma: PrismaService) {}

  async exportSettings(selection: ExportSelection) {
    if (
      !selection.includeCatalog &&
      !selection.includeProjectHeaderFields &&
      !selection.includeProjectsAndActiveVersions
    ) {
      throw new BadRequestException('Selecione pelo menos um bloco para exportacao.');
    }

    const payload: Record<string, unknown> = {
      schemaVersion: '1.0.0',
      exportedAtUtc: new Date().toISOString(),
      source: 'sigp',
      selection,
    };

    if (selection.includeCatalog) {
      payload.catalog = await this.prisma.localCatalog.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          operations: {
            orderBy: { sortOrder: 'asc' },
            include: {
              equipments: {
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
      });
    }

    if (selection.includeProjectHeaderFields) {
      payload.projectHeaderFields = await this.prisma.projectHeaderField.findMany({
        orderBy: { sortOrder: 'asc' },
      });
    }

    if (selection.includeProjectsAndActiveVersions) {
      payload.projects = await this.prisma.project.findMany({
        orderBy: { name: 'asc' },
        include: {
          requisitions: {
            where: { status: { not: ReqStatus.COMPLETED } },
            orderBy: [{ createdAt: 'asc' }],
            include: {
              projectConfigs: {
                orderBy: [{ field: { sortOrder: 'asc' } }],
                include: {
                  field: true,
                },
              },
              items: {
                orderBy: [{ localName: 'asc' }, { operationName: 'asc' }, { equipmentName: 'asc' }],
              },
            },
          },
        },
      });
    }

    return payload;
  }
}

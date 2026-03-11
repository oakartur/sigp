import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormulasService } from '../formulas/formulas.service';
import { Prisma, RequisitionItem, Requisition } from '@prisma/client';

@Injectable()
export class RequisitionsService {
  constructor(
    private prisma: PrismaService,
    private formulasService: FormulasService,
  ) {}

  async createInitialRequisition(projectId: string) {
    return this.prisma.requisition.create({
      data: {
        projectId,
        version: 1,
        status: 'PENDING',
      },
    });
  }

  // SNAPSHOT: Altera o estado para COMPLETED e garante que o próximo request gere nova versão
  async completeRequisition(id: string, currentLock: number) {
    const req = await this.prisma.requisition.findUnique({ where: { id } });
    if (!req) throw new BadRequestException('Requisition not found');
    if (req.versionLock !== currentLock) {
      throw new ConflictException('Concorrência: Alguém modificou a requisição. Atualize a tela.');
    }

    return this.prisma.requisition.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        isReadOnly: true, // Congela versão atual
        versionLock: { increment: 1 },
      },
    });
  }

  // Cria um clone "V+1" se a requisição estiver COMPLETED e o usuário quiser editar
  async createSnapshot(existingId: string) {
    const req = await this.prisma.requisition.findUnique({
      where: { id: existingId },
      include: { items: true },
    });
    if (!req) throw new BadRequestException('Origem não encontrada');
    if (req.status !== 'COMPLETED') {
      throw new BadRequestException('Apenas requisições fechadas geram novos Snapshots');
    }

    const nextVersion = req.version + 1;
    
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Cria novo Header
      const newReq = await tx.requisition.create({
        data: {
          projectId: req.projectId,
          version: nextVersion,
          status: 'FILLING',
          isReadOnly: false,
        },
      });

      // Duplica Items copiando os logs anteriores (exceto override se preferir limpar)
      if (req.items.length > 0) {
        await tx.requisitionItem.createMany({
          data: req.items.map((i: RequisitionItem) => ({
            requisitionId: newReq.id,
            equipmentName: i.equipmentName,
            formulaId: i.formulaId,
            variablesPayload: i.variablesPayload ?? undefined,
            calculatedValue: i.calculatedValue,
            overrideValue: i.overrideValue, // Transfere override pro novo snapshot
            status: 'PENDING' as const, // Items clonados deverão ser recebidos de novo
          }))
        });
      }
      return newReq;
    });
  }

  async addItem(reqId: string, payload: any) {
    const req = await this.prisma.requisition.findUnique({ where: { id: reqId } });
    if (req?.isReadOnly) throw new BadRequestException('Requisição congelada (Somente Leitura)');

    let calculatedValue: number | null = null;
    if (payload.formulaId && payload.variables) {
      const formula = await this.prisma.formula.findUnique({ where: { id: payload.formulaId } });
      if (formula) {
        calculatedValue = this.formulasService.evaluateFormula(formula.expression, payload.variables);
      }
    }

    return this.prisma.requisitionItem.create({
      data: {
        requisitionId: reqId,
        equipmentName: payload.equipmentName,
        formulaId: payload.formulaId,
        variablesPayload: payload.variables ? payload.variables : undefined,
        calculatedValue,
      },
    });
  }

  async adminOverrideItem(itemId: string, overrideValue: number, currentLock: number) {
    const item = await this.prisma.requisitionItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('Item não encontrado.');
    if (item.versionLock !== currentLock) {
      throw new ConflictException('Conflito de edição no item.');
    }
    return this.prisma.requisitionItem.update({
      where: { id: itemId },
      data: {
        overrideValue,
        versionLock: { increment: 1 },
      },
    });
  }

  async managerReceiveItem(itemId: string, managerId: string, observation: string, currentLock: number) {
    const item = await this.prisma.requisitionItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('Item não encontrado.');
    if (item.versionLock !== currentLock) {
      throw new ConflictException('O item foi editado pelo admin. Atualize a lista.');
    }
    return this.prisma.requisitionItem.update({
      where: { id: itemId },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
        receivedById: managerId,
        observation,
        versionLock: { increment: 1 },
      },
    });
  }
}

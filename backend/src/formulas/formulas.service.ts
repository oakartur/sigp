import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as math from 'mathjs';

@Injectable()
export class FormulasService {
  constructor(private prisma: PrismaService) {}

  async create(data: { name: string; expression: string }) {
    this.validateExpression(data.expression);
    return this.prisma.formula.create({ data });
  }

  async findAll() {
    return this.prisma.formula.findMany();
  }

  async update(id: string, data: { name?: string; expression?: string; isActive?: boolean }) {
    if (data.expression) {
      this.validateExpression(data.expression);
    }
    return this.prisma.formula.update({ where: { id }, data });
  }

  // Avaliação segura da fórmula em AST
  evaluateFormula(expression: string, variables: Record<string, number>): number {
    try {
      const compiled = math.compile(expression);
      return compiled.evaluate(variables);
    } catch (e: any) {
      throw new BadRequestException(`Erro ao avaliar a fórmula: ${e.message}`);
    }
  }

  // Validação simples se compila corretamente
  private validateExpression(expression: string) {
    try {
      math.parse(expression);
    } catch (e: any) {
      throw new BadRequestException(`Sintaxe da fórmula inválida: ${e.message}`);
    }
  }
}

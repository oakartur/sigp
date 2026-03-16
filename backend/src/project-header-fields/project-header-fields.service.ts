import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectHeaderFieldType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as math from 'mathjs';

type CreateFieldInput = {
  label: string;
  type?: ProjectHeaderFieldType;
  options?: string[];
  defaultValue?: string | null;
  formulaExpression?: string | null;
};

type UpdateFieldInput = {
  label?: string;
  type?: ProjectHeaderFieldType;
  options?: string[] | null;
  defaultValue?: string | null;
  formulaExpression?: string | null;
  isActive?: boolean;
};

@Injectable()
export class ProjectHeaderFieldsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.projectHeaderField.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  private normalizeString(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeOptions(options: unknown): string[] {
    if (!Array.isArray(options)) return [];

    const dedup = new Set<string>();
    const normalized: string[] = [];

    for (const option of options) {
      const value = String(option ?? '').trim();
      if (!value) continue;

      const key = value.toLowerCase();
      if (dedup.has(key)) continue;
      dedup.add(key);
      normalized.push(value);
    }

    return normalized;
  }

  private normalizeFieldAlias(label: string): string {
    return label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  private getFormulaTokens(formula: string): string[] {
    const unique = new Set<string>();
    const regex = /\{\{\s*([^}]+)\s*\}\}|\{\s*([^{}]+)\s*\}/g;

    let match: RegExpExecArray | null = regex.exec(formula);
    while (match) {
      const token = this.normalizeString(match[1] ?? match[2] ?? '');
      if (token) unique.add(token);
      match = regex.exec(formula);
    }

    return Array.from(unique);
  }

  private async validateFormulaReferences(
    formulaExpression: string | null,
    currentFieldId?: string,
    currentFieldLabel?: string,
  ) {
    if (!formulaExpression) return;

    const tokens = this.getFormulaTokens(formulaExpression);
    if (tokens.length === 0) return;

    const fields = await this.prisma.projectHeaderField.findMany({
      where: currentFieldId
        ? {
            OR: [{ isActive: true }, { id: currentFieldId }],
          }
        : { isActive: true },
      select: { id: true, label: true },
    });

    const tokenMatchesField = (token: string, field: { id: string; label: string }) => {
      const tokenNormalized = token.toLowerCase();
      const fieldLabelNormalized = field.label.toLowerCase();
      return (
        token === field.id ||
        tokenNormalized === fieldLabelNormalized ||
        this.normalizeFieldAlias(token) === this.normalizeFieldAlias(field.label)
      );
    };

    const missingTokens: string[] = [];
    for (const token of tokens) {
      const referencedField = fields.find((field) => tokenMatchesField(token, field));
      const isSelfReferenceByLabel =
        !!currentFieldLabel && this.normalizeFieldAlias(token) === this.normalizeFieldAlias(currentFieldLabel);

      if (referencedField?.id === currentFieldId || isSelfReferenceByLabel) {
        throw new BadRequestException('Formula nao pode referenciar o proprio campo.');
      }

      if (!referencedField && !isSelfReferenceByLabel) {
        missingTokens.push(token);
      }
    }

    if (missingTokens.length > 0) {
      throw new BadRequestException(
        `Formula referencia campo(s) inexistente(s): ${missingTokens.join(', ')}.`,
      );
    }
  }

  private normalizeFormulaExpression(formula?: string | null): string | null {
    const value = this.normalizeString(formula);
    if (!value) return null;

    const withIf = value
      .replace(/\bse\s*\(/gi, 'if(')
      .replace(/\bou\s*\(/gi, 'or(')
      .replace(/\be\s*\(/gi, 'and(')
      .replace(/;/g, ',');
    const withoutExcelPrefix = withIf.replace(/^\s*=\s*/, '');
    return withoutExcelPrefix.replace(/(?<![<>=!])=(?!=)/g, '==');
  }

  private validateFormulaSyntax(formula: string) {
    const withPlaceholders = formula.replace(/\{\{\s*[^}]+\s*\}\}|\{\s*[^{}]+\s*\}/g, '1');

    try {
      math.parse(withPlaceholders);
    } catch (error: any) {
      throw new BadRequestException(`Formula invalida: ${error?.message || 'erro de sintaxe'}`);
    }
  }

  private resolveFieldPayload(input: {
    label: string;
    type: ProjectHeaderFieldType;
    options?: unknown;
    defaultValue?: string | null;
    formulaExpression?: string | null;
  }) {
    const label = this.normalizeString(input.label);
    if (!label) {
      throw new BadRequestException('Nome do campo e obrigatorio.');
    }

    const type = input.type;
    const options = this.normalizeOptions(input.options);
    let defaultValue = this.normalizeString(input.defaultValue);
    let formulaExpression = this.normalizeFormulaExpression(input.formulaExpression);

    if (type === ProjectHeaderFieldType.SELECT) {
      if (options.length === 0) {
        throw new BadRequestException('Campos do tipo lista exigem ao menos uma opcao.');
      }

      if (defaultValue && !options.some((option) => option === defaultValue)) {
        throw new BadRequestException('Valor padrao deve existir na lista de opcoes.');
      }
    }

    if (type !== ProjectHeaderFieldType.SELECT) {
      defaultValue = defaultValue ?? null;
    }

    if (type === ProjectHeaderFieldType.NUMBER && defaultValue !== null) {
      const parsed = Number(String(defaultValue).replace(',', '.'));
      if (Number.isNaN(parsed)) {
        throw new BadRequestException('Valor padrao do tipo numero deve ser numerico.');
      }
      defaultValue = String(parsed);
    }

    if (type === ProjectHeaderFieldType.COMPUTED) {
      if (!formulaExpression) {
        throw new BadRequestException('Campos calculados exigem formula.');
      }
      this.validateFormulaSyntax(formulaExpression);
      defaultValue = null;
    } else {
      formulaExpression = null;
    }

    return {
      label,
      type,
      options: type === ProjectHeaderFieldType.SELECT ? options : Prisma.JsonNull,
      defaultValue,
      formulaExpression,
    };
  }

  async create(data: CreateFieldInput) {
    const type = data.type ?? ProjectHeaderFieldType.TEXT;
    const payload = this.resolveFieldPayload({
      label: data.label,
      type,
      options: data.options,
      defaultValue: data.defaultValue,
      formulaExpression: data.formulaExpression,
    });
    await this.validateFormulaReferences(payload.formulaExpression, undefined, payload.label);

    const existingField = await this.prisma.projectHeaderField.findFirst({
      where: { label: { equals: payload.label, mode: 'insensitive' } },
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
          ...payload,
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

  async update(id: string, data: UpdateFieldInput) {
    const existing = await this.prisma.projectHeaderField.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campo nao encontrado');

    const label = typeof data.label === 'string' ? data.label : existing.label;
    const type = data.type ?? existing.type;
    const options = data.options === undefined ? existing.options : data.options;
    const defaultValue = data.defaultValue === undefined ? existing.defaultValue : data.defaultValue;
    const formulaExpression =
      data.formulaExpression === undefined ? existing.formulaExpression : data.formulaExpression;

    const payload = this.resolveFieldPayload({
      label,
      type,
      options,
      defaultValue,
      formulaExpression,
    });
    await this.validateFormulaReferences(payload.formulaExpression, id, payload.label);

    const duplicated = await this.prisma.projectHeaderField.findFirst({
      where: {
        id: { not: id },
        label: { equals: payload.label, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicated) {
      throw new ConflictException('Ja existe um campo com esse nome.');
    }

    try {
      return await this.prisma.projectHeaderField.update({
        where: { id },
        data: {
          ...payload,
          ...(typeof data.isActive === 'boolean' ? { isActive: data.isActive } : {}),
        },
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

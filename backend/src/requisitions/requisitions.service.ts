import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormulasService } from '../formulas/formulas.service';
import {
  Prisma,
  ProjectHeaderFieldType,
  QuantitySourceType,
  ReqStatus,
  RequisitionItem,
  Role,
} from '@prisma/client';
import * as math from 'mathjs';

type ConfigWithField = Prisma.RequisitionProjectConfigGetPayload<{
  include: { field: true };
}>;

type FormulaRuntimeContext = {
  variables?: Record<string, unknown>;
  quantityResolver?: (local: unknown, operation: unknown, equipment: unknown) => number;
  allowUnknownTokensAsLiteral?: boolean;
};

type ResolvedAutoQuantity = {
  quantity: number;
  sourceType: QuantitySourceType;
  sourceNote: string | null;
};

@Injectable()
export class RequisitionsService {
  constructor(
    private prisma: PrismaService,
    private formulasService: FormulasService,
  ) {}

  private normalizeVersion(version: string | undefined, fallback: string): string {
    const normalized = version?.trim();
    return normalized && normalized.length > 0 ? normalized : fallback;
  }

  private normalizeText(value?: string | null): string {
    return String(value ?? '').trim();
  }

  private normalizeFieldAlias(label: string): string {
    return label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  private sanitizeFormulaInput(expression: string): string {
    return expression
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[−–—]/g, '-')
      .replace(/[×]/g, '*')
      .replace(/[÷]/g, '/')
      .replace(/[｛]/g, '{')
      .replace(/[｝]/g, '}')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/[，]/g, ',')
      .replace(/[；]/g, ';');
  }

  private normalizeDecimalCommas(expression: string): string {
    // Converte apenas numero com virgula decimal (ex.: 1,1 -> 1.1),
    // sem tocar em separadores de argumentos (ex.: arred(1.1,0)).
    return expression.replace(/(?<![\d.])(\d+)\s*,\s*(\d+)(?![\d.])/g, '$1.$2');
  }

  private splitTopLevelArgs(argsText: string): string[] {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    let braceDepth = 0;
    let quote: "'" | '"' | null = null;

    for (let i = 0; i < argsText.length; i++) {
      const char = argsText[i];
      const prev = i > 0 ? argsText[i - 1] : '';

      if (quote) {
        current += char;
        if (char === quote && prev !== '\\') quote = null;
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        current += char;
        continue;
      }

      if (char === '{') {
        braceDepth++;
        current += char;
        continue;
      }
      if (char === '}') {
        if (braceDepth > 0) braceDepth--;
        current += char;
        continue;
      }

      if (braceDepth === 0) {
        if (char === '(') {
          depth++;
          current += char;
          continue;
        }
        if (char === ')') {
          if (depth > 0) depth--;
          current += char;
          continue;
        }
        if (char === ',' && depth === 0) {
          args.push(current.trim());
          current = '';
          continue;
        }
      }

      current += char;
    }

    args.push(current.trim());
    return args;
  }

  private findMatchingParen(text: string, openIndex: number): number {
    let depth = 0;
    let quote: "'" | '"' | null = null;

    for (let i = openIndex; i < text.length; i++) {
      const char = text[i];
      const prev = i > 0 ? text[i - 1] : '';

      if (quote) {
        if (char === quote && prev !== '\\') quote = null;
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (char === '(') depth++;
      if (char === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }

    return -1;
  }

  private rewriteIfCallsToTernary(expression: string): string {
    const source = expression;
    let result = '';
    let i = 0;

    while (i < source.length) {
      const char = source[i];
      const isIdentStart = /[A-Za-z_]/.test(char);
      if (!isIdentStart) {
        result += char;
        i++;
        continue;
      }

      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
      const name = source.slice(i, j);

      let k = j;
      while (k < source.length && /\s/.test(source[k])) k++;

      const nameLower = name.toLowerCase();
      if ((nameLower === 'if' || nameLower === 'se') && source[k] === '(') {
        const closeIndex = this.findMatchingParen(source, k);
        if (closeIndex > k) {
          const argsText = source.slice(k + 1, closeIndex);
          const args = this.splitTopLevelArgs(argsText);
          if (args.length === 3) {
            const condition = this.rewriteIfCallsToTernary(args[0]);
            const whenTrue = this.rewriteIfCallsToTernary(args[1]);
            const whenFalse = this.rewriteIfCallsToTernary(args[2]);
            result += `((${condition}) ? (${whenTrue}) : (${whenFalse}))`;
            i = closeIndex + 1;
            continue;
          }
        }
      }

      result += char;
      i++;
    }

    return result;
  }

  private unwrapMalformedIfWrapper(expression: string): string {
    const trimmed = this.normalizeText(expression);
    const ifMatch = /^if\s*\(/i.exec(trimmed);
    if (!ifMatch) return trimmed;

    const openIndex = trimmed.indexOf('(', ifMatch.index);
    if (openIndex < 0) return trimmed;

    const closeIndex = this.findMatchingParen(trimmed, openIndex);
    if (closeIndex !== trimmed.length - 1) return trimmed;

    const inside = trimmed.slice(openIndex + 1, closeIndex).trim();
    if (!inside.includes('?') || !inside.includes(':')) return trimmed;

    const args = this.splitTopLevelArgs(inside);
    if (args.length !== 1) return trimmed;
    return inside;
  }

  private normalizeExpression(expression: string): string {
    const trimmed = this.sanitizeFormulaInput(this.normalizeText(expression));
    const withIf = trimmed
      .replace(/\bse\s*\(/gi, 'if(')
      .replace(/\bou\s*\(/gi, 'or(')
      .replace(/\be\s*\(/gi, 'and(')
      .replace(/;/g, ',');
    const withFunctionAliases = withIf
      .replace(/\bsoma\s*\(/gi, 'soma(')
      .replace(/\barredondar\s*\(/gi, 'arred(')
      .replace(/\barred\s*\(/gi, 'arred(')
      .replace(/\binteiro\s*\(/gi, 'inteiro(')
      .replace(/\bint\s*\(/gi, 'int(');
    const withoutExcelPrefix = withFunctionAliases.replace(/^\s*=\s*/, '');
    const withDecimalDot = this.normalizeDecimalCommas(withoutExcelPrefix);
    const withNotEqual = withDecimalDot.replace(/<>/g, '!=');
    const withEq = withNotEqual.replace(/(?<![<>=!])=(?!=)/g, '==');
    const withEqFunctions = this.rewriteEqualityOperators(withEq);
    return this.unwrapMalformedIfWrapper(withEqFunctions);
  }

  private rewriteEqualityOperators(expression: string): string {
    const operand =
      '(?:__token_\\d+|[A-Za-z_][A-Za-z0-9_]*|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|-?\\d+(?:\\.\\d+)?)';

    const neqRegex = new RegExp(`(${operand})\\s*!=\\s*(${operand})`, 'g');
    const eqRegex = new RegExp(`(${operand})\\s*==\\s*(${operand})`, 'g');

    return expression.replace(neqRegex, 'neq($1,$2)').replace(eqRegex, 'eq($1,$2)');
  }

  private parseAstWithLazyIf(expression: string) {
    const parsed = math.parse(expression);
    const ConditionalNodeCtor = (math as any).ConditionalNode;
    const FunctionNodeCtor = (math as any).FunctionNode;
    const SymbolNodeCtor = (math as any).SymbolNode;
    if (!ConditionalNodeCtor || !FunctionNodeCtor || !SymbolNodeCtor) return parsed;

    return parsed.transform((node: any) => {
      const fnName = node?.fn?.name;
      const isIfLike =
        node?.isFunctionNode &&
        node?.fn?.isSymbolNode &&
        typeof fnName === 'string' &&
        ['if', 'se'].includes(fnName.toLowerCase()) &&
        Array.isArray(node?.args) &&
        node.args.length === 3;

      if (isIfLike) {
        return new ConditionalNodeCtor(node.args[0], node.args[1], node.args[2]);
      }

      const isConcatOperator =
        node?.isOperatorNode && node?.op === '&' && Array.isArray(node?.args) && node.args.length === 2;
      if (isConcatOperator) {
        return new FunctionNodeCtor(new SymbolNodeCtor('concat'), [node.args[0], node.args[1]]);
      }

      return node;
    });
  }

  private toComparable(value: unknown): string | number | boolean {
    if (typeof value === 'number' || typeof value === 'boolean') return value;

    const text = this.normalizeText(String(value ?? ''));
    const lower = text.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;

    const parsed = Number(text.replace(',', '.'));
    if (!Number.isNaN(parsed)) return parsed;

    return text;
  }

  private isEqual(left: unknown, right: unknown): boolean {
    const a = this.toComparable(left);
    const b = this.toComparable(right);

    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
    return this.normalizeText(String(a)).toLowerCase() === this.normalizeText(String(b)).toLowerCase();
  }

  private parseNumber(value?: string | null): number | null {
    const normalized = this.normalizeText(value);
    if (!normalized) return null;

    const parsed = Number(normalized.replace(',', '.'));
    if (Number.isNaN(parsed)) return null;
    return parsed;
  }

  private toFormulaNumber(value: unknown): number {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException('Numero invalido em formula.');
      }
      return value;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    const normalized = this.normalizeText(String(value ?? '')).replace(',', '.');
    const parsed = Number(normalized);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      throw new BadRequestException(`Cannot convert "${String(value)}" to a number.`);
    }

    return parsed;
  }

  private parseSelectOptions(rawOptions: unknown): string[] {
    if (!Array.isArray(rawOptions)) return [];

    const dedup = new Set<string>();
    const result: string[] = [];
    for (const option of rawOptions) {
      const normalized = this.normalizeText(String(option ?? ''));
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (dedup.has(key)) continue;
      dedup.add(key);
      result.push(normalized);
    }

    return result;
  }

  private normalizeLooseKey(value?: string | null): string {
    return this.normalizeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toLowerCase();
  }

  private normalizeCatalogKey(value?: string | null): string {
    return this.normalizeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private buildCatalogLookupKey(local: string, operation: string, equipment: string): string {
    return `${local}||${operation}||${equipment}`;
  }

  private getEffectiveItemQuantity(item: {
    overrideValue?: number | null;
    manualQuantity?: number | null;
    calculatedValue?: number | null;
  }): number {
    if (typeof item.overrideValue === 'number' && Number.isFinite(item.overrideValue)) {
      return item.overrideValue;
    }

    const autoQuantity =
      typeof item.calculatedValue === 'number' && Number.isFinite(item.calculatedValue) ? item.calculatedValue : 0;
    const manualAdjustment =
      typeof item.manualQuantity === 'number' && Number.isFinite(item.manualQuantity) ? item.manualQuantity : 0;

    return autoQuantity + manualAdjustment;
  }

  private isStatusProjectField(label: string): boolean {
    return this.normalizeLooseKey(label) === 'statusdarequisicao';
  }

  private parseReqStatusFromText(value?: string | null): ReqStatus | null {
    const key = this.normalizeLooseKey(value);
    if (!key) return null;

    const pending = new Set(['pending', 'pendente', 'aberta', 'aberto']);
    const filling = new Set(['filling', 'preenchimento', 'empreenchimento', 'andamento', 'emandamento']);
    const completed = new Set(['completed', 'concluida', 'concluido', 'finalizada', 'finalizado', 'completa']);

    if (pending.has(key)) return ReqStatus.PENDING;
    if (filling.has(key)) return ReqStatus.FILLING;
    if (completed.has(key)) return ReqStatus.COMPLETED;
    return null;
  }

  private toStatusFieldValue(status: ReqStatus, fieldOptions: unknown, currentValue?: string | null): string {
    const normalizedCurrent = this.normalizeText(currentValue);
    if (normalizedCurrent && this.parseReqStatusFromText(normalizedCurrent) === status) {
      return normalizedCurrent;
    }

    const options = this.parseSelectOptions(fieldOptions);
    for (const option of options) {
      if (this.parseReqStatusFromText(option) === status) {
        return option;
      }
    }

    if (status === ReqStatus.PENDING) return 'Pending';
    if (status === ReqStatus.FILLING) return 'Filling';
    return 'Completed';
  }

  private async syncRequisitionStatusWithProjectConfig(tx: Prisma.TransactionClient, requisitionId: string) {
    const requisition = await tx.requisition.findUnique({
      where: { id: requisitionId },
      select: { id: true, status: true, isReadOnly: true },
    });
    if (!requisition) {
      throw new NotFoundException('Requisicao nao encontrada.');
    }

    const configs = await tx.requisitionProjectConfig.findMany({
      where: { requisitionId, field: { isActive: true } },
      include: { field: true },
      orderBy: [{ field: { sortOrder: 'asc' } }],
    });

    const statusConfig = configs.find((config) => this.isStatusProjectField(config.field.label));
    if (!statusConfig) {
      return;
    }

    const statusFromConfig = this.parseReqStatusFromText(statusConfig.value);
    let currentStatus = requisition.status;

    if (statusFromConfig && statusFromConfig !== requisition.status) {
      await tx.requisition.update({
        where: { id: requisitionId },
        data: {
          status: statusFromConfig,
          isReadOnly: statusFromConfig === ReqStatus.COMPLETED,
        },
      });
      currentStatus = statusFromConfig;
    }

    const desiredConfigValue = this.toStatusFieldValue(currentStatus, statusConfig.field.options, statusConfig.value);
    if (this.normalizeText(statusConfig.value) !== this.normalizeText(desiredConfigValue)) {
      await tx.requisitionProjectConfig.update({
        where: { id: statusConfig.id },
        data: { value: desiredConfigValue },
      });
    }
  }

  private getFieldDefaultValue(field: {
    type: ProjectHeaderFieldType;
    defaultValue: string | null;
    options: unknown;
  }): string {
    if (field.type === ProjectHeaderFieldType.COMPUTED) {
      return '';
    }

    const normalizedDefault = this.normalizeText(field.defaultValue);
    if (normalizedDefault) {
      return normalizedDefault;
    }

    if (field.type === ProjectHeaderFieldType.SELECT) {
      const options = this.parseSelectOptions(field.options);
      return options[0] ?? '';
    }

    return '';
  }

  private buildFormulaScope(configs: ConfigWithField[], runtime?: FormulaRuntimeContext) {
    const scope: Record<string, unknown> = {
      if: (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),
      SE: (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),
      se: (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),
      and: (...args: unknown[]) => args.every((value) => Boolean(value)),
      or: (...args: unknown[]) => args.some((value) => Boolean(value)),
      E: (...args: unknown[]) => args.every((value) => Boolean(value)),
      OU: (...args: unknown[]) => args.some((value) => Boolean(value)),
      soma: (...args: unknown[]) => args.reduce((acc: number, item) => acc + this.toFormulaNumber(item), 0),
      SOMA: (...args: unknown[]) => args.reduce((acc: number, item) => acc + this.toFormulaNumber(item), 0),
      sum: (...args: unknown[]) => args.reduce((acc: number, item) => acc + this.toFormulaNumber(item), 0),
      inteiro: (value: unknown) => Math.trunc(this.toFormulaNumber(value)),
      INTEIRO: (value: unknown) => Math.trunc(this.toFormulaNumber(value)),
      int: (value: unknown) => Math.trunc(this.toFormulaNumber(value)),
      arred: (value: unknown, decimals?: unknown) => {
        const base = this.toFormulaNumber(value);
        if (decimals === undefined) return Math.trunc(base);
        const precision = Math.trunc(this.toFormulaNumber(decimals));
        const factor = Math.pow(10, precision);
        return Math.round(base * factor) / factor;
      },
      ARRED: (value: unknown, decimals?: unknown) => {
        const base = this.toFormulaNumber(value);
        if (decimals === undefined) return Math.trunc(base);
        const precision = Math.trunc(this.toFormulaNumber(decimals));
        const factor = Math.pow(10, precision);
        return Math.round(base * factor) / factor;
      },
      eq: (left: unknown, right: unknown) => this.isEqual(left, right),
      neq: (left: unknown, right: unknown) => !this.isEqual(left, right),
      concat: (...args: unknown[]) => args.map((value) => this.normalizeText(String(value ?? ''))).join(''),
      CONCAT: (...args: unknown[]) => args.map((value) => this.normalizeText(String(value ?? ''))).join(''),
      concatenar: (...args: unknown[]) => args.map((value) => this.normalizeText(String(value ?? ''))).join(''),
      CONCATENAR: (...args: unknown[]) => args.map((value) => this.normalizeText(String(value ?? ''))).join(''),
      qtd: (local: unknown, operation: unknown, equipment: unknown) =>
        runtime?.quantityResolver ? runtime.quantityResolver(local, operation, equipment) : 0,
      QTD: (local: unknown, operation: unknown, equipment: unknown) =>
        runtime?.quantityResolver ? runtime.quantityResolver(local, operation, equipment) : 0,
      quantidade: (local: unknown, operation: unknown, equipment: unknown) =>
        runtime?.quantityResolver ? runtime.quantityResolver(local, operation, equipment) : 0,
    } as any;

    const valuesByFieldId = new Map<string, string | number | boolean>();
    const valuesByAlias = new Map<string, string | number | boolean>();
    const valuesByLabel = new Map<string, string | number | boolean>();
    const runtimeValuesByLooseKey = new Map<string, unknown>();

    if (runtime?.variables) {
      for (const [key, value] of Object.entries(runtime.variables)) {
        const normalizedKey = this.normalizeLooseKey(key);
        if (normalizedKey) runtimeValuesByLooseKey.set(normalizedKey, value);
        scope[key] = value;
      }
    }

    for (const config of configs) {
      const rawValue = this.normalizeText(config.value);
      const numericValue = this.parseNumber(rawValue);
      const normalizedLower = rawValue.toLowerCase();

      let typedValue: string | number | boolean = rawValue;
      if (
        config.field.type === ProjectHeaderFieldType.NUMBER ||
        config.field.type === ProjectHeaderFieldType.COMPUTED
      ) {
        typedValue = numericValue ?? 0;
      } else if (config.field.type === ProjectHeaderFieldType.TEXT && rawValue === '') {
        // Campo textual vazio participa de formulas numericas como zero.
        typedValue = 0;
      } else if (numericValue !== null) {
        typedValue = numericValue;
      } else if (normalizedLower === 'true') {
        typedValue = true;
      } else if (normalizedLower === 'false') {
        typedValue = false;
      }

      valuesByFieldId.set(config.fieldId, typedValue);
      const aliasRaw = config.field.label
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const alias = this.normalizeFieldAlias(config.field.label);

      if (aliasRaw && !(aliasRaw in scope)) {
        scope[aliasRaw] = typedValue;
      }
      if (alias && !valuesByAlias.has(alias)) {
        valuesByAlias.set(alias, typedValue);
      }
      if (alias && !(alias in scope)) {
        scope[alias] = typedValue;
      }
      valuesByLabel.set(this.normalizeText(config.field.label).toLowerCase(), typedValue);

      const idAlias = `f_${config.fieldId.replace(/[^a-zA-Z0-9]+/g, '_')}`;
      scope[idAlias] = typedValue;
    }

    return {
      scope,
      resolveToken: (token: string) => {
        const directId = this.normalizeText(token);
        if (valuesByFieldId.has(directId)) {
          return valuesByFieldId.get(directId);
        }

        const alias = this.normalizeFieldAlias(token);
        if (alias && valuesByAlias.has(alias)) {
          return valuesByAlias.get(alias);
        }

        if (runtime?.variables) {
          if (directId in runtime.variables) return runtime.variables[directId];
          const looseKey = this.normalizeLooseKey(directId);
          if (runtimeValuesByLooseKey.has(looseKey)) {
            return runtimeValuesByLooseKey.get(looseKey);
          }
        }

        throw new BadRequestException(`Token de formula nao encontrado: ${token}`);
      },
      resolveQuotedFieldLabel: (label: string) => {
        const key = this.normalizeText(label).toLowerCase();
        const fieldValue = valuesByLabel.get(key);
        if (fieldValue !== undefined) return fieldValue;

        if (runtime?.variables) {
          if (label in runtime.variables) return runtime.variables[label];
          const looseKey = this.normalizeLooseKey(label);
          if (runtimeValuesByLooseKey.has(looseKey)) {
            return runtimeValuesByLooseKey.get(looseKey);
          }
        }

        return undefined;
      },
    };
  }

  private evaluateExpression(
    expression: string,
    configs: ConfigWithField[],
    context: string,
    runtime?: FormulaRuntimeContext,
  ) {
    const normalizedExpression = this.normalizeExpression(expression);
    if (!normalizedExpression) {
      throw new BadRequestException(`Formula vazia em ${context}.`);
    }

    const { scope, resolveToken, resolveQuotedFieldLabel } = this.buildFormulaScope(configs, runtime);

    let tokenIndex = 0;
    const withReferenceTokens = normalizedExpression.replace(
      /\{\{\s*([^}]+)\s*\}\}|\{\s*([^{}]+)\s*\}/g,
      (_match, tokenDouble, tokenSingle) => {
        const token = tokenDouble ?? tokenSingle;
        const varName = `__token_${tokenIndex++}`;
        try {
          scope[varName] = resolveToken(token) as any;
        } catch (error) {
          if (!runtime?.allowUnknownTokensAsLiteral) {
            throw error;
          }
          scope[varName] = this.normalizeText(token) as any;
        }
        return varName;
      },
    );

    const expressionWithTokens = withReferenceTokens.replace(
      /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g,
      (quotedLiteral) => {
        const raw = quotedLiteral.slice(1, -1);
        const unescaped = raw.replace(/\\"/g, '"').replace(/\\'/g, "'");
        const resolved = resolveQuotedFieldLabel(unescaped);
        if (resolved === undefined) return quotedLiteral;

        const varName = `__token_${tokenIndex++}`;
        scope[varName] = resolved as any;
        return varName;
      },
    );

    const expressionForMath = this.unwrapMalformedIfWrapper(this.rewriteEqualityOperators(expressionWithTokens));
    const expressionFallback = this.unwrapMalformedIfWrapper(this.rewriteIfCallsToTernary(expressionForMath));

    try {
      const parsed = this.parseAstWithLazyIf(expressionForMath);
      const compiled = parsed.compile();
      return compiled.evaluate(scope as any);
    } catch (error: any) {
      try {
        const parsedFallback = this.parseAstWithLazyIf(expressionFallback);
        const compiledFallback = parsedFallback.compile();
        return compiledFallback.evaluate(scope as any);
      } catch (fallbackError: any) {
        throw new BadRequestException(
          `Erro ao avaliar formula em ${context}: ${fallbackError?.message || error?.message || 'erro desconhecido'}`,
        );
      }
    }
  }

  private serializeComputedValue(result: unknown): string {
    if (result === null || result === undefined) return '';
    if (typeof result === 'number') {
      if (!Number.isFinite(result)) {
        throw new BadRequestException('Formula calculada retornou numero invalido.');
      }
      return String(result);
    }
    if (typeof result === 'boolean') {
      return result ? '1' : '0';
    }
    if (typeof result === 'string') {
      return result;
    }

    return String(result);
  }

  private resolveAutoQuantity(result: unknown, context: string): ResolvedAutoQuantity {
    const parseSafeNumber = (raw: string): number | null => {
      const parsedValue = Number(raw.replace(',', '.'));
      if (Number.isNaN(parsedValue) || !Number.isFinite(parsedValue)) return null;
      return parsedValue;
    };

    const extractNumberFromText = (raw: string): number | null => {
      const parenthesisMatch = raw.match(/\(([-+]?\d+(?:[.,]\d+)?)\)/);
      if (parenthesisMatch?.[1]) {
        const parsedParenthesis = parseSafeNumber(parenthesisMatch[1]);
        if (parsedParenthesis !== null) return parsedParenthesis;
      }

      const firstNumberMatch = raw.match(/[-+]?\d+(?:[.,]\d+)?/);
      if (firstNumberMatch?.[0]) {
        const parsedFirstNumber = parseSafeNumber(firstNumberMatch[0]);
        if (parsedFirstNumber !== null) return parsedFirstNumber;
      }

      return null;
    };

    if (typeof result === 'number') {
      if (!Number.isFinite(result)) {
        throw new BadRequestException(`Formula em ${context} retornou numero invalido.`);
      }
      return { quantity: result, sourceType: QuantitySourceType.PURCHASE, sourceNote: null };
    }

    if (typeof result === 'boolean') {
      return {
        quantity: result ? 1 : 0,
        sourceType: QuantitySourceType.PURCHASE,
        sourceNote: null,
      };
    }

    const normalized = this.normalizeText(String(result ?? ''));
    if (!normalized) {
      return { quantity: 0, sourceType: QuantitySourceType.PURCHASE, sourceNote: null };
    }

    const directNumber = parseSafeNumber(normalized);
    if (directNumber !== null) {
      return { quantity: directNumber, sourceType: QuantitySourceType.PURCHASE, sourceNote: null };
    }

    // Origem em estoque: aceita textos como "EST. AGP (06)".
    if (/EST\.?\s*AGP/i.test(normalized)) {
      const stockQuantity = extractNumberFromText(normalized);
      if (stockQuantity === null) {
        throw new BadRequestException(
          `Formula em ${context} marcou EST. AGP, mas sem numero de quantidade (ex.: "EST. AGP (06)").`,
        );
      }
      return {
        quantity: stockQuantity,
        sourceType: QuantitySourceType.STOCK_AGP,
        sourceNote: normalized,
      };
    }

    throw new BadRequestException(
      `Formula em ${context} deve retornar numero, ou EST. AGP com quantidade (ex.: "EST. AGP (06)").`,
    );
  }

  private async recomputeComputedProjectConfigs(tx: Prisma.TransactionClient, requisitionId: string) {
    const configs = await tx.requisitionProjectConfig.findMany({
      where: {
        requisitionId,
        field: { isActive: true },
      },
      include: { field: true },
      orderBy: [{ field: { sortOrder: 'asc' } }],
    });

    const computedConfigs = configs.filter(
      (config) => config.field.type === ProjectHeaderFieldType.COMPUTED && this.normalizeText(config.field.formulaExpression),
    );

    if (computedConfigs.length === 0) {
      return;
    }

    const changed = new Map<string, string>();
    const formulaErrors = new Map<string, string>();

    for (let pass = 0; pass < configs.length; pass++) {
      let hasChanges = false;

      for (const config of computedConfigs) {
        const formula = this.normalizeText(config.field.formulaExpression);
        if (!formula) continue;

        let nextValue = '';
        try {
          const evaluated = this.evaluateExpression(formula, configs, `campo calculado '${config.field.label}'`);
          nextValue = this.serializeComputedValue(evaluated);
          formulaErrors.delete(config.id);
        } catch (error: any) {
          const message = this.normalizeText(error?.message || '');
          formulaErrors.set(config.id, message || 'erro de formula');
          // Nao derruba a tela de requisicao por erro em um campo calculado.
          continue;
        }

        const currentValue = this.normalizeText(config.value);

        if (nextValue !== currentValue) {
          config.value = nextValue;
          changed.set(config.id, nextValue);
          hasChanges = true;
        }
      }

      if (!hasChanges) {
        break;
      }
    }

    for (const [configId, value] of changed.entries()) {
      await tx.requisitionProjectConfig.update({
        where: { id: configId },
        data: { value },
      });
    }

    if (formulaErrors.size > 0) {
      for (const config of computedConfigs) {
        const errorMessage = formulaErrors.get(config.id);
        if (!errorMessage) continue;
        // Loga diagnostico sem interromper o fluxo.
        console.error(
          `[ProjectConfigFormula] requisition=${requisitionId} field=${config.field.label} error=${errorMessage}`,
        );
      }
    }
  }

  private async buildDefaultVersion(projectId: string): Promise<string> {
    const count = await this.prisma.requisition.count({ where: { projectId } });
    return `V${count + 1}`;
  }

  private async syncProjectConfigs(
    tx: Prisma.TransactionClient,
    requisitionId: string,
    sourceRequisitionId?: string,
  ) {
    const headerFields = await tx.projectHeaderField.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (headerFields.length === 0) {
      return [];
    }

    const existingConfigs = await tx.requisitionProjectConfig.findMany({
      where: { requisitionId },
    });
    const existingFieldIds = new Set(existingConfigs.map((config) => config.fieldId));

    const sourceMap = new Map<string, string | null>();
    if (sourceRequisitionId) {
      const sourceConfigs = await tx.requisitionProjectConfig.findMany({
        where: { requisitionId: sourceRequisitionId },
      });
      sourceConfigs.forEach((sourceConfig) => {
        sourceMap.set(sourceConfig.fieldId, sourceConfig.value ?? null);
      });
    }

    const missingConfigs = headerFields
      .filter((field) => !existingFieldIds.has(field.id))
      .map((field) => {
        const sourceValue = sourceMap.get(field.id);
        const value = sourceValue !== undefined && sourceValue !== null ? sourceValue : this.getFieldDefaultValue(field);

        return {
          requisitionId,
          fieldId: field.id,
          value,
        };
      });

    if (missingConfigs.length > 0) {
      await tx.requisitionProjectConfig.createMany({
        data: missingConfigs,
      });
    }

    await this.recomputeComputedProjectConfigs(tx, requisitionId);
    await this.syncRequisitionStatusWithProjectConfig(tx, requisitionId);

    return tx.requisitionProjectConfig.findMany({
      where: {
        requisitionId,
        field: { isActive: true },
      },
      include: { field: true },
      orderBy: [{ field: { sortOrder: 'asc' } }],
    });
  }

  private async syncCatalogItemsForRequisition(tx: Prisma.TransactionClient, requisitionId: string) {
    const requisition = await tx.requisition.findUnique({
      where: { id: requisitionId },
      select: { id: true, status: true },
    });
    if (!requisition) throw new NotFoundException('Requisicao nao encontrada.');

    const equipments = await tx.equipmentCatalog.findMany({
      where: {
        isActive: true,
        operation: {
          isActive: true,
          local: { isActive: true },
        },
      },
      include: {
        operation: {
          include: {
            local: true,
          },
        },
      },
    });

    const existingItems = await tx.requisitionItem.findMany({
      where: {
        requisitionId,
        equipmentCatalogId: { not: null },
      },
      select: {
        id: true,
        equipmentCatalogId: true,
        localName: true,
        operationName: true,
        equipmentCode: true,
        equipmentName: true,
        manualQuantity: true,
      },
    });

    if (equipments.length === 0) {
      if (requisition.status === ReqStatus.PENDING && existingItems.length > 0) {
        await tx.requisitionItem.deleteMany({
          where: { id: { in: existingItems.map((item) => item.id) } },
        });
      }
      return;
    }

    const equipmentByCatalogId = new Map(equipments.map((equipment) => [equipment.id, equipment]));
    const existingCatalogIds = new Set(
      existingItems
        .map((item) => item.equipmentCatalogId)
        .filter((catalogId): catalogId is string => Boolean(catalogId)),
    );

    const missingEquipments = equipments
      .filter((equipment) => !existingCatalogIds.has(equipment.id))
      .sort((a, b) => {
        if (a.operation.local.sortOrder !== b.operation.local.sortOrder) {
          return a.operation.local.sortOrder - b.operation.local.sortOrder;
        }
        if (a.operation.sortOrder !== b.operation.sortOrder) {
          return a.operation.sortOrder - b.operation.sortOrder;
        }
        return a.sortOrder - b.sortOrder;
      });

    if (missingEquipments.length > 0) {
      await tx.requisitionItem.createMany({
        data: missingEquipments.map((equipment) => {
          const hasAutoRule =
            Boolean(equipment.autoConfigFieldId) || this.normalizeText(equipment.autoFormulaExpression).length > 0;

          return {
            requisitionId,
            equipmentCatalogId: equipment.id,
            localName: equipment.operation.local.name,
            operationName: equipment.operation.name,
            equipmentCode: equipment.code,
            equipmentName: equipment.description,
            // Requisito: em itens auto, Qtd Manual e apenas ajuste.
            manualQuantity: hasAutoRule ? 0 : equipment.baseQuantity,
            status: 'PENDING' as const,
          };
        }),
      });
    }

    if (requisition.status !== ReqStatus.PENDING) {
      return;
    }

    const activeCatalogIds = new Set(equipments.map((equipment) => equipment.id));
    const staleItemIds = existingItems
      .filter((item) => item.equipmentCatalogId && !activeCatalogIds.has(item.equipmentCatalogId))
      .map((item) => item.id);

    if (staleItemIds.length > 0) {
      await tx.requisitionItem.deleteMany({
        where: { id: { in: staleItemIds } },
      });
    }

    for (const item of existingItems) {
      const catalogId = item.equipmentCatalogId;
      if (!catalogId || !activeCatalogIds.has(catalogId)) {
        continue;
      }

      const equipment = equipmentByCatalogId.get(catalogId);
      if (!equipment) continue;

      const shouldBackfillManualQuantity = item.manualQuantity === null;
      const hasAutoRule =
        Boolean(equipment.autoConfigFieldId) || this.normalizeText(equipment.autoFormulaExpression).length > 0;
      const fallbackManualQuantity = hasAutoRule ? 0 : equipment.baseQuantity;
      const nextManualQuantity = shouldBackfillManualQuantity ? fallbackManualQuantity : item.manualQuantity;

      const needsUpdate =
        item.localName !== equipment.operation.local.name ||
        item.operationName !== equipment.operation.name ||
        item.equipmentCode !== equipment.code ||
        item.equipmentName !== equipment.description ||
        (shouldBackfillManualQuantity && nextManualQuantity !== item.manualQuantity);

      if (!needsUpdate) continue;

      await tx.requisitionItem.update({
        where: { id: item.id },
        data: {
          localName: equipment.operation.local.name,
          operationName: equipment.operation.name,
          equipmentCode: equipment.code,
          equipmentName: equipment.description,
          ...(shouldBackfillManualQuantity ? { manualQuantity: nextManualQuantity } : {}),
          versionLock: { increment: 1 },
        },
      });
    }
  }

  async createInitialRequisition(projectId: string, version?: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projeto nao encontrado.');

    const defaultVersion = await this.buildDefaultVersion(projectId);
    const normalizedVersion = this.normalizeVersion(version, defaultVersion);

    const requisition = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const requisition = await tx.requisition.create({
        data: {
          projectId,
          version: normalizedVersion,
          status: 'FILLING',
        },
      });

      await this.syncProjectConfigs(tx, requisition.id);
      await this.syncCatalogItemsForRequisition(tx, requisition.id);
      return requisition;
    });

    // Evita desincronismo inicial: aplica auto preenchimento com valores default
    // das Configuracoes de Projeto (ex.: Obra = "Nova") logo na criacao.
    await this.autoFillItemsFromProjectConfigs(requisition.id);
    return requisition;
  }

  async completeRequisition(id: string, currentLock: number) {
    const req = await this.prisma.requisition.findUnique({ where: { id } });
    if (!req) throw new BadRequestException('Requisicao nao encontrada.');
    if (req.versionLock !== currentLock) {
      throw new ConflictException('Conflito de concorrencia. Atualize a tela.');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.requisition.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          isReadOnly: true,
          versionLock: { increment: 1 },
        },
      });

      await this.syncRequisitionStatusWithProjectConfig(tx, id);
      return updated;
    });
  }

  async createSnapshot(existingId: string, version?: string) {
    const req = await this.prisma.requisition.findUnique({
      where: { id: existingId },
      include: { items: true },
    });
    if (!req) throw new BadRequestException('Requisicao de origem nao encontrada.');

    const defaultVersion = await this.buildDefaultVersion(req.projectId);
    const normalizedVersion = this.normalizeVersion(version, defaultVersion);

    const newReq = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newReq = await tx.requisition.create({
        data: {
          projectId: req.projectId,
          version: normalizedVersion,
          status: 'FILLING',
          isReadOnly: false,
        },
      });

      if (req.items.length > 0) {
        await tx.requisitionItem.createMany({
          data: req.items.map((item: RequisitionItem & {
            equipmentCatalogId?: string | null;
            localName?: string | null;
            operationName?: string | null;
            equipmentCode?: string | null;
            manualQuantity?: number | null;
          }) => ({
            requisitionId: newReq.id,
            equipmentCatalogId: item.equipmentCatalogId ?? null,
            localName: item.localName ?? null,
            operationName: item.operationName ?? null,
            equipmentCode: item.equipmentCode ?? null,
            equipmentName: item.equipmentName,
            manualQuantity: item.manualQuantity ?? null,
            formulaId: item.formulaId,
            variablesPayload: item.variablesPayload ?? undefined,
            calculatedValue: item.calculatedValue,
            overrideValue: item.overrideValue,
            quantitySourceType: item.quantitySourceType ?? QuantitySourceType.PURCHASE,
            quantitySourceNote: item.quantitySourceNote ?? null,
            status: 'PENDING' as const,
          })),
        });
      }

      await this.syncCatalogItemsForRequisition(tx, newReq.id);
      await this.syncProjectConfigs(tx, newReq.id, req.id);
      return newReq;
    });

    // Garante formulas de auto preenchimento aplicadas na versao nova.
    await this.autoFillItemsFromProjectConfigs(newReq.id);
    return newReq;
  }

  async updateVersion(id: string, version: string) {
    const normalizedVersion = version?.trim();
    if (!normalizedVersion) {
      throw new BadRequestException('Versao e obrigatoria.');
    }

    const requisition = await this.prisma.requisition.findUnique({ where: { id } });
    if (!requisition) throw new NotFoundException('Requisicao nao encontrada.');

    return this.prisma.requisition.update({
      where: { id },
      data: {
        version: normalizedVersion,
        versionLock: { increment: 1 },
      },
    });
  }

  async findItems(reqId: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.syncCatalogItemsForRequisition(tx, reqId);
      return tx.requisitionItem.findMany({
        where: { requisitionId: reqId },
        include: {
          equipmentCatalog: {
            include: {
              autoConfigField: { select: { id: true, label: true } },
            },
          },
        },
        orderBy: [{ localName: 'asc' }, { operationName: 'asc' }, { equipmentName: 'asc' }],
      });
    });
  }

  async findProjectConfigs(reqId: string) {
    const requisition = await this.prisma.requisition.findUnique({ where: { id: reqId } });
    if (!requisition) throw new NotFoundException('Requisicao nao encontrada.');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return this.syncProjectConfigs(tx, reqId);
    });
  }

  async upsertProjectConfigs(reqId: string, configs: Array<{ fieldId: string; value: string }>, actorRole?: Role) {
    const requisition = await this.prisma.requisition.findUnique({ where: { id: reqId } });
    if (!requisition) throw new NotFoundException('Requisicao nao encontrada.');
    if (requisition.isReadOnly) {
      const isAdmin = actorRole === Role.ADMIN;
      if (!isAdmin) {
        throw new BadRequestException('Requisicao em modo somente leitura.');
      }

      const currentConfigs = await this.prisma.requisitionProjectConfig.findMany({
        where: {
          requisitionId: reqId,
          field: { isActive: true },
        },
        include: { field: true },
      });
      const currentByFieldId = new Map(currentConfigs.map((config) => [config.fieldId, config]));

      const changedConfigs = configs.filter((config) => {
        const current = currentByFieldId.get(config.fieldId);
        const currentValue = this.normalizeText(current?.value);
        const nextValue = this.normalizeText(config.value);
        return currentValue !== nextValue;
      });

      const hasNonStatusChange = changedConfigs.some((config) => {
        const current = currentByFieldId.get(config.fieldId);
        if (!current) return true;
        return !this.isStatusProjectField(current.field.label);
      });

      if (hasNonStatusChange) {
        throw new BadRequestException(
          'Requisicao em modo somente leitura. ADMIN pode alterar apenas o campo "Status da Requisicao".',
        );
      }
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.syncProjectConfigs(tx, reqId);

      const fieldIds = Array.from(new Set(configs.map((config) => config.fieldId).filter(Boolean)));
      const fields = await tx.projectHeaderField.findMany({
        where: { id: { in: fieldIds }, isActive: true },
      });
      const fieldsById = new Map(fields.map((field) => [field.id, field]));

      for (const config of configs) {
        if (!config.fieldId) continue;

        const field = fieldsById.get(config.fieldId);
        if (!field) continue;

        if (field.type === ProjectHeaderFieldType.COMPUTED) {
          continue;
        }

        const normalizedValue = this.normalizeText(config.value);

        if (field.type === ProjectHeaderFieldType.NUMBER && normalizedValue) {
          const parsed = Number(normalizedValue.replace(',', '.'));
          if (Number.isNaN(parsed)) {
            throw new BadRequestException(`Campo '${field.label}' exige valor numerico.`);
          }
        }

        if (field.type === ProjectHeaderFieldType.SELECT && normalizedValue) {
          const options = this.parseSelectOptions(field.options);
          if (!options.includes(normalizedValue)) {
            throw new BadRequestException(`Campo '${field.label}' exige um valor da lista configurada.`);
          }
        }

        await tx.requisitionProjectConfig.upsert({
          where: {
            requisitionId_fieldId: {
              requisitionId: reqId,
              fieldId: config.fieldId,
            },
          },
          create: {
            requisitionId: reqId,
            fieldId: config.fieldId,
            value: normalizedValue,
          },
          update: {
            value: normalizedValue,
          },
        });
      }

      return this.syncProjectConfigs(tx, reqId);
    });
  }

  async autoFillItemsFromProjectConfigs(reqId: string) {
    const requisition = await this.prisma.requisition.findUnique({ where: { id: reqId } });
    if (!requisition) throw new NotFoundException('Requisicao nao encontrada.');
    if (requisition.isReadOnly) {
      throw new BadRequestException('Requisicao em modo somente leitura.');
    }

    const configs = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.syncCatalogItemsForRequisition(tx, reqId);
      return this.syncProjectConfigs(tx, reqId);
    });

    const configByFieldId = new Map<string, string>();
    for (const config of configs) {
      configByFieldId.set(config.fieldId, this.normalizeText(config.value));
    }

    const items = await this.prisma.requisitionItem.findMany({
      where: { requisitionId: reqId, equipmentCatalogId: { not: null } },
      include: { equipmentCatalog: true },
    });

    const typedItems = items as Array<any>;
    const quantityByItemId = new Map<string, number>();
    const calculatedByItemId = new Map<string, number>();
    const initialCalculatedByItemId = new Map<string, number>();
    const manualAdjustmentByItemId = new Map<string, number>();
    const overrideByItemId = new Map<string, number | null>();
    const sourceTypeByItemId = new Map<string, QuantitySourceType>();
    const initialSourceTypeByItemId = new Map<string, QuantitySourceType>();
    const sourceNoteByItemId = new Map<string, string | null>();
    const initialSourceNoteByItemId = new Map<string, string | null>();
    const quantityByReference = new Map<string, number>();

    const registerItemQuantity = (item: any, quantity: number) => {
      const local = this.normalizeCatalogKey(item.localName);
      const operation = this.normalizeCatalogKey(item.operationName);
      const equipmentCode = this.normalizeCatalogKey(item.equipmentCode);

      if (local && operation && equipmentCode) {
        quantityByReference.set(this.buildCatalogLookupKey(local, operation, equipmentCode), quantity);
      }
    };

    for (const item of typedItems) {
      const initialCalculated =
        typeof item.calculatedValue === 'number' && Number.isFinite(item.calculatedValue) ? item.calculatedValue : 0;
      const manualAdjustment =
        typeof item.manualQuantity === 'number' && Number.isFinite(item.manualQuantity) ? item.manualQuantity : 0;
      const overrideValue =
        typeof item.overrideValue === 'number' && Number.isFinite(item.overrideValue) ? item.overrideValue : null;

      calculatedByItemId.set(item.id, initialCalculated);
      initialCalculatedByItemId.set(item.id, initialCalculated);
      manualAdjustmentByItemId.set(item.id, manualAdjustment);
      overrideByItemId.set(item.id, overrideValue);

      const initialEffective = this.getEffectiveItemQuantity(item);
      quantityByItemId.set(item.id, initialEffective);
      const initialSourceType = item.quantitySourceType ?? QuantitySourceType.PURCHASE;
      sourceTypeByItemId.set(item.id, initialSourceType);
      initialSourceTypeByItemId.set(item.id, initialSourceType);
      const initialSourceNote = this.normalizeText(item.quantitySourceNote) || null;
      sourceNoteByItemId.set(item.id, initialSourceNote);
      initialSourceNoteByItemId.set(item.id, initialSourceNote);
      registerItemQuantity(item, initialEffective);
    }

    const maxPasses = Math.max(typedItems.length, 1) + 2;
    for (let pass = 0; pass < maxPasses; pass++) {
      let hasChanges = false;

      for (const item of typedItems) {
        const catalog = item.equipmentCatalog;
        if (!catalog) continue;

        let resolvedQuantity: ResolvedAutoQuantity | null = null;

        if (this.normalizeText(catalog.autoFormulaExpression)) {
          const currentLocal = this.normalizeCatalogKey(item.localName);
          const currentOperation = this.normalizeCatalogKey(item.operationName);

          const evaluated = this.evaluateExpression(
            catalog.autoFormulaExpression,
            configs,
            `auto formula do equipamento '${catalog.description}'`,
            {
              variables: {
                Local: item.localName ?? '',
                Operacao: item.operationName ?? '',
                Operação: item.operationName ?? '',
                Equipamento: item.equipmentName ?? '',
                Codigo: item.equipmentCode ?? '',
                Código: item.equipmentCode ?? '',
              },
              allowUnknownTokensAsLiteral: true,
              quantityResolver: (local: unknown, operation: unknown, equipment: unknown) => {
                const targetLocal = this.normalizeCatalogKey(
                  this.normalizeText(String(local ?? '')) || currentLocal,
                );
                const targetOperation = this.normalizeCatalogKey(
                  this.normalizeText(String(operation ?? '')) || currentOperation,
                );
                const targetEquipment = this.normalizeCatalogKey(String(equipment ?? ''));

                if (!targetLocal || !targetOperation || !targetEquipment) return 0;

                return (
                  quantityByReference.get(
                    this.buildCatalogLookupKey(targetLocal, targetOperation, targetEquipment),
                  ) ?? 0
                );
              },
            },
          );
          resolvedQuantity = this.resolveAutoQuantity(evaluated, `equipamento '${catalog.description}'`);
        } else if (catalog.autoConfigFieldId) {
          const configValueRaw = configByFieldId.get(catalog.autoConfigFieldId);
          const configValue = this.parseNumber(configValueRaw);
          if (configValue !== null) {
            const base = catalog.baseQuantity && catalog.baseQuantity !== 0 ? catalog.baseQuantity : 1;
            const multiplier = catalog.autoMultiplier ?? 1;
            resolvedQuantity = {
              quantity: configValue * base * multiplier,
              sourceType: QuantitySourceType.PURCHASE,
              sourceNote: null,
            };
          }
        }

        if (!resolvedQuantity) continue;

        const autoQuantity = resolvedQuantity.quantity;
        calculatedByItemId.set(item.id, autoQuantity);

        const manualAdjustment = manualAdjustmentByItemId.get(item.id) ?? 0;
        const overrideValue = overrideByItemId.get(item.id);
        const nextEffectiveQuantity =
          typeof overrideValue === 'number' && Number.isFinite(overrideValue)
            ? overrideValue
            : autoQuantity + manualAdjustment;

        const previous = quantityByItemId.get(item.id) ?? 0;
        const previousSourceType = sourceTypeByItemId.get(item.id) ?? QuantitySourceType.PURCHASE;
        const previousSourceNote = sourceNoteByItemId.get(item.id) ?? null;

        if (
          Math.abs(previous - nextEffectiveQuantity) > 1e-9 ||
          previousSourceType !== resolvedQuantity.sourceType ||
          previousSourceNote !== resolvedQuantity.sourceNote
        ) {
          hasChanges = true;
          quantityByItemId.set(item.id, nextEffectiveQuantity);
          sourceTypeByItemId.set(item.id, resolvedQuantity.sourceType);
          sourceNoteByItemId.set(item.id, resolvedQuantity.sourceNote);
          registerItemQuantity(item, nextEffectiveQuantity);
        }
      }

      if (!hasChanges) break;
      if (pass === maxPasses - 1 && hasChanges) {
        throw new BadRequestException(
          'Dependencia ciclica detectada entre formulas de auto preenchimento do catalogo.',
        );
      }
    }

    for (const item of typedItems) {
      const nextCalculated = calculatedByItemId.get(item.id);
      const initialCalculated = initialCalculatedByItemId.get(item.id);
      const nextSourceType = sourceTypeByItemId.get(item.id) ?? QuantitySourceType.PURCHASE;
      const initialSourceType = initialSourceTypeByItemId.get(item.id) ?? QuantitySourceType.PURCHASE;
      const nextSourceNote = sourceNoteByItemId.get(item.id) ?? null;
      const initialSourceNote = initialSourceNoteByItemId.get(item.id) ?? null;
      if (nextCalculated === undefined || initialCalculated === undefined) continue;
      const calculatedUnchanged = Math.abs(nextCalculated - initialCalculated) <= 1e-9;
      const sourceUnchanged = nextSourceType === initialSourceType && nextSourceNote === initialSourceNote;
      if (calculatedUnchanged && sourceUnchanged) continue;

      // Requisito: auto preenchimento atualiza apenas Qtd Auto.
      await this.prisma.requisitionItem.update({
        where: { id: item.id },
        data: {
          calculatedValue: nextCalculated,
          quantitySourceType: nextSourceType,
          quantitySourceNote: nextSourceNote,
          versionLock: { increment: 1 },
        },
      });
    }

    return this.findItems(reqId);
  }

  async addItem(reqId: string, payload: any) {
    const req = await this.prisma.requisition.findUnique({ where: { id: reqId } });
    if (!req) throw new NotFoundException('Requisicao nao encontrada.');
    if (req.isReadOnly) throw new BadRequestException('Requisicao congelada (somente leitura).');

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
        localName: payload.localName,
        operationName: payload.operationName,
        equipmentCode: payload.equipmentCode,
        equipmentName: payload.equipmentName,
        manualQuantity:
          payload.manualQuantity === null ||
          payload.manualQuantity === undefined ||
          String(payload.manualQuantity).trim() === ''
            ? null
            : Number(payload.manualQuantity),
        formulaId: payload.formulaId,
        variablesPayload: payload.variables ? payload.variables : undefined,
        calculatedValue,
        quantitySourceType: QuantitySourceType.PURCHASE,
        quantitySourceNote: null,
      },
    });
  }

  async updateItemQuantity(itemId: string, manualQuantity: number | null, currentLock: number) {
    const item = await this.prisma.requisitionItem.findUnique({
      where: { id: itemId },
      include: { requisition: true },
    });
    if (!item) throw new BadRequestException('Item nao encontrado.');
    if (item.versionLock !== currentLock) {
      throw new ConflictException('Conflito de edicao no item.');
    }
    if (item.requisition.isReadOnly) {
      throw new BadRequestException('Requisicao em modo somente leitura.');
    }

    return this.prisma.requisitionItem.update({
      where: { id: itemId },
      data: {
        manualQuantity: manualQuantity === null ? null : Number(manualQuantity),
        versionLock: { increment: 1 },
      },
    });
  }

  async adminOverrideItem(itemId: string, overrideValue: number, currentLock: number) {
    const item = await this.prisma.requisitionItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('Item nao encontrado.');
    if (item.versionLock !== currentLock) {
      throw new ConflictException('Conflito de edicao no item.');
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
    if (!item) throw new BadRequestException('Item nao encontrado.');
    if (item.versionLock !== currentLock) {
      throw new ConflictException('O item foi editado por outro usuario. Atualize a lista.');
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

  async remove(id: string) {
    const requisition = await this.prisma.requisition.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });
    if (!requisition) {
      throw new NotFoundException('Requisicao nao encontrada.');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.requisitionItem.deleteMany({ where: { requisitionId: id } });
      await tx.requisitionProjectConfig.deleteMany({ where: { requisitionId: id } });
      await tx.requisition.delete({ where: { id } });
    });

    return {
      deletedRequisitionId: id,
      projectId: requisition.projectId,
    };
  }
}

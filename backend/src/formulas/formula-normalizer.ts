const OPERATOR_REGEX = /[+\-*/%^<>=!]/;

function sanitizeFormulaInput(expression: string): string {
  return expression
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[â€œâ€]/g, '"')
    .replace(/[â€˜â€™]/g, "'")
    .replace(/[âˆ’â€“â€”]/g, '-')
    .replace(/[Ã—]/g, '*')
    .replace(/[Ã·]/g, '/')
    .replace(/[ï½›]/g, '{')
    .replace(/[ï½]/g, '}')
    .replace(/[ï¼ˆ]/g, '(')
    .replace(/[ï¼‰]/g, ')')
    .replace(/[ï¼Œ]/g, ',')
    .replace(/[ï¼›]/g, ';');
}

function isInsideQuotedLiteral(text: string, index: number): boolean {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < index; i++) {
    const char = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (quote) {
      if (char === quote && prev !== '\\') {
        quote = null;
      }
      continue;
    }

    if ((char === '"' || char === "'") && prev !== '\\') {
      quote = char;
    }
  }
  return quote !== null;
}

function previousNonWhitespaceIndex(text: string, from: number): number {
  for (let i = from; i >= 0; i--) {
    if (!/\s/.test(text[i])) return i;
  }
  return -1;
}

function nextNonWhitespaceIndex(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (!/\s/.test(text[i])) return i;
  }
  return text.length;
}

function shouldConvertDecimalComma(text: string, start: number, end: number): boolean {
  const prevIndex = previousNonWhitespaceIndex(text, start - 1);
  const nextIndex = nextNonWhitespaceIndex(text, end);

  const prevChar = prevIndex >= 0 ? text[prevIndex] : '';
  const nextChar = nextIndex < text.length ? text[nextIndex] : '';

  const nextLooksNumericContext = nextIndex >= text.length || nextChar === ')' || OPERATOR_REGEX.test(nextChar);
  if (!nextLooksNumericContext) return false;

  if (prevIndex < 0) return true;
  if (OPERATOR_REGEX.test(prevChar)) return true;

  if (prevChar === '(') {
    const beforeParenIndex = previousNonWhitespaceIndex(text, prevIndex - 1);
    if (beforeParenIndex < 0) return true;
    const beforeParenChar = text[beforeParenIndex];
    if (beforeParenChar === '(' || beforeParenChar === ',' || OPERATOR_REGEX.test(beforeParenChar)) {
      return true;
    }
    return false;
  }

  return false;
}

function normalizeDecimalCommas(expression: string): string {
  return expression.replace(/(\d+)\s*,\s*(\d+)/g, (match, left, right, offset, fullText) => {
    const start = Number(offset);
    const end = start + String(match).length;

    if (isInsideQuotedLiteral(fullText, start)) return String(match);
    if (!shouldConvertDecimalComma(fullText, start, end)) return String(match);

    return `${left}.${right}`;
  });
}

// Corrige formulas antigas quebradas por normalizacao incorreta
// Ex.: arred(x * 1.1.0) -> arred(x * 1.1,0)
function fixLegacyMalformedNumericSeparators(expression: string): string {
  return expression.replace(/(\d+\.\d+)\.(\d+)(?=\s*[,)\]])/g, '$1,$2');
}

export function normalizeFormulaForStorage(formula?: string | null): string | null {
  const normalizedInput = sanitizeFormulaInput(String(formula ?? '').trim());
  if (!normalizedInput) return null;

  const withIf = normalizedInput
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
  const fixedLegacySeparators = fixLegacyMalformedNumericSeparators(withoutExcelPrefix);
  const withDecimalDot = normalizeDecimalCommas(fixedLegacySeparators);
  const withNotEqual = withDecimalDot.replace(/<>/g, '!=');

  return withNotEqual.replace(/(?<![<>=!])=(?!=)/g, '==');
}


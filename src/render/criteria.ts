import { t } from '@/i18n';
/**
 * The browser's copy of App\Support\Criteria: reads expressions like
 * "roleId == 1 || appMetaId == 2 || supplierTypeId == 3" and never runs them as code. Numbers,
 * 'text' or "text", true/false/null, names, ( ), == != <> > < >= <= (a single = means ==),
 * && || ! (also and/or/not), and + - * /. A name is looked up as written, then as snake_case,
 * then ignoring case. A list (roleId) matches with == when it holds the value. Mistakes throw
 * an Error with the same messages as the server.
 */

type Token = ['num' | 'str' | 'lit' | 'name' | 'op', unknown];
export type CriteriaVars = Record<string, unknown>;

/** Whether the expression holds. An empty expression always does. */
export function criteriaPasses(expression: string | null | undefined, vars: CriteriaVars): boolean {
  if (!expression?.trim()) return true;
  return !!new Parser(expression, vars).run();
}

const isNumeric = (v: unknown) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));

function same(left: unknown, right: unknown): boolean {
  // null matches only null or empty text, never 0.
  if (left == null || right == null) return (left ?? '') === (right ?? '');
  if (isNumeric(left) && isNumeric(right)) return Number(left) === Number(right);
  if (typeof left === 'boolean' || typeof right === 'boolean') return !!left === !!right;
  return String(left) === String(right);
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(
    expression: string,
    private vars: CriteriaVars,
  ) {
    this.tokens = tokenize(expression);
  }

  run(): unknown {
    const value = this.or();
    if (this.peek()) throw new Error(t('Unexpected "{token}" in the criteria.', { token: String(this.peek()![1]) }));
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private accept(...ops: string[]): string | null {
    const item = this.peek();
    if (item && item[0] === 'op' && ops.includes(item[1] as string)) {
      this.pos++;
      return item[1] as string;
    }
    return null;
  }

  private or(): unknown {
    let left = this.and();
    while (this.accept('||')) {
      const right = this.and();
      left = !!left || !!right;
    }
    return left;
  }

  private and(): unknown {
    let left = this.not();
    while (this.accept('&&')) {
      const right = this.not();
      left = !!left && !!right;
    }
    return left;
  }

  private not(): unknown {
    return this.accept('!') ? !this.not() : this.comparison();
  }

  private comparison(): unknown {
    const left = this.sum();
    const op = this.accept('==', '!=', '>', '<', '>=', '<=');
    if (!op) return left;
    const right = this.sum();

    if (op === '==' || op === '!=') {
      const equal =
        Array.isArray(left) && Array.isArray(right)
          ? left.some((l) => right.some((r) => same(l, r)))
          : Array.isArray(left)
            ? left.some((l) => same(l, right))
            : Array.isArray(right)
              ? right.some((r) => same(left, r))
              : same(left, right);
      return op === '==' ? equal : !equal;
    }
    if (Array.isArray(left) || Array.isArray(right)) throw new Error(t('A list (like roleId) can only be compared with == or !=.'));

    const order = isNumeric(left) && isNumeric(right) ? Math.sign(Number(left) - Number(right)) : String(left ?? '') < String(right ?? '') ? -1 : String(left ?? '') > String(right ?? '') ? 1 : 0;
    return op === '>' ? order > 0 : op === '<' ? order < 0 : op === '>=' ? order >= 0 : order <= 0;
  }

  private sum(): unknown {
    let left = this.product();
    let op: string | null;
    while ((op = this.accept('+', '-'))) {
      const right = this.product();
      left = op === '+' ? num(left) + num(right) : num(left) - num(right);
    }
    return left;
  }

  private product(): unknown {
    let left = this.unary();
    let op: string | null;
    while ((op = this.accept('*', '/'))) {
      const right = num(this.unary());
      if (op === '/' && right === 0) throw new Error(t('The criteria divides by zero.'));
      left = op === '*' ? num(left) * right : num(left) / right;
    }
    return left;
  }

  private unary(): unknown {
    return this.accept('-') ? -num(this.unary()) : this.primary();
  }

  private primary(): unknown {
    const item = this.peek();
    if (!item) throw new Error(t('The criteria ends too early.'));
    this.pos++;
    if (item[0] === 'op' && item[1] === '(') {
      const value = this.or();
      if (!this.accept(')')) throw new Error(t("The criteria is missing a closing \")\"."));
      return value;
    }
    if (item[0] === 'num' || item[0] === 'str' || item[0] === 'lit') return item[1];
    if (item[0] === 'name') return this.lookup(item[1] as string);
    throw new Error(t('Unexpected "{token}" in the criteria.', { token: String(item[1]) }));
  }

  private lookup(name: string): unknown {
    if (name in this.vars) return this.vars[name];
    const snake = name.replace(/(?<!^)[A-Z]/g, (c) => `_${c}`).toLowerCase();
    if (snake in this.vars) return this.vars[snake];
    const key = Object.keys(this.vars).find((k) => k.toLowerCase() === name.toLowerCase());
    if (key !== undefined) return this.vars[key];
    throw new Error(t('The criteria uses "{name}", which this record doesn\'t have.', { name }));
  }
}

function num(value: unknown): number {
  if (!isNumeric(value)) throw new Error(t('The criteria does arithmetic on something that is not a number.'));
  return Number(value);
}

function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const c = s[i];
    let m: RegExpMatchArray | null;
    if (/\s/.test(c)) {
      i++;
    } else if ((m = rest.match(/^\d*\.?\d+/))) {
      tokens.push(['num', Number(m[0])]);
      i += m[0].length;
    } else if (c === "'" || c === '"') {
      const end = s.indexOf(c, i + 1);
      if (end < 0) throw new Error(t('A text value in the criteria is missing its closing quote.'));
      tokens.push(['str', s.slice(i + 1, end)]);
      i = end + 1;
    } else if ((m = rest.match(/^[A-Za-z_]\w*/))) {
      const word = m[0].toLowerCase();
      tokens.push(
        word === 'and' ? ['op', '&&'] : word === 'or' ? ['op', '||'] : word === 'not' ? ['op', '!'] : word === 'true' ? ['lit', true] : word === 'false' ? ['lit', false] : word === 'null' ? ['lit', null] : ['name', m[0]],
      );
      i += m[0].length;
    } else if ((m = rest.match(/^(==|!=|<>|>=|<=|&&|\|\||[=<>!()+\-*/])/))) {
      tokens.push(['op', m[0] === '=' ? '==' : m[0] === '<>' ? '!=' : m[0]]);
      i += m[0].length;
    } else {
      throw new Error(t('The criteria can\'t use "{token}".', { token: c }));
    }
  }
  return tokens;
}

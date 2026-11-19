import type { MetaParam } from '../lib/metaApi';
import type { DetailNode } from './definitions';
import { SUBLINES, type Line } from './DetailLines';
import type { Values } from './formValues';
import { t } from '@/i18n';

/**
 * Calculated fields in forms: a param's expression_string is a formula, worked out as people
 * type. The same rules as the server's App\Support\Formula, which works it out again on every
 * save, so what is shown is what is stored. Read there for what a formula can say.
 */

type Node =
  | ['num' | 'str' | 'lit', unknown]
  | ['name', string]
  | ['un', '!' | '-', Node]
  | ['bin', string, Node, Node]
  | ['call', string, Node[]];

type Token = ['num' | 'str' | 'lit' | 'name' | 'op', unknown];

const FUNCTIONS = ['if', 'round', 'floor', 'ceil', 'abs', 'min', 'max', 'coalesce', 'concat', 'today', 'days', 'adddays', 'sum', 'avg', 'count'];
const AGGREGATES = ['sum', 'avg', 'min', 'max', 'count'];
const NOT_CALCULATED = ['detail', 'subgrid', 'singlefile', 'multifile', 'document', 'signature'];

export class FormulaError extends Error {}

/** A param's formula, or null when it has none. */
export function formulaOf(p: MetaParam): string | null {
  const f = (p.expression_string ?? '').trim();
  return f && !NOT_CALCULATED.includes(p.data_type) ? f : null;
}

// Reading --------------------------------------------------------------------------------

function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const rest = s.slice(i);
    let m: RegExpMatchArray | null;
    if (/\s/.test(c)) i++;
    else if ((m = rest.match(/^\d*\.?\d+/))) {
      tokens.push(['num', Number(m[0])]);
      i += m[0].length;
    } else if (c === "'" || c === '"') {
      const end = s.indexOf(c, i + 1);
      if (end < 0) throw new FormulaError(t('A text in the formula is missing its closing quote.'));
      tokens.push(['str', s.slice(i + 1, end)]);
      i = end + 1;
    } else if ((m = rest.match(/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)?/))) {
      const word = m[0].toLowerCase();
      tokens.push(
        word === 'and' ? ['op', '&&'] : word === 'or' ? ['op', '||'] : word === 'not' ? ['op', '!']
        : word === 'true' ? ['lit', true] : word === 'false' ? ['lit', false] : word === 'null' ? ['lit', null]
        : ['name', m[0]],
      );
      i += m[0].length;
    } else if ((m = rest.match(/^(==|!=|<>|>=|<=|&&|\|\||[=<>!()+\-*/%,])/))) {
      tokens.push(['op', m[0] === '=' ? '==' : m[0] === '<>' ? '!=' : m[0]]);
      i += m[0].length;
    } else throw new FormulaError(t('The formula can\'t use "{char}".', { char: c }));
  }
  return tokens;
}

const cache = new Map<string, Node>();

/** The formula read into a tree (kept, since forms work them out on every change). */
export function parse(formula: string): Node {
  const known = cache.get(formula);
  if (known) return known;
  const tokens = tokenize(formula);
  let pos = 0;
  const peek = () => tokens[pos];
  const accept = (...ops: string[]) => {
    const tk = tokens[pos];
    if (tk && tk[0] === 'op' && ops.includes(tk[1] as string)) {
      pos++;
      return tk[1] as string;
    }
    return null;
  };
  const closing = () => {
    if (!accept(')')) throw new FormulaError(t('The formula is missing a closing ")".'));
  };

  const orExpr = (): Node => {
    let left = andExpr();
    let op;
    while ((op = accept('||'))) left = ['bin', op, left, andExpr()];
    return left;
  };
  const andExpr = (): Node => {
    let left = notExpr();
    let op;
    while ((op = accept('&&'))) left = ['bin', op, left, notExpr()];
    return left;
  };
  const notExpr = (): Node => (accept('!') ? ['un', '!', notExpr()] : comparison());
  const comparison = (): Node => {
    const left = sum();
    const op = accept('==', '!=', '>', '<', '>=', '<=');
    return op ? ['bin', op, left, sum()] : left;
  };
  const sum = (): Node => {
    let left = product();
    let op;
    while ((op = accept('+', '-'))) left = ['bin', op, left, product()];
    return left;
  };
  const product = (): Node => {
    let left = unary();
    let op;
    while ((op = accept('*', '/', '%'))) left = ['bin', op, left, unary()];
    return left;
  };
  const unary = (): Node => (accept('-') ? ['un', '-', unary()] : primary());
  const primary = (): Node => {
    const tk = peek();
    if (!tk) throw new FormulaError(t('The formula ends too early.'));
    pos++;
    if (tk[0] === 'op' && tk[1] === '(') {
      const inner = orExpr();
      closing();
      return inner;
    }
    if (tk[0] === 'name' && accept('(')) {
      const fn = (tk[1] as string).toLowerCase();
      if (!FUNCTIONS.includes(fn)) throw new FormulaError(t('The formula has no function "{name}".', { name: tk[1] as string }));
      const args: Node[] = [];
      if (!accept(')')) {
        do args.push(orExpr());
        while (accept(','));
        closing();
      }
      arity(fn, args.length);
      return ['call', fn, args];
    }
    if (tk[0] === 'num' || tk[0] === 'str' || tk[0] === 'lit') return [tk[0], tk[1]];
    if (tk[0] === 'name') return ['name', tk[1] as string];
    throw new FormulaError(t('Unexpected "{token}" in the formula.', { token: String(tk[1]) }));
  };

  if (!tokens.length) throw new FormulaError(t('The formula is empty.'));
  const ast = orExpr();
  if (peek()) throw new FormulaError(t('Unexpected "{token}" in the formula.', { token: String(peek()[1]) }));
  cache.set(formula, ast);
  return ast;
}

function arity(fn: string, n: number) {
  const [min, max] =
    fn === 'if' ? [3, 3]
    : fn === 'round' ? [1, 2]
    : ['floor', 'ceil', 'abs', 'sum', 'avg', 'count'].includes(fn) ? [1, 1]
    : fn === 'today' ? [0, 0]
    : fn === 'days' || fn === 'adddays' ? [2, 2]
    : [1, Infinity];
  if (n < min || n > max) {
    throw new FormulaError(t('{name}() takes {count}.', { name: fn, count: min === max ? min : max === Infinity ? `${min}+` : `${min}–${max}` }));
  }
}


const splitName = (name: string): [string, string | null] => {
  const dot = name.indexOf('.');
  return dot < 0 ? [name, null] : [name.slice(0, dot), name.slice(dot + 1)];
};

/** A map's entry for a name as written, as snake_case, or ignoring case. */
function find<T>(map: Record<string, T>, name: string): T | undefined {
  if (name in map) return map[name];
  const snake = name.replace(/(?<!^)[A-Z]/g, (c) => `_${c}`).toLowerCase();
  if (snake in map) return map[snake];
  const key = Object.keys(map).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : map[key];
}

// Working out ------------------------------------------------------------------------------

type Rows = Record<string, unknown>[];

const blank = (v: unknown) => v === null || v === undefined || v === '';
const isNumeric = (v: unknown) => typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(v);
const numberish = (v: unknown) => blank(v) || typeof v === 'boolean' || isNumeric(v);
const num = (v: unknown): number | null => (blank(v) ? null : typeof v === 'boolean' ? (v ? 1 : 0) : isNumeric(v) ? Number(v) : null);
const arith = (v: unknown): number | null => {
  if (!numberish(v)) throw new FormulaError(t('The formula does arithmetic on text ("{value}").', { value: text(v) }));
  return num(v);
};
const truthy = (v: unknown) => !blank(v) && v !== false && v !== 0 && v !== '0' && v !== 'false';
const text = (v: unknown): string =>
  blank(v) ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : typeof v === 'number' && !Number.isInteger(v) ? String(Number(v.toFixed(6))) : String(v);
const same = (l: unknown, r: unknown) =>
  blank(l) || blank(r) ? blank(l) && blank(r)
  : typeof l === 'boolean' || typeof r === 'boolean' ? truthy(l) === truthy(r)
  : isNumeric(l) && isNumeric(r) ? Number(l) === Number(r)
  : String(l) === String(r);
/** Rounds half away from zero, like PHP's round(). */
const roundTo = (x: number, digits: number) => {
  const f = 10 ** digits;
  return (Math.sign(x) * Math.round(Math.abs(x) * f)) / f;
};
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const date = (v: unknown): Date | null => {
  const s = text(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Works out a value: vars are the record's fields, lines each detail's lines by detail field,
 * parent the record a line is on. Names the values don't hold count as blank (a form holds
 * only the fields it shows; the server, with the whole record, refuses unknown ones).
 */
export function evaluate(formula: string, vars: Record<string, unknown>, lines: Record<string, Rows> = {}, parent: Record<string, unknown> | null = null): unknown {
  const run = (node: Node): unknown => {
    switch (node[0]) {
      case 'num':
      case 'str':
      case 'lit':
        return node[1];
      case 'name': {
        const [head, tail] = splitName(node[1]);
        if (tail !== null && head.toLowerCase() === 'parent') return find(parent ?? {}, tail) ?? null;
        if (tail !== null) throw new FormulaError(t('Lines add up with a function, e.g. sum({name}).', { name: node[1] }));
        return find(vars, head) ?? null;
      }
      case 'un': {
        const v = run(node[2]);
        if (node[1] === '!') return !truthy(v);
        const n = num(v);
        return n === null ? null : -n;
      }
      case 'bin':
        return binary(node[1], node[2], node[3]);
      case 'call':
        return call(node[1], node[2]);
    }
  };

  const binary = (op: string, l: Node, r: Node): unknown => {
    if (op === '&&') return truthy(run(l)) && truthy(run(r));
    if (op === '||') return truthy(run(l)) || truthy(run(r));
    const left = run(l);
    const right = run(r);
    switch (op) {
      case '+':
        return numberish(left) && numberish(right) ? (num(left) ?? 0) + (num(right) ?? 0) : text(left) + text(right);
      case '-':
        return (arith(left) ?? 0) - (arith(right) ?? 0);
      case '*':
        return (arith(left) ?? 0) * (arith(right) ?? 0);
      case '/':
      case '%': {
        const d = arith(right) ?? 0;
        if (d === 0) return null;
        const n = arith(left) ?? 0;
        return op === '/' ? n / d : n % d;
      }
      case '==':
        return same(left, right);
      case '!=':
        return !same(left, right);
      default: {
        const order =
          numberish(left) && numberish(right) && !blank(left) && !blank(right)
            ? Math.sign(num(left)! - num(right)!)
            : Math.sign(text(left).localeCompare(text(right)));
        return op === '>' ? order > 0 : op === '<' ? order < 0 : op === '>=' ? order >= 0 : order <= 0;
      }
    }
  };

  const call = (fn: string, args: Node[]): unknown => {
    // sum(lines.amount), count(lines): over a detail's lines.
    if (AGGREGATES.includes(fn) && args.length === 1 && args[0][0] === 'name') {
      const [head, tail] = splitName(args[0][1] as string);
      const rows = find(lines, head);
      if (rows !== undefined && (tail !== null || fn === 'count')) {
        if (fn === 'count' && tail === null) return rows.length;
        const values = rows.map((row) => num(find(row, tail!) ?? null)).filter((v): v is number => v !== null);
        if (fn === 'sum') return values.reduce((a, b) => a + b, 0);
        if (fn === 'count') return values.length;
        if (!values.length) return null;
        return fn === 'avg' ? values.reduce((a, b) => a + b, 0) / values.length : fn === 'min' ? Math.min(...values) : Math.max(...values);
      }
    }
    if (fn === 'if') return truthy(run(args[0])) ? run(args[1]) : run(args[2]);
    const values = args.map(run);
    switch (fn) {
      case 'round': {
        const x = arith(values[0]);
        return x === null ? null : roundTo(x, Math.trunc(arith(values[1] ?? 0) ?? 0));
      }
      case 'floor':
      case 'ceil':
      case 'abs': {
        const x = arith(values[0]);
        return x === null ? null : Math[fn](x);
      }
      case 'min':
      case 'max': {
        const numbers = values.map(arith).filter((v): v is number => v !== null);
        return numbers.length ? Math[fn](...numbers) : null;
      }
      case 'coalesce':
        return values.find((v) => !blank(v)) ?? null;
      case 'concat':
        return values.map(text).join('');
      case 'today':
        return today();
      case 'days': {
        const from = date(values[0]);
        const to = date(values[1]);
        return from && to ? Math.round((to.getTime() - from.getTime()) / 86_400_000) : null;
      }
      case 'adddays': {
        const d = date(values[0]);
        const n = arith(values[1]);
        if (!d || n === null) return null;
        d.setUTCDate(d.getUTCDate() + Math.round(n));
        return ymd(d);
      }
      default:
        throw new FormulaError(t('{name}() adds up lines, e.g. {name}(lines.amount).', { name: fn }));
    }
  };

  return run(parse(formula));
}

/** A formula's result as its field's input holds it. */
function asValue(p: MetaParam, v: unknown): string | boolean {
  if (p.data_type === 'boolean') return truthy(v);
  if (blank(v)) return '';
  if (p.data_type === 'integer') return numberish(v) ? String(roundTo(num(v) ?? 0, 0)) : '';
  if (p.data_type === 'decimal') return numberish(v) ? String(roundTo(num(v) ?? 0, 6)) : '';
  if (p.data_type === 'date') return text(v).slice(0, 10);
  return text(v);
}

/**
 * The calculated fields' values, in passes until they settle, so one formula can use another
 * whatever their order. A formula that fails leaves its field blank, with the reason in errors.
 */
function solve(formulas: MetaParam[], values: Values, lines: Record<string, Rows>, parent: Values | null, errors?: Record<string, string>): Values {
  let out = values;
  for (let pass = 0; pass <= formulas.length; pass++) {
    let changed = false;
    for (const p of formulas) {
      let value: string | boolean;
      try {
        value = asValue(p, evaluate(formulaOf(p)!, out, lines, parent));
        if (errors) delete errors[p.field_path];
      } catch (err) {
        value = '';
        if (errors) errors[p.field_path] = err instanceof Error ? err.message : String(err);
      }
      if (out[p.field_path] !== value) {
        out = { ...out, [p.field_path]: value };
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

/** A line with its own lines worked out first, then its calculated fields. */
function applyLine(node: DetailNode, line: Line, parent: Values): Line {
  const subs = line[SUBLINES];
  const nextSubs = subs && node.children.length
    ? Object.fromEntries(node.children.map((c) => [c.detail.field_path, (subs[c.detail.field_path] ?? []).map((l) => applyLine(c, l, line))]))
    : subs;
  const formulas = node.def.params.filter((p) => formulaOf(p));
  if (!formulas.length && nextSubs === subs) return line;
  const solved = formulas.length ? solve(formulas, line, (nextSubs ?? {}) as Record<string, Rows>, parent) : line;
  return { ...line, ...solved, _key: line._key, ...(nextSubs ? { [SUBLINES]: nextSubs } : {}) } as Line;
}

/**
 * A form's values and lines with every calculated field worked out: lines first, then the
 * record, which may add them up. errors gets each failing header formula's reason.
 */
export function applyFormulas(params: MetaParam[], tree: DetailNode[], values: Values, lines: Record<string, Line[]>, errors?: Record<string, string>) {
  const nextLines = tree.length
    ? Object.fromEntries(Object.entries(lines).map(([field, list]) => {
        const node = tree.find((n) => n.detail.field_path === field);
        return [field, node ? list.map((l) => applyLine(node, l, values)) : list];
      }))
    : lines;
  const formulas = params.filter((p) => formulaOf(p));
  return { values: formulas.length ? solve(formulas, values, nextLines as Record<string, Rows>, null, errors) : values, lines: nextLines };
}

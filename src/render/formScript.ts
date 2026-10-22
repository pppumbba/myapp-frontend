import { dataApi, type DataRow } from '../lib/dataApi';
import { sessionValue } from '../lib/sessionApi';
import type { Meta } from '../lib/metaApi';
import type { Values } from './formValues';
import type { Line } from './DetailLines';

/**
 * A form's scripts, written in JavaScript on its meta and run in the browser:
 * - load: once the form has its values (a new record or one being edited);
 * - event: after any field changes, including a field of a line (detail and line say which);
 * - before_save: before saving; error('…') or returning false stops the save;
 * - after_save: after saving, with the saved record as row;
 * - var_fnc: variables and functions every other script can use.
 * Each script sees the helpers in ScriptApi as plain names, e.g. set('total_amount', 0).
 */
export type ScriptKind = 'load' | 'event' | 'before_save' | 'after_save';

export const SCRIPT_COLUMNS = {
  load: 'load_expression_string',
  event: 'event_expression_string',
  before_save: 'before_save_expression_string',
  after_save: 'after_save_expression_string',
  var_fnc: 'var_fnc_expression_string',
} as const;

export type FormScripts = Partial<Record<keyof typeof SCRIPT_COLUMNS, string>>;

/** The scripts a meta has, without blank ones. */
export function scriptsOf(meta: Meta | undefined): FormScripts {
  if (!meta) return {};
  return Object.fromEntries(
    Object.entries(SCRIPT_COLUMNS)
      .map(([kind, column]) => [kind, (meta[column] ?? '').trim()])
      .filter(([, code]) => code !== ''),
  );
}

/** What a script works on: the form's values and its lines, plus which fields it hid or locked. */
export interface ScriptState {
  values: Values;
  lines: Record<string, Line[]>;
  hidden: Set<string>;
  readonly: Set<string>;
}

/** What a script was run for. */
export interface ScriptEvent {
  /** The field that changed; empty when a line was added or removed. */
  field?: string;
  value?: string | boolean;
  /** The detail (e.g. "lines") a changed line belongs to, and the line's index in it. */
  detail?: string;
  line?: number;
  /** after_save: the record as saved. */
  row?: DataRow;
  /** Whether the form adds a record or edits one. */
  mode: 'new' | 'edit';
}

export interface ScriptResult {
  state: ScriptState;
  messages: string[];
  /** error('…') was called, or before_save returned false. */
  stopped?: string;
}

/** Thrown by error(): stops the script, and a save when before_save throws it. */
class ScriptStop extends Error {}

/** A script that could not run, with the kind it was, for the message. */
export class ScriptFailure extends Error {
  constructor(kind: string, cause: unknown) {
    super(`The form's ${kind.replace('_', ' ')} script failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;
const compiled = new Map<string, (...args: unknown[]) => Promise<unknown>>();

/** The helper names, in the order the compiled function takes them. */
const NAMES = [
  'values', 'get', 'set', 'lines', 'line', 'sum', 'setLine', 'header',
  'num', 'round', 'today', 'hide', 'show', 'readonly', 'message', 'error', 'fill', 'session',
  'field', 'value', 'detail', 'index', 'row', 'mode',
] as const;

function compile(shared: string, body: string) {
  const source = `${shared}\n;\n${body}`;
  let fn = compiled.get(source);
  if (!fn) {
    fn = new AsyncFunction(...NAMES, `"use strict";\n${source}`);
    compiled.set(source, fn);
  }
  return fn;
}

/** A value as an input holds it: text, or true/false for a toggle. */
const asInput = (v: unknown): string | boolean => (typeof v === 'boolean' ? v : v === null || v === undefined ? '' : String(v));
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const round = (v: unknown, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(num(v) * f) / f;
};
const today = () => new Date().toLocaleDateString('sv-SE');

/** A copy a script may change freely; the form takes it over only when the script finishes. */
function draft(state: ScriptState): ScriptState {
  return {
    values: { ...state.values },
    lines: Object.fromEntries(Object.entries(state.lines).map(([k, ls]) => [k, ls.map((l) => ({ ...l }))])),
    hidden: new Set(state.hidden),
    readonly: new Set(state.readonly),
  };
}

/**
 * Runs one of a form's scripts on a copy of its state and returns the changed copy.
 * lineOf: for a line form's script, the line it runs on (detail and index); get and set then
 * work on that line, and header.get/header.set on the form above.
 */
export async function runScript(
  scripts: FormScripts,
  kind: ScriptKind,
  state: ScriptState,
  event: ScriptEvent,
  lineOf?: { detail: string; index: number },
): Promise<ScriptResult> {
  const body = scripts[kind];
  if (!body) return { state, messages: [] };

  const next = draft(state);
  const messages: string[] = [];
  const own = lineOf ? (next.lines[lineOf.detail]?.[lineOf.index] as Values | undefined) : next.values;
  if (!own) return { state, messages };

  const header = {
    get: (f: string) => next.values[f],
    set: (f: string, v: unknown) => void (next.values[f] = asInput(v)),
  };
  const linesOf = (detail: string) => (next.lines[detail] ?? []) as Values[];
  const api: Record<(typeof NAMES)[number], unknown> = {
    values: own,
    get: (f: string) => own[f],
    set: (f: string, v: unknown) => void (own[f] = asInput(v)),
    lines: linesOf,
    line: (detail: string, i: number) => linesOf(detail)[i],
    sum: (detail: string, by: string | ((l: Values) => unknown)) =>
      linesOf(detail).reduce((s, l) => s + num(typeof by === 'function' ? by(l) : l[by]), 0),
    setLine: (detail: string, i: number, f: string, v: unknown) => {
      const l = linesOf(detail)[i];
      if (l) l[f] = asInput(v);
    },
    header,
    num,
    round,
    today,
    hide: (f: string, on = true) => void (on ? next.hidden.add(f) : next.hidden.delete(f)),
    show: (f: string) => void next.hidden.delete(f),
    readonly: (f: string, on = true) => void (on ? next.readonly.add(f) : next.readonly.delete(f)),
    message: (text: unknown) => void messages.push(String(text)),
    error: (text: unknown) => {
      throw new ScriptStop(String(text));
    },
    fill: (getMetaId: number, params: Record<string, string> = {}) => dataApi.fill(getMetaId, params),
    // A custom session value of the signed-in user, e.g. session('sessionemployeeid').
    session: (path: string) => sessionValue(path) ?? null,
    field: event.field ?? '',
    value: event.value,
    detail: event.detail ?? '',
    index: event.line ?? lineOf?.index ?? -1,
    row: event.row,
    mode: event.mode,
  };

  try {
    const fn = compile(scripts.var_fnc ?? '', body);
    const returned = await fn(...NAMES.map((n) => api[n]));
    if (kind === 'before_save' && returned === false) return { state: next, messages, stopped: messages.pop() ?? 'The form stopped the save.' };
    return { state: next, messages };
  } catch (err) {
    if (err instanceof ScriptStop) return { state: next, messages, stopped: err.message };
    throw new ScriptFailure(kind, err);
  }
}

/**
 * What changed between two versions of a detail's lines: for each line still there, the
 * fields that differ; a line added or removed is one change with no field.
 */
export function lineChanges(before: Line[], after: Line[]): { index: number; field: string; value?: string | boolean }[] {
  if (before.length !== after.length) return [{ index: Math.max(0, Math.min(before.length, after.length) - 1), field: '' }];
  const changes: { index: number; field: string; value?: string | boolean }[] = [];
  after.forEach((l, i) => {
    const old = before[i];
    if (old === l) return;
    for (const key of Object.keys(l)) {
      if (!key.startsWith('_') && l[key] !== old[key]) changes.push({ index: i, field: key, value: l[key] });
    }
  });
  return changes;
}

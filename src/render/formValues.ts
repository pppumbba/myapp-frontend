import type { DataRow } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { fillTokens } from '../lib/sessionApi';

/** A form's or a line's values as its inputs hold them. */
export type Values = Record<string, string | boolean>;

const isTrue = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true';

/** A database value as an input expects it: dates as "YYYY-MM-DD", datetimes as "YYYY-MM-DDTHH:mm". */
function inputValue(f: MetaParam, raw: unknown): string {
  if (f.data_type === 'date') return String(raw).slice(0, 10);
  if (f.data_type === 'datetime') return String(raw).replace(' ', 'T').slice(0, 16);
  return String(raw);
}

/**
 * The values fields start with: the record's, else the defaults given, else each param's
 * default_value with its {placeholders} filled (e.g. {today}, {sessionemployeeid}).
 */
export function startValues(fields: MetaParam[], record: DataRow | null, defaults?: DataRow): Values {
  const values: Values = {};
  for (const f of fields) {
    const raw = record ? record[f.field_path] : (defaults?.[f.field_path] ?? (f.default_value == null ? null : fillTokens(f.default_value)));
    if (f.data_type === 'boolean') values[f.field_path] = isTrue(raw);
    else if (raw === null || raw === undefined) values[f.field_path] = '';
    else values[f.field_path] = inputValue(f, raw);
  }
  return values;
}

/** Form values -> what the API expects: numbers as numbers, blanks as null. */
export function toPayload(fields: MetaParam[], values: Values): DataRow {
  const out: DataRow = {};
  for (const f of fields) {
    const v = values[f.field_path];
    if (typeof v === 'boolean') out[f.field_path] = v;
    else if (v === '' || v === undefined) out[f.field_path] = null;
    else if (f.data_type === 'integer') out[f.field_path] = parseInt(v, 10);
    else if (f.data_type === 'decimal') out[f.field_path] = Number(v);
    else if (f.data_type === 'datetime') out[f.field_path] = `${v.replace('T', ' ')}:00`.slice(0, 19);
    else out[f.field_path] = v;
  }
  return out;
}

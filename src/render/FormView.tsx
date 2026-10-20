import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { dataApi, type DataRow } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { ComboField } from '../components/ComboField';
import { DatePicker } from '../components/DatePicker';
import { Input } from '@/components/base/input/input';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { formatNumber } from './Cell';
import { DetailLines, lineAmount, type Line } from './DetailLines';
import { detailParams, filledFrom, optionsOf, primaryKey, title, useMetaDef, useMetaDefs, visibleParams, type MetaDef } from './definitions';
import { LookupField } from './LookupField';

type Values = Record<string, string | boolean>;

let lineSeq = 0;
const blankLine = (def: MetaDef): Line => ({ ...startValues(visibleParams(def.params), null), _key: `new-${++lineSeq}` });

function startLines(def: MetaDef, rows: unknown): Line[] {
  if (!Array.isArray(rows)) return [];
  const key = primaryKey(def.params);
  return (rows as DataRow[]).map((r) => ({ ...startValues(visibleParams(def.params), r), _key: String(r[key]), _id: String(r[key]) }));
}

const isTrue = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true';

/** A database value as an input expects it: dates as "YYYY-MM-DD", datetimes as "YYYY-MM-DDTHH:mm". */
function inputValue(f: MetaParam, raw: unknown): string {
  if (f.data_type === 'date') return String(raw).slice(0, 10);
  if (f.data_type === 'datetime') return String(raw).replace(' ', 'T').slice(0, 16);
  return String(raw);
}

function startValues(fields: MetaParam[], record: DataRow | null, defaults?: DataRow): Values {
  const values: Values = {};
  for (const f of fields) {
    const raw = record ? record[f.field_path] : (defaults?.[f.field_path] ?? f.default_value);
    if (f.data_type === 'boolean') values[f.field_path] = isTrue(raw);
    else if (raw === null || raw === undefined) values[f.field_path] = '';
    else values[f.field_path] = inputValue(f, raw);
  }
  return values;
}

/** Form values -> what the API expects: numbers as numbers, blanks as null. */
function toPayload(fields: MetaParam[], values: Values): DataRow {
  const out: DataRow = {};
  for (const f of fields) {
    const v = values[f.field_path];
    if (typeof v === 'boolean') out[f.field_path] = v;
    else if (v === '') out[f.field_path] = null;
    else if (f.data_type === 'integer') out[f.field_path] = parseInt(v, 10);
    else if (f.data_type === 'decimal') out[f.field_path] = Number(v);
    else if (f.data_type === 'datetime') out[f.field_path] = `${v.replace('T', ' ')}:00`.slice(0, 19);
    else out[f.field_path] = v;
  }
  return out;
}

const wide = (f: MetaParam) => f.render_type === 'textarea' || f.data_type === 'text' || f.data_type === 'boolean';

/**
 * A form meta as a working form. With recordId it edits that record, otherwise it adds one.
 * embedded: inside a modal opened from a grid. Otherwise it's a page of its own (e.g. a
 * "New request" menu item) and stays open for the next entry after saving.
 * defaults: starting values for a new record, e.g. the day picked on a calendar.
 * fill: a get meta and its named parameters; its first row decides the values the form
 * opens with (over the record's own values when editing).
 * Detail params (data_type "detail") add editable line items, saved with the record. A
 * detail's json_config.amount and total_field make the header total follow the lines.
 */
export function FormView({
  metaId,
  recordId,
  defaults,
  fill,
  embedded,
  onSaved,
  onCancel,
}: {
  metaId: number;
  recordId?: string | null;
  defaults?: DataRow;
  fill?: { metaId: number; params: Record<string, string> };
  embedded?: boolean;
  onSaved?: (row: DataRow) => void;
  onCancel?: () => void;
}) {
  const { def, error: defError } = useMetaDef(metaId);
  const fields = useMemo(() => (def ? visibleParams(def.params) : []), [def]);
  const details = useMemo(() => (def ? detailParams(def.params) : []), [def]);
  const { defs: lineDefs, error: lineDefError } = useMetaDefs(useMemo(() => details.map((d) => d.ref_meta_id), [details]));

  const [values, setValues] = useState<Values | null>(null);
  const [lines, setLines] = useState<Record<string, Line[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // A new record starts with one empty line per detail.
  const freshLines = () => Object.fromEntries(details.map((d, i) => [d.field_path, [blankLine(lineDefs![i])]]));

  // The get meta's values win over the record's own and over defaults.
  const fillKey = fill ? `${fill.metaId}:${JSON.stringify(fill.params)}` : '';

  useEffect(() => {
    if (!def || !lineDefs) return;
    let live = true;
    const filled: Promise<DataRow> = fill ? dataApi.fill(fill.metaId, fill.params) : Promise.resolve({});
    const fail = (err: unknown) => live && setLoadError(err instanceof ApiError ? err.message : 'This record could not be loaded.');

    if (!recordId) {
      filled.then((values) => {
        if (!live) return;
        setValues(startValues(fields, null, { ...defaults, ...values }));
        setLines(freshLines());
      }, fail);
    } else {
      Promise.all([dataApi.get(def.meta.id, recordId), filled]).then(([row, values]) => {
        if (!live) return;
        setValues(startValues(fields, { ...row, ...values }));
        setLines(Object.fromEntries(details.map((d, i) => [d.field_path, startLines(lineDefs[i], row[d.field_path])])));
      }, fail);
    }
    return () => {
      live = false;
    };
  }, [def, fields, details, lineDefs, recordId, fillKey]);

  if (defError || lineDefError || loadError) return <Alert>{defError ?? lineDefError ?? loadError}</Alert>;
  if (!def || !lineDefs || !values) return <div className="h-48 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />;

  const set = (field: string, value: string | boolean, fill?: Record<string, string>) => {
    setSaved(false);
    setValues((v) => ({ ...v!, ...fill, [field]: value }));
  };
  const fe = (field: string) => fieldErrors[field]?.[0];

  // Header fields a detail sums into: field_path -> the current total.
  const totals = new Map(
    details.flatMap((d) => {
      const field = d.json_config?.total_field;
      if (typeof field !== 'string') return [];
      return [[field, (lines[d.field_path] ?? []).reduce((sum, l) => sum + (lineAmount(d, l) ?? 0), 0)] as const];
    }),
  );

  function payload(): DataRow {
    const out = toPayload(fields, values!);
    totals.forEach((sum, field) => (out[field] = Math.round(sum * 100) / 100));
    details.forEach((d, i) => {
      const lineFields = visibleParams(lineDefs![i].params);
      const key = primaryKey(lineDefs![i].params);
      out[d.field_path] = (lines[d.field_path] ?? []).map((l) => ({ ...(l._id ? { [key]: Number(l._id) } : {}), ...toPayload(lineFields, l) }));
    });
    return out;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!def || !values) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const body = payload();
      const row = recordId ? await dataApi.update(def.meta.id, recordId, body) : await dataApi.create(def.meta.id, body);
      if (!embedded && !recordId) {
        setValues(startValues(fields, null));
        setLines(freshLines());
        setSaved(true);
      }
      onSaved?.(row);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {});
        if (!err.errors) setError(err.message);
      } else {
        setError('This could not be saved. Check that the API is running.');
      }
    } finally {
      setSaving(false);
    }
  }

  const form = (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && <Alert>{error}</Alert>}
      {saved && (
        <div role="status" className="flex gap-3 rounded-xl bg-success-primary p-4 ring-1 ring-success-secondary ring-inset">
          <CheckCircle className="size-5 shrink-0 text-fg-success-primary" aria-hidden="true" />
          <p className="text-sm font-medium text-success-primary">Saved. You can add another one.</p>
        </div>
      )}

      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.field_path} className={wide(f) ? 'sm:col-span-2' : undefined}>
            {totals.has(f.field_path) ? (
              <Input
                label={f.label_name || f.param_name}
                value={formatNumber(totals.get(f.field_path))}
                isReadOnly
                hint="Worked out from the lines below."
                wrapperClassName="bg-secondary shadow-none"
                inputClassName="font-semibold tabular-nums"
              />
            ) : (
              <Field param={f} value={values[f.field_path]} error={fe(f.field_path)} onChange={(v, fill) => set(f.field_path, v, fill)} />
            )}
          </div>
        ))}
        {details.map((d, i) => (
          <DetailLines
            key={d.field_path}
            detail={d}
            def={lineDefs[i]}
            lines={lines[d.field_path] ?? []}
            errors={fieldErrors}
            onChange={(next) => {
              setSaved(false);
              setLines((all) => ({ ...all, [d.field_path]: next }));
            }}
            onAdd={() => setLines((all) => ({ ...all, [d.field_path]: [...(all[d.field_path] ?? []), blankLine(lineDefs[i])] }))}
          />
        ))}
      </div>

      <div className="flex justify-end gap-3 border-t border-secondary pt-5">
        {onCancel && (
          <Button size="lg" color="secondary" onPress={onCancel}>
            Cancel
          </Button>
        )}
        <Button size="lg" type="submit" isLoading={saving} showTextWhileLoading>
          {saving ? 'Saving…' : recordId ? 'Save changes' : 'Save'}
        </Button>
      </div>
    </form>
  );

  if (embedded) return form;

  return (
    <div className="max-w-3xl rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="border-b border-secondary px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold text-primary">{title(def.meta)}</h2>
        {def.meta.description && <p className="mt-1 text-sm text-tertiary">{def.meta.description}</p>}
      </div>
      <div className="px-4 py-5 sm:px-5">{form}</div>
    </div>
  );
}

/** Picks the Untitled UI control for one param. Picking a lookup record also returns the values json_config.fill copies from it. */
function Field({
  param: f,
  value,
  error,
  onChange,
}: {
  param: MetaParam;
  value: string | boolean;
  error?: string;
  onChange: (value: string | boolean, fill?: Record<string, string>) => void;
}) {
  const label = f.label_name || f.param_name;
  const options = optionsOf(f);
  const common = { label, isRequired: f.is_required, isInvalid: !!error, hint: error };

  if (f.data_type === 'boolean') {
    return <Toggle label={label} hint={error} isSelected={value === true} onChange={onChange} />;
  }

  if (f.is_select && f.ref_meta_id) {
    return <LookupField {...common} param={f} value={String(value)} onChange={(v, row) => onChange(v, filledFrom(f, row))} />;
  }

  if (options) {
    return <ComboField {...common} items={options} value={String(value)} onChange={onChange} />;
  }

  if (f.data_type === 'date' || f.data_type === 'datetime') {
    return <DatePicker {...common} withTime={f.data_type === 'datetime'} value={String(value)} onChange={onChange} />;
  }

  if (f.render_type === 'textarea' || f.data_type === 'text') {
    return <TextArea {...common} rows={3} value={String(value)} onChange={onChange} />;
  }

  const type =
    f.data_type === 'integer' || f.data_type === 'decimal'
          ? 'number'
          : f.render_type === 'email'
            ? 'email'
            : 'text';

  return <Input {...common} type={type} value={String(value)} onChange={onChange} />;
}

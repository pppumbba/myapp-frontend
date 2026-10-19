import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { dataApi, type DataRow } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { title, useLookup, useMetaDef, visibleParams } from './definitions';

type Values = Record<string, string | boolean>;

const isTrue = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true';

function startValues(fields: MetaParam[], record: DataRow | null): Values {
  const values: Values = {};
  for (const f of fields) {
    const raw = record ? record[f.field_path] : f.default_value;
    if (f.data_type === 'boolean') values[f.field_path] = isTrue(raw);
    else if (raw === null || raw === undefined) values[f.field_path] = '';
    else values[f.field_path] = f.data_type === 'date' ? String(raw).slice(0, 10) : String(raw);
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
    else out[f.field_path] = v;
  }
  return out;
}

const wide = (f: MetaParam) => f.render_type === 'textarea' || f.data_type === 'text' || f.data_type === 'boolean';

/**
 * A form meta as a working form. With recordId it edits that record, otherwise it adds one.
 * embedded: inside a modal opened from a grid. Otherwise it's a page of its own (e.g. a
 * "New request" menu item) and stays open for the next entry after saving.
 */
export function FormView({
  metaId,
  recordId,
  embedded,
  onSaved,
  onCancel,
}: {
  metaId: number;
  recordId?: string | null;
  embedded?: boolean;
  onSaved?: (row: DataRow) => void;
  onCancel?: () => void;
}) {
  const { def, error: defError } = useMetaDef(metaId);
  const fields = useMemo(() => (def ? visibleParams(def.params) : []), [def]);

  const [values, setValues] = useState<Values | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!def) return;
    if (!recordId) {
      setValues(startValues(fields, null));
      return;
    }
    let live = true;
    dataApi.get(def.meta.id, recordId).then(
      (row) => live && setValues(startValues(fields, row)),
      (err) => live && setLoadError(err instanceof ApiError ? err.message : 'This record could not be loaded.'),
    );
    return () => {
      live = false;
    };
  }, [def, fields, recordId]);

  if (defError || loadError) return <Alert>{defError ?? loadError}</Alert>;
  if (!def || !values) return <div className="h-48 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />;

  const set = (field: string, value: string | boolean) => {
    setSaved(false);
    setValues((v) => ({ ...v!, [field]: value }));
  };
  const fe = (field: string) => fieldErrors[field]?.[0];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!def || !values) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const payload = toPayload(fields, values);
      const row = recordId ? await dataApi.update(def.meta.id, recordId, payload) : await dataApi.create(def.meta.id, payload);
      if (!embedded && !recordId) {
        setValues(startValues(fields, null));
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
    <form onSubmit={onSubmit} className="space-y-6">
      {error && <Alert>{error}</Alert>}
      {saved && (
        <div role="status" className="flex gap-3 rounded-xl bg-success-primary p-4 ring-1 ring-success-secondary ring-inset">
          <CheckCircle className="size-5 shrink-0 text-fg-success-primary" aria-hidden="true" />
          <p className="text-sm font-medium text-success-primary">Saved. You can add another one.</p>
        </div>
      )}

      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.field_path} className={wide(f) ? 'sm:col-span-2' : undefined}>
            <Field param={f} value={values[f.field_path]} error={fe(f.field_path)} onChange={(v) => set(f.field_path, v)} />
          </div>
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
      <div className="border-b border-secondary px-4 py-5 sm:px-6">
        <h2 className="text-lg font-semibold text-primary">{title(def.meta)}</h2>
        {def.meta.description && <p className="mt-1 text-sm text-tertiary">{def.meta.description}</p>}
      </div>
      <div className="px-4 py-6 sm:px-6">{form}</div>
    </div>
  );
}

/** Picks the Untitled UI control for one param. */
function Field({
  param: f,
  value,
  error,
  onChange,
}: {
  param: MetaParam;
  value: string | boolean;
  error?: string;
  onChange: (value: string | boolean) => void;
}) {
  const lookup = useLookup(f);
  const label = f.label_name || f.param_name;
  const options = Array.isArray(f.json_config?.options) ? (f.json_config.options as unknown[]).map(String) : null;
  const common = { label, isRequired: f.is_required, isInvalid: !!error, hint: error };

  if (f.data_type === 'boolean') {
    return <Toggle label={label} hint={error} isSelected={value === true} onChange={onChange} />;
  }

  if (lookup || options) {
    const choices = lookup ?? options!.map((o) => ({ value: o, label: o.charAt(0).toUpperCase() + o.slice(1) }));
    return (
      <NativeSelect
        label={label}
        required={f.is_required}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        hint={error}
        selectClassName={error ? 'ring-error' : undefined}
        options={[{ label: lookup && !lookup.length ? 'Loading…' : 'Choose…', value: '' }, ...choices]}
      />
    );
  }

  if (f.render_type === 'textarea' || f.data_type === 'text') {
    return <TextArea {...common} rows={3} value={String(value)} onChange={onChange} />;
  }

  const type =
    f.data_type === 'date'
      ? 'date'
      : f.data_type === 'datetime'
        ? 'datetime-local'
        : f.data_type === 'integer' || f.data_type === 'decimal'
          ? 'number'
          : f.render_type === 'email'
            ? 'email'
            : 'text';

  return <Input {...common} type={type} value={String(value)} onChange={onChange} />;
}

import { useState, type FormEvent } from 'react';
import { CheckCircle, Zap } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { dataApi, type StageRun } from '../lib/dataApi';
import { fillTokens } from '../lib/sessionApi';
import type { MetaParam } from '../lib/metaApi';
import { Alert } from '../components/ui';
import { ComboField } from '../components/ComboField';
import { DatePicker } from '../components/DatePicker';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { LookupField } from './LookupField';
import { optionsOf, title, type MetaDef } from './definitions';

const rows = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`;

/**
 * A stage query's screen: a field for each of its named parameters (its params), then Run.
 * Run first checks how many rows would change (a dry run) and asks before changing them.
 * defaults: starting values, e.g. from the menu item or grid button that opens it.
 * embedded: inside a dialog, which already shows the title. onRan: after a real (not dry) run.
 */
export function StageQueryView({
  def,
  defaults,
  embedded,
  onRan,
}: {
  def: MetaDef;
  defaults?: Record<string, string>;
  embedded?: boolean;
  onRan?: (result: StageRun) => void;
}) {
  const params = def.params.filter((p) => p.is_show !== false).sort((a, b) => a.order_number - b.order_number);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(params.map((p) => [p.field_path, defaults?.[p.field_path] ?? (p.default_value ? fillTokens(p.default_value) : '')])),
  );
  const [checked, setChecked] = useState<StageRun | null>(null);
  const [done, setDone] = useState<StageRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(field: string, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setChecked(null);
    setDone(null);
  }

  async function go(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await dataApi.runStage(def.meta.id, values, dryRun);
      if (dryRun) {
        setChecked(result);
        setDone(null);
      } else {
        setChecked(null);
        setDone(result);
        onRan?.(result);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The query could not run.');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    go(true);
  }

  return (
    <form onSubmit={onSubmit} className={embedded ? 'space-y-5' : 'max-w-2xl space-y-5 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary sm:p-6'}>
      {!embedded && (
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
            <Zap className="size-5 text-fg-brand-primary" aria-hidden="true" />
            {title(def.meta)}
          </h2>
          {def.meta.description && <p className="mt-1 text-sm text-tertiary">{def.meta.description}</p>}
        </div>
      )}

      {params.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {params.map((p) => (
            <ParamField key={p.id} param={p} value={values[p.field_path] ?? ''} onChange={(v) => change(p.field_path, v)} />
          ))}
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      {checked && (
        <div role="status" className="space-y-3 rounded-lg bg-warning-primary p-4 ring-1 ring-secondary ring-inset">
          <p className="text-sm font-medium text-warning-primary">
            {checked.affected === 0 ? 'Nothing to change: no rows match.' : `This will change ${rows(checked.affected)}. Run it?`}
          </p>
          {checked.affected > 0 && (
            <div className="flex gap-2">
              <Button size="sm" isLoading={busy} showTextWhileLoading onPress={() => go(false)}>
                Yes, run it
              </Button>
              <Button size="sm" color="secondary" isDisabled={busy} onPress={() => setChecked(null)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {done && (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-success-primary p-4 ring-1 ring-success-secondary ring-inset">
          <CheckCircle className="size-5 text-fg-success-primary" aria-hidden="true" />
          <p className="text-sm font-medium text-success-primary">Done: {rows(done.affected)} changed.</p>
        </div>
      )}

      <div className="modal-footer flex justify-end border-t border-secondary pt-4">
        <Button type="submit" iconLeading={Zap} isLoading={busy && !checked} showTextWhileLoading isDisabled={!!checked && checked.affected > 0}>
          Run
        </Button>
      </div>
    </form>
  );
}

/** One named parameter, picked the way a form field is: a lookup, a list, a date, a number. */
function ParamField({ param: p, value, onChange }: { param: MetaParam; value: string; onChange: (value: string) => void }) {
  const label = p.label_name || p.param_name;
  const options = optionsOf(p);
  const hint = p.default_value && !value ? `Empty: ${p.default_value}` : undefined;
  const common = { label, value, onChange, isRequired: p.is_required, hint };

  if (p.is_select && p.ref_meta_id) return <LookupField {...common} param={p} />;
  if (options) return <ComboField label={label} value={value} onChange={onChange} items={options} />;
  if (p.data_type === 'boolean') {
    return (
      <NativeSelect
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: '', label: '—' },
          { value: '1', label: 'Yes' },
          { value: '0', label: 'No' },
        ]}
      />
    );
  }
  if (p.data_type === 'date' || p.data_type === 'datetime') return <DatePicker {...common} withTime={p.data_type === 'datetime'} />;
  return <Input {...common} type={p.data_type === 'integer' || p.data_type === 'decimal' ? 'number' : 'text'} />;
}

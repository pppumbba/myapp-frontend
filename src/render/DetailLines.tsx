import { Plus, Trash01 } from '@untitledui/icons';
import type { MetaParam } from '../lib/metaApi';
import { ComboField } from '../components/ComboField';
import { DatePicker } from '../components/DatePicker';
import { IconAction } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Toggle } from '@/components/base/toggle/toggle';
import { formatNumber } from './Cell';
import { filledFrom, optionsOf, title, visibleParams, type MetaDef } from './definitions';
import { LookupField } from './LookupField';

/** One line being edited. _key keeps React rows stable; _id is the saved line's primary key. */
export type Line = Record<string, string | boolean> & { _key: string; _id?: string };

/** quantity x unit price, or null when the detail has no json_config.amount. */
export function lineAmount(detail: MetaParam, line: Line): number | null {
  const amount = detail.json_config?.amount;
  if (!Array.isArray(amount) || amount.length !== 2) return null;
  const n = Number(line[String(amount[0])]) * Number(line[String(amount[1])]);
  return Number.isFinite(n) ? n : 0;
}

/** Typed-in numbers (not lookups, whose ids are integers too) sit right-aligned. */
const numeric = (f: MetaParam) => (f.data_type === 'integer' || f.data_type === 'decimal') && !f.is_select && !Array.isArray(f.json_config?.options);
const choice = (f: MetaParam) => (f.is_select && !!f.ref_meta_id) || Array.isArray(f.json_config?.options);

/** Column widths, so names and prices aren't cut off. */
const width = (f: MetaParam) => (choice(f) ? 'min-w-56' : f.data_type === 'datetime' ? 'min-w-60' : f.data_type === 'date' ? 'min-w-44' : f.data_type === 'decimal' ? 'w-36' : numeric(f) ? 'w-24' : 'min-w-40');

/**
 * A form's detail as an editable table: one row per line, one column per visible param of
 * the line form. Errors arrive keyed like "lines.2.quantity", as the API sends them.
 */
export function DetailLines({
  detail,
  def,
  lines,
  errors,
  onChange,
  onAdd,
}: {
  detail: MetaParam;
  def: MetaDef;
  lines: Line[];
  errors: Record<string, string[]>;
  onChange: (lines: Line[]) => void;
  onAdd: () => void;
}) {
  const columns = visibleParams(def.params);
  const hasAmount = lines.length ? lineAmount(detail, lines[0]) !== null : Array.isArray(detail.json_config?.amount);
  const total = lines.reduce((sum, l) => sum + (lineAmount(detail, l) ?? 0), 0);
  const name = detail.label_name || title(def.meta);
  const listError = errors[detail.field_path]?.[0];

  const update = (i: number, values: Partial<Line>) => onChange(lines.map((l, j) => (j === i ? ({ ...l, ...values } as Line) : l)));

  return (
    <section aria-label={name} className="sm:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-primary">{name}</h3>
        <Button size="sm" color="link-color" iconLeading={Plus} onPress={onAdd}>
          Add line
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-secondary">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-secondary text-left text-xs font-medium text-tertiary">
            <tr>
              <th className="w-8 py-2 pl-3 font-medium">#</th>
              {columns.map((c) => (
                <th key={c.field_path} className={`px-2 py-2 font-medium ${numeric(c) ? 'text-right' : ''}`}>
                  {c.label_name || c.param_name}
                  {c.is_required && <span className="text-brand-tertiary"> *</span>}
                </th>
              ))}
              {hasAmount && <th className="px-2 py-2 text-right font-medium">Amount</th>}
              <th className="w-10" aria-label="Remove" />
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {lines.map((line, i) => (
              <tr key={line._key} className="align-top">
                <td className="py-3.5 pl-3 text-tertiary tabular-nums">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.field_path} className={`px-1.5 py-1.5 ${width(c)}`}>
                    <LineField
                      param={c}
                      label={`${c.label_name || c.param_name}, line ${i + 1}`}
                      value={line[c.field_path]}
                      error={errors[`${detail.field_path}.${i}.${c.field_path}`]?.[0]}
                      onChange={(v, fill) => update(i, { [c.field_path]: v, ...fill })}
                    />
                  </td>
                ))}
                {hasAmount && <td className="px-2 py-3.5 text-right font-medium text-primary tabular-nums">{formatNumber(lineAmount(detail, line))}</td>}
                <td className="py-2 pr-1.5">
                  <IconAction icon={Trash01} danger label={`Remove line ${i + 1}`} onPress={() => onChange(lines.filter((_, j) => j !== i))} />
                </td>
              </tr>
            ))}
            {!lines.length && (
              <tr>
                <td colSpan={columns.length + 3} className="px-4 py-8 text-center text-sm text-tertiary">
                  No lines yet. Add the first one.
                </td>
              </tr>
            )}
          </tbody>
          {hasAmount && lines.length > 0 && (
            <tfoot className="border-t border-secondary bg-secondary">
              <tr>
                <td colSpan={columns.length + 1} className="py-2.5 pl-3 text-sm font-semibold text-primary">
                  Total
                </td>
                <td className="px-2 py-2.5 text-right text-sm font-semibold text-primary tabular-nums">{formatNumber(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {listError && <p className="mt-1.5 text-sm text-error-primary">{listError}</p>}
    </section>
  );
}

/** A compact control for one cell. Picking a lookup record also returns the values json_config.fill copies from it. */
function LineField({
  param: f,
  label,
  value,
  error,
  onChange,
}: {
  param: MetaParam;
  label: string;
  value: string | boolean | undefined;
  error?: string;
  onChange: (value: string | boolean, fill?: Record<string, string>) => void;
}) {
  const options = optionsOf(f);
  const common = { 'aria-label': label, size: 'sm' as const, isRequired: f.is_required, isInvalid: !!error, hint: error };

  if (f.data_type === 'boolean') {
    return <Toggle aria-label={label} size="sm" isSelected={value === true} onChange={onChange} className="py-2" />;
  }

  if (f.is_select && f.ref_meta_id) {
    return <LookupField {...common} param={f} value={String(value ?? '')} onChange={(v, row) => onChange(v, filledFrom(f, row))} />;
  }

  if (options) {
    return <ComboField {...common} items={options} value={String(value ?? '')} onChange={onChange} />;
  }

  if (f.data_type === 'date' || f.data_type === 'datetime') {
    return <DatePicker {...common} withTime={f.data_type === 'datetime'} value={String(value ?? '')} onChange={onChange} />;
  }

  return (
    <>
      <Input
        aria-label={label}
        size="sm"
        type={numeric(f) ? 'number' : 'text'}
        value={String(value ?? '')}
        onChange={onChange}
        isInvalid={!!error}
        inputClassName={numeric(f) ? 'text-right tabular-nums' : undefined}
      />
      {error && <p className="mt-1 text-xs text-error-primary">{error}</p>}
    </>
  );
}

import { useState, type FormEvent } from 'react';
import type { MetaParam } from '../lib/metaApi';
import type { WfmStatus } from '../lib/workflowApi';
import { ComboField } from '../components/ComboField';
import { DatePicker } from '../components/DatePicker';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { optionsOf } from './definitions';
import { LookupField } from './LookupField';
import { t } from '@/i18n';
import { cx } from '@/utils/cx';

export type Filters = Record<string, string>;

/**
 * The filter panel of a grid, statement, calendar or gantt: one field per param marked
 * is_criteria, picking values the way a form does: a lookup, a list of options, a date. A
 * filter that is neither a lookup nor a list itself picks with its form field's (filter_as).
 * Values apply when the panel is submitted. Required filters (is_mandatory_criteria) are marked; a query
 * grid's :named parameters are filled from here too. In a grid run by a workflow, status_id
 * picks from its statuses.
 */
export function GridFilters({
  params,
  applied,
  onApply,
  statuses,
  dropdown,
}: {
  params: MetaParam[];
  applied: Filters;
  onApply: (filters: Filters) => void;
  statuses?: WfmStatus[];
  /** Shown in a dropdown from the Filters button: narrower, in at most two columns. */
  dropdown?: boolean;
}) {
  const [draft, setDraft] = useState<Filters>(applied);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onApply(Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== '')));
  }

  return (
    <form
      onSubmit={onSubmit}
      className={dropdown ? 'p-4' : 'border-b border-secondary bg-secondary_alt px-4 py-3 sm:px-5'}
      aria-label={t('Filters')}
    >
      <div className={cx('grid gap-x-3 gap-y-2.5', dropdown ? params.length > 1 && 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4')}>
        {params.map((p) => (
          <FilterField key={p.field_path} param={p} statuses={p.field_path === 'status_id' ? statuses : undefined} value={draft[p.field_path] ?? ''} onChange={(v) => setDraft((d) => ({ ...d, [p.field_path]: v }))} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          size="sm"
          color="link-gray"
          onPress={() => {
            setDraft({});
            onApply({});
          }}
        >
          {t('Clear')}
        </Button>
        <Button size="sm" type="submit">
          {t('Apply filters')}
        </Button>
      </div>
    </form>
  );
}

/** The param as it filters: with its form field's lookup or list when it borrows one. */
export function asFilter(p: MetaParam): MetaParam {
  const borrowed = p.filter_as;
  if (!borrowed) return p;
  const { options, ...lookup } = borrowed;
  return { ...p, ...lookup, json_config: options ? { ...(p.json_config ?? {}), options } : p.json_config };
}

function FilterField({
  param,
  statuses,
  value,
  onChange,
}: {
  param: MetaParam;
  statuses?: WfmStatus[];
  value: string;
  onChange: (value: string) => void;
}) {
  const p = asFilter(param);
  const label = `${p.label_name || p.param_name}${p.is_mandatory_criteria ? ' *' : ''}`;
  const options = optionsOf(p);
  const common = { label, size: 'sm' as const, value, onChange };

  if (statuses) {
    return <ComboField {...common} placeholder={t('Any')} items={statuses.map((s) => ({ id: String(s.id), label: s.label_name || s.name }))} />;
  }

  if (p.is_select && p.ref_meta_id) {
    return <LookupField {...common} param={p} placeholder={t('Any')} />;
  }

  if (options) {
    return <ComboField {...common} placeholder={t('Any')} items={options} />;
  }

  if (p.data_type === 'boolean') {
    return (
      <NativeSelect
        label={label}
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: '', label: t('Any') },
          { value: '1', label: t('Yes') },
          { value: '0', label: t('No') },
        ]}
      />
    );
  }

  // Dates match the whole day, so a datetime is filtered by its date.
  if (p.data_type === 'date' || p.data_type === 'datetime') {
    return <DatePicker {...common} />;
  }

  const type = p.data_type === 'integer' || p.data_type === 'decimal' ? 'number' : 'text';
  return <Input label={label} size="sm" type={type} value={value} onChange={onChange} placeholder={type === 'text' ? t('Contains…') : undefined} />;
}

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

export type Filters = Record<string, string>;

/**
 * The filter panel of a grid: one field per param marked is_criteria. Values apply when
 * the panel is submitted. Required filters (is_mandatory_criteria) are marked; a query
 * grid's :named parameters are filled from here too. In a grid run by a workflow, status_id
 * picks from its statuses.
 */
export function GridFilters({
  params,
  applied,
  onApply,
  statuses,
}: {
  params: MetaParam[];
  applied: Filters;
  onApply: (filters: Filters) => void;
  statuses?: WfmStatus[];
}) {
  const [draft, setDraft] = useState<Filters>(applied);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onApply(Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== '')));
  }

  return (
    <form onSubmit={onSubmit} className="border-b border-secondary bg-secondary_alt px-4 py-3 sm:px-5" aria-label="Filters">
      <div className="grid gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
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
          Clear
        </Button>
        <Button size="sm" type="submit">
          Apply filters
        </Button>
      </div>
    </form>
  );
}

function FilterField({
  param: p,
  statuses,
  value,
  onChange,
}: {
  param: MetaParam;
  statuses?: WfmStatus[];
  value: string;
  onChange: (value: string) => void;
}) {
  const label = `${p.label_name || p.param_name}${p.is_mandatory_criteria ? ' *' : ''}`;
  const options = optionsOf(p);
  const common = { label, size: 'sm' as const, value, onChange };

  if (statuses) {
    return <ComboField {...common} placeholder="Any" items={statuses.map((s) => ({ id: String(s.id), label: s.label_name || s.name }))} />;
  }

  if (p.is_select && p.ref_meta_id) {
    return <LookupField {...common} param={p} placeholder="Any" />;
  }

  if (options) {
    return <ComboField {...common} placeholder="Any" items={options} />;
  }

  if (p.data_type === 'boolean') {
    return (
      <NativeSelect
        label={label}
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: '', label: 'Any' },
          { value: '1', label: 'Yes' },
          { value: '0', label: 'No' },
        ]}
      />
    );
  }

  // Dates match the whole day, so a datetime is filtered by its date.
  if (p.data_type === 'date' || p.data_type === 'datetime') {
    return <DatePicker {...common} />;
  }

  const type = p.data_type === 'integer' || p.data_type === 'decimal' ? 'number' : 'text';
  return <Input label={label} size="sm" type={type} value={value} onChange={onChange} placeholder={type === 'text' ? 'Contains…' : undefined} />;
}

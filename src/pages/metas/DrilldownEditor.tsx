import { useMemo } from 'react';
import { Plus, Trash01 } from '@untitledui/icons';
import type { MetaOption } from '../../lib/metaApi';
import { ComboField, type ComboOption } from '../../components/ComboField';
import { IconAction } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { useMetaDef } from '../../render/definitions';
import type { Drilldown } from '../../render/drilldown';

/** Metas a drilldown can open. */
const TARGETS = ['datagrid', 'statement', 'report', 'form', 'dashboard', 'chart', 'calendar', 'gantt'];

/**
 * Edits a json_config.drilldown: the meta it opens and which of its filters or parameters
 * get which value. sources are what the clicked thing offers (a row's fields, or a chart's
 * x, x.from, x.to, range.from, range.to). withLabel asks for the row button's text.
 */
export function DrilldownEditor({
  value,
  onChange,
  options,
  sources,
  selfId,
  withLabel,
}: {
  value: Drilldown | null;
  onChange: (value: Drilldown | null) => void;
  options: MetaOption[];
  sources: ComboOption[];
  selfId: number;
  withLabel?: boolean;
}) {
  const metas = useMemo(
    () => options.filter((o) => o.id !== selfId && o.type && TARGETS.includes(o.type)).map((o) => ({ id: String(o.id), label: `${o.name} · ${o.type}` })),
    [options, selfId],
  );
  const { def } = useMetaDef(value?.meta_id);
  // Filters and parameters of the target, and its key for opening one record.
  const names = useMemo(() => {
    if (!def) return [];
    const seen = new Set<string>();
    return [...def.params.filter((p) => p.is_primary), ...def.params.filter((p) => p.is_criteria)]
      .filter((p) => !seen.has(p.field_path) && seen.add(p.field_path))
      .map((p) => ({ id: p.field_path, label: `${p.label_name || p.field_path}${p.is_primary ? ' · opens this record' : ''}` }));
  }, [def]);
  const pairs = Object.entries(value?.params ?? {});
  const setPairs = (next: [string, string][]) => value && onChange({ ...value, params: Object.fromEntries(next) });

  return (
    <div className="space-y-2.5">
      <ComboField
        aria-label="Drilldown opens"
        size="sm"
        placeholder="Nothing: clicking does nothing"
        items={metas}
        value={value ? String(value.meta_id) : ''}
        onChange={(id) => onChange(id ? { meta_id: Number(id), params: value?.meta_id === Number(id) ? value.params : {}, label: value?.label ?? null } : null)}
      />
      {value && (
        <>
          {pairs.map(([name, source], i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
              <ComboField
                aria-label={`Parameter ${i + 1} of the opened meta`}
                size="sm"
                placeholder="Its filter…"
                items={names.some((n) => n.id === name) || !name ? names : [{ id: name, label: name }, ...names]}
                value={name}
                onChange={(n) => setPairs(pairs.map((p, j) => (j === i ? [n, p[1]] : p)))}
              />
              <span className="text-sm text-tertiary" aria-hidden="true">
                ←
              </span>
              <ComboField
                aria-label={`Value for parameter ${i + 1}`}
                size="sm"
                placeholder="From…"
                items={sources.some((s) => s.id === source) || !source ? sources : [{ id: source, label: source }, ...sources]}
                value={source}
                onChange={(s) => setPairs(pairs.map((p, j) => (j === i ? [p[0], s] : p)))}
              />
              <IconAction icon={Trash01} danger label={`Remove parameter ${i + 1}`} onPress={() => setPairs(pairs.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" color="link-color" iconLeading={Plus} isDisabled={pairs.some(([k]) => !k)} onPress={() => value && onChange({ ...value, params: { ...value.params, '': '' } })}>
            Pass a value
          </Button>
          {withLabel && (
            <Input aria-label="Row button text" size="sm" placeholder="Button text, e.g. Print order (optional)" value={value.label ?? ''} onChange={(label) => onChange({ ...value, label: label || null })} />
          )}
        </>
      )}
    </div>
  );
}

export const chartSources: ComboOption[] = [
  { id: 'x', label: 'The clicked group' },
  { id: 'x.from', label: 'The group’s first day (date groups)' },
  { id: 'x.to', label: 'The group’s last day (date groups)' },
  { id: 'range.from', label: 'Dashboard range: from' },
  { id: 'range.to', label: 'Dashboard range: to' },
];

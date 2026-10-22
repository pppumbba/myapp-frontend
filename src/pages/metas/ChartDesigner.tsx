import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import {
  AlignLeft,
  BarChart01,
  Hash01,
  LineChartUp01,
  PieChart01,
  PieChart03,
  Plus,
  Table,
  TrendUp01,
  Trash01,
} from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { chartApi, type Aggregate, type ChartColumn, type ChartConfig, type ChartType, type FilterOp } from '../../lib/chartApi';
import { metaApi, type Meta, type MetaOption } from '../../lib/metaApi';
import { ComboField } from '../../components/ComboField';
import { Alert, IconAction } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { useDebounced } from '@/hooks/use-debounced';
import { cx } from '@/utils/cx';
import { ChartCard } from '../../render/DashboardView';
import { DrilldownEditor, chartSources } from './DrilldownEditor';
import { useMetaDef, visibleParams } from '../../render/definitions';

const types: { id: ChartType; label: string; icon: FC<{ className?: string }> }[] = [
  { id: 'column', label: 'Columns', icon: BarChart01 },
  { id: 'bar', label: 'Bars', icon: AlignLeft },
  { id: 'line', label: 'Line', icon: LineChartUp01 },
  { id: 'area', label: 'Area', icon: TrendUp01 },
  { id: 'pie', label: 'Pie', icon: PieChart01 },
  { id: 'donut', label: 'Donut', icon: PieChart03 },
  { id: 'kpi', label: 'Figure', icon: Hash01 },
  { id: 'table', label: 'Table', icon: Table },
];

const aggregates: { value: Aggregate; label: string }[] = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Lowest' },
  { value: 'max', label: 'Highest' },
];

const operators: { value: FilterOp; label: string }[] = [
  { value: '=', label: 'is' },
  { value: '!=', label: 'is not' },
  { value: '>', label: 'more than' },
  { value: '>=', label: 'at least' },
  { value: '<', label: 'less than' },
  { value: '<=', label: 'at most' },
  { value: 'contains', label: 'contains' },
  { value: 'empty', label: 'is empty' },
  { value: 'not_empty', label: 'is not empty' },
];

const kindLabel = { number: 'number', date: 'date', text: 'text', boolean: 'yes/no' } as const;

/**
 * Builds a chart meta's json_config: what it counts, how it groups, how it looks. Columns
 * come from the chart's own table or query; the preview redraws as the settings change and
 * Save stores them.
 */
export function ChartDesigner({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const [config, setConfig] = useState<ChartConfig>(() => ({ type: 'column', measures: [{ agg: 'count' }], ...(meta.json_config as ChartConfig | null) }));
  const [saved, setSaved] = useState(() => JSON.stringify(config));
  const [columns, setColumns] = useState<ChartColumn[] | null>(null);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useDebounced(config, 400);

  useEffect(() => {
    let live = true;
    chartApi.columns(meta.id).then(
      (c) => live && setColumns(c),
      (err) => live && setColumnsError(err instanceof ApiError ? err.message : 'The columns could not be loaded.'),
    );
    return () => {
      live = false;
    };
  }, [meta.id, meta.table_name, meta.query_string]);

  const set = (patch: Partial<ChartConfig>) => setConfig((c) => ({ ...c, ...patch }));
  const type = config.type ?? 'column';
  const single = type === 'pie' || type === 'donut' || type === 'kpi';
  const measures = config.measures?.length ? config.measures : [{ agg: 'count' as Aggregate }];
  const kindOf = (name?: string | null) => columns?.find((c) => c.name === name)?.kind;
  const choices = (kinds?: ChartColumn['kind'][]) =>
    (columns ?? []).filter((c) => !kinds || kinds.includes(c.kind)).map((c) => ({ id: c.name, label: `${c.name} · ${kindLabel[c.kind]}` }));
  const dirty = JSON.stringify(config) !== saved;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await metaApi.update(meta.id, { json_config: config as Record<string, unknown> });
      setSaved(JSON.stringify(config));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The chart could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (columnsError) {
    return (
      <Panel>
        <Alert>{`${columnsError} Set the chart's table or query with Edit above.`}</Alert>
      </Panel>
    );
  }

  return (
    <Panel
      actions={
        <Button size="sm" isDisabled={!dirty} isLoading={saving} showTextWhileLoading onPress={save}>
          {saving ? 'Saving…' : dirty ? 'Save chart' : 'Saved'}
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-secondary">Chart type</legend>
            <div className="grid grid-cols-4 gap-2">
              {types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={type === t.id}
                  onClick={() => set({ type: t.id, ...(t.id === 'kpi' ? { split: null } : {}) })}
                  className={cx(
                    'flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-xs font-medium outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2',
                    type === t.id ? 'bg-brand-primary_alt text-brand-secondary ring-2 ring-brand' : 'text-secondary ring-1 ring-secondary hover:bg-primary_hover',
                  )}
                >
                  <t.icon className="size-5" aria-hidden="true" />
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>

          {!columns ? (
            <div className="h-60 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
          ) : (
            <>
              {type !== 'kpi' && (
                <Group title="Group by" hint="Each value of this column becomes a column, bar, point or slice.">
                  <ComboField
                    aria-label="Group by column"
                    items={choices()}
                    value={config.x ?? ''}
                    onChange={(x) => set({ x: x || null, bucket: kindOf(x) === 'date' ? (config.bucket ?? 'month') : null })}
                  />
                  {kindOf(config.x) === 'date' && (
                    <NativeSelect
                      label="Dates by"
                      size="sm"
                      value={config.bucket ?? ''}
                      onChange={(e) => set({ bucket: (e.target.value || null) as ChartConfig['bucket'] })}
                      options={[
                        { value: '', label: 'Each date as it is' },
                        { value: 'day', label: 'Day' },
                        { value: 'week', label: 'Week' },
                        { value: 'month', label: 'Month' },
                        { value: 'quarter', label: 'Quarter' },
                        { value: 'year', label: 'Year' },
                      ]}
                    />
                  )}
                  {kindOf(config.x) === 'number' && <LookupPicker options={options} value={config.x_lookup ?? null} onChange={(x_lookup) => set({ x_lookup })} />}
                </Group>
              )}

              <Group title={single ? 'Value' : 'Values'} hint={single ? undefined : 'Up to four, drawn as separate series.'}>
                {(single ? measures.slice(0, 1) : measures).map((m, i) => (
                  <div key={i} className="grid grid-cols-[8rem_minmax(0,1fr)_auto] items-start gap-2">
                    <NativeSelect
                      aria-label={`Value ${i + 1}: how`}
                      size="sm"
                      value={m.agg}
                      onChange={(e) => set({ measures: measures.map((x, j) => (j === i ? { ...x, agg: e.target.value as Aggregate } : x)) })}
                      options={aggregates}
                    />
                    <ComboField
                      aria-label={`Value ${i + 1}: column`}
                      size="sm"
                      placeholder={m.agg === 'count' ? 'Rows' : 'Column…'}
                      items={choices(m.agg === 'sum' || m.agg === 'avg' ? ['number'] : undefined)}
                      value={m.column ?? ''}
                      onChange={(column) => set({ measures: measures.map((x, j) => (j === i ? { ...x, column: column || null } : x)) })}
                      isInvalid={m.agg !== 'count' && !m.column}
                    />
                    <IconAction
                      icon={Trash01}
                      danger
                      label={`Remove value ${i + 1}`}
                      onPress={() => set({ measures: measures.filter((_, j) => j !== i) })}
                      className={cx('mt-1', measures.length < 2 && 'invisible')}
                    />
                    <div className="col-span-2">
                      <Input
                        aria-label={`Value ${i + 1}: name`}
                        size="sm"
                        placeholder="Name shown in the legend (optional)"
                        value={m.label ?? ''}
                        onChange={(label) => set({ measures: measures.map((x, j) => (j === i ? { ...x, label: label || null } : x)) })}
                      />
                    </div>
                  </div>
                ))}
                {!single && measures.length < 4 && !config.split && (
                  <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => set({ measures: [...measures, { agg: 'sum' }] })}>
                    Add value
                  </Button>
                )}
              </Group>

              {!single && (
                <Group title="Split by" hint="One series per value of this column (the first value only).">
                  <ComboField aria-label="Split by column" placeholder="No split" items={choices(['text', 'boolean', 'number'])} value={config.split ?? ''} onChange={(split) => set({ split: split || null })} />
                </Group>
              )}

              <Group title="Only rows where" hint="All of these must hold.">
                {(config.filters ?? []).map((f, i) => {
                  const update = (patch: Partial<typeof f>) => set({ filters: config.filters!.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  const noValue = f.op === 'empty' || f.op === 'not_empty';
                  return (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_7.5rem_auto] items-start gap-2">
                      <ComboField aria-label={`Filter ${i + 1}: column`} size="sm" items={choices()} value={f.column} onChange={(column) => update({ column })} />
                      <NativeSelect aria-label={`Filter ${i + 1}: rule`} size="sm" value={f.op} onChange={(e) => update({ op: e.target.value as FilterOp })} options={operators} />
                      <IconAction icon={Trash01} danger label={`Remove filter ${i + 1}`} className="mt-1" onPress={() => set({ filters: config.filters!.filter((_, j) => j !== i) })} />
                      {!noValue && (
                        <div className="col-span-2">
                          <Input aria-label={`Filter ${i + 1}: value`} size="sm" placeholder="Value" value={String(f.value ?? '')} onChange={(value) => update({ value })} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button
                  size="sm"
                  color="link-color"
                  iconLeading={Plus}
                  onPress={() => set({ filters: [...(config.filters ?? []), { column: columns[0]?.name ?? '', op: '=', value: '' }] })}
                >
                  Add filter
                </Button>
              </Group>

              <Group title="Dashboard date range" hint={type === 'kpi' ? 'The range narrows this column; the figure also compares with the period before.' : 'The range picked on a dashboard narrows this column.'}>
                <ComboField aria-label="Date range column" placeholder="Not affected by the range" items={choices(['date'])} value={config.date_field ?? ''} onChange={(date_field) => set({ date_field: date_field || null })} />
              </Group>

              <Group title="When clicked" hint="A column, slice, point or figure opens another meta with the clicked values. Works on running dashboards, not in this preview.">
                <DrilldownEditor value={config.drilldown ?? null} onChange={(drilldown) => set({ drilldown })} options={options} sources={chartSources} selfId={meta.id} />
              </Group>

              <Group title="Display">
                <div className="grid grid-cols-2 gap-3">
                  <NativeSelect
                    label="Numbers as"
                    size="sm"
                    value={config.format ?? 'number'}
                    onChange={(e) => set({ format: e.target.value as ChartConfig['format'] })}
                    options={[
                      { value: 'number', label: 'Number' },
                      { value: 'money', label: 'Money' },
                      { value: 'percent', label: 'Percent' },
                    ]}
                  />
                  {type !== 'kpi' && (
                    <NativeSelect
                      label="Order"
                      size="sm"
                      value={config.sort ?? ''}
                      onChange={(e) => set({ sort: (e.target.value || null) as ChartConfig['sort'] })}
                      options={[
                        { value: '', label: 'Automatic' },
                        { value: 'value', label: 'Biggest first' },
                        { value: 'label', label: 'By name or date' },
                      ]}
                    />
                  )}
                  {type !== 'kpi' && (
                    <Input
                      label="Show at most"
                      size="sm"
                      type="number"
                      placeholder={config.bucket ? 'Every period' : type === 'pie' || type === 'donut' ? '6' : '12'}
                      value={config.limit ? String(config.limit) : ''}
                      onChange={(v) => set({ limit: v ? Math.max(1, Math.min(500, Number(v))) : null })}
                      hint={type === 'pie' || type === 'donut' ? 'The rest add up into "Other".' : undefined}
                    />
                  )}
                </div>
              </Group>
            </>
          )}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-sm font-medium text-secondary">Preview</p>
          <ChartCard metaId={meta.id} preview={preview} height={type === 'kpi' ? 160 : 400} className="bg-primary" />
          <p className="mt-2 text-xs text-tertiary">{dirty ? 'Not saved yet. Dashboards show the saved chart.' : 'This is what dashboards show.'}</p>
        </div>
      </div>
    </Panel>
  );
}

function Panel({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-labelledby="chart-designer-title">
      <div className="flex items-center justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div>
          <h2 id="chart-designer-title" className="text-lg font-semibold text-primary">
            Chart
          </h2>
          <p className="mt-0.5 text-sm text-tertiary">Pick what to count and how to group it. Columns come from this chart's table or query.</p>
        </div>
        {actions}
      </div>
      <div className="px-4 py-5 sm:px-5">{children}</div>
    </section>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-sm font-medium text-secondary">{title}</legend>
      {hint && <p className="-mt-1 text-xs text-tertiary">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** When the group column holds ids, which meta's records name them, and by which field. */
function LookupPicker({
  options,
  value,
  onChange,
}: {
  options: MetaOption[];
  value: ChartConfig['x_lookup'];
  onChange: (value: ChartConfig['x_lookup']) => void;
}) {
  const { def } = useMetaDef(value?.meta_id);
  const metas = useMemo(() => options.filter((o) => o.type === 'datagrid' || o.type === 'form').map((o) => ({ id: String(o.id), label: o.name })), [options]);
  const fields = def ? visibleParams(def.params).map((p) => ({ id: p.field_path, label: p.label_name || p.field_path })) : [];

  return (
    <div className="grid grid-cols-2 gap-2">
      <ComboField
        label="Names from"
        size="sm"
        placeholder="Show the ids"
        items={metas}
        value={value ? String(value.meta_id) : ''}
        onChange={(id) => onChange(id ? { meta_id: Number(id), label_field: value?.label_field ?? 'name' } : null)}
      />
      {value && <ComboField label="Name field" size="sm" items={fields} value={value.label_field} onChange={(label_field) => onChange({ ...value, label_field: label_field || 'name' })} />}
    </div>
  );
}

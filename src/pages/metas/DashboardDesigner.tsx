import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Edit01, Plus, Trash01 } from '@untitledui/icons';
import type { Key } from 'react-aria-components';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaParam, type MetaType } from '../../lib/metaApi';
import { ComboField } from '../../components/ComboField';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Dropdown } from '@/components/base/dropdown/dropdown';
import { ChartCard, DashboardGrid, HEIGHTS, WIDTHS, cardHeight, chartParams, placement, spanClass } from '../../render/DashboardView';
import { clearRenderCache } from '../../render/definitions';
import { MetaFormModal } from './MetaFormModal';

const widthNames: Record<number, string> = { 3: 'Quarter', 4: 'Third', 6: 'Half', 8: 'Two thirds', 9: 'Three quarters', 12: 'Full width' };
const heightNames: Record<number, string> = { 1: 'Short', 2: 'Medium', 3: 'Tall' };

/**
 * Lays out a dashboard meta. Each placed chart is a param of the dashboard: ref_meta_id is
 * the chart meta, order_number its place, json_config.w / .h its size on the 12-column
 * grid. Every change is saved straight away.
 */
export function DashboardDesigner({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const navigate = useNavigate();
  const [params, setParams] = useState<MetaParam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<MetaType[] | null>(null);
  const [chartOptions, setChartOptions] = useState(options);

  const load = useCallback(async () => {
    try {
      setParams(await metaApi.params(meta.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The layout could not be loaded.');
    }
  }, [meta.id]);

  useEffect(() => {
    load();
  }, [load]);

  const placed = useMemo(() => chartParams(params ?? []), [params]);
  const charts = useMemo(() => chartOptions.filter((o) => o.type === 'chart').map((o) => ({ id: String(o.id), label: o.name })), [chartOptions]);

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await task();
      // The running dashboard reads the cached definition; let it see the change.
      clearRenderCache();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That change could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  /** Places a chart at the end; figures start small, other charts take half a row. */
  const add = (chartId: number) =>
    run(async () => {
      const chart = await metaApi.get(chartId);
      const kpi = chart.json_config?.type === 'kpi';
      const taken = new Set(params?.map((p) => p.field_path));
      let field = chart.code;
      for (let n = 2; taken.has(field); n++) field = `${chart.code}_${n}`;
      await metaApi.createParam(meta.id, {
        field_path: field,
        param_name: field,
        data_type: 'chart',
        ref_meta_id: chart.id,
        is_show: true,
        order_number: Math.max(0, ...(params ?? []).map((p) => p.order_number)) + 1,
        json_config: kpi ? { w: 3, h: 1 } : { w: 6, h: 2 },
      });
      setPicked('');
    });

  const resize = (p: MetaParam, patch: { w?: number; h?: number }) =>
    run(() => metaApi.updateParam(p.id, { json_config: { ...p.json_config, ...placement(p), ...patch } }));

  /** Swaps a chart with its neighbour; order numbers are rewritten so they stay distinct. */
  const move = (i: number, by: -1 | 1) =>
    run(async () => {
      const next = [...placed];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      await Promise.all(next.map((p, k) => (p.order_number === k + 1 ? null : metaApi.updateParam(p.id, { order_number: k + 1 }))));
    });

  function onAction(p: MetaParam, i: number, key: Key) {
    const [what, value] = String(key).split(':');
    if (what === 'w' || what === 'h') resize(p, { [what]: Number(value) });
    else if (what === 'earlier') move(i, -1);
    else if (what === 'later') move(i, 1);
    else if (what === 'edit') navigate(`/metas/${p.ref_meta_id}`);
    else if (what === 'remove') run(() => metaApi.removeParam(p.id));
  }

  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-labelledby="dashboard-designer-title">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 id="dashboard-designer-title" className="text-lg font-semibold text-primary">
            Layout
          </h2>
          <p className="mt-0.5 text-sm text-tertiary">Charts sit on a 12-column grid, in order. Use each chart's menu to size or move it.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="min-w-56 flex-1">
            <ComboField aria-label="Chart to add" size="sm" placeholder="Pick a chart to add…" items={charts} value={picked} onChange={setPicked} />
          </div>
          <Button size="sm" iconLeading={Plus} isDisabled={!picked || busy} onPress={() => add(Number(picked))}>
            Add
          </Button>
          <Button size="sm" color="secondary" isDisabled={busy} onPress={async () => setCreating(await metaApi.types())}>
            New chart
          </Button>
        </div>
      </div>

      <div className="bg-secondary_alt px-4 py-5 sm:px-5">
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}
        {!params ? (
          <div className="h-60 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
        ) : placed.length ? (
          <DashboardGrid>
            {placed.map((p, i) => {
              const { w, h } = placement(p);
              return (
                <ChartCard
                  key={p.id}
                  metaId={p.ref_meta_id}
                  title={p.label_name}
                  className={spanClass(w)}
                  height={cardHeight(h)}
                  actions={
                    <Dropdown.Root>
                      <Dropdown.DotsButton
                        aria-label={`Size and place ${p.label_name || chartOptions.find((o) => o.id === p.ref_meta_id)?.name || 'this chart'}`}
                        className="mt-0.5"
                      />
                      <Dropdown.Popover className="w-56">
                        <Dropdown.Menu onAction={(key) => onAction(p, i, key)}>
                          <Dropdown.Section aria-label="Width">
                            <Dropdown.SectionHeader className="px-3 pt-1.5 pb-1 text-xs font-semibold text-tertiary">Width</Dropdown.SectionHeader>
                            {WIDTHS.map((x) => (
                              <Dropdown.Item key={x} id={`w:${x}`} label={widthNames[x]} addon={x === w ? 'Now' : `${x}/12`} isDisabled={x === w} />
                            ))}
                          </Dropdown.Section>
                          <Dropdown.Separator />
                          <Dropdown.Section aria-label="Height">
                            <Dropdown.SectionHeader className="px-3 pt-1.5 pb-1 text-xs font-semibold text-tertiary">Height</Dropdown.SectionHeader>
                            {HEIGHTS.map((x) => (
                              <Dropdown.Item key={x} id={`h:${x}`} label={heightNames[x]} addon={x === h ? 'Now' : undefined} isDisabled={x === h} />
                            ))}
                          </Dropdown.Section>
                          <Dropdown.Separator />
                          <Dropdown.Section aria-label="Arrange">
                            <Dropdown.Item id="earlier" icon={ArrowLeft} label="Move earlier" isDisabled={i === 0} />
                            <Dropdown.Item id="later" icon={ArrowRight} label="Move later" isDisabled={i === placed.length - 1} />
                            <Dropdown.Item id="edit" icon={Edit01} label="Edit chart" />
                            <Dropdown.Item id="remove" icon={Trash01} label="Remove from dashboard" />
                          </Dropdown.Section>
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown.Root>
                  }
                />
              );
            })}
          </DashboardGrid>
        ) : (
          <div className="rounded-xl bg-primary px-6 py-12 text-center ring-1 ring-secondary">
            <p className="text-md font-semibold text-primary">No charts on this dashboard yet</p>
            <p className="mt-1 text-sm text-tertiary">Pick a chart above, or make a new one.</p>
          </div>
        )}
      </div>

      {creating && (
        <MetaFormModal
          meta={null}
          types={creating}
          options={chartOptions}
          presetTypeId={creating.find((t) => t.code === 'chart')?.id}
          onClose={() => setCreating(null)}
          onSaved={async (chart) => {
            setCreating(null);
            setChartOptions((o) => [...o, { id: chart.id, code: chart.code, name: chart.name, type: 'chart' }]);
            await add(chart.id);
          }}
        />
      )}
    </section>
  );
}

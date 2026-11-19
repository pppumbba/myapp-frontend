import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BarChart01, Table } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { chartApi, type ChartConfig, type ChartData, type ChartRow, type DateRange } from '../lib/chartApi';
import type { MetaParam } from '../lib/metaApi';
import { Alert, IconAction } from '../components/ui';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { cx } from '@/utils/cx';
import { ChartTable, ChartView, rowName } from './charts/ChartView';
import { title, useMetaDef, useMetaDefs, type MetaDef } from './definitions';
import { BlurWords, wordCount } from '../components/motion';
import { drilldownOf, drillParams, periodRange, useDrilldown } from './drilldown';
import { ymd } from './palette';
import { t } from '@/i18n';

/** Widths a chart can take on the dashboard's 12-column grid, and the rows it can span. */
export const WIDTHS = [3, 4, 6, 8, 9, 12] as const;
export const HEIGHTS = [1, 2, 3] as const;

// Below lg, narrow charts pair up and wide ones take the row; on phones everything stacks.
const span: Record<number, string> = {
  3: 'md:col-span-6 lg:col-span-3',
  4: 'md:col-span-6 lg:col-span-4',
  6: 'md:col-span-6',
  8: 'md:col-span-12 lg:col-span-8',
  9: 'md:col-span-12 lg:col-span-9',
  12: 'md:col-span-12',
};
const heightPx: Record<number, number> = { 1: 148, 2: 340, 3: 520 };

/** Where a dashboard param puts its chart: json_config.w (of 12) and json_config.h (rows). */
export function placement(p: MetaParam): { w: number; h: number } {
  const w = Number(p.json_config?.w);
  const h = Number(p.json_config?.h);
  return { w: WIDTHS.includes(w as never) ? w : 6, h: HEIGHTS.includes(h as never) ? h : 2 };
}

export const spanClass = (w: number) => span[w] ?? span[6];
export const cardHeight = (h: number) => heightPx[h] ?? heightPx[2];

/** A dashboard's params that place a chart, in order. */
export function chartParams(params: MetaParam[]): (MetaParam & { ref_meta_id: number })[] {
  return params.filter((p): p is MetaParam & { ref_meta_id: number } => p.is_show && !!p.ref_meta_id);
}

type Preset = 'all' | '7' | '30' | '90' | 'year';
const presets: { id: Preset; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'year', label: 'This year' },
];

function rangeOf(preset: Preset): DateRange {
  const today = new Date();
  if (preset === 'all') return {};
  if (preset === 'year') return { from: `${today.getFullYear()}-01-01`, to: ymd(today) };
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Number(preset) + 1);
  return { from: ymd(from), to: ymd(today) };
}

/**
 * A dashboard meta: each param places the chart meta it refers to (ref_meta_id) on a
 * 12-column grid. When any chart has a date_field, a date range above applies to them all.
 */
export function DashboardView({ def }: { def: MetaDef }) {
  const params = useMemo(() => chartParams(def.params), [def]);
  const { defs } = useMetaDefs(useMemo(() => params.map((p) => p.ref_meta_id), [params]));
  const [preset, setPreset] = useState<Preset>('all');
  const range = useMemo(() => rangeOf(preset), [preset]);
  const dated = defs?.some((d) => typeof d.meta.json_config?.date_field === 'string' && d.meta.json_config.date_field);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-primary">
            <BlurWords text={title(def.meta)} />
          </h2>
          {def.meta.description && (
            <p className="mt-0.5 text-sm text-tertiary">
              <BlurWords text={def.meta.description} delay={wordCount(title(def.meta))} />
            </p>
          )}
        </div>
        {dated && <DateRangePresets value={preset} onChange={setPreset} />}
      </div>

      {params.length ? (
        <DashboardGrid>
          {params.map((p, i) => {
            const { w, h } = placement(p);
            return <ChartCard key={p.id} metaId={p.ref_meta_id} title={p.label_name} range={range} className={spanClass(w)} height={cardHeight(h)} style={{ '--i': i } as React.CSSProperties} />;
          })}
        </DashboardGrid>
      ) : (
        <div className="rounded-xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary">
          <p className="text-md font-semibold text-primary">{t('This dashboard has no charts yet')}</p>
          <p className="mt-1 text-sm text-tertiary">{t('Place chart metas on it in the builder.')}</p>
        </div>
      )}
    </div>
  );
}

export function DashboardGrid({ children }: { children: ReactNode }) {
  // Each card arrives a moment after the one before (.blur-in, --i).
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-12 cards-in">{children}</div>;
}

export function DateRangePresets({ value, onChange }: { value: Preset; onChange: (p: Preset) => void }) {
  const group = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const last = useRef<{ left: number; width: number } | null>(null);
  const [place, setPlace] = useState<{ left: number; width: number } | null>(null);

  // One highlight behind the picked range. A new pick springs it across, stretching on the way:
  // the edge in front gets there first, the one behind catches up, a little overshoot, settled.
  useLayoutEffect(() => {
    const picked = group.current?.querySelector<HTMLElement>(`[data-range="${value}"]`);
    const next = picked ? { left: picked.offsetLeft, width: picked.offsetWidth } : null;
    const before = last.current;
    last.current = next;
    setPlace(next);
    const el = thumb.current;
    if (!el || !next || !before || before.left === next.left || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dx = before.left - next.left;
    const w = next.width;
    const right = dx < 0;
    const at = (left: number, width: number) => `translateX(${left}px) scaleX(${width / w})`;
    el.animate(
      [
        { transform: at(dx, before.width), offset: 0, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
        { transform: right ? at(dx * 0.6, w - dx * 0.6) : at(-2, dx * 0.6 + before.width + 2), offset: 0.4, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
        { transform: right ? at(4, w - 3) : at(-4, w - 3), offset: 0.72, easing: 'ease-out' },
        { transform: at(0, w), offset: 1 },
      ],
      { duration: 560 },
    );
  }, [value]);

  return (
    <ButtonGroup
      ref={group}
      size="sm"
      aria-label={t('Date range')}
      selectedKeys={[value]}
      disallowEmptySelection
      onSelectionChange={(keys) => {
        const [next] = [...keys];
        if (next) onChange(next as Preset);
      }}
      // It blurs in, then its buttons one after another (.cards-in, --i), the highlight with the picked one.
      className="blur-in cards-in bg-primary"
    >
      {place && (
        <span
          ref={thumb}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 origin-left rounded-lg bg-secondary ring-1 ring-primary ring-inset will-change-transform"
          style={{ left: place.left, width: place.width, '--i': presets.findIndex((p) => p.id === value) + 1 } as React.CSSProperties}
        />
      )}
      {presets.map((p, i) => (
        // See-through, so the sliding highlight shows behind the picked one.
        <ButtonGroupItem
          key={p.id}
          id={p.id}
          data-range={p.id}
          style={{ '--i': i + 1 } as React.CSSProperties}
          className="relative z-10 bg-transparent hover:bg-primary_hover/60 selected:bg-transparent"
        >
          {t(p.label)}
        </ButtonGroupItem>
      ))}
    </ButtonGroup>
  );
}

/**
 * One chart in a card: its title, the chart, and a switch to see the numbers as a table.
 * preview draws an unsaved config instead (the builder); actions go in the card's corner.
 */
export function ChartCard({
  metaId,
  title: titleOverride,
  range = {},
  preview,
  height = cardHeight(2),
  className,
  style,
  actions,
}: {
  metaId: number;
  title?: string | null;
  range?: DateRange;
  preview?: ChartConfig;
  height?: number;
  className?: string;
  /** E.g. --i, its place in the dashboard's entrance. */
  style?: React.CSSProperties;
  actions?: ReactNode;
}) {
  const { def } = useMetaDef(metaId);
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);
  const previewKey = preview ? JSON.stringify(preview) : '';

  useEffect(() => {
    let live = true;
    setError(null);
    const load = preview ? chartApi.preview(metaId, preview, range) : chartApi.data(metaId, range);
    load.then(
      (d) => {
        if (!live) return;
        setData(d);
      },
      (err) => live && setError(err instanceof ApiError ? err.message : t('This chart could not be loaded.')),
    );
    return () => {
      live = false;
    };
  }, [metaId, range.from, range.to, previewKey]);

  const name = titleOverride || (def ? title(def.meta) : '');

  // A saved chart with a drilldown opens what a mark stands for (previews never drill).
  const drill = useDrilldown();
  const target = drill && !preview ? drilldownOf(def?.meta.json_config) : null;
  const onSelect =
    drill && target && data
      ? (row: ChartRow | null) => {
          const period = periodRange(row?.x ?? null, data.bucket);
          const values = { x: row?.x, 'x.from': period.from, 'x.to': period.to, 'range.from': range.from, 'range.to': range.to };
          drill({ metaId: target.meta_id, params: drillParams(target, values), open: target.open_in, label: row ? `${name} · ${rowName(row, data.bucket)}` : name });
        }
      : undefined;
  const kpi = data?.type === 'kpi';
  const canTable = data && !kpi && data.type !== 'table';

  return (
    <section
      aria-label={name || t('Chart')}
      className={cx('flex min-w-0 flex-col rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary', className)}
      style={{ ...style, height }}
    >
      <header className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className={cx('truncate font-semibold text-primary', kpi ? 'text-sm text-tertiary' : 'text-md')}>{name ? <BlurWords text={name} /> : ' '}</h3>
          {!kpi && def?.meta.description && (
            <p className="truncate text-xs text-tertiary">
              <BlurWords text={def.meta.description} delay={wordCount(name)} />
            </p>
          )}
        </div>
        {canTable && (
          <IconAction icon={asTable ? BarChart01 : Table} label={asTable ? t('Show as chart') : t('Show as table')} onPress={() => setAsTable((item) => !item)} />
        )}
        {actions}
      </header>
      <div className="min-h-0 flex-1">
        {error ? (
          <Alert>{error}</Alert>
        ) : !data ? (
          <div className="h-full animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
        ) : asTable ? (
          <div className="blur-in h-full">
            <ChartTable data={data} onSelect={onSelect} />
          </div>
        ) : (
          <div className="blur-in h-full">
            <ChartView data={data} onSelect={onSelect} />
          </div>
        )}
      </div>
      {data?.truncated && !kpi && <p className="mt-1 text-xs text-quaternary">{t('Some groups are left out; raise the limit to see more.')}</p>}
    </section>
  );
}

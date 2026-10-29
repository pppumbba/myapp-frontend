import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { ArrowDown, ArrowUp } from '@untitledui/icons';
import type { Bucket, ChartData, ChartFormat, ChartRow } from '../../lib/chartApi';
import { cx } from '@/utils/cx';
import { formatDate } from '../Cell';
import { t } from '@/i18n';

/*
 * Charts drawn as plain SVG, following one set of mark specs: columns at most 24px thick
 * with a 4px rounded data end, 2px lines, area washes at 10%, hairline gridlines, a legend
 * for two or more series, and a tooltip on hover. Series take --chart-1..6 in order.
 */

export const seriesColor = (i: number) => `var(--chart-${(i % 6) + 1})`;

const AXIS = 'var(--color-text-quaternary)';
const GRID = 'var(--color-border-secondary)';
const SURFACE = 'var(--color-bg-primary)';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** A value as the chart's format says: money with 2 decimals at most, percent with a %. */
export function formatValue(value: number | null | undefined, format: ChartFormat = 'number', short = false): string {
  if (value === null || value === undefined) return '—';
  if (short && Math.abs(value) >= 1000) return compact.format(value) + (format === 'percent' ? '%' : '');
  const text = value.toLocaleString(undefined, { maximumFractionDigits: format === 'money' ? 2 : value % 1 ? 2 : 0 });
  return format === 'percent' ? `${text}%` : text;
}

const months = (m: number, y: number) => new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

/** "item_id" -> "Item", "order_date" -> "Order date": a column named for a table header. */
function columnName(column: string | null): string {
  if (!column) return t('Group');
  const words = column.replace(/_id$/, '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A group's name: lookup labels as they are, period keys like 2026-10 as "Oct 2026", plain values capitalised. */
export function rowName(row: ChartRow, bucket: Bucket | null): string {
  if (row.label !== null && row.label !== row.x) return row.label;
  if (row.x === null) return '(empty)';
  const x = row.x;
  switch (bucket) {
    case 'day':
      return formatDate(x);
    case 'week':
      return x.replace(/^(\d{4})-W(\d+)$/, (_, y, w) => `Week ${Number(w)}, ${y}`);
    case 'month': {
      const [y, m] = x.split('-').map(Number);
      return y && m ? months(m, y) : x;
    }
    case 'quarter':
      return x.replace(/^(\d{4})-Q(\d)$/, 'Q$2 $1');
    case 'year':
      return x;
    default:
      return x.charAt(0).toUpperCase() + x.slice(1);
  }
}

/** Width and height of an element, kept up to date. */
function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** About `count` round tick values covering [min, max], always including 0. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (lo === hi) return [0, 1];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let item = Math.floor(lo / step) * step; item <= hi + step * 1e-9; item += step) ticks.push(Number(item.toPrecision(12)));
  if (ticks[ticks.length - 1] < hi) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Called with the clicked group (null for a figure) when the chart drills down. */
type OnSelect = ((row: ChartRow | null) => void) | undefined;

/** The chart for this data, filling its parent. With onSelect, its marks open what they stand for. */
export function ChartView({ data, onSelect }: { data: ChartData; onSelect?: OnSelect }) {
  if (data.type === 'kpi') return <KpiFigure data={data} onSelect={onSelect} />;
  if (!data.rows.length) return <Empty />;
  if (data.type === 'table') return <ChartTable data={data} onSelect={onSelect} />;
  if (data.type === 'pie' || data.type === 'donut') return <PieChart data={data} onSelect={onSelect} />;
  if (data.type === 'bar') return <BarChart data={data} onSelect={onSelect} />;
  return <CartesianChart data={data} onSelect={onSelect} />;
}

/** Click and keyboard handling for a mark that drills down. */
function selectable(onSelect: OnSelect, row: ChartRow, bucket: ChartData['bucket']) {
  if (!onSelect) return {};
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': t('{name}: open the records', { name: rowName(row, bucket) }),
    style: { cursor: 'pointer' },
    onClick: () => onSelect(row),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(row);
      }
    },
  };
}

function Empty() {
  return <div className="flex h-full min-h-24 items-center justify-center text-sm text-tertiary">{t("Nothing to show for this period.")}</div>;
}

/** Swatch + name for each series; present whenever there are two or more. */
function Legend({ series }: { series: ChartData['series'] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 pb-2 text-xs text-tertiary">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: seriesColor(i) }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** The hover card: the group's name, then each series' value. */
function Tooltip({ x, y, width, title, items }: { x: number; y: number; width: number; title: string; items: { label: string; value: string; color: string }[] }) {
  const left = Math.min(Math.max(x + 12, 0), Math.max(width - 200, 0));
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 w-max max-w-52 rounded-lg bg-primary px-3 py-2 text-xs shadow-lg ring-1 ring-secondary_alt"
      style={{ left, top: Math.max(y - 8, 0) }}
    >
      <p className="mb-1 font-semibold text-primary">{title}</p>
      {items.map((it) => (
        <p key={it.label} className="flex items-center gap-1.5 text-tertiary">
          <span className="size-2 shrink-0 rounded-sm" style={{ background: it.color }} aria-hidden="true" />
          <span className="truncate">{it.label}</span>
          <span className="ml-auto pl-3 font-medium text-primary tabular-nums">{it.value}</span>
        </p>
      ))}
    </div>
  );
}

function Frame({ children, legend, chartRef, label }: { children: ReactNode; legend?: ReactNode; chartRef: RefObject<HTMLDivElement | null>; label: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {legend}
      <div ref={chartRef} role="img" aria-label={label} className="relative min-h-0 flex-1">
        {children}
      </div>
    </div>
  );
}

const describe = (data: ChartData) =>
  t('{series} for {count} groups. The table view lists every value.', { series: data.series.map((s) => s.label).join(', '), count: data.rows.length });

/** A column from the baseline y0 to its value y1, rounded 4px at the value end only. */
function columnPath(x: number, y0: number, y1: number, w: number): string {
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const r = Math.min(4, (bottom - top) / 2, w / 2);
  if (y1 <= y0) return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${bottom}Z`;
  return `M${x},${top}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + w - r}Q${x + w},${bottom} ${x + w},${bottom - r}V${top}Z`;
}

/** A bar from the baseline x0 to its value x1, h tall from y, rounded 4px at the value end only. */
function barPath(x0: number, x1: number, y: number, h: number): string {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const r = Math.min(4, (right - left) / 2, h / 2);
  if (x1 >= x0) return `M${left},${y}H${right - r}Q${right},${y} ${right},${y + r}V${y + h - r}Q${right},${y + h} ${right - r},${y + h}H${left}Z`;
  return `M${right},${y}H${left + r}Q${left},${y} ${left},${y + r}V${y + h - r}Q${left},${y + h} ${left + r},${y + h}H${right}Z`;
}

/** Columns, lines and areas over the groups, with a value axis on the left. */
function CartesianChart({ data, onSelect }: { data: ChartData; onSelect?: OnSelect }) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(ref);
  const [hover, setHover] = useState<number | null>(null);

  const values = data.rows.flatMap((r) => data.series.map((s) => r.values[s.key] ?? 0));
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const [lo, hi] = [ticks[0], ticks[ticks.length - 1]];
  const pad = { top: 8, right: 8, bottom: 22, left: Math.max(...ticks.map((item) => formatValue(item, data.format, true).length)) * 6.5 + 10 };
  const plotW = Math.max(width - pad.left - pad.right, 0);
  const plotH = Math.max(height - pad.top - pad.bottom, 0);
  const y = (v: number) => pad.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const band = plotW / data.rows.length;
  const bx = (i: number) => pad.left + i * band;
  const mid = (i: number) => bx(i) + band / 2;

  const isColumn = data.type === 'column';
  const n = data.series.length;
  // Columns: at most 24px each, 2px apart, the rest of the band is air.
  const barW = Math.max(Math.min(24, (band * 0.7 - (n - 1) * 2) / n), 2);
  const groupW = n * barW + (n - 1) * 2;
  // Every label gets about 64px; skip the rest so none collide.
  const every = Math.max(1, Math.ceil(64 / Math.max(band, 1)));
  const markers = data.rows.length <= 24;

  const points = (key: string) => data.rows.map((r, i) => [mid(i), y(r.values[key] ?? 0)] as const);

  return (
    <Frame chartRef={ref} label={describe(data)} legend={<Legend series={data.series} />}>
      {width > 0 && height > 0 && (
        <svg width={width} height={height} className="block overflow-visible" onPointerLeave={() => setHover(null)}>
          {ticks.map((item) => (
            <g key={item}>
              <line x1={pad.left} x2={width - pad.right} y1={y(item)} y2={y(item)} stroke={item === 0 ? AXIS : GRID} strokeOpacity={item === 0 ? 0.5 : 1} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={pad.left - 8} y={y(item)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS} className="tabular-nums">
                {formatValue(item, data.format, true)}
              </text>
            </g>
          ))}

          {data.rows.map((r, i) =>
            i % every === 0 ? (
              <text key={i} x={mid(i)} y={height - 6} textAnchor="middle" fontSize={11} fill={AXIS}>
                {truncate(rowName(r, data.bucket), Math.max(Math.floor((band * every) / 6.5), 4))}
              </text>
            ) : null,
          )}

          {hover !== null && !isColumn && <line x1={mid(hover)} x2={mid(hover)} y1={pad.top} y2={pad.top + plotH} stroke={AXIS} strokeOpacity={0.4} />}
          {hover !== null && isColumn && <rect x={bx(hover)} y={pad.top} width={band} height={plotH} fill={AXIS} opacity={0.08} rx={4} />}

          {isColumn &&
            data.rows.map((r, i) =>
              data.series.map((s, j) => {
                const v = r.values[s.key];
                if (v === null || v === undefined) return null;
                return <path key={`${i}-${s.key}`} d={columnPath(mid(i) - groupW / 2 + j * (barW + 2), y(0), y(v), barW)} fill={seriesColor(j)} />;
              }),
            )}

          {!isColumn &&
            data.series.map((s, j) => {
              const pts = points(s.key);
              const line = pts.map(([px, py], k) => `${k ? 'L' : 'M'}${px},${py}`).join('');
              return (
                <g key={s.key}>
                  {data.type === 'area' && <path d={`${line}L${pts[pts.length - 1][0]},${y(0)}L${pts[0][0]},${y(0)}Z`} fill={seriesColor(j)} opacity={0.1} />}
                  <path d={line} fill="none" stroke={seriesColor(j)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map(([px, py], k) =>
                    markers || k === pts.length - 1 || k === hover ? (
                      <circle key={k} cx={px} cy={py} r={k === hover ? 5 : 4} fill={seriesColor(j)} stroke={SURFACE} strokeWidth={2} />
                    ) : null,
                  )}
                </g>
              );
            })}

          {/* Hit areas: the whole band, bigger than any mark. */}
          {data.rows.map((_, i) => (
            <rect
              key={i}
              x={bx(i)}
              y={pad.top}
              width={band}
              height={plotH}
              fill="transparent"
              className="outline-none focus-visible:stroke-[var(--color-focus-ring)] focus-visible:stroke-2"
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              {...selectable(onSelect, data.rows[i], data.bucket)}
            />
          ))}
        </svg>
      )}
      {hover !== null && data.rows[hover] && (
        <Tooltip
          x={mid(hover)}
          y={pad.top}
          width={width}
          title={rowName(data.rows[hover], data.bucket)}
          items={data.series.map((s, j) => ({ label: s.label, value: formatValue(data.rows[hover].values[s.key], data.format), color: seriesColor(j) }))}
        />
      )}
    </Frame>
  );
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(max - 1, 1))}…` : text);

/** Horizontal bars: names on the left, values at the bar tips. Best for long names. */
function BarChart({ data, onSelect }: { data: ChartData; onSelect?: OnSelect }) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(ref);
  const [hover, setHover] = useState<number | null>(null);

  const n = data.series.length;
  const values = data.rows.flatMap((r) => data.series.map((s) => r.values[s.key] ?? 0));
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const labelW = Math.min(Math.max(...data.rows.map((r) => rowName(r, data.bucket).length)) * 6.5 + 8, width * 0.38);
  const valueW = Math.max(...values.map((v) => formatValue(v, data.format, true).length)) * 6.5 + 10;
  const plotW = Math.max(width - labelW - valueW, 0);
  const x = (v: number) => labelW + ((v - min) / (max - min || 1)) * plotW;
  const band = height / data.rows.length;
  const barH = Math.max(Math.min(24, (band * 0.7 - (n - 1) * 2) / n), 2);
  const groupH = n * barH + (n - 1) * 2;

  return (
    <Frame chartRef={ref} label={describe(data)} legend={<Legend series={data.series} />}>
      {width > 0 && height > 0 && (
        <svg width={width} height={height} className="block overflow-visible" onPointerLeave={() => setHover(null)}>
          <line x1={x(0)} x2={x(0)} y1={0} y2={height} stroke={AXIS} strokeOpacity={0.5} shapeRendering="crispEdges" />
          {data.rows.map((r, i) => {
            const top = i * band + (band - groupH) / 2;
            return (
              <g key={i}>
                {hover === i && <rect x={0} y={i * band} width={width} height={band} fill={AXIS} opacity={0.08} rx={4} />}
                <text x={labelW - 8} y={i * band + band / 2} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--color-text-tertiary)">
                  {truncate(rowName(r, data.bucket), Math.floor((labelW - 8) / 6.5))}
                </text>
                {data.series.map((s, j) => {
                  const v = r.values[s.key];
                  if (v === null || v === undefined) return null;
                  const yy = top + j * (barH + 2);
                  return (
                    <g key={s.key}>
                      <path d={barPath(x(0), x(v), yy, barH)} fill={seriesColor(j)} />
                      {(n === 1 || band >= 28) && (
                        <text x={x(Math.max(v, 0)) + 6} y={yy + barH / 2} dy="0.32em" fontSize={11} fill="var(--color-text-tertiary)" className="tabular-nums">
                          {formatValue(v, data.format, true)}
                        </text>
                      )}
                    </g>
                  );
                })}
                <rect
                  x={0}
                  y={i * band}
                  width={width}
                  height={band}
                  fill="transparent"
                  className="outline-none focus-visible:stroke-[var(--color-focus-ring)] focus-visible:stroke-2"
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  {...selectable(onSelect, r, data.bucket)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data.rows[hover] && (
        <Tooltip
          x={labelW + plotW / 2}
          y={hover * band + band}
          width={width}
          title={rowName(data.rows[hover], data.bucket)}
          items={data.series.map((s, j) => ({ label: s.label, value: formatValue(data.rows[hover].values[s.key], data.format), color: seriesColor(j) }))}
        />
      )}
    </Frame>
  );
}

/** Pie or donut of the first series, with the slices listed beside it. */
function PieChart({ data, onSelect }: { data: ChartData; onSelect?: OnSelect }) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(ref);
  const [hover, setHover] = useState<number | null>(null);
  const key = data.series[0]?.key;
  const rows = data.rows.filter((r) => (r.values[key] ?? 0) > 0);
  const total = rows.reduce((s, r) => s + (r.values[key] ?? 0), 0);
  const side = width >= 360;
  const size = Math.max(Math.min(side ? width * 0.45 : width, side ? height : height * 0.6), 0);
  const r = size / 2 - 4;
  const inner = data.type === 'donut' ? r * 0.62 : 0;

  let angle = -Math.PI / 2;
  const arcs = rows.map((row) => {
    const v = row.values[key] ?? 0;
    const a0 = angle;
    angle += (v / (total || 1)) * Math.PI * 2;
    return { row, v, a0, a1: angle };
  });
  const pt = (a: number, rad: number) => [size / 2 + rad * Math.cos(a), size / 2 + rad * Math.sin(a)];
  const arc = (a0: number, a1: number) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
    const [x0, y0] = pt(a0, r);
    const [x1, y1] = pt(a1, r);
    if (!inner) return `M${size / 2},${size / 2}L${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}Z`;
    const [x2, y2] = pt(a1, inner);
    const [x3, y3] = pt(a0, inner);
    return `M${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${inner},${inner} 0 ${large} 0 ${x3},${y3}Z`;
  };
  const pct = (v: number) => `${Math.round((v / (total || 1)) * 100)}%`;

  return (
    <Frame chartRef={ref} label={describe(data)}>
      {size > 0 && (
        <div className={cx('flex h-full gap-4', side ? 'items-center' : 'flex-col items-center')}>
          <svg width={size} height={size} className="shrink-0" onPointerLeave={() => setHover(null)}>
            {arcs.map((a, i) => (
              <path
                key={i}
                d={arc(a.a0, a.a1)}
                fill={seriesColor(i)}
                stroke={SURFACE}
                strokeWidth={2}
                strokeLinejoin="round"
                opacity={hover === null || hover === i ? 1 : 0.55}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                className="outline-none"
                {...selectable(onSelect, a.row, data.bucket)}
              />
            ))}
            {inner > 0 && (
              <text x={size / 2} y={size / 2} textAnchor="middle" dy="0.32em" fontSize={Math.max(Math.min(inner / 3, 22), 12)} fontWeight={600} fill="var(--color-text-primary)">
                {formatValue(hover !== null ? arcs[hover]?.v : total, data.format, true)}
              </text>
            )}
          </svg>
          <ul className="min-w-0 flex-1 space-y-1.5 overflow-y-auto text-sm">
            {arcs.map((a, i) => (
              <li
                key={i}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                className={cx('flex items-center gap-2 rounded px-1', hover === i && 'bg-primary_hover')}
              >
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: seriesColor(i) }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-tertiary">{rowName(a.row, data.bucket)}</span>
                <span className="font-medium text-primary tabular-nums">{formatValue(a.v, data.format, true)}</span>
                <span className="w-10 text-right text-xs text-quaternary tabular-nums">{pct(a.v)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Frame>
  );
}

/** One big number, and how it moved against the period before when there is one. */
function KpiFigure({ data, onSelect }: { data: ChartData; onSelect?: OnSelect }) {
  const value = data.kpi?.value ?? null;
  const previous = data.kpi?.previous;
  const change = previous && value !== null ? ((value - previous) / Math.abs(previous)) * 100 : null;
  const up = (change ?? 0) >= 0;

  return (
    <div className="flex h-full flex-col justify-end">
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="self-start rounded-md text-left text-display-sm font-semibold text-primary underline-offset-4 outline-focus-ring hover:underline focus-visible:outline-2"
        >
          {formatValue(value, data.format)}
          <span className="sr-only">{t(": open the records")}</span>
        </button>
      ) : (
        <p className="text-display-sm font-semibold text-primary">{formatValue(value, data.format)}</p>
      )}
      {change !== null && (
        <p className={cx('mt-1 flex items-center gap-1 text-sm font-medium', up ? 'text-success-primary' : 'text-error-primary')}>
          {up ? <ArrowUp className="size-4" aria-hidden="true" /> : <ArrowDown className="size-4" aria-hidden="true" />}
          {t(up ? 'Up {percent}%' : 'Down {percent}%', { percent: Math.abs(change).toFixed(change % 1 && Math.abs(change) < 10 ? 1 : 0) })}
          <span className="font-normal text-tertiary">{t("vs. the period before")}</span>
        </p>
      )}
    </div>
  );
}

/** The data as a table: a chart type of its own, and every chart's accessible view. */
export function ChartTable({ data, onSelect }: { data: ChartData; onSelect?: OnSelect }) {
  if (data.type === 'kpi') return <KpiFigure data={data} onSelect={onSelect} />;
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-primary text-left text-xs font-medium text-tertiary">
          <tr className="border-b border-secondary">
            <th scope="col" className="py-2 pr-3 font-medium">
              {data.bucket ? t("Period") : columnName(data.group_by)}
            </th>
            {data.series.map((s) => (
              <th key={s.key} scope="col" className="py-2 pl-3 text-right font-medium">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary">
          {data.rows.map((r, i) => (
            <tr key={i}>
              <th scope="row" className="py-2 pr-3 text-left font-medium text-primary">
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(r)}
                    className="rounded text-left font-medium text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                  >
                    {rowName(r, data.bucket)}
                  </button>
                ) : (
                  rowName(r, data.bucket)
                )}
              </th>
              {data.series.map((s) => (
                <td key={s.key} className="py-2 pl-3 text-right text-tertiary tabular-nums">
                  {formatValue(r.values[s.key], data.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

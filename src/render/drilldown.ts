import { createContext, useContext } from 'react';
import type { Bucket } from '../lib/chartApi';
import { ymd } from './palette';

/**
 * A drilldown (json_config.drilldown on a grid, statement, chart or a grid column) opens
 * another meta with values from what was clicked. params maps the target's filter or
 * parameter names to a source: a field of the clicked row, or for charts x (the group),
 * x.from / x.to (a date group's first and last day) and range.from / range.to (the
 * dashboard's date range). A source starting with = is a fixed value ("=approved").
 */
export interface Drilldown {
  meta_id: number;
  params?: Record<string, string>;
  /** What the row button says, e.g. "Print order". */
  label?: string | null;
  /** Where the target opens: a modal in the middle (the default) or a drawer from the right. */
  open_in?: 'modal' | 'drawer';
}

/** What to open: the target meta, its parameter values, and what was clicked (for the breadcrumb). */
export interface DrillTarget {
  metaId: number;
  params: Record<string, string>;
  label: string;
  /** Opens in a drawer from the right instead of a modal. */
  drawer?: boolean;
}

export function drilldownOf(config: Record<string, unknown> | null | undefined): Drilldown | null {
  const d = config?.drilldown as Drilldown | undefined;
  return d && typeof d === 'object' && Number(d.meta_id) > 0 ? { ...d, meta_id: Number(d.meta_id) } : null;
}

/** The target's parameter values, read from the clicked thing's values. */
export function drillParams(d: Drilldown, values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, source] of Object.entries(d.params ?? {})) {
    if (!name || !source) continue;
    const value = source.startsWith('=') ? source.slice(1) : values[source];
    if (value !== null && value !== undefined && value !== '') out[name] = String(value);
  }
  return out;
}

const DrilldownContext = createContext<((target: DrillTarget) => void) | null>(null);

export const DrilldownContextProvider = DrilldownContext.Provider;

/** Opens a drilldown target, or null where nothing hosts drilldowns (e.g. the builder's previews). */
export function useDrilldown() {
  return useContext(DrilldownContext);
}

/** The first and last day of a chart group: a date, or a period key like 2026-10, 2026-W43, 2026-Q4, 2026. */
export function periodRange(x: string | null, bucket: Bucket | null): { from?: string; to?: string } {
  if (!x) return {};
  const iso = (d: Date) => ymd(d);
  const year = Number(x.slice(0, 4));
  if (bucket === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (bucket === 'month') {
    const m = Number(x.slice(5, 7));
    return { from: iso(new Date(year, m - 1, 1)), to: iso(new Date(year, m, 0)) };
  }
  if (bucket === 'quarter') {
    const q = Number(x.slice(-1));
    return { from: iso(new Date(year, (q - 1) * 3, 1)), to: iso(new Date(year, q * 3, 0)) };
  }
  if (bucket === 'week') {
    // ISO weeks: week 1 holds January 4th and starts on a Monday.
    const week = Number(x.split('W')[1]);
    const jan4 = new Date(year, 0, 4);
    const monday = new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
    return { from: iso(monday), to: iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
  }
  return { from: x.slice(0, 10), to: x.slice(0, 10) };
}

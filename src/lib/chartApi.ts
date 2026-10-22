import { api } from './api';

export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'kpi' | 'table';
export type Aggregate = 'count' | 'sum' | 'avg' | 'min' | 'max';
export type Bucket = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type FilterOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'empty' | 'not_empty';
export type ChartFormat = 'number' | 'money' | 'percent';

/** What a chart meta's json_config holds (backend: ChartQuery). */
export interface ChartConfig {
  type?: ChartType;
  /** The column to group by. */
  x?: string | null;
  /** Groups a date x by period. */
  bucket?: Bucket | null;
  measures?: { agg: Aggregate; column?: string | null; label?: string | null }[];
  /** A column whose values become the series. */
  split?: string | null;
  filters?: { column: string; op: FilterOp; value?: string | number | null }[];
  /** The date column a dashboard's date range applies to. */
  date_field?: string | null;
  sort?: 'value' | 'label' | null;
  limit?: number | null;
  /** x holds ids of this meta's table; show its label_field instead. */
  x_lookup?: { meta_id: number; label_field: string } | null;
  format?: ChartFormat;
  /** What clicking a mark opens (see render/drilldown). */
  drilldown?: { meta_id: number; params?: Record<string, string>; label?: string | null } | null;
}

export interface ChartRow {
  /** The group's value: a column value or a period key like 2026-10 or 2026-W43. null when empty. */
  x: string | null;
  label: string | null;
  values: Record<string, number | null>;
}

export interface ChartData {
  type: ChartType;
  format: ChartFormat;
  /** The column the rows are grouped by. */
  group_by: string | null;
  bucket: Bucket | null;
  series: { key: string; label: string }[];
  rows: ChartRow[];
  /** Some groups or series were left out (see limit). */
  truncated: boolean;
  kpi?: { value: number | null; previous: number | null };
}

export interface ChartColumn {
  name: string;
  kind: 'number' | 'date' | 'text' | 'boolean';
}

/** A dashboard's date range, both days included, as YYYY-MM-DD. */
export interface DateRange {
  from?: string;
  to?: string;
}

const range = (r: DateRange) => {
  const q = new URLSearchParams(Object.entries(r).filter(([, v]) => v) as [string, string][]).toString();
  return q ? `?${q}` : '';
};

/** Chart metas: their numbers, and for the builder previews and columns (backend: ChartController). */
export const chartApi = {
  data: (metaId: number, r: DateRange = {}) => api<ChartData>(`/metas/${metaId}/chart${range(r)}`),
  preview: (metaId: number, config: ChartConfig, r: DateRange = {}) =>
    api<ChartData>(`/metas/${metaId}/chart/preview`, { method: 'POST', body: JSON.stringify({ config, ...r }) }),
  columns: (metaId: number) => api<ChartColumn[]>(`/metas/${metaId}/columns`),
};

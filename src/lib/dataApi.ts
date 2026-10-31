import { api, downloadFile } from './api';

/** One record from a meta's table. Keys are the params' field_path values. */
export type DataRow = Record<string, unknown>;

export interface Page<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  /** Labels of required filters (is_mandatory_criteria) still empty; no rows until they're filled. */
  missing_filters?: string[];
  /** A grid's footer: each column's json_config.aggregate over every matching row, by field_path. */
  footer?: Record<string, unknown>;
}

export interface ListQuery {
  page?: number;
  per_page?: number;
  search?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  /** Calendars: only records overlapping [from, to), as YYYY-MM-DD. */
  from?: string;
  to?: string;
  /** Filter values by field_path; a query grid's :named parameters take theirs from here too. */
  filter?: Record<string, string>;
  /** Exact values that always hold, whether or not the field is a filter, e.g. a workspace's record (tender_id). */
  scope?: Record<string, string>;
  /** A tree grid (a param with is_parent): the records under this one; empty for the top level. Rows then carry _children. */
  parent?: string;
}

// Lookup lists are cached while an app runs; any write may change them, so writes clear the cache.
const writeListeners = new Set<() => void>();
export function onDataWrite(listener: () => void) {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}
const written = <T,>(result: T) => {
  writeListeners.forEach((l) => l());
  return result;
};

/** Plain values become ?k=v; objects become ?k[name]=v, the way Laravel reads arrays. */
function queryString(q: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v && typeof v === 'object') {
      for (const [name, value] of Object.entries(v)) if (value !== undefined && value !== '') params.set(`${k}[${name}]`, String(value));
    } else if (v !== undefined && (v !== '' || k === 'parent')) {
      // An empty parent still says something: the top level of a tree.
      params.set(k, String(v));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** One value of a filter field and how many records have it. */
export interface Facet {
  value: string | number | boolean | null;
  count: number;
}

/** A statement meta's rows, ordered by its groups, with totals over every matching row. */
export interface StatementResult {
  rows: DataRow[];
  /** Per param with json_config.aggregate: the total over all rows. */
  totals: Record<string, number | string | null>;
  group_by: string[];
  /** More rows matched than a statement shows; narrow the filters. */
  truncated: boolean;
  missing_filters: string[];
}

/** One problem in an imported file: its Excel row number and the column's heading. */
export interface ImportError {
  row: number;
  column: string | null;
  message: string;
}

/** What an Excel import did, or (dry_run) would do. Nothing is saved while errors remain. */
export interface ImportResult {
  mode: 'insert' | 'update' | 'upsert';
  dry_run: boolean;
  saved: boolean;
  /** Rows under the headings that have something in them. */
  total: number;
  inserted: number;
  updated: number;
  /** The first 200 problems; error_count counts them all. */
  errors: ImportError[];
  error_count: number;
  /** Each column the import takes, and where the file has it (a letter), or null. */
  columns: { heading: string; field: string; column: string | null }[];
  /** The first rows as they would be saved. */
  preview: DataRow[];
}

/** What running a stage query did, or (dry_run) would do: rows changed, in all and by statement. */
export interface StageRun {
  affected: number;
  statements: number[];
  dry_run: boolean;
}

/** Records behind a datagrid, form or calendar meta (backend: MetaDataController). */
/** Lines added, removed and changed in one detail (see RecordLog). */
export interface LineChanges {
  added?: DataRow[];
  removed?: DataRow[];
  changed?: ({ id: number | string } & RecordChanges)[];
}

/** What a save changed: fields as [old, new], and lines by detail field. */
export interface RecordChanges {
  fields?: Record<string, [unknown, unknown]>;
  lines?: Record<string, LineChanges>;
}

/** One logged save of a record. */
export interface RecordLogEntry {
  id: number;
  meta_id: number | null;
  meta_name: string | null;
  action: 'created' | 'updated' | 'deleted';
  changes: RecordChanges | null;
  snapshot: DataRow | null;
  source: 'form' | 'process_flow' | 'schedule' | 'import' | 'matrix';
  batch_id: string | null;
  created_at: string;
  user_id: number | null;
  user_name: string | null;
}

export const dataApi = {
  list: (metaId: number, q: ListQuery = {}) => api<Page<DataRow>>(`/metas/${metaId}/data${queryString({ ...q })}`),
  /** For a grid's sidebar: how many records have each value of these filter fields, under the other filters. */
  facets: (metaId: number, fields: string[], q: Pick<ListQuery, 'search' | 'filter' | 'scope'> = {}) =>
    api<Record<string, Facet[]>>(`/metas/${metaId}/facets?${[queryString({ ...q }).slice(1), ...fields.map((f) => `fields[]=${encodeURIComponent(f)}`)].filter(Boolean).join('&')}`),
  statement: (metaId: number, q: Pick<ListQuery, 'search' | 'filter' | 'scope'> = {}) => api<StatementResult>(`/metas/${metaId}/statement${queryString({ ...q })}`),
  get: (metaId: number, id: number | string) => api<DataRow>(`/metas/${metaId}/data/${id}`),
  /** A record's logged saves, newest first (metas with is_log). */
  log: (metaId: number, id: number | string, page = 1) => api<Page<RecordLogEntry>>(`/metas/${metaId}/data/${id}/log?page=${page}`),
  /** A get meta's first row for these named parameters: the values a form opens with. */
  fill: (getMetaId: number, params: Record<string, string>) => api<DataRow>(`/metas/${getMetaId}/fill${queryString({ params })}`),
  /** The numbers a new record would get now, by field (json_config.autonumber), without taking them. */
  autonumber: (formId: number, values: Record<string, string>) => api<Record<string, string>>(`/metas/${formId}/autonumber${queryString({ values })}`),
  create: async (metaId: number, values: DataRow) =>
    written(await api<DataRow>(`/metas/${metaId}/data`, { method: 'POST', body: JSON.stringify(values) })),
  update: async (metaId: number, id: number | string, values: DataRow) =>
    written(await api<DataRow>(`/metas/${metaId}/data/${id}`, { method: 'PUT', body: JSON.stringify(values) })),
  remove: async (metaId: number, id: number | string) =>
    written(await api<null>(`/metas/${metaId}/data/${id}`, { method: 'DELETE' })),
  /** The records a grid or statement shows, with these filters, as an .xlsx download. */
  exportExcel: (metaId: number, fileName: string, q: Pick<ListQuery, 'search' | 'filter' | 'scope' | 'sort' | 'dir'> = {}) =>
    downloadFile(`/metas/${metaId}/export${queryString({ ...q })}`, `${fileName}.xlsx`),
  /** Runs a stage query with these named parameters; a dry run changes nothing (backend: StageQueryController). */
  runStage: async (metaId: number, params: Record<string, string>, dryRun: boolean) => {
    const result = await api<StageRun>(`/metas/${metaId}/run`, { method: 'POST', body: JSON.stringify({ params, dry_run: dryRun }), notify: !dryRun });
    return dryRun ? result : written(result);
  },
  /** An excel_import meta's empty workbook, with its headings. */
  importTemplate: (importMetaId: number, fileName: string) => downloadFile(`/metas/${importMetaId}/import/template`, `${fileName}-template.xlsx`),
  /** Loads an .xlsx or .csv file through an excel_import meta; dryRun only checks it. */
  importExcel: async (importMetaId: number, file: File, dryRun: boolean) => {
    const body = new FormData();
    body.append('file', file);
    body.append('dry_run', dryRun ? '1' : '0');
    const result = await api<ImportResult>(`/metas/${importMetaId}/import`, { method: 'POST', body, notify: !dryRun });
    return result.saved ? written(result) : result;
  },
};

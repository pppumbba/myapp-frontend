import { api } from './api';

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
    } else if (v !== undefined && v !== '') {
      params.set(k, String(v));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Records behind a datagrid, form or calendar meta (backend: MetaDataController). */
export const dataApi = {
  list: (metaId: number, q: ListQuery = {}) => api<Page<DataRow>>(`/metas/${metaId}/data${queryString({ ...q })}`),
  get: (metaId: number, id: number | string) => api<DataRow>(`/metas/${metaId}/data/${id}`),
  /** A get meta's first row for these named parameters: the values a form opens with. */
  fill: (getMetaId: number, params: Record<string, string>) => api<DataRow>(`/metas/${getMetaId}/fill${queryString({ params })}`),
  create: async (metaId: number, values: DataRow) =>
    written(await api<DataRow>(`/metas/${metaId}/data`, { method: 'POST', body: JSON.stringify(values) })),
  update: async (metaId: number, id: number | string, values: DataRow) =>
    written(await api<DataRow>(`/metas/${metaId}/data/${id}`, { method: 'PUT', body: JSON.stringify(values) })),
  remove: async (metaId: number, id: number | string) =>
    written(await api<null>(`/metas/${metaId}/data/${id}`, { method: 'DELETE' })),
};

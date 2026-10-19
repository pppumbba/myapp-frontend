import { api } from './api';

/** One record from a meta's table. Keys are the params' field_path values. */
export type DataRow = Record<string, unknown>;

export interface Page<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface ListQuery {
  page?: number;
  per_page?: number;
  search?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
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

function queryString(q: ListQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Records behind a datagrid or form meta (backend: MetaDataController). */
export const dataApi = {
  list: (metaId: number, q: ListQuery = {}) => api<Page<DataRow>>(`/metas/${metaId}/data${queryString(q)}`),
  get: (metaId: number, id: number | string) => api<DataRow>(`/metas/${metaId}/data/${id}`),
  create: async (metaId: number, values: DataRow) =>
    written(await api<DataRow>(`/metas/${metaId}/data`, { method: 'POST', body: JSON.stringify(values) })),
  update: async (metaId: number, id: number | string, values: DataRow) =>
    written(await api<DataRow>(`/metas/${metaId}/data/${id}`, { method: 'PUT', body: JSON.stringify(values) })),
  remove: async (metaId: number, id: number | string) =>
    written(await api<null>(`/metas/${metaId}/data/${id}`, { method: 'DELETE' })),
};

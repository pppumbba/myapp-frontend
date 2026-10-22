import { api } from './api';

/** A saved version of a meta (backend: meta_versions; the snapshot itself stays on the server). */
export interface MetaVersion {
  id: number;
  meta_id: number;
  version_no: number;
  /** The meta's code and name when it was saved. */
  code: string;
  name: string;
  note: string | null;
  created_at: string;
  creator: { id: number; name: string } | null;
}

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface PartDiff {
  added: string[];
  removed: string[];
  changed: { label: string; fields: FieldChange[] }[];
}

/** What changed from one version to another, or to the meta as it is now. */
export interface VersionDiff {
  meta: FieldChange[];
  /** Only the parts that changed: params, actions, permissions, widgets, wfm_statuses, ... */
  parts: Record<string, PartDiff>;
}

export interface RestoreResult {
  /** The version the meta's changes were saved as before restoring, if it had any. */
  saved_first: number | null;
  /** What could not be put back as it was. */
  warnings: string[];
}

export const versionApi = {
  list: (metaId: number) => api<{ versions: MetaVersion[]; current_version: number | null; changed: boolean }>(`/metas/${metaId}/versions`),
  save: (metaId: number, note: string) => api<MetaVersion>(`/metas/${metaId}/versions`, { method: 'POST', body: JSON.stringify({ note: note || null }) }),
  diff: (versionId: number, against: number | 'current') => api<VersionDiff>(`/meta-versions/${versionId}/diff?against=${against}`),
  restore: (versionId: number) => api<RestoreResult>(`/meta-versions/${versionId}/restore`, { method: 'POST' }),
  deleted: () => api<MetaVersion[]>('/meta-versions/deleted'),
};

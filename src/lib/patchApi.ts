import { api, downloadFile } from './api';
import type { ImportExisting, ImportResult, Meta } from './metaApi';

/** A named set of metas made here to ship elsewhere. Released, its file stays as it was (backend: Patches). */
export interface Patch {
  id: number;
  code: string;
  name: string;
  description: string | null;
  with_used: boolean;
  status: 'draft' | 'released';
  hash: string | null;
  released_at: string | null;
  releaser: { id: number; name: string } | null;
  created_at: string;
  updated_at: string;
  metas: Meta[];
}

export type PatchInput = { code?: string; name?: string; description?: string | null; with_used?: boolean; meta_ids?: number[] };

/** A patch file installed here, with what it did to each meta. */
export interface PatchInstall {
  id: number;
  patch_code: string | null;
  patch_name: string;
  description: string | null;
  hash: string;
  source: string | null;
  released_at: string | null;
  existing: ImportExisting;
  result: ImportResult;
  installed_at: string;
  installer: { id: number; name: string } | null;
  rolled_back_at: string | null;
  rollbacker: { id: number; name: string } | null;
}

export type InstallResult = ImportResult & { install: PatchInstall | null; installed_before: { id: number; installed_at: string | null }[] };

export const patchApi = {
  list: () => api<Patch[]>('/patches'),
  create: (input: PatchInput) => api<Patch>('/patches', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: PatchInput) => api<Patch>(`/patches/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id: number) => api<null>(`/patches/${id}`, { method: 'DELETE' }),
  /** Writes the patch's file and freezes it. */
  release: (id: number) => api<Patch>(`/patches/${id}/release`, { method: 'POST' }),
  download: (patch: Patch) => downloadFile(`/patches/${patch.id}/download`, `${patch.code}.patch.json`),
  /** Metas changed since a time; without one, since the newest release. */
  changed: (since?: string) => api<Meta[]>(`/patches/changed${since ? `?since=${encodeURIComponent(since)}` : ''}`),

  installs: () => api<PatchInstall[]>('/patch-installs'),
  install: (pkg: unknown, existing: ImportExisting, dryRun: boolean, fileName: string) =>
    api<InstallResult>('/patch-installs', { method: 'POST', body: JSON.stringify({ package: pkg, existing, dry_run: dryRun, file_name: fileName }) }),
  rollback: (id: number) => api<{ install: PatchInstall; warnings: string[] }>(`/patch-installs/${id}/rollback`, { method: 'POST' }),
  downloadInstall: (install: PatchInstall) => downloadFile(`/patch-installs/${install.id}/download`, `${install.patch_code ?? `patch-${install.id}`}.patch.json`),
};

import { api } from './api';

/** One meta in a person's list, newest first; at is when it was starred, opened or shared. */
export interface LibraryEntry {
  meta_id: number;
  at: string;
  /** Shared with me only: who shared it. */
  by?: { id: number; name: string } | null;
}

export interface MetaLibrary {
  starred: LibraryEntry[];
  recent: LibraryEntry[];
  shared: LibraryEntry[];
}

export interface SharePerson {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  is_admin?: boolean;
}

export interface MetaShares {
  shared: (SharePerson & { shared_at: string; by: string | null })[];
  /** Admins and builders it can be shared with. */
  people: SharePerson[];
}

/** The Meta studio's Starred, Recent and Shared with me lists, and sharing a meta. */
export const libraryApi = {
  get: () => api<MetaLibrary>('/metas/library'),
  star: (metaId: number) => api<void>(`/metas/${metaId}/star`, { method: 'PUT', notify: false }),
  unstar: (metaId: number) => api<void>(`/metas/${metaId}/star`, { method: 'DELETE', notify: false }),
  /** The meta was opened, for Recent. */
  viewed: (metaId: number) => api<void>(`/metas/${metaId}/viewed`, { method: 'POST', notify: false }),
  shares: (metaId: number) => api<MetaShares>(`/metas/${metaId}/shares`),
  share: (metaId: number, userIds: number[]) => api<{ shared: number; added: number }>(`/metas/${metaId}/shares`, { method: 'PUT', body: JSON.stringify({ user_ids: userIds }) }),
};

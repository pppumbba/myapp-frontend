import { api } from './api';

/**
 * A custom session value (backend: session_values): path is worked out per user at login by
 * query, with param (e.g. userid) bound to it. Queries use it as :path, defaults as {path}.
 */
export interface SessionValue {
  id: number;
  path: string;
  query: string;
  param: string | null;
  /** Its value for the admin looking at it. */
  value?: unknown;
}

export type SessionValueInput = Pick<SessionValue, 'path' | 'query' | 'param'>;

/** The signed-in user's session values, path -> value. */
export type SessionValues = Record<string, unknown>;

export const sessionApi = {
  mine: () => api<SessionValues>('/user/session'),
  refresh: () => api<SessionValues>('/user/session/refresh', { method: 'POST' }),
  list: () => api<SessionValue[]>('/session-values'),
  create: (input: SessionValueInput) => api<SessionValue>('/session-values', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: SessionValueInput) => api<SessionValue>(`/session-values/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id: number) => api<null>(`/session-values/${id}`, { method: 'DELETE' }),
  test: (query: string, param: string | null) =>
    api<{ value: unknown; error: string | null }>('/session-values/test', { method: 'POST', body: JSON.stringify({ query, param }) }),
};

let current: SessionValues = {};
let currentUser: { id: number; name: string; email: string } | null = null;

/** Kept by AuthContext: the signed-in user and their session values. */
export function setSession(user: typeof currentUser, values: SessionValues) {
  currentUser = user;
  current = values;
}

/** A session value by path, ignoring case; undefined when there is none. */
export function sessionValue(path: string): unknown {
  if (path in current) return current[path];
  const key = Object.keys(current).find((k) => k.toLowerCase() === path.toLowerCase());
  return key === undefined ? undefined : current[key];
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Fills {placeholders} in a default or preset value: {today}, {user_id}, {user_name},
 * {user_email} and any session value, e.g. {sessionemployeeid}. Unknown ones stay as written.
 */
export function fillTokens(raw: unknown, user = currentUser): string {
  return String(raw ?? '').replace(/\{(\w+)\}/g, (whole, token: string) => {
    if (token === 'today') return ymd(new Date());
    if (token === 'user_id') return String(user?.id ?? '');
    if (token === 'user_name') return user?.name ?? '';
    if (token === 'user_email') return user?.email ?? '';
    const value = sessionValue(token);
    return value === undefined ? whole : value === null ? '' : String(value);
  });
}

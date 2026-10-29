import { currentLocale, setLocale, t } from '../i18n';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';
const TOKEN_KEY = 'auth_token';

/** A page of the backend itself (not its API), e.g. where Google sign-in starts. */
export const backendUrl = (path: string) => BASE_URL.replace(/\/api\/?$/, '') + path;

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  /** The whole answer, for errors that carry more than a message (e.g. the issues a publish was refused for). */
  body?: Record<string, unknown> | null;

  constructor(status: number, message: string, errors?: Record<string, string[]>, body?: Record<string, unknown> | null) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.body = body;
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    forgetReads();
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    forgetReads();
  },
};

/**
 * What a screen is built from (a meta, its params and actions, a page, themes, the user's access and
 * session values): kept once loaded, until anything is changed, someone signs in or out, or the
 * language changes. Records, charts and the rest are always asked for afresh.
 */
const SETUP = [
  /^\/metas\/\d+(\?translated=1)?$/,
  /^\/metas\/\d+\/(params|actions)(\?[^/]*)?$/,
  /^\/metas\/\d+\/page$/,
  /^\/workflows\/\d+(\?translated=1)?$/,
  /^\/(themes|meta-tree|user|user\/access|user\/session)$/,
];
const kept = new Map<string, Promise<unknown>>();
// Reads on their way: the same one asked for again meanwhile (e.g. by two widgets) waits for it.
const pending = new Map<string, Promise<unknown>>();
// Bumped by every change, so a read sent before it isn't kept afterwards.
let round = 0;

/** Forgets every kept read: after a change, signing in or out, or another language. */
export function forgetReads(): void {
  round++;
  kept.clear();
  pending.clear();
}

/** Single place that adds the token and turns errors into ApiError; reads are shared and setup kept (see SETUP). */
export function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if ((options.method ?? 'GET').toUpperCase() !== 'GET') {
    forgetReads();
    return send<T>(path, options).finally(forgetReads);
  }
  const key = `${tokenStore.get() ?? ''} ${currentLocale()} ${path}`;
  const known = kept.get(key) ?? pending.get(key);
  // Each caller gets its own copy: one changing what it got must not change it for the others.
  if (known) return known.then(copy) as Promise<T>;

  const at = round;
  const read = send<T>(path, options);
  pending.set(key, read);
  const keep = SETUP.some((re) => re.test(path));
  read.then(
    () => {
      if (pending.get(key) === read) pending.delete(key);
      if (keep && at === round) kept.set(key, read);
    },
    () => {
      if (pending.get(key) === read) pending.delete(key);
    },
  );
  return read.then(copy);
}

const copy = <T,>(data: T): T => (data === null || typeof data !== 'object' ? data : structuredClone(data));

async function send<T>(path: string, options: RequestInit): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  // FormData sets its own multipart Content-Type, with the boundary.
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  // The server says which language it picked (the user's, the browser's or the default).
  const language = res.headers.get('Content-Language');
  if (language && language !== currentLocale()) void setLocale(language);
  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, data?.message ?? t('Request failed.'), data?.errors, data);
  }
  return data as T;
}

/** Downloads a file the API sends (e.g. an Excel export) under the name it gives. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const headers = new Headers({ Accept: 'application/json' });
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.message ?? t('The file could not be downloaded.'), data?.errors);
  }

  // filename* carries the UTF-8 name (e.g. Cyrillic); plain filename only an ASCII stand-in.
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const name = (encoded && decodeURIComponent(encoded)) || /filename="?([^";]+)"?/.exec(disposition)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

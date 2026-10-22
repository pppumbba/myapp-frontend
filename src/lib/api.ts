const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';
const TOKEN_KEY = 'auth_token';

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Single place that adds the token and turns errors into ApiError. */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  // FormData sets its own multipart Content-Type, with the boundary.
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, data?.message ?? 'Request failed.', data?.errors);
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
    throw new ApiError(res.status, data?.message ?? 'The file could not be downloaded.', data?.errors);
  }

  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

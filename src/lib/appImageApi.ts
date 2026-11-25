import { api } from './api';
import type { Meta } from './metaApi';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

/** Which of an app's pictures: its icon (image_path) or its card cover (cover_path). */
export type AppImageKind = 'icon' | 'cover';

/** Where an app's pictures are kept, as paths under the server's storage (app-images/{file}). */
export type AppImagePaths = Pick<Meta, 'image_path' | 'cover_path'>;

/**
 * Where one of an app's pictures loads from, served by file name (no token needed as the name is
 * random); null: show the Wand mark.
 */
export const appImageUrl = (app: Partial<AppImagePaths>, kind: AppImageKind = 'icon'): string | null => {
  const file = (kind === 'icon' ? app.image_path : app.cover_path)?.split('/').pop();
  return file ? `${BASE_URL}/app-images/${file}` : null;
};

export const appImageApi = {
  /** A PNG, JPG or WebP up to 5 MB as the app's icon or cover; answers where both are kept. */
  upload: (appId: number, file: File, kind: AppImageKind) => {
    const form = new FormData();
    form.append('image', file);
    form.append('kind', kind);
    return api<AppImagePaths>(`/metas/${appId}/app-image`, { method: 'POST', body: form });
  },
  /** That picture back to the Wand mark. */
  remove: (appId: number, kind: AppImageKind) => api<AppImagePaths>(`/metas/${appId}/app-image?kind=${kind}`, { method: 'DELETE' }),
};

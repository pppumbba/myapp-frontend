import { ApiError, downloadFile, tokenStore } from './api';
import { t } from '@/i18n';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

/** An attached file, as forms and grids get it (see App\Support\Contents). */
export interface FileInfo {
  id: number;
  file_name: string;
  file_extension: string | null;
  file_size: number;
  description: string | null;
  is_public: boolean;
  type_id: number | null;
}

export const FILE_TYPES = ['singlefile', 'multifile'];
export const isFileParam = (p: { data_type: string }) => FILE_TYPES.includes(p.data_type);

/** Files a browser shows itself; the rest download. */
const VIEWABLE = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt'];

export function fileSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export const contentApi = {
  /** Uploads one file into a form's file field, reporting progress from 0 to 1. */
  upload: (metaId: number, paramId: number, file: File, onProgress?: (share: number) => void) =>
    new Promise<FileInfo>((resolve, reject) => {
      const body = new FormData();
      body.append('param_id', String(paramId));
      body.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/metas/${metaId}/files`);
      xhr.setRequestHeader('Accept', 'application/json');
      const token = tokenStore.get();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        let data: { message?: string; errors?: Record<string, string[]> } | FileInfo | null = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // Not JSON: the status says enough.
        }
        if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data as FileInfo);
        else {
          const err = data as { message?: string; errors?: Record<string, string[]> } | null;
          reject(new ApiError(xhr.status, err?.errors?.file?.[0] ?? err?.message ?? t('The file could not be uploaded.'), err?.errors));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, t('The file could not be uploaded. Check the connection.')));
      xhr.send(body);
    }),

  /** Opens a PDF or picture in a new tab; other files download. */
  open: async (file: FileInfo) => {
    if (!VIEWABLE.includes(file.file_extension ?? '')) return contentApi.download(file);
    // Opened first, so the browser treats it as the click's own window and doesn't block it.
    const tab = window.open('', '_blank');
    const token = tokenStore.get();
    const res = await fetch(`${BASE_URL}/contents/${file.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      tab?.close();
      throw new ApiError(res.status, res.status === 404 ? t('This file is not there, or not yours to open.') : t('The file could not be opened.'));
    }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  download: (file: FileInfo) => downloadFile(`/contents/${file.id}?download=1`, file.file_name),
};

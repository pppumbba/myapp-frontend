import { api, ApiError, downloadFile, tokenStore } from './api';
import { t } from '@/i18n';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

export type ElementType = 'text' | 'field' | 'image' | 'line' | 'box' | 'signature' | 'page';
export type Align = 'left' | 'center' | 'right';
export type ValueFormat = 'text' | 'number' | 'integer' | 'money' | 'date' | 'datetime' | 'words';

export interface ElementStyle {
  font_size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: Align;
  color: string;
  bg: string;
  border: number;
  border_color: string;
  padding: number;
}

/** A thing placed on a band, in millimetres from the band's top left. */
export interface DocElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text (with {placeholders}), a signature's name line, or a page number's wording. */
  text: string;
  field: string;
  /** A field's caption before its value, or who signs. */
  label: string;
  format: ValueFormat;
  /** An uploaded image's file name. */
  src: string;
  style: ElementStyle;
}

export interface Band {
  height: number;
  elements: DocElement[];
  /** A picture behind the band (an imported PDF page, a letterhead); printed only with print. */
  background?: { src: string; print: boolean } | null;
}

export interface TableColumn {
  id: string;
  field: string;
  label: string;
  width: number;
  align: Align;
  format: ValueFormat;
  total: boolean;
}

export type Section =
  | ({ id: string; kind: 'free' } & Band)
  | { id: string; kind: 'table'; detail: string; numbered: boolean; border: boolean; font_size: number; header_bg: string; totals_label: string; columns: TableColumn[] }
  | { id: string; kind: 'text'; text: string; font_size: number; align: Align | 'justify'; space_before: number };

export interface PageSettings {
  size: 'A4' | 'A5' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  margin: { top: number; right: number; bottom: number; left: number };
  font: 'sans' | 'serif' | 'mono';
  font_size: number;
  date_format: string;
  decimals: number;
  thousands: string;
  decimal_point: string;
  currency: string;
  words_language: 'mn' | 'en';
  currency_word: string;
  subunit_word: string;
}

export interface Layout {
  page: PageSettings;
  header: Band;
  footer: Band;
  sections: Section[];
}

/** What each part of a layout shows: text, a signature's [who signs, name], a table's rows and totals. */
export type Shown = Record<string, string | [string, string] | { rows: string[][]; totals: (string | null)[] | null }>;

export interface FilledDocument {
  report_meta_id: number;
  layout: Layout;
  shown: Shown;
}

export const PAPER: Record<PageSettings['size'], [number, number]> = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };

/** A PDF from the API as a blob URL; the caller revokes it. */
async function pdf(path: string, init: RequestInit = {}): Promise<string> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/pdf, application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.message ?? t('The PDF could not be made.'), data?.errors);
  }
  return URL.createObjectURL(await res.blob());
}

export const documentApi = {
  layout: (metaId: number) => api<{ layout: Layout; saved: boolean }>(`/metas/${metaId}/layout`),
  save: (metaId: number, layout: Layout, extra: { title?: string | null; number_field?: string | null } = {}) =>
    api<{ layout: Layout; saved: boolean }>(`/metas/${metaId}/layout`, { method: 'PUT', body: JSON.stringify({ layout, ...extra }) }),
  /** A layout not yet saved, of a record or (without one) of sample values. */
  preview: (metaId: number, layout: Layout, recordId?: string | null) =>
    pdf(`/metas/${metaId}/layout/preview`, { method: 'POST', body: JSON.stringify({ layout, record_id: recordId || null }) }),
  record: (metaId: number, recordId: string) => pdf(`/metas/${metaId}/data/${encodeURIComponent(recordId)}/pdf`),
  /** Saves the record's PDF under the name the server gives it. */
  download: (metaId: number, recordId: string) => downloadFile(`/metas/${metaId}/data/${encodeURIComponent(recordId)}/pdf?download=1`, 'document.pdf'),
  /**
   * A form's document field filled with the form's values as they are (saved or not): its
   * report's layout and what each part of it shows (by element or section id).
   */
  fill: (formMetaId: number, paramId: number, values: Record<string, unknown>, recordId?: string | null) =>
    api<FilledDocument>(`/metas/${formMetaId}/documents/${paramId}`, { method: 'POST', body: JSON.stringify({ values, record_id: recordId || null }) }),
  many: (metaId: number, ids: string[]) => pdf(`/metas/${metaId}/pdf?ids=${ids.map(encodeURIComponent).join(',')}`),
  upload: (metaId: number, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return api<{ src: string }>(`/metas/${metaId}/document-assets`, { method: 'POST', body });
  },
  /** An uploaded image as a blob URL, for the designer to show (it needs the token). */
  asset: async (metaId: number, src: string) => {
    const token = tokenStore.get();
    const res = await fetch(`${BASE_URL}/metas/${metaId}/document-assets/${src}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, t('The image could not be loaded.'));
    return URL.createObjectURL(await res.blob());
  },
};

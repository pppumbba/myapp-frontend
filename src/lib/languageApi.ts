import { api, downloadFile } from './api';

/** A language the app speaks. Labels are written in the source; users who pick none get the default. */
export interface Language {
  id: number;
  code: string;
  name: string;
  is_source: boolean;
  is_default: boolean;
  is_active: boolean;
  order_number: number;
}

/** One text of a meta that can be translated, with its translations by language code. */
export interface TranslatableText {
  key: string;
  table: string;
  row_id: number;
  field: string;
  /** What it is, e.g. "Field qty" or "Button add". */
  where: string;
  original: string;
  values: Record<string, string>;
}

export interface MetaTranslations {
  source: string;
  /** The languages to translate into: every active one but the source. */
  languages: Language[];
  texts: TranslatableText[];
}

export interface TranslationEntry {
  key: string;
  locale: string;
  value: string;
}

export const languageApi = {
  /** current: the language the API answers in for this user. */
  list: () => api<{ languages: Language[]; current: string }>('/languages'),
  create: (code: string, name: string) => api<Language>('/languages', { method: 'POST', body: JSON.stringify({ code, name }) }),
  update: (id: number, input: Partial<Pick<Language, 'name' | 'is_active'>> & { is_source?: true; is_default?: true }) =>
    api<Language>(`/languages/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id: number) => api<null>(`/languages/${id}`, { method: 'DELETE' }),
  /** The user's own: null follows the browser. */
  mine: (locale: string | null) => api<{ locale: string | null }>('/user/locale', { method: 'PUT', body: JSON.stringify({ locale }) }),

  translations: (metaId: number) => api<MetaTranslations>(`/metas/${metaId}/translations`),
  saveTranslations: (metaId: number, entries: TranslationEntry[]) =>
    api<{ saved: number; removed: number; texts: TranslatableText[] }>(`/metas/${metaId}/translations`, { method: 'PUT', body: JSON.stringify({ entries }) }),
  exportTranslations: (metaId: number, code: string) => downloadFile(`/metas/${metaId}/translations/export`, `${code}-translations.xlsx`),
  importTranslations: (metaId: number, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return api<{ saved: number; removed: number; skipped: number; texts: TranslatableText[] }>(`/metas/${metaId}/translations/import`, { method: 'POST', body });
  },
};

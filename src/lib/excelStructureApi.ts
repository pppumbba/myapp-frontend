import { api } from './api';
import type { Meta } from './metaApi';

export type Cell = string | number | boolean | null;

/** An uploaded spreadsheet's sheet as the builder shows it: its first rows, and its size. */
export interface SheetPreview {
  token: string;
  sheets: string[];
  sheet: string;
  rows: Cell[][];
  /** All its rows; only the first ones are in rows. */
  total: number;
  width: number;
}

/** A column the rows left would make: index is its column in the sheet (0 = A). */
export interface StructureColumn {
  index: number;
  column: string;
  label: string;
  data_type: string;
}

export interface StructureChoice {
  sheet: string;
  skip_rows: number[];
  skip_columns: number[];
}

export const STRUCTURE_TYPES = ['string', 'text', 'integer', 'decimal', 'date', 'datetime', 'boolean'] as const;

/** Tables and datagrids made from spreadsheets (backend: ExcelStructureController). */
export const excelStructureApi = {
  upload: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return api<SheetPreview>('/excel-structure', { method: 'POST', body });
  },
  sheet: (token: string, sheet: string) => api<SheetPreview>(`/excel-structure/${token}?sheet=${encodeURIComponent(sheet)}`),
  columns: (token: string, choice: StructureChoice) => api<StructureColumn[]>(`/excel-structure/${token}/columns`, { method: 'POST', body: JSON.stringify(choice) }),
  create: (token: string, input: StructureChoice & { name: string; code?: string; table?: string; types: Record<number, string>; labels: Record<number, string> }) =>
    api<Meta>(`/excel-structure/${token}/create`, { method: 'POST', body: JSON.stringify(input) }),
};

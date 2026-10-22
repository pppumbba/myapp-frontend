import { api } from './api';

/** How a matrix's columns add up (backend: MatrixController). */
export type MatrixTotal = 'sum' | 'avg' | 'weighted' | 'amount';

/** A matrix meta's values: one for each row × column pair, keyed "rowId:columnId". */
export interface Matrix {
  rows: { id: number; label: string; weight?: number }[];
  columns: { id: number; label: string }[];
  cells: Record<string, number | string | null>;
  type: 'decimal' | 'integer' | 'string';
  /** Which value is best in each row. */
  best: 'min' | 'max' | null;
  total: MatrixTotal | null;
  /** Whether rows carry a weight (json_config.weight). */
  weighted: boolean;
}

export interface MatrixCellInput {
  row: number;
  column: number;
  value: number | string | null;
}

/** A matrix's json_config, as the builder edits it. */
export interface MatrixConfig {
  rows?: { meta_id?: number; label?: string };
  columns?: { meta_id?: number; label?: string };
  cell?: { row?: string; column?: string; value?: string; type?: Matrix['type'] };
  best?: Matrix['best'];
  weight?: string | null;
  total?: MatrixTotal | null;
}

export const matrixApi = {
  get: (metaId: number, scope: Record<string, string> = {}) =>
    api<Matrix>(`/metas/${metaId}/matrix?${new URLSearchParams(Object.entries(scope).map(([k, v]) => [`scope[${k}]`, v]))}`),
  save: (metaId: number, scope: Record<string, string>, cells: MatrixCellInput[]) =>
    api<Matrix>(`/metas/${metaId}/matrix`, { method: 'PUT', body: JSON.stringify({ scope, cells }) }),
};

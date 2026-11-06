import { api } from './api';

/** One line of what applying does: create/add/change a column, or keep one whose param is gone. */
export interface StructureChange {
  kind: 'create' | 'add' | 'change' | 'keep';
  column: string;
  label: string;
  detail: string;
}

/** What "Apply to database" would do now (backend: Structure::plan). */
export interface StructurePlan {
  table: string;
  /** No table made yet: applying creates it. */
  creating: boolean;
  applied_at: string | null;
  changes: StructureChange[];
  /** Reasons applying would stop; nothing is applied while there are any. */
  problems: string[];
}

export interface StructureApplied {
  changes: StructureChange[];
  grid_id: number | null;
  form_id: number | null;
  plan: StructurePlan;
}

export const structureApi = {
  plan: (metaId: number) => api<StructurePlan>(`/metas/${metaId}/structure`),
  apply: (metaId: number, makeScreens: boolean) =>
    api<StructureApplied>(`/metas/${metaId}/structure/apply`, { method: 'POST', body: JSON.stringify({ make_screens: makeScreens }) }),
};

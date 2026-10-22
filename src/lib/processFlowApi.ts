import { api } from './api';

/** One value a step's form takes (backend: meta_process_behaviour). */
export interface ProcessBehaviour {
  /** A field of the record just saved, "main.field" of the main form's record, or "=text". */
  source_path: string;
  target_path: string;
}

export type ConditionOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'empty' | 'not_empty';

export interface ProcessCondition {
  field: string;
  op: ConditionOp;
  value: string;
}

/** A step as saved (backend: meta_process_workflow). */
export interface ProcessStep {
  id: number;
  process_id: number;
  order_number: number;
  process: { id: number; code: string; name: string } | null;
  behaviours: ProcessBehaviour[];
}

/** Runs target after source (null: the main form) when criteria hold (backend: meta_process_transition). */
export interface ProcessTransition {
  id: number;
  source_id: number | null;
  target_id: number;
  criteria: ProcessCondition[] | null;
}

export interface ProcessFlow {
  steps: ProcessStep[];
  transitions: ProcessTransition[];
}

/** What the builder saves: keys tie transitions to steps within one save. */
export interface ProcessFlowInput {
  steps: { key: string; process_id: number; behaviours: ProcessBehaviour[] }[];
  transitions: { source: string | null; target: string; criteria: ProcessCondition[] }[];
}

/** A step a new record ran, as the save's response lists it under _processes. */
export interface ProcessRun {
  step_id: number;
  process_id: number;
  process: string;
  id: number | null;
}

export const processFlowApi = {
  get: (formId: number) => api<ProcessFlow>(`/metas/${formId}/process-flow`),
  save: (formId: number, input: ProcessFlowInput) => api<ProcessFlow>(`/metas/${formId}/process-flow`, { method: 'PUT', body: JSON.stringify(input) }),
};

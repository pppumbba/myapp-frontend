import { api } from './api';

/** One value a step takes (backend: meta_process_behaviour). */
export interface ProcessBehaviour {
  /**
   * "=text", "main.field" of the main form's record, "stepN.field" of what step N passed on
   * (sent as "step:key.field" when saving), or a bare field of the record that led here.
   */
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
  pos_x: number | null;
  pos_y: number | null;
  process: { id: number; code: string; name: string; type: { code: string } | null } | null;
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
  /** Where the main form's node sits on the canvas. */
  main_at: { x: number; y: number } | null;
  steps: ProcessStep[];
  transitions: ProcessTransition[];
}

/** What the builder saves: keys tie transitions and values to steps within one save. */
export interface ProcessFlowInput {
  main_at: { x: number; y: number } | null;
  steps: { key: string; process_id: number; x: number; y: number; behaviours: ProcessBehaviour[] }[];
  transitions: { source: string | null; target: string; criteria: ProcessCondition[] }[];
}

/** A step a new record ran, as the save's response lists it under _processes. */
export interface ProcessRun {
  step_id: number;
  process_id: number;
  process: string;
  id: number | null;
}

/** A value a node takes in or passes on. */
export interface ProcessPort {
  field: string;
  label: string;
}

/** What each meta takes in (inputs) and passes on once it has run (outputs), by meta id. */
export type ProcessPorts = Record<string, { inputs: ProcessPort[]; outputs: ProcessPort[] }>;

export const processFlowApi = {
  get: (formId: number) => api<ProcessFlow>(`/metas/${formId}/process-flow`),
  ports: (formId: number, ids: number[]) => api<ProcessPorts>(`/metas/${formId}/process-flow/ports?ids=${ids.join(',')}`),
  save: (formId: number, input: ProcessFlowInput) => api<ProcessFlow>(`/metas/${formId}/process-flow`, { method: 'PUT', body: JSON.stringify(input) }),
};

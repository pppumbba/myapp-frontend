import { api } from './api';

/** One status of a workflow. meta_id is the form opened for a record moving into it. */
export interface WfmStatus {
  id: number;
  code: string;
  name: string;
  label_name: string | null;
  /** A palette name: gray, blue, red, purple, amber, green. */
  color: string | null;
  meta_id: number | null;
  workflow_meta_id: number;
}

/**
 * A move between statuses (from none when prev_status_id is null). criteria is an
 * expression like "totalAmount > 100000"; is_transition false only draws it.
 */
export interface WfmTransition {
  id: number;
  prev_status_id: number | null;
  next_status_id: number;
  criteria: string | null;
  prev_id: number | null;
  next_id: number | null;
  source_id: number | null;
  is_transition: boolean;
  workflow_meta_id: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Where the designer's boxes sit; kept in the workflow meta's json_config.layout. */
export interface WorkflowLayout {
  start?: Point;
  statuses?: Record<string, Point>;
}

export interface WorkflowDef {
  statuses: WfmStatus[];
  transitions: WfmTransition[];
  layout: WorkflowLayout;
}

export interface StatusLog {
  id: number;
  status_id: number;
  prev_status_id: number | null;
  created_at: string;
  /** Seconds spent in the previous status. */
  time_spent: number | null;
  user: { id: number; name: string } | null;
}

/** A record's status, the moves out of it (allowed or not, and why), and its history. */
export interface RecordState {
  status: WfmStatus | null;
  transitions: { id: number; criteria: string | null; next_status: WfmStatus; allowed: boolean; reason: string | null }[];
  log: StatusLog[];
}

export type StatusInput = Partial<Pick<WfmStatus, 'code' | 'name' | 'label_name' | 'color' | 'meta_id'>>;
export type TransitionInput = Partial<Omit<WfmTransition, 'id' | 'workflow_meta_id'>>;

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

/** Workflows (backend: WorkflowController). */
export const workflowApi = {
  get: (workflowId: number) => api<WorkflowDef>(`/workflows/${workflowId}`),
  saveLayout: (workflowId: number, layout: WorkflowLayout) => api<{ layout: WorkflowLayout }>(`/workflows/${workflowId}/layout`, json('PUT', { layout })),

  createStatus: (workflowId: number, input: StatusInput) => api<WfmStatus>(`/workflows/${workflowId}/statuses`, json('POST', input)),
  updateStatus: (id: number, input: StatusInput) => api<WfmStatus>(`/wfm-statuses/${id}`, json('PUT', input)),
  removeStatus: (id: number) => api<null>(`/wfm-statuses/${id}`, { method: 'DELETE' }),

  createTransition: (workflowId: number, input: TransitionInput) => api<WfmTransition>(`/workflows/${workflowId}/transitions`, json('POST', input)),
  updateTransition: (id: number, input: TransitionInput) => api<WfmTransition>(`/wfm-transitions/${id}`, json('PUT', input)),
  removeTransition: (id: number) => api<null>(`/wfm-transitions/${id}`, { method: 'DELETE' }),

  record: (workflowId: number, recordId: string, sourceId?: number) =>
    api<RecordState>(`/workflows/${workflowId}/records/${recordId}${sourceId ? `?source=${sourceId}` : ''}`),
  move: (workflowId: number, recordId: string, transitionId: number, sourceId?: number) =>
    api<RecordState>(`/workflows/${workflowId}/records/${recordId}/move`, json('POST', { transition_id: transitionId, source_id: sourceId ?? null })),
};

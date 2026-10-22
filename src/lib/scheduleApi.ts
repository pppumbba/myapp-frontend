import { api } from './api';

/** A form a schedule runs (backend: meta_schedules): the form once per row of the grid. */
export interface ScheduledForm {
  id: number;
  schedule_id: number;
  process_id: number;
  view_id: number;
  process: { id: number; code: string; name: string } | null;
  view: { id: number; code: string; name: string } | null;
}

/** When forms run by themselves. code is a keyword (daily, ...) or a cron expression. */
export interface Schedule {
  id: number;
  code: string;
  name: string;
  /** The cron expression code stands for. */
  expression: string | null;
  next_run_at: string | null;
  forms: ScheduledForm[];
}

/** What running one scheduled form did. */
export interface ScheduleRun {
  process: string;
  view: string;
  created: number;
  /** A stage query's: rows its runs changed; null for a form. */
  affected: number | null;
  failed: { row: number | string | null; message: string }[];
  /** Why nothing ran at all, e.g. the grid needs a filter. */
  message: string | null;
}

/** Keywords a schedule's code may be (backend: Schedule::KEYWORDS). */
export const SCHEDULE_KEYWORDS: Record<string, string> = {
  every_minute: 'Every minute',
  every_five_minutes: 'Every 5 minutes',
  hourly: 'Every hour, on the hour',
  daily: 'Every day at midnight',
  weekly: 'Mondays at midnight',
  monthly: 'The 1st of each month at midnight',
  yearly: 'January 1st at midnight',
};

export const scheduleApi = {
  list: () => api<Schedule[]>('/schedules'),
  create: (input: { code: string; name: string }) => api<Schedule>('/schedules', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: { code: string; name: string }) => api<Schedule>(`/schedules/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id: number) => api<null>(`/schedules/${id}`, { method: 'DELETE' }),

  addForm: (scheduleId: number, input: { process_id: number; view_id: number }) =>
    api<ScheduledForm>(`/schedules/${scheduleId}/forms`, { method: 'POST', body: JSON.stringify(input) }),
  removeForm: (id: number) => api<null>(`/meta-schedules/${id}`, { method: 'DELETE' }),
  run: (scheduleId: number) => api<{ results: ScheduleRun[] }>(`/schedules/${scheduleId}/run`, { method: 'POST' }),
};

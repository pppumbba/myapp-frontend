// Toasts and the error dialog, as a small store outside React: the API client calls it on every
// save and failure (see api.ts), screens can call toast()/showError() themselves, and <Notices>
// draws whatever is in it.

export type ToastKind = 'success' | 'info' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** How many times the same message came in while it was showing. */
  count: number;
}

export interface ErrorNotice {
  title: string;
  message: string;
  /** Session ended: the dialog offers to sign in again instead of just closing. */
  session?: boolean;
  count: number;
}

interface State {
  toasts: Toast[];
  error: ErrorNotice | null;
}

let state: State = { toasts: [], error: null };
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 0;

/** Messages the dialog showed lately, so the screen's own red box doesn't say it a second time (see Alert). */
const shown = new Map<string, number>();
const SHOWN_FOR = 30_000;
const TOAST_FOR = 3500;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export const notices = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => state,
};

/** Shows a short message at the corner; the same message again while it shows just restarts its clock. */
export function toast(message: string, kind: ToastKind = 'success'): void {
  const same = state.toasts.find((x) => x.message === message && x.kind === kind);
  const id = same?.id ?? ++nextId;
  if (same) {
    set({ toasts: state.toasts.map((x) => (x.id === id ? { ...x, count: x.count + 1 } : x)) });
  } else {
    // At most three at once; the oldest goes first.
    set({ toasts: [...state.toasts.slice(-2), { id, kind, message, count: 1 }] });
  }
  holdToast(id);
}

/** (Re)starts a toast's clock; pausing it (pointer over the toasts) clears it. */
export function holdToast(id: number, ms = TOAST_FOR): void {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => dismissToast(id), ms));
}

export function pauseToasts(): void {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
}

export function resumeToasts(): void {
  state.toasts.forEach((x) => holdToast(x.id));
}

export function dismissToast(id: number): void {
  clearTimeout(timers.get(id));
  timers.delete(id);
  set({ toasts: state.toasts.filter((x) => x.id !== id) });
}

/** Opens the error dialog; the same message while it's open only counts up. */
export function showError(message: string, options: { title?: string; session?: boolean } = {}): void {
  shown.set(message, Date.now());
  const open = state.error;
  if (open && open.message === message) {
    set({ error: { ...open, count: open.count + 1 } });
    return;
  }
  if (open?.session) return;
  set({ error: { title: options.title ?? 'Something went wrong', message, session: options.session, count: 1 } });
}

export function closeError(): void {
  set({ error: null });
}

/** Whether the dialog said this lately: a screen's inline box with the same words stays hidden. */
export function wasShown(message: string): boolean {
  const at = shown.get(message);
  return at !== undefined && Date.now() - at < SHOWN_FOR;
}

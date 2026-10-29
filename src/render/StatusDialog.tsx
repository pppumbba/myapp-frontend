import { useEffect, useState } from 'react';
import { ArrowRight, Lock01 } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { workflowApi, type RecordState, type WfmStatus } from '../lib/workflowApi';
import { Alert } from '../components/ui';
import { Modal } from '../components/Modal';
import { Button } from '@/components/base/buttons/button';
import { FormView } from './FormView';
import { palette } from './palette';
import { t } from '@/i18n';

/** A status as a coloured pill; "No status" for a record that hasn't started. */
export function StatusBadge({ status }: { status?: WfmStatus | null }) {
  const swatch = palette[(status?.color ?? 'gray') as keyof typeof palette] ?? palette.gray;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${status ? swatch.chip : palette.gray.chip}`}>
      <span className={`size-1.5 rounded-full ${status ? swatch.dot : 'bg-utility-neutral-400'}`} aria-hidden="true" />
      {status ? status.label_name || status.name : t("No status")}
    </span>
  );
}

/** 93784 -> "1d 2h", 2700 -> "45m". */
function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d${h ? ` ${h}h` : ''}`;
  if (h) return `${h}h${m ? ` ${m}m` : ''}`;
  return m ? `${m}m` : `${seconds}s`;
}

/**
 * "Change status" for one record: where it is, where it can go (moves whose criteria don't
 * hold are shown greyed with the reason), and its history. A status with a form opens it
 * first; saving the form completes the move.
 */
export function StatusDialog({
  workflowId,
  statuses,
  recordId,
  recordName,
  sourceId,
  onClose,
  onMoved,
}: {
  workflowId: number;
  statuses: WfmStatus[];
  recordId: string;
  recordName: string;
  sourceId: number;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [state, setState] = useState<RecordState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  // A move waiting for its status's form to be saved.
  const [pending, setPending] = useState<{ transitionId: number; status: WfmStatus } | null>(null);
  const byId = new Map(statuses.map((s) => [s.id, s]));

  useEffect(() => {
    let live = true;
    workflowApi.record(workflowId, recordId, sourceId).then(
      (s) => live && setState(s),
      (err) => live && setError(err instanceof ApiError ? err.message : t("The record’s status could not be loaded.")),
    );
    return () => {
      live = false;
    };
  }, [workflowId, recordId, sourceId]);

  async function move(transitionId: number) {
    setBusy(transitionId);
    setError(null);
    try {
      await workflowApi.move(workflowId, recordId, transitionId, sourceId);
      onMoved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("The status could not be changed."));
      setPending(null);
    } finally {
      setBusy(null);
    }
  }

  function choose(item: RecordState['transitions'][number]) {
    if (item.next_status.meta_id) setPending({ transitionId: item.id, status: item.next_status });
    else move(item.id);
  }

  const title = recordName ? `Change status · ${recordName}` : t("Change status");

  if (pending?.status.meta_id) {
    return (
      <Modal title={`${pending.status.name} · ${recordName || 'record'}`} description={t("Fill this in to finish the move.")} onClose={() => setPending(null)} size="lg">
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <FormView metaId={pending.status.meta_id} recordId={recordId} embedded onCancel={() => setPending(null)} onSaved={() => move(pending.transitionId)} />
      </Modal>
    );
  }

  return (
    <Modal title={title} onClose={onClose} size="md">
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!state ? (
        !error && <div className="h-40 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-tertiary">
            {t("Now")} <StatusBadge status={state.status} />
          </div>

          <section aria-label={t("Move to")}>
            <h3 className="mb-2 text-sm font-semibold text-primary">{t("Move to")}</h3>
            {state.transitions.length ? (
              <ul className="space-y-1.5">
                {state.transitions.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={!item.allowed || busy !== null}
                      onClick={() => choose(item)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ring-1 ring-secondary outline-focus-ring ring-inset enabled:hover:bg-primary_hover focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <StatusBadge status={item.next_status} />
                      <span className="min-w-0 flex-1 truncate text-xs text-tertiary">
                        {item.allowed ? (item.next_status.meta_id ? t("Asks for a few details first") : item.criteria ? t('When {criteria}', { criteria: item.criteria }) : '') : item.reason}
                      </span>
                      {busy === item.id ? (
                        <span className="text-xs text-tertiary">{t("Moving…")}</span>
                      ) : item.allowed ? (
                        <ArrowRight className="size-4 text-fg-quaternary" aria-hidden="true" />
                      ) : (
                        <Lock01 className="size-4 text-fg-quaternary" aria-label={t("Not allowed")} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-tertiary">{t("There are no moves out of this status.")}</p>
            )}
          </section>

          <section aria-label={t("History")}>
            <h3 className="mb-2 text-sm font-semibold text-primary">{t("History")}</h3>
            {state.log.length ? (
              <ol className="space-y-2 border-l border-secondary pl-4">
                {state.log.map((l) => (
                  <li key={l.id} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-fg-quaternary" aria-hidden="true" />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {l.prev_status_id && (
                        <>
                          <StatusBadge status={byId.get(l.prev_status_id)} />
                          <ArrowRight className="size-3 text-fg-quaternary" aria-hidden="true" />
                        </>
                      )}
                      <StatusBadge status={byId.get(l.status_id)} />
                    </div>
                    <p className="mt-0.5 text-xs text-tertiary">
                      {new Date(l.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      {l.user && ` · ${l.user.name}`}
                      {l.time_spent != null && ` · ${t('after {time}', { time: duration(l.time_spent) })}`}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-tertiary">{t("No moves yet.")}</p>
            )}
          </section>

          <div className="modal-footer flex justify-end border-t border-secondary pt-4">
            <Button size="sm" color="secondary" onPress={onClose}>
              {t("Close")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

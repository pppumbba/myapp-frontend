import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Clock, Edit01, Play, Plus, Trash01 } from '@untitledui/icons';
import { Link } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { metaApi, type MetaOption } from '../lib/metaApi';
import { SCHEDULE_KEYWORDS, scheduleApi, type Schedule, type ScheduleRun } from '../lib/scheduleApi';
import { PageHeader } from '../components/AppShell';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Alert, IconAction } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { t } from '@/i18n';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** "daily" reads as "Every day at midnight"; a cron expression shows as written. */
const describe = (s: Schedule) => {
  const keyword = SCHEDULE_KEYWORDS[s.code.toLowerCase()];
  return keyword ? t(keyword) : t('Cron {expression}', { expression: s.expression ?? s.code });
};

const formatNext = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Scheduled forms. Each schedule (code = when) runs its forms by themselves: a form is
 * saved once for every row of its grid, fields filled from the grid's columns of the same
 * name. A stage query runs once for every row instead, its parameters taking the columns of
 * the same name. The server's scheduler (php artisan schedule:work) checks every minute.
 */
export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [metas, setMetas] = useState<MetaOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  // undefined: closed; null: new.
  const [editing, setEditing] = useState<Schedule | null | undefined>();
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [adding, setAdding] = useState<Schedule | null>(null);
  const [running, setRunning] = useState<number | null>(null);
  const [runs, setRuns] = useState<{ schedule: Schedule; results: ScheduleRun[] } | null>(null);

  async function load() {
    try {
      setSchedules(await scheduleApi.list());
    } catch (err) {
      setError(message(err, t("The schedules could not be loaded.")));
    }
  }

  useEffect(() => {
    load();
    metaApi.options().then(setMetas).catch(() => setMetas([]));
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await scheduleApi.remove(deleting.id);
      await load();
    } catch (err) {
      setError(message(err, t("The schedule could not be removed.")));
    } finally {
      setDeleting(null);
      setDeleteBusy(false);
    }
  }

  async function removeForm(id: number) {
    try {
      await scheduleApi.removeForm(id);
      await load();
    } catch (err) {
      setError(message(err, t("The form could not be taken off the schedule.")));
    }
  }

  async function runNow(schedule: Schedule) {
    setRunning(schedule.id);
    setError(null);
    try {
      const { results } = await scheduleApi.run(schedule.id);
      setRuns({ schedule, results });
    } catch (err) {
      setError(message(err, t("The schedule could not run.")));
    } finally {
      setRunning(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("Schedules")}
        subtitle={t("Forms that run by themselves: each one is saved once for every row of its grid, whenever its schedule comes round.")}
        actions={
          <Button size="sm" iconLeading={Plus} onPress={() => setEditing(null)}>
            {t("New schedule")}
          </Button>
        }
      />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}
      {!schedules ? (
        <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : schedules.length === 0 ? (
        <div className="rounded-xl bg-primary p-8 text-center ring-1 ring-secondary">
          <Clock className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-primary">{t("No schedules yet")}</p>
          <p className="mt-1 text-sm text-tertiary">{t("Make one, then pick the forms it runs and the grids they run over.")}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {schedules.map((s) => (
            <li key={s.id} className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
              <div className="flex flex-wrap items-start gap-3 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <Clock className="size-5 text-fg-secondary" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-primary">{s.name}</p>
                    <Badge type="color" size="sm" color="gray">
                      {s.code}
                    </Badge>
                  </div>
                  <p className="text-sm text-tertiary">
                    {t('{schedule} · next {when}', { schedule: describe(s), when: formatNext(s.next_run_at) })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" color="secondary" iconLeading={Play} isDisabled={s.forms.length === 0} isLoading={running === s.id} showTextWhileLoading onPress={() => runNow(s)}>
                    {t("Run now")}
                  </Button>
                  <IconAction icon={Edit01} label={t('Edit {name}', { name: s.name })} onPress={() => setEditing(s)} />
                  <IconAction icon={Trash01} danger label={t('Remove {name}', { name: s.name })} onPress={() => setDeleting(s)} />
                </div>
              </div>
              <div className="border-t border-secondary px-4 py-3">
                {s.forms.length === 0 ? (
                  <p className="text-sm text-tertiary">{t("Runs no forms yet.")}</p>
                ) : (
                  <ul className="divide-y divide-secondary">
                    {s.forms.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 py-2 text-sm">
                        <span className="text-tertiary">{t("For each row of")}</span>
                        <Link to={`/metas/${f.view_id}`} className="font-medium text-brand-secondary hover:underline">
                          {f.view?.name ?? `#${f.view_id}`}
                        </Link>
                        <ArrowRight className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                        <span className="text-tertiary">{t("save")}</span>
                        <Link to={`/metas/${f.process_id}`} className="min-w-0 truncate font-medium text-brand-secondary hover:underline">
                          {f.process?.name ?? `#${f.process_id}`}
                        </Link>
                        <IconAction icon={Trash01} danger label={t("Take this form off the schedule")} onPress={() => removeForm(f.id)} className="ml-auto" />
                      </li>
                    ))}
                  </ul>
                )}
                <Button size="sm" color="link-color" iconLeading={Plus} className="mt-2" onPress={() => setAdding(s)}>
                  {t("Add a form")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== undefined && (
        <ScheduleModal
          schedule={editing}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await load();
          }}
        />
      )}

      {adding && (
        <AddFormModal
          schedule={adding}
          metas={metas}
          onClose={() => setAdding(null)}
          onSaved={async () => {
            setAdding(null);
            await load();
          }}
        />
      )}

      {runs && (
        <Modal title={t('{name} ran', { name: runs.schedule.name })} onClose={() => setRuns(null)}>
          <ul className="space-y-4">
            {runs.results.map((r, i) => (
              <li key={i} className="space-y-2">
                <p className="text-sm font-medium text-primary">
                  {r.view} → {r.process}
                </p>
                {r.message ? (
                  <Alert>{r.message}</Alert>
                ) : (
                  <p className="text-sm text-tertiary">
                    {r.affected === null ? t('{count} saved', { count: r.created }) : t('Ran {times} times, {rows} rows changed', { times: r.created, rows: r.affected })}
                    {r.failed.length > 0 && t(', {count} refused', { count: r.failed.length })}.
                  </p>
                )}
                {r.failed.length > 0 && (
                  <ul className="max-h-60 overflow-y-auto rounded-lg bg-secondary_alt p-3 text-sm ring-1 ring-secondary">
                    {r.failed.map((f, j) => (
                      <li key={j} className="py-0.5 text-secondary">
                        <span className="font-medium">{t('Row {row}:', { row: f.row ?? j + 1 })}</span> {f.message}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div className="modal-footer mt-6 flex justify-end">
            <Button size="md" color="secondary" onPress={() => setRuns(null)}>
              {t("Close")}
            </Button>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={t('Remove {name}?', { name: deleting.name })}
          message={t("Its forms stop running. The records they already saved stay.")}
          confirmLabel={t("Remove schedule")}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function ScheduleModal({ schedule, onClose, onSaved }: { schedule: Schedule | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(schedule?.name ?? '');
  const [code, setCode] = useState(schedule?.code ?? 'daily');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isKeyword = code in SCHEDULE_KEYWORDS;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setError(null);
    try {
      const input = { name: name.trim(), code: code.trim() };
      if (schedule) await scheduleApi.update(schedule.id, input);
      else await scheduleApi.create(input);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      else setError(message(err, t("The schedule could not be saved.")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={schedule ? t('Edit {name}', { name: schedule.name }) : t("New schedule")} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Input label={t("Name")} isRequired value={name} onChange={setName} isInvalid={!!fieldErrors.name} hint={fieldErrors.name?.[0]} />
        <NativeSelect
          label={t("Runs")}
          value={isKeyword ? code : ''}
          onChange={(e) => setCode(e.target.value)}
          options={[...Object.entries(SCHEDULE_KEYWORDS).map(([value, label]) => ({ value, label: t(label) })), { value: '', label: t("Custom (cron expression)") }]}
        />
        <Input
          label={t("Code")}
          isRequired
          value={code}
          onChange={setCode}
          isInvalid={!!fieldErrors.code}
          hint={fieldErrors.code?.[0] ?? t("A keyword above, or cron: minute hour day month weekday, e.g. \"0 6 * * 1\" for Mondays at 06:00.")}
        />
        <div className="modal-footer flex justify-end gap-3 border-t border-secondary pt-5">
          <Button size="md" color="secondary" onPress={onClose}>
            {t("Cancel")}
          </Button>
          <Button size="md" type="submit" isLoading={saving} showTextWhileLoading>
            {schedule ? t("Save changes") : t("Add schedule")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AddFormModal({ schedule, metas, onClose, onSaved }: { schedule: Schedule; metas: MetaOption[]; onClose: () => void; onSaved: () => void }) {
  const forms = useMemo(() => metas.filter((m) => m.type === 'form' || m.type === 'stage_query'), [metas]);
  const grids = useMemo(() => metas.filter((m) => m.type === 'datagrid'), [metas]);
  const [processId, setProcessId] = useState('');
  const [viewId, setViewId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setError(null);
    try {
      await scheduleApi.addForm(schedule.id, { process_id: Number(processId), view_id: Number(viewId) });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      else setError(message(err, t("The form could not be added.")));
    } finally {
      setSaving(false);
    }
  }

  const pick = (list: MetaOption[], none: string) => [{ value: '', label: none }, ...list.map((m) => ({ value: String(m.id), label: `${m.name} (${m.type === 'stage_query' ? 'stage query' : m.code})` }))];

  return (
    <Modal title={t('Add a form to {name}', { name: schedule.name })} description={t("The form is saved (or the stage query runs) once for every row of the grid. Each field or parameter takes the grid column with the same name.")} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <NativeSelect label={t("For each row of (datagrid)")} value={viewId} onChange={(e) => setViewId(e.target.value)} options={pick(grids, t("Pick a grid…"))} hint={fieldErrors.view_id?.[0] ?? t("A grid with a query can rename its columns to fit the form.")} />
        <NativeSelect label={t("Save a form or run a stage query")} value={processId} onChange={(e) => setProcessId(e.target.value)} options={pick(forms, t("Pick one…"))} hint={fieldErrors.process_id?.[0]} />
        <div className="modal-footer flex justify-end gap-3 border-t border-secondary pt-5">
          <Button size="md" color="secondary" onPress={onClose}>
            {t("Cancel")}
          </Button>
          <Button size="md" type="submit" isDisabled={!processId || !viewId} isLoading={saving} showTextWhileLoading>
            {t("Add form")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

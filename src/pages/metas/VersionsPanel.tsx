import { useEffect, useState, type FormEvent } from 'react';
import { ClockRewind, GitCommit, SwitchHorizontal01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import type { Meta } from '../../lib/metaApi';
import { versionApi, type FieldChange, type MetaVersion, type RestoreResult, type VersionDiff } from '../../lib/versionApi';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { Alert, IconAction } from '../../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** How each part of a meta reads in a diff. */
const PART_NAMES: Record<string, string> = {
  params: 'Fields and columns',
  actions: 'Actions',
  permissions: 'Permissions',
  widgets: 'Widgets',
  wfm_statuses: 'Workflow statuses',
  wfm_transitions: 'Workflow transitions',
  process_steps: 'Process flow steps',
  process_transitions: 'Process flow transitions',
  process_behaviours: 'Process flow values',
};

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

/**
 * Version control for a meta: save it as a version with a note, see what changed since any
 * version, and restore one. Restoring saves unsaved changes as a version first, so it can
 * always be undone. onRestored reloads the page's panels.
 */
export function VersionsPanel({ meta, onRestored }: { meta: Meta; onRestored: () => void }) {
  const [versions, setVersions] = useState<MetaVersion[] | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [changed, setChanged] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparing, setComparing] = useState<MetaVersion | null>(null);
  const [restoring, setRestoring] = useState<MetaVersion | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restored, setRestored] = useState<(RestoreResult & { version: number }) | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function load() {
    try {
      const res = await versionApi.list(meta.id);
      setVersions(res.versions);
      setCurrent(res.current_version);
      setChanged(res.changed);
    } catch (err) {
      setError(message(err, 'The versions could not be loaded.'));
    }
  }

  useEffect(() => {
    load();
  }, [meta.id]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await versionApi.save(meta.id, note.trim());
      setNote('');
      await load();
    } catch (err) {
      setError(message(err, 'The version could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmRestore() {
    if (!restoring) return;
    setRestoreBusy(true);
    try {
      const result = await versionApi.restore(restoring.id);
      setRestored({ ...result, version: restoring.version_no });
      setRestoring(null);
      onRestored();
      await load();
    } catch (err) {
      setError(message(err, 'The version could not be restored.'));
      setRestoring(null);
    } finally {
      setRestoreBusy(false);
    }
  }

  const list = versions ?? [];
  const visible = showAll ? list : list.slice(0, 5);

  return (
    <section className="mb-8 rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-labelledby="versions-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <GitCommit className="size-5 text-fg-quaternary" aria-hidden="true" />
          <h2 id="versions-title" className="text-md font-semibold text-primary">
            Versions
          </h2>
          {versions &&
            (changed ? (
              <Badge type="pill-color" color="warning" size="sm">
                {list.length ? 'Unsaved changes' : 'Never saved'}
              </Badge>
            ) : (
              <Badge type="pill-color" color="success" size="sm">
                Same as version {current}
              </Badge>
            ))}
        </div>
        <form onSubmit={onSave} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-72">
            <Input aria-label="What changed" placeholder="What changed? (optional)" value={note} onChange={setNote} size="sm" />
          </div>
          <Button size="sm" type="submit" isDisabled={!changed} isLoading={saving} showTextWhileLoading>
            Save version
          </Button>
        </form>
      </div>

      <div className="px-4 py-3 sm:px-5">
        {error && (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        )}
        {restored && (
          <div role="status" className="mb-3 rounded-lg bg-success-primary p-3 text-sm text-success-primary ring-1 ring-success-secondary ring-inset">
            <p className="font-medium">
              Restored version {restored.version}.{restored.saved_first && ` Your changes before it are kept as version ${restored.saved_first}.`}
            </p>
            {restored.warnings.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-warning-primary">
                {restored.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {!versions ? (
          <div className="h-16 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
        ) : list.length === 0 ? (
          <p className="py-2 text-sm text-tertiary">No versions yet. Save one to be able to compare and go back to it later.</p>
        ) : (
          <ol className="divide-y divide-secondary">
            {visible.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-2.5">
                <span className="w-10 shrink-0 text-sm font-semibold text-primary tabular-nums">v{v.version_no}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-secondary">
                    {v.note || <span className="text-quaternary">No note</span>}
                    {v.version_no === current && (
                      <Badge type="color" color="success" size="sm" className="ml-2">
                        Current
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-quaternary">
                    {when(v.created_at)}
                    {v.creator && ` · ${v.creator.name}`}
                  </p>
                </div>
                <IconAction icon={SwitchHorizontal01} label={`What changed since version ${v.version_no}`} onPress={() => setComparing(v)} />
                <IconAction icon={ClockRewind} label={`Restore version ${v.version_no}`} onPress={() => setRestoring(v)} />
              </li>
            ))}
          </ol>
        )}
        {list.length > 5 && (
          <Button size="sm" color="link-gray" onPress={() => setShowAll((s) => !s)}>
            {showAll ? 'Show fewer' : `Show all ${list.length}`}
          </Button>
        )}
      </div>

      {comparing && <DiffModal version={comparing} versions={list} onClose={() => setComparing(null)} />}

      {restoring && (
        <ConfirmDialog
          title={`Restore version ${restoring.version_no}?`}
          message={
            changed
              ? `${meta.name} goes back to how it was then. Its current state is saved as a new version first, so you can come back to it.`
              : `${meta.name} goes back to how it was then. Its current state is already saved as version ${current}.`
          }
          confirmLabel="Restore"
          busy={restoreBusy}
          onConfirm={confirmRestore}
          onCancel={() => setRestoring(null)}
        />
      )}
    </section>
  );
}

/** What changed from a version to now or to another version. */
function DiffModal({ version, versions, onClose }: { version: MetaVersion; versions: MetaVersion[]; onClose: () => void }) {
  const [against, setAgainst] = useState<string>('current');
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setDiff(null);
    setError(null);
    versionApi.diff(version.id, against === 'current' ? 'current' : Number(against)).then(
      (d) => live && setDiff(d),
      (err) => live && setError(message(err, 'The changes could not be worked out.')),
    );
    return () => {
      live = false;
    };
  }, [version.id, against]);

  const parts = diff ? Object.entries(diff.parts) : [];
  const empty = diff && diff.meta.length === 0 && parts.length === 0;

  return (
    <Modal title={`Changes since version ${version.version_no}`} description={version.note ?? undefined} onClose={onClose} size="lg">
      <div className="space-y-5">
        <NativeSelect
          label="Compared with"
          value={against}
          onChange={(e) => setAgainst(e.target.value)}
          options={[{ value: 'current', label: 'Now' }, ...versions.filter((v) => v.id !== version.id).map((v) => ({ value: String(v.id), label: `Version ${v.version_no}${v.note ? ` — ${v.note}` : ''}` }))]}
        />
        {error && <Alert>{error}</Alert>}
        {!diff && !error && <div className="h-32 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />}
        {empty && <p className="text-sm text-tertiary">Nothing changed.</p>}
        {diff && diff.meta.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-primary">Settings</h3>
            <Changes changes={diff.meta} />
          </div>
        )}
        {parts.map(([part, d]) => (
          <div key={part}>
            <h3 className="mb-2 text-sm font-semibold text-primary">{PART_NAMES[part] ?? part}</h3>
            <ul className="space-y-2 text-sm">
              {d.added.map((label) => (
                <li key={`a-${label}`} className="flex items-center gap-2">
                  <Badge type="color" color="success" size="sm">
                    Added
                  </Badge>
                  <span className="text-secondary">{label}</span>
                </li>
              ))}
              {d.removed.map((label) => (
                <li key={`r-${label}`} className="flex items-center gap-2">
                  <Badge type="color" color="error" size="sm">
                    Removed
                  </Badge>
                  <span className="text-secondary line-through">{label}</span>
                </li>
              ))}
              {d.changed.map((c) => (
                <li key={`c-${c.label}`} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge type="color" color="warning" size="sm">
                      Changed
                    </Badge>
                    <span className="text-secondary">{c.label}</span>
                  </div>
                  <Changes changes={c.fields} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function Changes({ changes }: { changes: FieldChange[] }) {
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-secondary">
      <table className="w-full text-left text-xs">
        <thead className="bg-secondary_alt text-quaternary">
          <tr>
            <th className="px-3 py-1.5 font-medium">Setting</th>
            <th className="px-3 py-1.5 font-medium">Was</th>
            <th className="px-3 py-1.5 font-medium">Is</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary">
          {changes.map((c) => (
            <tr key={c.field} className="align-top">
              <td className="px-3 py-1.5 font-mono text-secondary">{c.field}</td>
              <td className="max-w-60 px-3 py-1.5 font-mono break-words text-error-primary">{show(c.from)}</td>
              <td className="max-w-60 px-3 py-1.5 font-mono break-words text-success-primary">{show(c.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

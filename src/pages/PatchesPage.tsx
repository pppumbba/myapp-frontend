import { useEffect, useState, type FormEvent } from 'react';
import { ClockRewind, Download01, Edit01, Package, Plus, Rocket01, Trash01, Upload01 } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { metaApi, type Meta } from '../lib/metaApi';
import { patchApi, type Patch, type PatchInstall } from '../lib/patchApi';
import { AppShell, PageHeader } from '../components/AppShell';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Alert, IconAction } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { TextArea } from '@/components/base/textarea/textarea';
import { ImportMetasModal, MetaPicker } from './metas/MetaTransferModals';
import { t } from '@/i18n';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

type Tab = 'made' | 'installed';

/**
 * Patch management. Made here: named sets of metas; releasing one writes its file, which
 * then stays as it was. Installed here: patch files put into this installation, each with
 * what it did, and a rollback that deletes the metas it added and restores the ones it
 * replaced to their versions from just before.
 */
export default function PatchesPage() {
  const [tab, setTab] = useState<Tab>('made');
  const [patches, setPatches] = useState<Patch[] | null>(null);
  const [installs, setInstalls] = useState<PatchInstall[] | null>(null);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // undefined: closed; null: new.
  const [editing, setEditing] = useState<Patch | null | undefined>();
  const [installing, setInstalling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Patch | null>(null);
  const [rollingBack, setRollingBack] = useState<PatchInstall | null>(null);

  async function load() {
    try {
      const [made, installed] = await Promise.all([patchApi.list(), patchApi.installs()]);
      setPatches(made);
      setInstalls(installed);
    } catch (err) {
      setError(message(err, t("The patches could not be loaded.")));
    }
  }

  useEffect(() => {
    void load();
    metaApi.list().then(setMetas).catch(() => setMetas([]));
  }, []);

  async function act(key: string, work: () => Promise<unknown>, fallback: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (err) {
      setError(message(err, fallback));
    } finally {
      setBusy(null);
    }
  }

  const release = (p: Patch) =>
    act(`release-${p.id}`, async () => {
      await patchApi.release(p.id);
      setNotice(t('{name} is released. Download its file to install it elsewhere.', { name: p.name }));
      await load();
    }, t("The patch could not be released."));

  const confirmDelete = () =>
    deleting &&
    act('delete', async () => {
      await patchApi.remove(deleting.id);
      setDeleting(null);
      await load();
    }, t("The patch could not be deleted."));

  const confirmRollback = () =>
    rollingBack &&
    act('rollback', async () => {
      const { warnings } = await patchApi.rollback(rollingBack.id);
      setRollingBack(null);
      setNotice(t('{name} is rolled back.', { name: rollingBack.patch_name }) + (warnings.length ? ` ${warnings.join(' ')}` : ''));
      await load();
    }, t("The install could not be rolled back."));

  return (
    <AppShell>
      <PageHeader
        title={t("Patches")}
        subtitle={t("Ship metas from one installation to another, e.g. from test to live: release a patch here, install its file there, roll it back if needed.")}
        actions={
          <div className="flex gap-2">
            <Button size="sm" color="secondary" iconLeading={Upload01} onPress={() => setInstalling(true)}>
              {t("Install patch")}
            </Button>
            <Button size="sm" iconLeading={Plus} onPress={() => setEditing(null)}>
              {t("New patch")}
            </Button>
          </div>
        }
      />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}
      {notice && !error && (
        <p role="status" className="mb-4 text-sm font-medium text-success-primary">
          {notice}
        </p>
      )}

      <ButtonGroup size="sm" aria-label={t("Patches")} selectionMode="single" disallowEmptySelection selectedKeys={[tab]} onSelectionChange={(keys) => setTab([...keys][0] === 'installed' ? 'installed' : 'made')} className="mb-4">
        <ButtonGroupItem id="made">{t('Made here ({n})', { n: patches?.length ?? 0 })}</ButtonGroupItem>
        <ButtonGroupItem id="installed">{t('Installed here ({n})', { n: installs?.length ?? 0 })}</ButtonGroupItem>
      </ButtonGroup>

      {tab === 'made' ? (
        !patches ? (
          <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
        ) : patches.length === 0 ? (
          <Empty title={t("No patches yet")} text={t("Make one, pick the metas it ships, then release it to get its file.")} />
        ) : (
          <ul className="space-y-3">
            {patches.map((p) => (
              <li key={p.id} className="rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-primary">{p.name}</p>
                      <Badge type="color" size="sm" color="gray">{p.code}</Badge>
                      <Badge type="color" size="sm" color={p.status === 'released' ? 'success' : 'warning'}>{p.status === 'released' ? t("Released") : t("Draft")}</Badge>
                    </div>
                    <p className="text-sm text-tertiary">
                      {t('{n} metas', { n: p.metas.length })}
                      {p.with_used && ` · ${t("with the metas they use")}`}
                      {p.released_at && ` · ${t('released {when}', { when: when(p.released_at) })}`}
                      {p.releaser && ` ${t('by {name}', { name: p.releaser.name })}`}
                    </p>
                    {p.description && <p className="mt-1 text-sm text-secondary">{p.description}</p>}
                    <p className="mt-2 truncate text-xs text-quaternary">{p.metas.map((m) => m.code).join(', ')}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {p.status === 'draft' ? (
                      <>
                        <Button size="sm" color="secondary" iconLeading={Rocket01} isDisabled={!p.metas.length} isLoading={busy === `release-${p.id}`} showTextWhileLoading onPress={() => release(p)}>
                          {t("Release")}
                        </Button>
                        <IconAction icon={Edit01} label={t("Edit")} onPress={() => setEditing(p)} />
                      </>
                    ) : (
                      <Button size="sm" color="secondary" iconLeading={Download01} isLoading={busy === `download-${p.id}`} showTextWhileLoading onPress={() => act(`download-${p.id}`, () => patchApi.download(p), t("The file could not be downloaded."))}>
                        {t("Download")}
                      </Button>
                    )}
                    <IconAction icon={Trash01} label={t("Delete")} danger onPress={() => setDeleting(p)} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : !installs ? (
        <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : installs.length === 0 ? (
        <Empty title={t("Nothing installed yet")} text={t("Install a patch file released in another installation.")} />
      ) : (
        <ul className="space-y-3">
          {installs.map((i) => (
            <InstallRow key={i.id} install={i} busy={busy} onDownload={() => act(`file-${i.id}`, () => patchApi.downloadInstall(i), t("The file could not be downloaded."))} onRollback={() => setRollingBack(i)} />
          ))}
        </ul>
      )}

      {editing !== undefined && (
        <PatchModal
          patch={editing}
          metas={metas}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void load();
          }}
        />
      )}
      {installing && (
        <ImportMetasModal
          title={t("Install patch")}
          description={t("A patch file released in this or another installation. What happens to each meta is logged, so the install can be rolled back.")}
          run={(pkg, existing, dryRun, fileName) => patchApi.install(pkg, existing, dryRun, fileName)}
          filePrompt={t("Pick a .patch.json file")}
          actionLabel={t("Install")}
          onClose={() => setInstalling(false)}
          onDone={(n) => {
            setInstalling(false);
            setNotice(n);
            setTab('installed');
            void load();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('Delete {name}?', { name: deleting.name })}
          message={t("Only the patch goes: its metas stay, and installations that installed its file keep them.")}
          confirmLabel={t("Delete patch")}
          busy={busy === 'delete'}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
      {rollingBack && (
        <ConfirmDialog
          title={t('Roll back {name}?', { name: rollingBack.patch_name })}
          message={t("The metas it added are deleted, and the ones it replaced go back to how they were before it. Changes made to them since are undone too, but each meta's state now is saved as a version first.")}
          confirmLabel={t("Roll back")}
          busy={busy === 'rollback'}
          onConfirm={() => void confirmRollback()}
          onCancel={() => setRollingBack(null)}
        />
      )}
    </AppShell>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-primary p-8 text-center ring-1 ring-secondary">
      <Package className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-primary">{title}</p>
      <p className="mt-1 text-sm text-tertiary">{text}</p>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = { create: 'added', replace: 'replaced', copy: 'added as copies', skip: 'skipped', 'left out': 'left out' };

/** One install: what it did, its notes, and its rollback. */
function InstallRow({ install: i, busy, onDownload, onRollback }: { install: PatchInstall; busy: string | null; onDownload: () => void; onRollback: () => void }) {
  const [open, setOpen] = useState(false);
  const counts = i.result.metas.reduce<Record<string, number>>((all, m) => ({ ...all, [m.action]: (all[m.action] ?? 0) + 1 }), {});
  const rolledBack = i.rolled_back_at !== null;

  return (
    <li className="rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className={rolledBack ? 'truncate text-sm font-semibold text-tertiary line-through' : 'truncate text-sm font-semibold text-primary'}>{i.patch_name}</p>
            {i.patch_code && <Badge type="color" size="sm" color="gray">{i.patch_code}</Badge>}
            <Badge type="color" size="sm" color={rolledBack ? 'gray' : 'success'}>{rolledBack ? t("Rolled back") : t("Installed")}</Badge>
          </div>
          <p className="text-sm text-tertiary">
            {t('installed {when}', { when: when(i.installed_at) })}
            {i.installer && ` ${t('by {name}', { name: i.installer.name })}`}
            {i.source && ` · ${t('from {source}', { source: i.source })}`}
            {rolledBack && ` · ${t('rolled back {when}', { when: when(i.rolled_back_at) })}`}
            {rolledBack && i.rollbacker && ` ${t('by {name}', { name: i.rollbacker.name })}`}
          </p>
          <p className="mt-1 text-sm text-secondary">
            {Object.entries(counts).map(([action, n]) => `${n} ${t(ACTION_LABELS[action] ?? action)}`).join(' · ')}
            {i.result.warnings.length > 0 && ` · ${t('{n} notes', { n: i.result.warnings.length })}`}
          </p>
          {i.description && <p className="mt-1 text-sm text-tertiary">{i.description}</p>}
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-sm font-medium text-brand-secondary hover:underline" aria-expanded={open}>
            {open ? t("Hide details") : t("Details")}
          </button>
          {open && (
            <div className="mt-2 space-y-2">
              <ul className="divide-y divide-secondary rounded-lg ring-1 ring-secondary">
                {i.result.metas.map((m) => (
                  <li key={m.code} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-primary">{m.name} <span className="text-xs text-tertiary">{m.code}</span></span>
                    <span className="text-xs text-tertiary">{t(ACTION_LABELS[m.action] ?? m.action)}</span>
                  </li>
                ))}
              </ul>
              {i.result.warnings.length > 0 && (
                <ul className="list-disc space-y-0.5 rounded-lg bg-warning-primary p-3 pl-8 text-sm text-warning-primary">
                  {i.result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconAction icon={Download01} label={t("Download the file")} onPress={onDownload} />
          {!rolledBack && (
            <Button size="sm" color="secondary-destructive" iconLeading={ClockRewind} isLoading={busy === 'rollback'} showTextWhileLoading onPress={onRollback}>
              {t("Roll back")}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** A patch's name and metas; a draft can change until it is released. */
function PatchModal({ patch, metas, onClose, onSaved }: { patch: Patch | null; metas: Meta[]; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(patch?.code ?? `patch_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`);
  const [name, setName] = useState(patch?.name ?? '');
  const [description, setDescription] = useState(patch?.description ?? '');
  const [withUsed, setWithUsed] = useState(patch?.with_used ?? false);
  const [picked, setPicked] = useState<number[]>(patch?.metas.map((m) => m.id) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [added, setAdded] = useState<string | null>(null);

  async function addChanged() {
    setError(null);
    try {
      const changed = await patchApi.changed();
      const fresh = changed.map((m) => m.id).filter((id) => !picked.includes(id));
      setPicked([...picked, ...fresh]);
      setAdded(t('Added {n} changed metas.', { n: fresh.length }));
    } catch (err) {
      setError(message(err, t("The changed metas could not be loaded.")));
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const input = { code, name, description: description || null, with_used: withUsed, meta_ids: picked };
    try {
      if (patch) await patchApi.update(patch.id, input);
      else await patchApi.create(input);
      onSaved();
    } catch (err) {
      setError(message(err, t("The patch could not be saved.")));
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={patch ? t('Edit {name}', { name: patch.name }) : t("New patch")} description={t("The metas it ships, each with everything defined with it. Release it to get its file.")} onClose={onClose} size="lg">
      <form onSubmit={save} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t("Name")} isRequired autoFocus value={name} onChange={setName} isInvalid={!!fieldErrors.name} hint={fieldErrors.name?.[0]} />
          <Input label={t("Code")} isRequired value={code} onChange={setCode} isInvalid={!!fieldErrors.code} hint={fieldErrors.code?.[0] ?? t("Letters, digits, _ . -")} />
        </div>
        <TextArea label={t("Description")} rows={2} value={description} onChange={setDescription} hint={t("What it changes, for whoever installs it.")} />
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-secondary">{t('Metas ({n})', { n: picked.length })}</p>
          <Button size="sm" color="link-color" onPress={addChanged} className="ml-auto">
            {t("Add the metas changed since the last release")}
          </Button>
        </div>
        {added && <p role="status" className="text-sm text-success-primary">{added}</p>}
        <MetaPicker metas={metas} picked={picked} onChange={setPicked} autoFocus={false} />
        <Checkbox isSelected={withUsed} onChange={setWithUsed} label={t("Also the metas they use")} hint={t("Lookups, the forms their buttons open, process steps, linked metas… and the ones those use. Leave it off when the other app already has them: they are found there by code.")} />
        <div className="flex justify-end gap-2 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>{t("Cancel")}</Button>
          <Button size="sm" type="submit" isLoading={busy} showTextWhileLoading isDisabled={!name.trim() || !code.trim()}>
            {t("Save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

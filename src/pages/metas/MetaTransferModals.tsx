import { useEffect, useState } from 'react';
import { Download01, SearchLg, Upload01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { metaApi, type ImportExisting, type ImportResult, type Meta } from '../../lib/metaApi';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/**
 * Downloads metas as a file to import in another installation: each with its fields, buttons,
 * workflow, permissions, links, tags and translations, and a page with its own widgets.
 */
export function ExportMetasModal({ metas, initial, onClose }: { metas: Meta[]; initial: number[]; onClose: () => void }) {
  const [picked, setPicked] = useState<number[]>(initial);
  const [withUsed, setWithUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      await metaApi.exportFile(picked, withUsed);
      onClose();
    } catch (err) {
      setError(message(err, t("The metas could not be exported.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("Export metas")} description={t("A file with the metas and everything defined with them, to import in another installation of the app. Their records are not included.")} onClose={onClose} size="lg">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <MetaPicker metas={metas} picked={picked} onChange={setPicked} />
        <Checkbox
          isSelected={withUsed}
          onChange={setWithUsed}
          label={t("Also the metas they use")}
          hint={t("Lookups, the forms their buttons open, process steps, linked metas… and the ones those use. Leave it off when the other app already has them: they are found there by code.")}
        />
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-sm text-tertiary">{t('{n} picked', { n: picked.length })}</span>
          <Button size="sm" color="secondary" onPress={onClose}>{t("Cancel")}</Button>
          <Button size="sm" iconLeading={Download01} isDisabled={!picked.length} isLoading={busy} showTextWhileLoading onPress={download}>
            {t("Export")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Metas to tick, with a search; ticked ones are highlighted. */
export function MetaPicker({
  metas,
  picked,
  onChange,
  autoFocus = true,
}: {
  metas: (Pick<Meta, 'id' | 'name' | 'code'> & { type?: { name: string } | null })[];
  picked: number[];
  onChange: (ids: number[]) => void;
  autoFocus?: boolean;
}) {
  const [search, setSearch] = useState('');
  const shown = metas.filter((m) => `${m.name} ${m.code} ${m.type?.name ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 200);
  const toggle = (id: number) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ring-primary">
        <SearchLg className="size-4 text-fg-quaternary" aria-hidden="true" />
        <input autoFocus={autoFocus} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Find metas")} aria-label={t("Find metas")} className="w-full bg-transparent text-sm text-primary outline-none placeholder:text-placeholder" />
      </label>
      <ul aria-label={t("Metas")} className="max-h-72 divide-y divide-secondary overflow-auto rounded-lg ring-1 ring-secondary">
        {shown.map((m) => (
          <li key={m.id} className={cx('flex items-center gap-3 px-3 py-2', picked.includes(m.id) && 'bg-brand-primary_alt')}>
            <Checkbox aria-label={m.name} isSelected={picked.includes(m.id)} onChange={() => toggle(m.id)} />
            <button type="button" onClick={() => toggle(m.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium text-primary">{m.name}</span>
              <span className="block truncate text-xs text-tertiary">{m.code}</span>
            </button>
            <span className="text-xs text-tertiary">{m.type?.name}</span>
          </li>
        ))}
        {!shown.length && <li className="px-3 py-4 text-sm text-tertiary">{t("No meta matches.")}</li>}
      </ul>
    </div>
  );
}

const ACTIONS: Record<ImportResult['metas'][number]['action'], { label: string; tone: string }> = {
  create: { label: 'New', tone: 'bg-success-primary text-success-primary' },
  replace: { label: 'Replaces the one here', tone: 'bg-warning-primary text-warning-primary' },
  skip: { label: 'Skipped: already here', tone: 'bg-secondary text-tertiary' },
  copy: { label: 'Added as a copy', tone: 'bg-brand-primary_alt text-brand-secondary' },
  'left out': { label: 'Left out', tone: 'bg-error-primary text-error-primary' },
};

/**
 * Imports a metas file. It first shows what would happen (a dry run), for the choice made
 * about metas whose code is already here, then imports on confirm.
 */
export function ImportMetasModal({
  onClose,
  onDone,
  title = t("Import metas"),
  description = t("Metas from a file exported in this or another installation. What they point at is found here by code; what isn't here is reported."),
  run: send = (pkg, existing, dryRun) => metaApi.importFile(pkg, existing, dryRun),
  filePrompt = t("Pick a .metas.json file"),
  actionLabel = t("Import"),
}: {
  onClose: () => void;
  onDone: (notice: string) => void;
  title?: string;
  description?: string;
  /** What importing does; a patch install also says when the same file was installed before. */
  filePrompt?: string;
  actionLabel?: string;
  run?: (pkg: unknown, existing: ImportExisting, dryRun: boolean, fileName: string) => Promise<ImportResult & { installed_before?: { id: number; installed_at: string | null }[] }>;
}) {
  const [file, setFile] = useState<{ name: string; pkg: unknown } | null>(null);
  const [existing, setExisting] = useState<ImportExisting>('replace');
  const [preview, setPreview] = useState<(ImportResult & { installed_before?: { id: number; installed_at: string | null }[] }) | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    let live = true;
    setPreview(null);
    setError(null);
    send(file.pkg, existing, true, file.name).then(
      (result) => live && setPreview(result),
      (err) => live && setError(message(err, t("The file could not be read."))),
    );
    return () => {
      live = false;
    };
  }, [file, existing]); // eslint-disable-line react-hooks/exhaustive-deps

  async function read(picked: File | undefined) {
    if (!picked) return;
    setError(null);
    try {
      setFile({ name: picked.name, pkg: JSON.parse(await picked.text()) });
    } catch {
      setError(t("This is not a metas file."));
    }
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await send(file.pkg, existing, false, file.name);
      if (result.warnings.length) setDone(result);
      else finish(result);
    } catch (err) {
      setError(message(err, t("The metas could not be imported.")));
    } finally {
      setBusy(false);
    }
  }

  const finish = (result: ImportResult) => onDone(t('Imported {n} metas.', { n: result.metas.filter((m) => m.action !== 'skip' && m.action !== 'left out').length }));
  const shown = done ?? preview;

  return (
    <Modal title={title} description={description} onClose={onClose} size="lg">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {!done && (
          <>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary px-4 py-3 hover:bg-primary_hover">
              <Upload01 className="size-5 text-fg-quaternary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-secondary">{file ? file.name : filePrompt}</span>
              <input type="file" accept=".json,application/json" className="sr-only" aria-label={t("Metas file")} onChange={(e) => void read(e.target.files?.[0])} />
            </label>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-secondary">{t("When a meta with the same code is already here")}</legend>
              {(
                [
                  ['replace', t("Replace it"), t("It keeps its id, so menus and links to it still work. Its current state is saved as a version first.")],
                  ['skip', t("Keep it, skip the file’s")],
                  ['copy', t("Add the file’s as a copy"), t("Under a new code ending in _copy.")],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="flex items-start gap-2 text-sm text-secondary">
                  <input type="radio" name="import-existing" className="mt-1" checked={existing === value} onChange={() => setExisting(value)} />
                  <span>
                    {label}
                    {hint && <span className="block text-xs text-tertiary">{hint}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {file && !shown && !error && <div className="h-24 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />}
        {shown && (
          <>
            <p className="text-sm font-medium text-secondary">{done ? t("Imported") : t("What will happen")}</p>
            {!done && !!preview?.installed_before?.length && (
              <Alert>{t('This file was already installed here on {when}. Installing it again is allowed.', { when: new Date(preview.installed_before[0].installed_at ?? '').toLocaleString() })}</Alert>
            )}
            <ul className="max-h-64 divide-y divide-secondary overflow-auto rounded-lg ring-1 ring-secondary">
              {shown.metas.map((m) => (
                <li key={m.code} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-primary">{m.name}</span>
                    <span className="block truncate text-xs text-tertiary">
                      {m.code}
                      {m.type && ` · ${m.type}`}
                    </span>
                  </span>
                  <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', ACTIONS[m.action].tone)}>{t(ACTIONS[m.action].label)}</span>
                </li>
              ))}
            </ul>
            {shown.warnings.length > 0 && (
              <div className="rounded-lg bg-warning-primary p-3 text-sm text-warning-primary">
                <p className="font-medium">{t("Notes")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {shown.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          {done ? (
            <Button size="sm" onPress={() => finish(done)}>{t("Done")}</Button>
          ) : (
            <>
              <Button size="sm" color="secondary" onPress={onClose}>{t("Cancel")}</Button>
              <Button size="sm" iconLeading={Upload01} isDisabled={!preview} isLoading={busy} showTextWhileLoading onPress={run}>
                {actionLabel}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

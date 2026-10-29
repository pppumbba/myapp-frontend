import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download01, Upload01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { languageApi, type MetaTranslations, type TranslationEntry } from '../../lib/languageApi';
import type { Meta } from '../../lib/metaApi';
import { clearRenderCache } from '../../render/definitions';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Toggle } from '@/components/base/toggle/toggle';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/**
 * The meta's names and labels in other languages: its name and title, each field's label,
 * each button and each status. Screens show them in the user's language; an empty box shows
 * the original. Out to Excel and back, for a translator.
 */
export function TranslationsPanel({ meta }: { meta: Meta }) {
  const [data, setData] = useState<MetaTranslations | null>(null);
  const [open, setOpen] = useState(false);
  // Edits not saved yet: key → locale → text.
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [find, setFind] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    languageApi.translations(meta.id).then(setData, (err) => setError(message(err, t("Translations could not be loaded."))));
  }, [meta.id]);

  const value = (key: string, code: string) => draft[key]?.[code] ?? data?.texts.find((item) => item.key === key)?.values[code] ?? '';
  const entries: TranslationEntry[] = useMemo(
    () => Object.entries(draft).flatMap(([key, byCode]) => Object.entries(byCode).map(([locale, v]) => ({ key, locale, value: v }))),
    [draft],
  );
  const languages = data?.languages ?? [];
  const total = (data?.texts.length ?? 0) * languages.length;
  const done = data ? data.texts.reduce((n, item) => n + languages.filter((l) => item.values[l.code]).length, 0) : 0;
  const shown = (data?.texts ?? []).filter((item) => {
    const q = find.trim().toLowerCase();
    if (q && !`${item.where} ${item.original} ${Object.values(item.values).join(' ')}`.toLowerCase().includes(q)) return false;
    return !missingOnly || languages.some((l) => !value(item.key, l.code));
  });

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
      // Screens already open load their labels again.
      clearRenderCache();
    } catch (err) {
      setError(message(err, t("The translations could not be saved.")));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      const r = await languageApi.saveTranslations(meta.id, entries);
      setData((d) => (d ? { ...d, texts: r.texts } : d));
      setDraft({});
      return t("Translations saved.");
    });

  const importFile = (file: File) =>
    run(async () => {
      const r = await languageApi.importTranslations(meta.id, file);
      setData((d) => (d ? { ...d, texts: r.texts } : d));
      setDraft({});
      const read = t('{count} translations read from the file.', { count: r.saved });
      return r.skipped ? `${read} ${t('{count} rows were skipped: those texts are no longer on this meta.', { count: r.skipped })}` : read;
    });

  const sourceName = data ? (data.source === 'en' ? 'English' : data.source) : '';

  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={t("Translations")}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-w-0 items-center gap-2 rounded-md text-left outline-focus-ring focus-visible:outline-2">
          <ChevronDown className={cx('size-5 shrink-0 text-fg-quaternary transition-transform motion-reduce:transition-none', !open && '-rotate-90')} aria-hidden="true" />
          <span>
            <span className="block text-lg font-semibold text-primary">{t("Translations")}</span>
            <span className="block text-sm text-tertiary">
              {!data ? t("Loading…") : !languages.length ? t("No other languages yet.") : t('{done} of {total} translated into {languages}.', { done, total, languages: languages.map((l) => l.name).join(', ') })}
            </span>
          </span>
        </button>
        {open && languages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" color="secondary" iconLeading={Download01} isDisabled={busy} onPress={() => run(async () => (await languageApi.exportTranslations(meta.id, meta.code), t("The file is downloading.")))}>
              {t("Export")}
            </Button>
            <Button size="sm" color="secondary" iconLeading={Upload01} isDisabled={busy} onPress={() => fileInput.current?.click()}>
              {t("Import")}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void importFile(f);
              }}
            />
            <Button size="sm" isDisabled={!entries.length} isLoading={busy} showTextWhileLoading onPress={save}>
              {t("Save translations")}
            </Button>
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-secondary px-4 py-4 sm:px-5">
          {error && (
            <div className="mb-3">
              <Alert>{error}</Alert>
            </div>
          )}
          {notice && (
            <p role="status" className="mb-3 text-sm font-medium text-success-primary">
              {notice}
            </p>
          )}
          {!data ? null : !languages.length ? (
            <p className="text-sm text-tertiary">{t("Add a language to translate into on the Users &amp; roles page, under Languages.")}</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-4">
                <Input aria-label={t("Find a text")} type="search" size="sm" value={find} onChange={setFind} placeholder={t("Find a text")} className="w-64" />
                <Toggle label={t("Only those not translated yet")} isSelected={missingOnly} onChange={setMissingOnly} />
              </div>
              <div className="overflow-x-auto rounded-lg ring-1 ring-secondary">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="bg-secondary text-left text-xs font-medium text-tertiary">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t("Text")}</th>
                      <th className="px-3 py-2 font-medium">{sourceName}</th>
                      {languages.map((l) => (
                        <th key={l.code} className="px-3 py-2 font-medium">
                          {l.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary">
                    {shown.map((item) => (
                      <tr key={item.key}>
                        <td className="px-3 py-1.5 whitespace-nowrap text-tertiary">{item.where}</td>
                        <td className="max-w-64 px-3 py-1.5 text-primary">{item.original}</td>
                        {languages.map((l) => {
                          const v = value(item.key, l.code);
                          const changed = draft[item.key]?.[l.code] !== undefined;
                          return (
                            <td key={l.code} className="px-2 py-1">
                              <input
                                aria-label={t('{field} in {language}', { field: item.where, language: l.name })}
                                lang={l.code}
                                value={v}
                                placeholder={item.original}
                                onChange={(e) => setDraft((d) => ({ ...d, [item.key]: { ...d[item.key], [l.code]: e.target.value } }))}
                                className={cx(
                                  'w-full min-w-40 rounded-md bg-primary px-2 py-1 text-sm text-primary ring-1 outline-none placeholder:text-placeholder focus:ring-2 focus:ring-brand',
                                  changed ? 'ring-brand' : 'ring-primary',
                                )}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {!shown.length && (
                      <tr>
                        <td colSpan={2 + languages.length} className="px-3 py-6 text-center text-sm text-tertiary">
                          {data.texts.length ? t("Nothing matches.") : t("This meta has no names or labels to translate.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-tertiary">{t('An empty box shows the {language} text. Clearing one and saving removes its translation.', { language: sourceName })}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

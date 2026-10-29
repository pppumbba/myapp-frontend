import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash01 } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { languageApi, type Language } from '../lib/languageApi';
import { Alert, IconAction } from '../components/ui';
import { ConfirmDialog } from '../components/Modal';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Toggle } from '@/components/base/toggle/toggle';
import { t } from '@/i18n';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/**
 * The languages the app speaks. Labels are written in the source language and translated
 * into the others on each meta; people who pick none, and whose browser asks for none of
 * these, get the default.
 */
export function LanguagesCard() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Language | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => languageApi.list().then((r) => setLanguages(r.languages), (err) => setError(message(err, t("Languages could not be loaded."))));
  useEffect(() => {
    void load();
  }, []);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (err) {
      setError(message(err, t("That did not work.")));
    } finally {
      setBusy(false);
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      await languageApi.create(code.trim().toLowerCase(), name.trim());
      setCode('');
      setName('');
      setAdding(false);
    });
  }

  return (
    <section className="self-start rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={t("Languages")}>
      <div className="flex items-start justify-between gap-3 border-b border-secondary px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="text-md font-semibold text-primary">{t("Languages")}</h2>
          <p className="text-sm text-tertiary">{t("Names and labels are written in the source language and translated on each meta, under Translations.")}</p>
        </div>
        {!adding && (
          <Button size="sm" color="secondary" iconLeading={Plus} onPress={() => setAdding(true)}>
            {t("Add language")}
          </Button>
        )}
      </div>
      <div className="px-4 py-4 sm:px-5">
        {error && (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        )}
        {adding && (
          <form onSubmit={add} className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-secondary p-3">
            <Input label={t("Code")} size="sm" isRequired value={code} onChange={setCode} placeholder="ru" hint={t("Like mn, en, ru or zh-hans.")} className="w-32" />
            <Input label={t("Name")} size="sm" isRequired value={name} onChange={setName} placeholder="Русский" hint={t("As its speakers write it.")} className="w-56" />
            <div className="flex gap-2 pb-6">
              <Button size="sm" color="secondary" onPress={() => setAdding(false)}>
                {t("Cancel")}
              </Button>
              <Button size="sm" type="submit" isLoading={busy} isDisabled={!code.trim() || !name.trim()}>
                {t("Add")}
              </Button>
            </div>
          </form>
        )}
        <ul className="divide-y divide-secondary">
          {languages.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium text-primary">
                  {l.name} <span className="font-normal text-tertiary">{l.code}</span>
                </p>
                <div className="mt-1 flex gap-1.5">
                  {l.is_source && (
                    <Badge size="sm" type="pill-color" color="brand">
                      {t("Labels are written in it")}
                    </Badge>
                  )}
                  {l.is_default && (
                    <Badge size="sm" type="pill-color" color="gray">
                      {t("Default")}
                    </Badge>
                  )}
                </div>
              </div>
              {!l.is_source && (
                <Button size="sm" color="link-gray" isDisabled={busy} onPress={() => run(() => languageApi.update(l.id, { is_source: true }))}>
                  {t("Labels are in it")}
                </Button>
              )}
              {!l.is_default && (
                <Button size="sm" color="link-gray" isDisabled={busy} onPress={() => run(() => languageApi.update(l.id, { is_default: true }))}>
                  {t("Make default")}
                </Button>
              )}
              <Toggle
                aria-label={`${l.name} on`}
                label={t("On")}
                size="sm"
                isDisabled={busy || l.is_source || l.is_default}
                isSelected={l.is_active}
                onChange={(on) => run(() => languageApi.update(l.id, { is_active: on }))}
              />
              {l.is_source || l.is_default ? <span className="size-8" aria-hidden="true" /> : <IconAction icon={Trash01} danger label={t('Remove {name}', { name: l.name })} onPress={() => setRemoving(l)} />}
            </li>
          ))}
        </ul>
      </div>
      {removing && (
        <ConfirmDialog
          title={t('Remove {name}?', { name: removing.name })}
          message={t("Every translation into {name} goes too, and people who picked it get the default. This can't be undone.", { name: removing.name })}
          confirmLabel={t("Remove language")}
          busy={busy}
          onConfirm={() => run(() => languageApi.remove(removing.id)).then(() => setRemoving(null))}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  );
}

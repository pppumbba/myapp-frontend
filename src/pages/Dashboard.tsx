import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { metaApi, type Meta, type MetaOption, type MetaType } from '../lib/metaApi';
import { AppTile } from '../components/AppTile';
import { Plus } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { TypePreview, typeLook } from '../components/TypePreview';
import { MetaCard } from './metas/MetaCard';
import { MetaFormModal } from './metas/MetaFormModal';
import { t } from '@/i18n';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return t("Good morning");
  if (h < 18) return t("Good afternoon");
  return t("Good evening");
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [types, setTypes] = useState<MetaType[]>([]);
  const [options, setOptions] = useState<MetaOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The type to start a new meta with, or undefined when the dialog is closed.
  const [creatingType, setCreatingType] = useState<number | null | undefined>(undefined);

  async function load() {
    try {
      const [m, item, o] = await Promise.all([metaApi.list(), metaApi.types(), metaApi.options()]);
      setMetas(m);
      setTypes(item);
      setOptions(o);
    } catch {
      // The home page still works without data; the Metas page shows the error in full.
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const firstName = (user?.name ?? '').split(' ')[0];
  const apps = metas.filter((m) => m.type?.code === 'app');
  const recent = [...metas].reverse().slice(0, 4);

  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-xl bg-brand-section px-5 py-6 text-white sm:px-7 sm:py-7">
        <div className="absolute -top-24 -right-16 size-64 rounded-full bg-brand-500/40 blur-2xl" aria-hidden="true" />
        <div className="absolute -bottom-28 right-40 size-48 rounded-full bg-brand-400/25 blur-2xl" aria-hidden="true" />
        <div className="relative max-w-xl">
          <h1 className="text-display-xs font-semibold">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-1.5 text-md text-brand-200">
            {loaded && metas.length > 0
              ? t('You have {apps} apps and {metas} metas in total.', { apps: apps.length, metas: metas.length })
              : t("Pick a building block below to start your first app.")}
          </p>
        </div>
      </section>

      {apps.length > 0 && (
        <section className="mb-7" aria-labelledby="apps-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="apps-heading" className="text-md font-semibold text-primary">
                {t("Your apps")}
              </h2>
              <p className="text-sm text-tertiary">{t("Open an app to use it the way its users will.")}</p>
            </div>
            <Link to="/apps" className="shrink-0 text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
              {t("See all apps")}
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {apps.slice(0, 6).map((a, i) => (
              <AppTile key={a.id} app={a} index={i} />
            ))}
          </div>
        </section>
      )}

      {isAdmin && (
      <section className="mb-7" aria-labelledby="start-heading">
        <h2 id="start-heading" className="text-md font-semibold text-primary">
          {t("Create something new")}
        </h2>
        <p className="mb-3 text-sm text-tertiary">{t("Each one becomes a screen you can link from an app’s menu.")}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {(types.length ? types : []).map((item) => {
            const look = typeLook(item.code);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCreatingType(item.id)}
                className="rounded-xl bg-primary p-2.5 text-left shadow-xs ring-1 ring-secondary transition duration-100 ease-linear ring-inset outline-focus-ring hover:shadow-md hover:ring-primary focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <div className="rounded-lg p-2" style={{ background: look.tint }}>
                  <TypePreview code={item.code} className="h-11 w-full" />
                </div>
                <span className="mt-2 block px-0.5 text-sm font-semibold text-primary">{item.name}</span>
                {item.description && <span className="mt-0.5 block px-0.5 text-xs text-tertiary line-clamp-2">{item.description}</span>}
              </button>
            );
          })}
        </div>
        {loaded && types.length === 0 && (
          <p className="rounded-xl bg-primary px-5 py-4 text-sm text-tertiary ring-1 ring-secondary ring-inset">
            {t("No meta types yet. Add app, datagrid, form, calendar and tabs to the meta_types table, then reload.")}
          </p>
        )}
      </section>

      )}

      {isAdmin && recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <div className="mb-3 flex items-end justify-between">
            <h2 id="recent-heading" className="text-md font-semibold text-primary">
              {t("Recently added")}
            </h2>
            <Link to="/metas" className="text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
              {t("See all metas")}
            </Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {recent.map((m) => (
              <MetaCard key={m.id} meta={m} />
            ))}
          </div>
        </section>
      )}

      {isAdmin && loaded && metas.length === 0 && types.length > 0 && (
        <div className="text-center">
          <Button size="lg" iconLeading={Plus} onPress={() => setCreatingType(types.find((item) => item.code === 'app')?.id ?? null)}>
            {t("Create your first app")}
          </Button>
        </div>
      )}

      {creatingType !== undefined && (
        <MetaFormModal
          meta={null}
          types={types}
          options={options}
          presetTypeId={creatingType ?? undefined}
          onClose={() => setCreatingType(undefined)}
          onSaved={() => {
            setCreatingType(undefined);
            load();
          }}
        />
      )}
    </>
  );
}

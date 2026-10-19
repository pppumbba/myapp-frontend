import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { metaApi, type Meta, type MetaOption, type MetaType } from '../lib/metaApi';
import { AppShell } from '../components/AppShell';
import { ArrowRight, Plus } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { TypePreview, typeLook } from '../components/TypePreview';
import { MetaCard } from './metas/MetaCard';
import { MetaFormModal } from './metas/MetaFormModal';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [types, setTypes] = useState<MetaType[]>([]);
  const [options, setOptions] = useState<MetaOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The type to start a new meta with, or undefined when the dialog is closed.
  const [creatingType, setCreatingType] = useState<number | null | undefined>(undefined);

  async function load() {
    try {
      const [m, t, o] = await Promise.all([metaApi.list(), metaApi.types(), metaApi.options()]);
      setMetas(m);
      setTypes(t);
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
    <AppShell>
      <section className="relative mb-10 overflow-hidden rounded-2xl bg-brand-section px-6 py-10 text-white sm:px-10 sm:py-12">
        <div className="absolute -top-24 -right-16 size-72 rounded-full bg-brand-500/40 blur-2xl" aria-hidden="true" />
        <div className="absolute -bottom-28 right-40 size-56 rounded-full bg-brand-400/25 blur-2xl" aria-hidden="true" />
        <div className="relative max-w-xl">
          <h1 className="text-display-sm font-semibold sm:text-display-md">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-3 text-lg text-brand-200">
            {loaded && metas.length > 0
              ? `You have ${apps.length} app${apps.length === 1 ? '' : 's'} and ${metas.length} metas in total.`
              : 'Pick a building block below to start your first app.'}
          </p>
        </div>
      </section>

      {apps.length > 0 && (
        <section className="mb-10" aria-labelledby="apps-heading">
          <h2 id="apps-heading" className="text-lg font-semibold text-primary">
            Your apps
          </h2>
          <p className="mt-1 mb-5 text-sm text-tertiary">Open an app to use it the way its users will.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((a) => (
              <div key={a.id} className="flex items-center gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-solid text-md font-semibold text-white" aria-hidden="true">
                  {(a.label_name || a.name).charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-md font-semibold text-primary">{a.label_name || a.name}</p>
                  {a.description && <p className="truncate text-sm text-tertiary">{a.description}</p>}
                </div>
                <Button color="secondary" size="sm" iconTrailing={ArrowRight} onPress={() => navigate(`/run/${a.id}`)}>
                  Open
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10" aria-labelledby="start-heading">
        <h2 id="start-heading" className="text-lg font-semibold text-primary">
          Create something new
        </h2>
        <p className="mt-1 mb-5 text-sm text-tertiary">Each one becomes a screen you can link from an app’s menu.</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {(types.length ? types : []).map((t) => {
            const look = typeLook(t.code);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setCreatingType(t.id)}
                className="rounded-xl bg-primary p-3 text-left shadow-xs ring-1 ring-secondary transition duration-100 ease-linear ring-inset outline-focus-ring hover:shadow-md hover:ring-primary focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <div className="rounded-lg p-2.5" style={{ background: look.tint }}>
                  <TypePreview code={t.code} className="h-14 w-full" />
                </div>
                <span className="mt-3 block px-1 text-sm font-semibold text-primary">{t.name}</span>
                {t.description && <span className="mt-0.5 block px-1 text-xs text-tertiary line-clamp-2">{t.description}</span>}
              </button>
            );
          })}
        </div>
        {loaded && types.length === 0 && (
          <p className="rounded-xl bg-primary px-5 py-4 text-sm text-tertiary ring-1 ring-secondary ring-inset">
            No meta types yet. Add app, datagrid, form, calendar and tabs to the meta_types table, then reload.
          </p>
        )}
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <div className="mb-5 flex items-end justify-between">
            <h2 id="recent-heading" className="text-lg font-semibold text-primary">
              Recently added
            </h2>
            <Link to="/metas" className="text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
              See all metas
            </Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5">
            {recent.map((m) => (
              <MetaCard key={m.id} meta={m} />
            ))}
          </div>
        </section>
      )}

      {loaded && metas.length === 0 && types.length > 0 && (
        <div className="text-center">
          <Button size="lg" iconLeading={Plus} onPress={() => setCreatingType(types.find((t) => t.code === 'app')?.id ?? null)}>
            Create your first app
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
    </AppShell>
  );
}

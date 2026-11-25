import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { metaApi, type Meta, type MetaOption, type MetaType } from '../lib/metaApi';
import { AppTile } from '../components/AppTile';
import { HomeLayout } from '../components/HomeHeader';
import { Plus } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { MetaFormModal } from './metas/MetaFormModal';
import { t } from '@/i18n';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return t('Good morning');
  if (h < 18) return t('Good afternoon');
  return t('Good evening');
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [types, setTypes] = useState<MetaType[]>([]);
  const [options, setOptions] = useState<MetaOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The type to start a new meta with, or undefined when the dialog is closed.
  const [creatingType, setCreatingType] = useState<number | null | undefined>(undefined);
  const navigate = useNavigate();

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

  // Home has no sidebar: its own bar across the top, then the page.
  return (
    <HomeLayout apps={apps}>
      <section className="relative mb-6 overflow-hidden rounded-xl bg-brand-section px-5 py-6 text-white sm:px-7 sm:py-7">
        <div className="relative max-w-xl">
          <h1 className="text-display-xs font-semibold">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-1.5 text-md text-brand-200">{loaded && apps.length > 0 ? t('You have {count} apps.', { count: apps.length }) : t('You have no apps yet.')}</p>
        </div>
      </section>

      {apps.length > 0 && (
        <section className="mb-7" aria-labelledby="apps-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="apps-heading" className="text-md font-semibold text-primary">
                {t('Your apps')}
              </h2>
              <p className="text-sm text-tertiary">{t('Open an app to use it the way its users will.')}</p>
            </div>
            <Link to="/apps" className="shrink-0 text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
              {t('See all apps')}
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {apps.slice(0, 6).map((a) => (
              <AppTile key={a.id} app={a} />
            ))}
          </div>
        </section>
      )}

      {isAdmin && loaded && apps.length === 0 && types.length > 0 && (
        <div className="text-center">
          <Button size="lg" iconLeading={Plus} onPress={() => setCreatingType(types.find((item) => item.code === 'app')?.id ?? null)}>
            {t('Create your first app')}
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
          // A new app opens on its own page, to be built there.
          onSaved={(saved) => navigate(`/metas/${saved.id}`)}
        />
      )}
    </HomeLayout>
  );
}

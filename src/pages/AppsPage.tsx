import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from '@untitledui/icons';
import { Link } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { metaApi, type Meta } from '../lib/metaApi';
import { PageHeader } from '../components/AppShell';
import { AppTile } from '../components/AppTile';
import { HomeLayout } from '../components/HomeHeader';
import { Alert } from '../components/ui';
import { t } from '@/i18n';

/** Only the app metas: open one to use it. */
export default function AppsPage() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    metaApi
      .list()
      .then(setMetas)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('Apps could not be loaded. Check that the API is running.')))
      .finally(() => setLoading(false));
  }, []);

  const apps = useMemo(() => metas.filter((m) => m.type?.code === 'app'), [metas]);

  // Like home: no sidebar, the top bar (whose search finds apps) over the page.
  return (
    <HomeLayout apps={apps}>
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-tertiary hover:text-tertiary_hover">
        <ArrowLeft className="size-5 text-fg-quaternary" />
        {t('Home')}
      </Link>
      <PageHeader title={t('Apps')} subtitle={t('Each app has a menu that opens its screens. Open one to use it the way its users will.')} />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label={t('Loading apps')}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
          ))}
        </div>
      ) : apps.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {apps.map((a) => (
            <AppTile key={a.id} app={a} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-primary px-6 py-10 text-center shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-semibold text-primary">{t('No apps yet')}</p>
        </div>
      )}
    </HomeLayout>
  );
}

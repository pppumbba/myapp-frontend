import { useEffect, useMemo, useState } from 'react';
import { Plus, SearchLg } from '@untitledui/icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaType } from '../lib/metaApi';
import { PageHeader } from '../components/AppShell';
import { AppTile } from '../components/AppTile';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { MetaFormModal } from './metas/MetaFormModal';
import { t } from '@/i18n';

/** Only the app metas: open one to use it, or jump to the builder to change its menu. */
export default function AppsPage() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [types, setTypes] = useState<MetaType[]>([]);
  const [options, setOptions] = useState<MetaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const { isAdmin } = useAuth();

  async function load() {
    setError(null);
    try {
      const [m, item, o] = await Promise.all([metaApi.list(), metaApi.types(), metaApi.options()]);
      setMetas(m);
      setTypes(item);
      setOptions(o);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Apps could not be loaded. Check that the API is running."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const apps = useMemo(() => metas.filter((m) => m.type?.code === 'app'), [metas]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => !q || (a.label_name || a.name).toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q));
  }, [apps, query]);
  const appTypeId = types.find((item) => item.code === 'app')?.id;

  return (
    <>
      <PageHeader
        title={t("Apps")}
        subtitle={t("Each app has a menu that opens its screens. Open one to use it the way its users will.")}
        actions={
          isAdmin && (
          <Button size="sm" iconLeading={Plus} onPress={() => setCreating(true)} isDisabled={!appTypeId}>
            {t("New app")}
          </Button>
          )
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {apps.length > 3 && (
        <Input
          aria-label={t("Search apps")}
          type="search"
          size="sm"
          icon={SearchLg}
          value={query}
          onChange={setQuery}
          placeholder={t("Search apps")}
          className="mb-4 sm:w-72"
        />
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("Loading apps")}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
          ))}
        </div>
      ) : visible.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((a) => (
            <AppTile key={a.id} app={a} index={apps.indexOf(a)} showEdit={isAdmin} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-primary px-6 py-10 text-center shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-sm font-semibold text-primary">{apps.length ? t("No apps match that search.") : t("No apps yet")}</p>
          <p className="mt-1 text-sm text-tertiary">
            {apps.length ? t("Try another name.") : t("Create an app, then link grids, forms and calendars from its menu.")}
          </p>
        </div>
      )}

      {creating && appTypeId && (
        <MetaFormModal
          meta={null}
          types={types}
          options={options}
          presetTypeId={appTypeId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </>
  );
}

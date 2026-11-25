import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LayoutAlt01, LinkExternal01 } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { metaApi, type Meta, type MetaOption } from '../lib/metaApi';
import { LogoMark } from '../components/AppShell';
import { Alert } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { PageDesigner } from './metas/PageDesigner';
import { t } from '@/i18n';

/** Metas the page builder designs: pages and composite widgets' templates. */
const DESIGNED = ['page', 'widget_template'];

/**
 * The page builder full screen, like the studio and the query builder: a title bar (back to the
 * meta, the open page, Meta settings), then every page or the designer filling the rest. The same
 * designer shows on a page meta's own page, which opens this with "Open in page builder".
 */
export default function PageBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pages, setPages] = useState<Meta[] | null>(null);
  const [options, setOptions] = useState<MetaOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const current = pages?.find((p) => String(p.id) === id) ?? null;

  useEffect(() => {
    Promise.all([metaApi.list(), metaApi.options()]).then(
      ([metas, o]) => {
        setPages(metas.filter((m) => DESIGNED.includes(m.type?.code ?? '')).sort((a, b) => a.name.localeCompare(b.name)));
        setOptions(o);
      },
      (err) => setError(err instanceof ApiError ? err.message : t('The pages could not be loaded.')),
    );
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-primary text-primary">
      {/* Title bar, as in the studio */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-secondary px-3">
        <Link to={current ? `/metas/${current.id}` : '/metas'} aria-label={t('Back to metas')} className="flex items-center rounded-md outline-focus-ring focus-visible:outline-2">
          <LogoMark />
        </Link>
        <span className="text-sm font-semibold text-primary">{t('Page builder')}</span>
        {current && <span className="truncate text-sm text-tertiary">· {current.name}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {pages && pages.length > 0 && (
            <select
              aria-label={t('Open a page')}
              className="rounded-md bg-primary px-2.5 py-1 text-sm text-primary ring-1 ring-primary ring-inset outline-none focus:ring-2 focus:ring-brand"
              value={current?.id ?? ''}
              onChange={(e) => navigate(e.target.value ? `/page-builder/${e.target.value}` : '/page-builder')}
            >
              <option value="">{t('All pages')}</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {current && (
            <Button size="xs" color="secondary" iconLeading={LinkExternal01} href={`/metas/${current.id}`}>
              {t('Meta settings')}
            </Button>
          )}
        </div>
      </header>

      <main className={current ? 'min-h-0 flex-1 overflow-auto' : 'min-h-0 flex-1 overflow-auto p-4'}>
        {error && (
          <div className="mb-5">
            <Alert>{error}</Alert>
          </div>
        )}
        {!pages ? (
          !error && <div className="mx-auto h-96 max-w-5xl animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" aria-busy="true" />
        ) : current ? (
          <PageDesigner key={current.id} meta={current} options={options} full />
        ) : id ? (
          <Alert>{t("There's no page meta {id}. Pick one from the list.", { id })}</Alert>
        ) : pages.length === 0 ? (
          <div className="mx-auto max-w-5xl rounded-xl bg-primary p-8 text-center ring-1 ring-secondary">
            <LayoutAlt01 className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-primary">{t('No pages yet')}</p>
            <p className="mt-1 text-sm text-tertiary">{t('Make a page meta on the Metas page, then build it here.')}</p>
          </div>
        ) : (
          <ul className="mx-auto max-w-5xl divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            {pages.map((p) => (
              <li key={p.id}>
                <Link to={`/page-builder/${p.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-primary_hover">
                  <LayoutAlt01 className="size-5 shrink-0 text-fg-brand-secondary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-primary">{p.name}</p>
                    {p.description && <p className="truncate text-sm text-tertiary">{p.description}</p>}
                  </div>
                  <Badge type="color" size="sm" color="gray">
                    {p.type?.name ?? p.code}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

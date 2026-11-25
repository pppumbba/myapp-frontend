import { useEffect, useState } from 'react';
import { LinkExternal01 } from '@untitledui/icons';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../lib/api';
import { publicPath } from '../../lib/customerApi';
import { siteDeskApi } from '../../lib/siteApi';
import { PageHeader } from '../../components/AppShell';
import { Alert } from '../../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { DeskCard } from './SiteDeskParts';
import { t } from '@/i18n';

type Domains = Awaited<ReturnType<typeof siteDeskApi.domains>>;

/**
 * The addresses every website answers at, and the sites with none (reached at /site/{code}).
 * Domains are added and made primary on each website's Domains tab.
 */
export default function SiteDomainsPage() {
  const { customer } = useAuth();
  const [data, setData] = useState<Domains | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    siteDeskApi.domains().then(setData, (err) => setError(err instanceof ApiError ? err.message : t('The domains could not be loaded.')));
  }, []);

  return (
    <>
      <PageHeader title={t('Domains')} subtitle={t("The addresses every website answers at. Point a domain's DNS at this server, then add it on the website's Domains tab.")} />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}
      {!data ? (
        !error && <div className="h-48 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" aria-busy="true" />
      ) : (
        <div className="space-y-6">
          <DeskCard title={t('Own domains')}>
            {data.domains.length === 0 ? (
              <p className="px-4 py-6 text-sm text-tertiary">{t('No website has its own domain yet.')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-tertiary">
                      <th className="px-4 py-2 font-medium">{t('Domain')}</th>
                      <th className="px-4 py-2 font-medium">{t('Website')}</th>
                      <th className="hidden px-4 py-2 font-medium sm:table-cell">{t('Added')}</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary">
                    {data.domains.map((d) => (
                      <tr key={d.id}>
                        <td className="px-4 py-2.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <a href={`https://${d.host}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-primary hover:underline">
                              {d.host}
                              <LinkExternal01 className="size-3.5 text-fg-quaternary" aria-hidden="true" />
                            </a>
                            {d.is_primary && (
                              <Badge type="pill-color" size="sm" color="brand">
                                {t('Primary')}
                              </Badge>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link to={`/sites/${d.site.id}`} className="font-medium text-secondary hover:underline">
                            {d.site.name}
                          </Link>
                          {!d.site.is_active && <span className="ml-2 text-xs text-tertiary">{t('switched off')}</span>}
                        </td>
                        <td className="hidden px-4 py-2.5 text-tertiary sm:table-cell">{d.created_at ? new Date(d.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Link to={`/sites/${d.site.id}?tab=domains`} className="text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
                            {t('Manage')}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DeskCard>

          {data.without.length > 0 && (
            <DeskCard title={t('Without a domain')}>
              <ul className="divide-y divide-secondary">
                {data.without.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                    <Link to={`/sites/${s.id}`} className="font-medium text-primary hover:underline">
                      {s.name}
                    </Link>
                    <span className="min-w-0 flex-1 truncate font-mono text-tertiary">{publicPath(customer, `/site/${s.code}`)}</span>
                    <Link to={`/sites/${s.id}?tab=domains`} className="font-semibold text-brand-secondary hover:text-brand-secondary_hover">
                      {t('Add a domain')}
                    </Link>
                  </li>
                ))}
              </ul>
            </DeskCard>
          )}
        </div>
      )}
    </>
  );
}

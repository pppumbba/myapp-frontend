import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { siteDeskApi, type DeskVisits } from '../../lib/siteApi';
import { PageHeader } from '../../components/AppShell';
import { Alert } from '../../components/ui';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { changeText, DailyBars } from './SiteCharts';
import { DeskCard } from './SiteDeskParts';
import { t } from '@/i18n';

/** Page views across every website: by day, by site, and the busiest pages. */
export default function SiteVisitsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DeskVisits | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    siteDeskApi.visits(days).then(setData, (err) => setError(err instanceof ApiError ? err.message : t('The visits could not be loaded.')));
  }, [days]);

  const change = data ? changeText(data.total, data.previous, data.days) : null;

  return (
    <>
      <PageHeader
        title={t('Visits')}
        subtitle={t('Page views on every website. Bots are not counted.')}
        actions={
          <ButtonGroup size="sm" aria-label={t('Period')} selectionMode="single" disallowEmptySelection selectedKeys={[String(days)]} onSelectionChange={(k) => setDays(Number([...k][0]) || 30)}>
            <ButtonGroupItem id="7">{t('7 days')}</ButtonGroupItem>
            <ButtonGroupItem id="30">{t('30 days')}</ButtonGroupItem>
            <ButtonGroupItem id="90">{t('90 days')}</ButtonGroupItem>
          </ButtonGroup>
        }
      />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}
      {!data ? (
        !error && <div className="h-72 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" aria-busy="true" />
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
            <p className="text-sm font-medium text-tertiary">{t('Page views, last {n} days', { n: data.days })}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-display-sm font-semibold text-primary tabular-nums">
              {data.total.toLocaleString()}
              {change && <span className="text-sm font-medium text-tertiary">{change}</span>}
            </p>
            <div className="mt-5">
              <DailyBars daily={data.daily} />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <DeskCard title={t('By website')}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-tertiary">
                    <th className="px-4 py-2 font-medium">{t('Website')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Views')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Before')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary">
                  {data.sites.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2">
                        <Link to={`/sites/${s.id}?tab=visits`} className="font-medium text-primary hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right text-primary tabular-nums">{s.views.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-tertiary tabular-nums">{s.previous.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DeskCard>
            <DeskCard title={t('Busiest pages')}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-tertiary">
                    <th className="px-4 py-2 font-medium">{t('Address')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Views')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary">
                  {data.pages.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-tertiary">
                        {t('No visits in this period.')}
                      </td>
                    </tr>
                  ) : (
                    data.pages.map((p) => (
                      <tr key={`${p.site_id}${p.path}`}>
                        <td className="px-4 py-2">
                          <span className="font-mono text-primary">{p.path}</span>
                          <span className="text-tertiary"> · {p.site}</span>
                        </td>
                        <td className="px-4 py-2 text-right text-primary tabular-nums">{p.views.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </DeskCard>
          </div>
        </div>
      )}
    </>
  );
}

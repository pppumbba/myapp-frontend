import { useEffect, useState } from 'react';
import { Globe01 } from '@untitledui/icons';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { siteDeskApi, type DeskOverview } from '../../lib/siteApi';
import { PageHeader } from '../../components/AppShell';
import { CountUp } from '../../components/motion';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { changeText } from './SiteCharts';
import { DeskCard, DeskStat, ReleaseLine } from './SiteDeskParts';
import { t } from '@/i18n';

const count = (n: number) => <CountUp value={n} format={(v) => Math.round(v).toLocaleString()} />;

/** Website management's first page: every site at a glance, what is about to go out and what went out. */
export default function SitesOverviewPage() {
  const [data, setData] = useState<DeskOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    siteDeskApi.overview().then(setData, (err) => setError(err instanceof ApiError ? err.message : t('The overview could not be loaded.')));
  }, []);

  const top = Math.max(1, ...(data?.top_sites.map((s) => s.views) ?? [1]));

  return (
    <>
      <PageHeader
        title={t('Overview')}
        subtitle={t('Every website at a glance: what is live, what is about to go out, and who visits.')}
        actions={
          <Button size="sm" color="secondary" iconLeading={Globe01} href="/sites">
            {t('All websites')}
          </Button>
        }
      />
      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}
      {!data ? (
        !error && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
            ))}
          </div>
        )
      ) : data.sites === 0 ? (
        <div className="rounded-xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary">
          <Globe01 className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
          <p className="mt-3 text-md font-semibold text-primary">{t('No websites yet')}</p>
          <p className="mt-1 text-sm text-tertiary">{t('Make one on the Websites page; it starts with an empty home page to design.')}</p>
          <Button size="sm" className="mt-4" href="/sites">
            {t('Go to Websites')}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <DeskStat to="/sites" label={t('Websites')} value={count(data.sites)} hint={t('{n} switched on', { n: data.active })} />
            <DeskStat to="/sites" label={t('Pages live')} value={count(data.live_pages)} hint={t('of {n} pages', { n: data.pages })} />
            <DeskStat to="/sites/releases" label={t('Scheduled')} value={count(data.scheduled)} hint={t('releases to go out')} />
            <DeskStat to="/sites/domains" label={t('Domains')} value={count(data.domains)} hint={t('own addresses')} />
            <DeskStat
              to="/sites/visits"
              label={t('Page views')}
              value={count(data.views.total)}
              hint={changeText(data.views.total, data.views.previous, data.views.days) ?? t('last {n} days', { n: data.views.days })}
            />
            <DeskStat to="/sites/messages" label={t('Form messages')} value={count(data.messages_30_days)} hint={t('last {n} days', { n: 30 })} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <DeskCard title={t('Coming up')} link={{ to: '/sites/releases', label: t('Schedule') }}>
              {data.upcoming.length === 0 ? (
                <p className="px-4 py-6 text-sm text-tertiary">{t('Nothing scheduled. Pick a time when you publish a page to have it go out later.')}</p>
              ) : (
                <ul className="divide-y divide-secondary">
                  {data.upcoming.map((r) => (
                    <ReleaseLine key={r.id} release={r} />
                  ))}
                </ul>
              )}
            </DeskCard>
            <DeskCard title={t('Went out lately')} link={{ to: '/sites/releases', label: t('See all') }}>
              {data.recent.length === 0 ? (
                <p className="px-4 py-6 text-sm text-tertiary">{t('Nothing published yet.')}</p>
              ) : (
                <ul className="divide-y divide-secondary">
                  {data.recent.map((r) => (
                    <ReleaseLine key={r.id} release={r} />
                  ))}
                </ul>
              )}
            </DeskCard>
          </div>

          <DeskCard title={t('Busiest websites, last {n} days', { n: 30 })} link={{ to: '/sites/visits', label: t('Visits') }}>
            <ul className="space-y-3 px-4 py-4">
              {data.top_sites.map((s) => (
                <li key={s.id} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm">
                  <Link to={`/sites/${s.id}?tab=visits`} className="truncate font-medium text-primary hover:underline">
                    {s.name}
                  </Link>
                  <span className="h-2 rounded-full bg-secondary" aria-hidden="true">
                    <span className="block h-2 rounded-full bg-brand-solid" style={{ width: `${(s.views / top) * 100}%` }} />
                  </span>
                  <span className="text-right text-primary tabular-nums">{s.views.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </DeskCard>
        </div>
      )}
    </>
  );
}

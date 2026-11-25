import { useCallback, useEffect, useRef, useState } from 'react';
import { ClockRewind, SearchLg, XClose } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { siteApi, siteDeskApi, type DeskRelease, type SiteSummary } from '../../lib/siteApi';
import { PageHeader } from '../../components/AppShell';
import { ConfirmDialog } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { LoadMore } from '../metas/MetaFilters';
import { ReleaseLine } from './SiteDeskParts';
import { t } from '@/i18n';

type Status = 'all' | 'scheduled' | 'history';

/**
 * Every site's releases: what is about to go out (soonest first) and what went out (latest
 * first). A scheduled one can be cancelled; an older one published again.
 */
export default function SiteReleasesPage() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [status, setStatus] = useState<Status>('all');
  const [siteId, setSiteId] = useState<number | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<DeskRelease[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ scheduled: 0, history: 0 });
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirm, setConfirm] = useState<{ release: DeskRelease; kind: 'cancel' | 'restore' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadNo = useRef(0);

  useEffect(() => {
    siteApi.list().then(setSites, () => undefined);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const load = useCallback(
    async (next: number) => {
      const no = ++loadNo.current;
      if (next > 1) setLoadingMore(true);
      try {
        const res = await siteDeskApi.releases({ status, site_id: siteId, q: search, page: next });
        if (no !== loadNo.current) return;
        setRows((list) => (next === 1 ? res.data : [...(list ?? []), ...res.data]));
        setTotal(res.total);
        setCounts(res.counts);
        setPage(next);
        setError(null);
      } catch (err) {
        if (no === loadNo.current) setError(err instanceof ApiError ? err.message : t('The releases could not be loaded.'));
      } finally {
        if (no === loadNo.current) setLoadingMore(false);
      }
    },
    [status, siteId, search],
  );
  useEffect(() => {
    void load(1);
  }, [load]);
  const more = useCallback(() => {
    if (!loadingMore && (rows?.length ?? 0) < total) void load(page + 1);
  }, [loadingMore, rows, total, load, page]);

  async function act() {
    if (!confirm) return;
    setBusy(true);
    try {
      await (confirm.kind === 'cancel' ? siteApi.cancel(confirm.release.id) : siteApi.restore(confirm.release.id));
      setConfirm(null);
      await load(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('That did not work.'));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  const actions = (r: DeskRelease) =>
    r.scheduled ? (
      <Button size="sm" color="secondary" iconLeading={XClose} onPress={() => setConfirm({ release: r, kind: 'cancel' })}>
        {t('Cancel')}
      </Button>
    ) : !r.current && !r.taken_down && r.param_id ? (
      <Button size="sm" color="secondary" iconLeading={ClockRewind} onPress={() => setConfirm({ release: r, kind: 'restore' })}>
        {t('Publish again')}
      </Button>
    ) : null;

  return (
    <>
      <PageHeader title={t('Releases & schedule')} subtitle={t('What went out on every website and what is about to. Publish a page from its website to add a release.')} />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-col gap-3 bg-secondary px-4 py-3 sm:-mx-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <ButtonGroup size="sm" aria-label={t('Show')} selectionMode="single" disallowEmptySelection selectedKeys={[status]} onSelectionChange={(k) => setStatus(([...k][0] as Status) ?? 'all')}>
          <ButtonGroupItem id="all">{t('All')}</ButtonGroupItem>
          <ButtonGroupItem id="scheduled">{t('Scheduled {n}', { n: counts.scheduled })}</ButtonGroupItem>
          <ButtonGroupItem id="history">{t('Went out {n}', { n: counts.history })}</ButtonGroupItem>
        </ButtonGroup>
        <div className="flex flex-wrap items-center gap-3">
          {sites.length > 1 && (
            <NativeSelect
              aria-label={t('Website')}
              size="sm"
              className="w-48"
              value={siteId ? String(siteId) : ''}
              onChange={(e) => setSiteId(e.target.value ? Number(e.target.value) : undefined)}
              options={[{ label: t('All websites'), value: '' }, ...sites.map((s) => ({ label: s.name, value: String(s.id) }))]}
            />
          )}
          <Input
            aria-label={t('Search releases')}
            type="search"
            size="sm"
            icon={SearchLg}
            value={query}
            onChange={setQuery}
            placeholder={t('Address or note')}
            className="flex-1 lg:w-64 lg:flex-none"
          />
        </div>
      </div>

      {!rows ? (
        !error && <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" aria-busy="true" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-primary px-6 py-12 text-center shadow-xs ring-1 ring-secondary">
          <p className="text-md font-semibold text-primary">{status === 'scheduled' ? t('Nothing scheduled') : t('No releases match')}</p>
          <p className="mt-1 text-sm text-tertiary">{status === 'scheduled' ? t('Pick a time when you publish a page to have it go out later.') : t('Try another website or search.')}</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            {rows.map((r) => (
              <ReleaseLine key={r.id} release={r} actions={actions(r)} />
            ))}
          </ul>
          <LoadMore shown={rows.length} total={total} onMore={more} loading={loadingMore} />
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'cancel' ? t('Cancel this release?') : t('Publish this again?')}
          message={
            confirm.kind === 'cancel'
              ? t('{path} on {site} will not go out. What visitors see now stays.', { path: confirm.release.path ?? '', site: confirm.release.site.name })
              : t('{path} on {site} goes back to how it was in this release, now.', { path: confirm.release.path ?? '', site: confirm.release.site.name })
          }
          confirmLabel={confirm.kind === 'cancel' ? t('Cancel release') : t('Publish again')}
          busy={busy}
          onConfirm={act}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

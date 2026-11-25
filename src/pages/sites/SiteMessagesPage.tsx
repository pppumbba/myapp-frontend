import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail01 } from '@untitledui/icons';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { siteApi, siteDeskApi, type DeskMessage, type SiteSummary } from '../../lib/siteApi';
import { PageHeader } from '../../components/AppShell';
import { Alert } from '../../components/ui';
import { NativeSelect } from '@/components/base/select/select-native';
import { ago, LoadMore } from '../metas/MetaFilters';
import { t } from '@/i18n';

type FormInfo = { id: number; name: string; sites: string[]; is_public: boolean; dated: boolean };

/** What visitors sent through every website's forms, newest first, 20 at a time. */
export default function SiteMessagesPage() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteId, setSiteId] = useState<number | undefined>(undefined);
  const [formId, setFormId] = useState<number | undefined>(undefined);
  const [forms, setForms] = useState<FormInfo[]>([]);
  const [rows, setRows] = useState<DeskMessage[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadNo = useRef(0);

  useEffect(() => {
    siteApi.list().then(setSites, () => undefined);
  }, []);

  const load = useCallback(
    async (next: number) => {
      const no = ++loadNo.current;
      if (next > 1) setLoadingMore(true);
      try {
        const res = await siteDeskApi.messages({ site_id: siteId, form_id: formId, page: next });
        if (no !== loadNo.current) return;
        setRows((list) => (next === 1 ? res.data : [...(list ?? []), ...res.data]));
        setTotal(res.total);
        setForms(res.forms);
        setPage(next);
        setError(null);
      } catch (err) {
        if (no === loadNo.current) setError(err instanceof ApiError ? err.message : t('The messages could not be loaded.'));
      } finally {
        if (no === loadNo.current) setLoadingMore(false);
      }
    },
    [siteId, formId],
  );
  useEffect(() => {
    void load(1);
  }, [load]);
  const more = useCallback(() => {
    if (!loadingMore && (rows?.length ?? 0) < total) void load(page + 1);
  }, [loadingMore, rows, total, load, page]);

  const undated = forms.filter((f) => !f.dated);
  // Forms visitors can send; the others on the pages are the app's own (signed-in) screens.
  const open = forms.filter((f) => f.is_public);
  const closed = forms.filter((f) => !f.is_public);
  const undatedOpen = undated.filter((f) => f.is_public);

  return (
    <>
      <PageHeader title={t('Form messages')} subtitle={t("What visitors sent through the websites' forms, newest first.")} />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {sites.length > 1 && (
          <NativeSelect
            aria-label={t('Website')}
            size="sm"
            className="w-48"
            value={siteId ? String(siteId) : ''}
            onChange={(e) => {
              setSiteId(e.target.value ? Number(e.target.value) : undefined);
              setFormId(undefined);
            }}
            options={[{ label: t('All websites'), value: '' }, ...sites.map((s) => ({ label: s.name, value: String(s.id) }))]}
          />
        )}
        {open.length > 1 && (
          <NativeSelect
            aria-label={t('Form')}
            size="sm"
            className="w-56"
            value={formId ? String(formId) : ''}
            onChange={(e) => setFormId(e.target.value ? Number(e.target.value) : undefined)}
            options={[{ label: t('All forms'), value: '' }, ...open.map((f) => ({ label: f.name, value: String(f.id) }))]}
          />
        )}
      </div>
      {closed.length > 0 && (
        <div className="mb-4">
          <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-sm text-tertiary ring-1 ring-secondary ring-inset">
            {t('{n} other forms on the pages are not public, so visitors cannot send them and they are not listed: {names}.', {
              n: closed.length,
              names:
                closed
                  .slice(0, 3)
                  .map((f) => f.name)
                  .join(', ') + (closed.length > 3 ? '…' : ''),
            })}
          </p>
        </div>
      )}

      {!rows ? (
        !error && <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" aria-busy="true" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary">
          <Mail01 className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
          <p className="mt-3 text-md font-semibold text-primary">{open.length ? t('No messages yet') : t('No forms on the websites')}</p>
          <p className="mt-1 text-sm text-tertiary">
            {open.length ? t('What visitors send through the forms shows here.') : t('Place a public form on a page, or open one from a button, and what visitors send shows here.')}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((m, i) => (
              <li key={`${m.form.id}-${m.record_id ?? i}`} className="rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm">
                    <Link to={`/metas/${m.form.id}`} className="font-semibold text-primary hover:underline">
                      {m.form.name}
                    </Link>
                    <span className="text-tertiary"> · {m.sites.join(', ')}</span>
                  </p>
                  <time dateTime={m.created_at} title={new Date(m.created_at).toLocaleString()} className="text-sm text-tertiary">
                    {ago(m.created_at)}
                  </time>
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {m.fields.map((f) => (
                    <div key={f.label} className="min-w-0">
                      <dt className="text-xs text-tertiary">{f.label}</dt>
                      <dd className="break-words whitespace-pre-line text-primary">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <LoadMore shown={rows.length} total={total} onMore={more} loading={loadingMore} />
        </>
      )}
      {undatedOpen.length > 0 && <p className="mt-4 text-xs text-tertiary">{t('Not listed (their table keeps no date): {names}.', { names: undatedOpen.map((f) => f.name).join(', ') })}</p>}
    </>
  );
}

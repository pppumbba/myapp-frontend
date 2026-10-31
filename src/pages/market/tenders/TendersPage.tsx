import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell01, BellOff01, FileSearch02, Plus, SearchLg } from '@untitledui/icons';
import { PageHeader } from '../../../components/AppShell';
import { Alert } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import type { Page } from '../../../lib/marketApi';
import { tenderApi, type Category, type TenderSummary, type TenderType } from '../../../lib/tenderApi';
import { PaginationCardMinimal } from '@/components/application/pagination/pagination';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { Pulse } from '../parts';
import { closesIn, typeLabel } from './tenderLabels';
import { t } from '@/i18n';

/** Open tenders anyone signed in can bid on, with a search, filters and category follows. */
export default function TendersPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TenderType | ''>('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<TenderSummary> | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setFetching(true);
    return tenderApi
      .list({ q: search, type, category_id: categoryId }, page)
      .then(setResult, (err) => setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.')))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    tenderApi.categories().then(setCategories, () => setCategories([]));
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, type, categoryId]);

  const category = categories.find((c) => c.id === categoryId);
  const toggleFollow = () => {
    if (!category) return;
    const on = !category.followed;
    tenderApi.follow(category.id, on).then(
      () => setCategories(categories.map((c) => (c.id === category.id ? { ...c, followed: on } : c))),
      (err) => setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.')),
    );
  };

  return (
    <>
      <PageHeader
        title={t('Tenders')}
        subtitle={t('Open tenders you can bid on, as yourself or for your companies.')}
        actions={
          <Button size="sm" iconLeading={Plus} onPress={() => navigate('/market/tenders/new')}>
            {t('Post a tender')}
          </Button>
        }
      />
      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        <Input aria-label={t('Search')} placeholder={t('Search title, code or description')} icon={SearchLg} value={q} onChange={setQ} wrapperClassName="min-w-56 flex-1" />
        <NativeSelect
          aria-label={t('Type')}
          className="w-40"
          value={type}
          onChange={(e) => {
            setPage(1);
            setType(e.target.value as TenderType | '');
          }}
          options={[{ value: '', label: t('All types') }, ...(['goods', 'services', 'works'] as const).map((k) => ({ value: k, label: typeLabel(k) }))]}
        />
        <NativeSelect
          aria-label={t('Category')}
          className="w-48"
          value={categoryId ? String(categoryId) : ''}
          onChange={(e) => {
            setPage(1);
            setCategoryId(e.target.value ? Number(e.target.value) : null);
          }}
          options={[{ value: '', label: t('All categories') }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
        />
        {category && (
          <Button size="sm" color="secondary" iconLeading={category.followed ? BellOff01 : Bell01} onPress={toggleFollow}>
            {category.followed ? t('Stop following') : t('Follow this category')}
          </Button>
        )}
      </form>
      {error && <Alert>{error}</Alert>}
      {!result ? (
        !error && <Pulse className="h-48" />
      ) : (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {result.data.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileSearch02 className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
              <p className="mt-2 text-sm text-tertiary">{search || type || categoryId ? t('No open tender matches.') : t('No open tenders right now.')}</p>
            </div>
          ) : (
            <ul className={`divide-y divide-secondary transition-opacity duration-150 ${fetching ? 'opacity-50' : ''}`} aria-busy={fetching}>
              {result.data.map((tender) => (
                <li key={tender.id}>
                  <Link to={`/market/tenders/${tender.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-primary_hover sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-primary">
                        {tender.title} <span className="font-normal text-tertiary">· {tender.code}</span>
                      </p>
                      <p className="truncate text-sm text-tertiary">
                        {tender.organizer.name ?? '—'} · {typeLabel(tender.type)}
                        {tender.category && ` · ${tender.category}`} · {t('{n} items', { n: tender.items_count })}
                      </p>
                    </div>
                    <p className="text-sm text-tertiary">{tender.visibility === 'sealed' ? t('Sealed bids') : t('Open bids')}</p>
                    <p className="text-sm font-medium text-primary">{t('Closes {when}', { when: closesIn(tender.closes_at) })}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <PaginationCardMinimal
            page={result.current_page}
            total={Math.max(1, result.last_page)}
            onPageChange={(p) => setPage(Math.max(1, p))}
            onRefresh={() => void load()}
            refreshing={fetching}
          />
        </div>
      )}
    </>
  );
}

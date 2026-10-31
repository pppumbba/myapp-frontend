import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileSearch02, Plus } from '@untitledui/icons';
import { PageHeader } from '../../../components/AppShell';
import { Alert } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import type { Page } from '../../../lib/marketApi';
import { tenderApi, type TenderSummary } from '../../../lib/tenderApi';
import { PaginationCardMinimal } from '@/components/application/pagination/pagination';
import { Button } from '@/components/base/buttons/button';
import { Pulse } from '../parts';
import { TenderStatusBadge, typeLabel, when } from './tenderLabels';
import { t } from '@/i18n';

/** Tenders the user posted, as themselves or for a company they sign for, in any status. */
export default function MyTendersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<TenderSummary> | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setFetching(true);
    return tenderApi
      .mine(page)
      .then(setResult, (err) => setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.')))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <>
      <PageHeader
        title={t('My tenders')}
        subtitle={t('Tenders you posted: drafts, open ones and those being evaluated.')}
        actions={
          <Button size="sm" iconLeading={Plus} onPress={() => navigate('/market/tenders/new')}>
            {t('Post a tender')}
          </Button>
        }
      />
      {error && <Alert>{error}</Alert>}
      {!result ? (
        !error && <Pulse className="h-48" />
      ) : (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {result.data.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileSearch02 className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
              <p className="mt-2 text-sm text-tertiary">{t('You have not posted a tender yet.')}</p>
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
                        {tender.organizer.name ?? '—'} · {typeLabel(tender.type)} · {t('Closes {when}', { when: when(tender.closes_at) })}
                      </p>
                    </div>
                    <TenderStatusBadge status={tender.status} />
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

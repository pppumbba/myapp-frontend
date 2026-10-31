import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSearch02 } from '@untitledui/icons';
import { PageHeader } from '../../../components/AppShell';
import { Alert } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import type { Page } from '../../../lib/marketApi';
import { tenderApi, type BidSummary } from '../../../lib/tenderApi';
import { PaginationCardMinimal } from '@/components/application/pagination/pagination';
import { money } from '../labels';
import { Pulse } from '../parts';
import { BidStatusBadge, tenderStatusLabel } from './tenderLabels';
import { t } from '@/i18n';

/** Bids the user sent, as themselves or for their companies. */
export default function MyBidsPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<BidSummary> | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setFetching(true);
    return tenderApi
      .myBids(page)
      .then(setResult, (err) => setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.')))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <>
      <PageHeader title={t('My bids')} subtitle={t('Bids you sent, and where each tender stands.')} />
      {error && <Alert>{error}</Alert>}
      {!result ? (
        !error && <Pulse className="h-48" />
      ) : (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {result.data.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileSearch02 className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
              <p className="mt-2 text-sm text-tertiary">
                {t('No bids yet.')}{' '}
                <Link to="/market/tenders" className="font-semibold text-brand-secondary hover:underline">
                  {t('Find a tender')}
                </Link>
              </p>
            </div>
          ) : (
            <ul className={`divide-y divide-secondary transition-opacity duration-150 ${fetching ? 'opacity-50' : ''}`} aria-busy={fetching}>
              {result.data.map((bid) => (
                <li key={bid.id}>
                  <Link to={`/market/tenders/${bid.tender.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-primary_hover sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-primary">
                        {bid.tender.title} <span className="font-normal text-tertiary">· {bid.tender.code}</span>
                      </p>
                      <p className="truncate text-sm text-tertiary">
                        {bid.company ?? t('As yourself')} · {tenderStatusLabel(bid.tender.status)}
                        {bid.round > 1 && ` · ${t('Round {n}', { n: bid.round })}`}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-primary tabular-nums">{money(bid.total)}</p>
                    <BidStatusBadge status={bid.status} />
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

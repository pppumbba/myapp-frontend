import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { File06, Plus } from '@untitledui/icons';
import { PageHeader } from '../../components/AppShell';
import { Alert } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { contractApi, type ContractSummary, type Page } from '../../lib/marketApi';
import { PaginationCardMinimal } from '@/components/application/pagination/pagination';
import { Button } from '@/components/base/buttons/button';
import { money, sideLabel, StatusBadge } from './labels';
import { Pulse } from './parts';
import { t } from '@/i18n';

/** The user's contracts on either side, newest change first. */
export default function ContractsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<ContractSummary> | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setFetching(true);
    return contractApi
      .list(page)
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
        title={t('Contracts')}
        subtitle={t('Contracts you buy or sell under, as a person or for your companies.')}
        actions={
          <Button size="sm" iconLeading={Plus} onPress={() => navigate('/market/contracts/new')}>
            {t('New contract')}
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
              <File06 className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
              <p className="mt-2 text-sm text-tertiary">{t('No contracts yet.')}</p>
            </div>
          ) : (
            <ul className={`divide-y divide-secondary transition-opacity duration-150 ${fetching ? 'opacity-50' : ''}`} aria-busy={fetching}>
              {result.data.map((c) => (
                <li key={c.id}>
                  <Link to={`/market/contracts/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-primary_hover sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-primary">
                        {c.title} <span className="font-normal text-tertiary">· {c.number}</span>
                      </p>
                      <p className="truncate text-sm text-tertiary">
                        {sideLabel(c.side)} · {c.other?.name ?? '—'}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-primary tabular-nums">{money(c.total)}</p>
                    <StatusBadge status={c.status} />
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

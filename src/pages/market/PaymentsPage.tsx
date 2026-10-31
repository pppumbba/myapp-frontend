import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CreditCard02, FileDownload02 } from '@untitledui/icons';
import { PageHeader } from '../../components/AppShell';
import { Alert } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { paymentApi, type MarketPayment, type Page } from '../../lib/marketApi';
import { PaginationCardMinimal } from '@/components/application/pagination/pagination';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { kindLabel, money, paymentStatusLabel } from './labels';
import { Pulse, Success } from './parts';
import { PayModal } from './PayModal';
import { t } from '@/i18n';

const message = (err: unknown) => (err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
const color = { pending: 'warning', paid: 'success', cancelled: 'gray', refunded: 'blue' } as const;

/** What the user has paid the market (and what is waiting), with receipts. */
export default function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<MarketPayment> | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState<MarketPayment | null>(null);

  const load = () => {
    setFetching(true);
    return paymentApi
      .list(page)
      .then(setResult, (err) => setError(message(err)))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    // Back from the provider's pay page: ask it again, then say how it went.
    const paid = Number(params.get('paid'));
    if (paid) {
      setParams({}, { replace: true });
      paymentApi.check(paid).then(
        (p) => (p.status === 'paid' ? setNotice(t('Payment received.')) : setError(t('Not paid yet. If you just paid, wait a moment and check again.'))),
        (err) => setError(message(err)),
      );
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <>
      <PageHeader title={t('Payments')} subtitle={t('Fees and payments held by the market, with receipts.')} />
      <div className="space-y-4">
        {notice && <Success>{notice}</Success>}
        {error && <Alert>{error}</Alert>}
        {!result ? (
          !error && <Pulse className="h-48" />
        ) : (
          <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            {result.data.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <CreditCard02 className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
                <p className="mt-2 text-sm text-tertiary">{t('No payments yet.')}</p>
              </div>
            ) : (
              <ul className={`divide-y divide-secondary transition-opacity duration-150 ${fetching ? 'opacity-50' : ''}`} aria-busy={fetching}>
                {result.data.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-primary">{kindLabel(p.kind)}</p>
                      <p className="truncate text-sm text-tertiary">
                        {p.subject && (
                          <>
                            <Link to={p.subject.type === 'contract' ? `/market/contracts/${p.subject.id}` : `/market/tenders/${p.subject.id}`} className="hover:underline">
                              {p.subject.number} {p.subject.title}
                            </Link>
                            {' · '}
                          </>
                        )}
                        {new Date(p.paid_at ?? p.created_at).toLocaleDateString()}
                        {p.receipt_number && ` · ${p.receipt_number}`}
                      </p>
                    </div>
                    <p className="text-sm font-medium tabular-nums text-primary">{money(p.amount)}</p>
                    <Badge size="sm" type="pill-color" color={color[p.status]}>
                      {paymentStatusLabel(p.status)}
                    </Badge>
                    {p.status === 'pending' && (
                      <Button size="sm" onPress={() => setPaying(p)}>
                        {t('Pay')}
                      </Button>
                    )}
                    {p.receipt_number && p.status !== 'pending' && (
                      <Button size="sm" color="tertiary" iconLeading={FileDownload02} onPress={() => void paymentApi.receipt(p).catch((err) => setError(message(err)))}>
                        {t('Receipt')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <PaginationCardMinimal
              page={result.current_page}
              total={Math.max(1, result.last_page)}
              onPageChange={(n) => setPage(Math.max(1, n))}
              onRefresh={() => void load()}
              refreshing={fetching}
            />
          </div>
        )}
      </div>
      {paying && (
        <PayModal
          payment={paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setNotice(t('Payment received.'));
            void load();
          }}
        />
      )}
    </>
  );
}

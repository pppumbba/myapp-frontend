import { useEffect, useState } from 'react';
import { File04 } from '@untitledui/icons';
import { PageHeader } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { marketApi, type RequestStatus, type Review, type ReviewPage } from '../../lib/marketApi';
import { PaginationCardMinimal } from '@/components/application/pagination/pagination';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Button } from '@/components/base/buttons/button';
import { TextArea } from '@/components/base/textarea/textarea';
import { Pulse } from './parts';
import { t } from '@/i18n';

const message = (err: unknown) => (err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));

/** Staff check powers of attorney: who asks to act for which company, the document, approve or reject. */
export default function MarketReviewsPage() {
  const [status, setStatus] = useState<RequestStatus>('pending');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ReviewPage | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Review | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = () => {
    setFetching(true);
    return marketApi
      .reviews(status, page)
      .then(setResult, (err) => setError(message(err)))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page]);

  const approve = (review: Review) => {
    setBusy(review.id);
    setError(null);
    marketApi.decideReview(review.id, 'approve').then(
      () => {
        setBusy(null);
        void load();
      },
      (err) => {
        setBusy(null);
        setError(message(err));
      },
    );
  };

  return (
    <>
      <PageHeader title={t('Market reviews')} subtitle={t('Powers of attorney sent by people asking to act for a company.')} />
      <div className="space-y-4">
        <ButtonGroup
          size="sm"
          aria-label={t('Status')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[status]}
          onSelectionChange={(keys) => {
            const next = [...keys][0] as RequestStatus | undefined;
            if (next) {
              setStatus(next);
              setPage(1);
            }
          }}
        >
          <ButtonGroupItem id="pending">{t('Waiting')}</ButtonGroupItem>
          <ButtonGroupItem id="approved">{t('Approved')}</ButtonGroupItem>
          <ButtonGroupItem id="rejected">{t('Declined')}</ButtonGroupItem>
        </ButtonGroup>
        {error && <Alert>{error}</Alert>}

        {!result ? (
          !error && <Pulse className="h-48" />
        ) : (
          <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            {result.data.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-tertiary">{t('Nothing here.')}</p>
            ) : (
              <ul className={`divide-y divide-secondary transition-opacity duration-150 ${fetching ? 'opacity-50' : ''}`} aria-busy={fetching}>
                {result.data.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-primary">
                        {r.user.verified_name ?? r.user.name} <span className="font-normal text-tertiary">· {r.user.registry_number}</span>
                      </p>
                      <p className="truncate text-sm text-tertiary">
                        {t('for {company}', { company: r.company.name })} ({r.company.registry_number}) · {new Date(r.created_at).toLocaleDateString()}
                        {r.reason && ` · ${r.reason}`}
                      </p>
                    </div>
                    {r.file && (
                      <Button size="sm" color="tertiary" iconLeading={File04} onPress={() => void marketApi.downloadReviewFile(r).catch((err) => setError(message(err)))}>
                        {r.file.name}
                      </Button>
                    )}
                    {r.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button size="sm" color="secondary-destructive" isDisabled={busy === r.id} onPress={() => setRejecting(r)}>
                          {t('Reject')}
                        </Button>
                        <Button size="sm" isLoading={busy === r.id} onPress={() => approve(r)}>
                          {t('Approve')}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <PaginationCardMinimal
              page={result.current_page}
              total={Math.max(1, result.last_page)}
              pageSize={25}
              onPageChange={(p) => setPage(Math.max(1, p))}
              onRefresh={() => void load()}
              refreshing={fetching}
            />
          </div>
        )}
      </div>
      {rejecting && (
        <RejectModal
          review={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function RejectModal({ review, onClose, onDone }: { review: Review; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reject = () => {
    setBusy(true);
    setError(null);
    marketApi.decideReview(review.id, 'reject', reason.trim()).then(onDone, (err) => {
      setBusy(false);
      setError(message(err));
    });
  };

  return (
    <Modal title={t('Reject the request')} description={t('The person sees this reason.')} onClose={onClose} size="sm">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <TextArea label={t('Reason')} value={reason} onChange={setReason} rows={3} isRequired />
        <div className="modal-footer flex justify-end gap-2 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button size="sm" color="primary-destructive" isLoading={busy} isDisabled={!reason.trim()} onPress={reject}>
            {t('Reject')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

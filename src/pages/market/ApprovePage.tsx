import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/AppShell';
import { Alert } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { marketApi, type Approval, type MarketMe } from '../../lib/marketApi';
import { Button } from '@/components/base/buttons/button';
import { Card, Pulse, Success } from './parts';
import { t } from '@/i18n';

const message = (err: unknown) => (err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));

/** The director's side of a representation request: approve or reject someone acting for the company. */
export default function ApprovePage() {
  const token = useParams().token ?? '';
  const [me, setMe] = useState<MarketMe | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'approve' | 'reject' | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    Promise.all([marketApi.me(), marketApi.approval(token)]).then(
      ([m, a]) => {
        setMe(m);
        setApproval(a);
      },
      (err) => setError(message(err)),
    );
  }, [token]);

  const decide = (decision: 'approve' | 'reject') => {
    setBusy(decision);
    setError(null);
    marketApi.decideApproval(token, decision).then(
      () => {
        setBusy(null);
        setDone(decision);
      },
      (err) => {
        setBusy(null);
        setError(message(err));
      },
    );
  };

  return (
    <>
      <PageHeader title={t('Approve a representative')} />
      <div className="max-w-xl space-y-5">
        {error && <Alert>{error}</Alert>}
        {!approval || !me ? (
          !error && <Pulse />
        ) : done ? (
          <Success>{done === 'approve' ? t('Approved. They can now act for the company.') : t('Rejected. They have been told.')}</Success>
        ) : (
          <Card title={approval.company.name} description={approval.company.registry_number}>
            <p className="text-sm text-secondary">
              {t('{person} asks to act for this company on the market: to bid, sign contracts and manage its members.', { person: approval.requester.verified_name ?? '—' })}
            </p>
            {!me.verified ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-tertiary">{t('Only the director registered in ХУР can decide. Verify with DAN first, then open this link again.')}</p>
                <Link to="/market/account" className="text-sm font-semibold text-brand-secondary hover:underline">
                  {t('Verify with DAN')}
                </Link>
              </div>
            ) : (
              <div className="mt-5 flex justify-end gap-2">
                <Button size="sm" color="secondary-destructive" isLoading={busy === 'reject'} isDisabled={!!busy} onPress={() => decide('reject')}>
                  {t('Reject')}
                </Button>
                <Button size="sm" isLoading={busy === 'approve'} isDisabled={!!busy} onPress={() => decide('approve')}>
                  {t('Approve')}
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

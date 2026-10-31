import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/AppShell';
import { Alert } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { marketApi, type MarketMe } from '../../lib/marketApi';
import { Button } from '@/components/base/buttons/button';
import { Card, Pulse } from './parts';
import { t } from '@/i18n';

const message = (err: unknown) => (err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));

/** A colleague follows an invite and joins the company. */
export default function JoinPage() {
  const token = useParams().token ?? '';
  const navigate = useNavigate();
  const [me, setMe] = useState<MarketMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    marketApi.me().then(setMe, (err) => setError(message(err)));
  }, []);

  const accept = () => {
    setBusy(true);
    setError(null);
    marketApi.acceptInvite(token).then(
      () => navigate('/market/account', { replace: true }),
      (err) => {
        setBusy(false);
        setError(message(err));
      },
    );
  };

  return (
    <>
      <PageHeader title={t('Join a company')} />
      <div className="max-w-xl space-y-5">
        {error && <Alert>{error}</Alert>}
        {!me ? (
          !error && <Pulse />
        ) : (
          <Card title={t('You were invited to act for a company')} description={t('Accept to join it with the rights the invite gives.')}>
            {!me.verified ? (
              <div className="space-y-3">
                <p className="text-sm text-tertiary">{t('Verify with DAN first, then open this link again.')}</p>
                <Link to="/market/account" className="text-sm font-semibold text-brand-secondary hover:underline">
                  {t('Verify with DAN')}
                </Link>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button size="sm" isLoading={busy} onPress={accept}>
                  {t('Accept and join')}
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

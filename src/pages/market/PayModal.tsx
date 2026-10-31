import { useEffect, useState } from 'react';
import { LinkExternal01 } from '@untitledui/icons';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { paymentApi, type MarketPayment } from '../../lib/marketApi';
import { Button } from '@/components/base/buttons/button';
import { kindLabel, money } from './labels';
import { Success } from './parts';
import { t } from '@/i18n';

/**
 * Paying an invoice: the bank app's QR (or the provider's page), and a check that asks the
 * provider again. It also checks by itself every few seconds while open.
 */
export function PayModal({ payment, onClose, onPaid }: { payment: MarketPayment; onClose: () => void; onPaid: () => void }) {
  const [current, setCurrent] = useState(payment);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = (byHand: boolean) => {
    if (byHand) setChecking(true);
    return paymentApi.check(payment.id).then(
      (p) => {
        setChecking(false);
        setCurrent(p);
        if (p.status === 'paid') onPaid();
        else if (byHand) setError(t('Not paid yet. If you just paid, wait a moment and check again.'));
      },
      (err) => {
        setChecking(false);
        if (byHand) setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
      },
    );
  };

  useEffect(() => {
    if (current.status !== 'pending') return;
    const timer = setInterval(() => void check(false), 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.status]);

  return (
    <Modal title={t('Pay {amount}', { amount: money(current.amount) })} description={kindLabel(current.kind)} onClose={onClose} size="sm">
      <div className="space-y-4">
        {error && current.status === 'pending' && <Alert>{error}</Alert>}
        {current.status === 'paid' ? (
          <Success>{t('Paid. Thank you.')}</Success>
        ) : (
          <>
            {current.qr_image ? (
              <img src={current.qr_image} alt={t('QR code to pay with a bank app')} className="mx-auto size-56 rounded-lg bg-white p-2" />
            ) : (
              <p className="text-sm text-tertiary">{t('Open the payment page to pay.')}</p>
            )}
            {current.pay_url && (
              <a
                href={current.pay_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-secondary hover:underline"
              >
                {t('Open the payment page')}
                <LinkExternal01 className="size-4" aria-hidden="true" />
              </a>
            )}
          </>
        )}
        <div className="modal-footer flex justify-end gap-2 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            {current.status === 'paid' ? t('Close') : t('Later')}
          </Button>
          {current.status === 'pending' && (
            <Button size="sm" isLoading={checking} onPress={() => void check(true)}>
              {t("I've paid")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

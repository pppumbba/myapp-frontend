import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/AppShell';
import { Alert } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { paymentApi, type Fee } from '../../lib/marketApi';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { kindLabel } from './labels';
import { Card, Pulse, Success } from './parts';
import { t } from '@/i18n';

const message = (err: unknown) => (err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));

/** What the market charges: each fee a fixed amount in ₮ or a percent of the contract. */
export default function MarketFeesPage() {
  const [fees, setFees] = useState<Fee[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    paymentApi.fees().then(setFees, (err) => setError(message(err)));
  }, []);

  const set = (kind: Fee['kind'], patch: Partial<Fee>) => {
    setNotice(null);
    setFees((all) => all && all.map((f) => (f.kind === kind ? { ...f, ...patch } : f)));
  };

  const save = () => {
    if (!fees) return;
    setBusy(true);
    setError(null);
    paymentApi.saveFees(fees).then(
      (saved) => {
        setBusy(false);
        setFees(saved);
        setNotice(t('Saved. New invoices use these fees.'));
      },
      (err) => {
        setBusy(false);
        setError(message(err));
      },
    );
  };

  return (
    <>
      <PageHeader title={t('Market fees')} subtitle={t('What the market charges. Invoices already made keep their amount.')} />
      <div className="max-w-2xl space-y-4">
        {notice && <Success>{notice}</Success>}
        {error && <Alert>{error}</Alert>}
        {!fees ? (
          !error && <Pulse className="h-64" />
        ) : (
          <Card title={t('Fees')}>
            <div className="space-y-4">
              {fees.map((f) => (
                <div key={f.kind} className="grid grid-cols-[1fr_9rem_9rem] items-end gap-3">
                  <p className="pb-2.5 text-sm font-medium text-primary">{kindLabel(f.kind)}</p>
                  <NativeSelect
                    aria-label={t('How it is charged')}
                    value={f.mode}
                    onChange={(e) => set(f.kind, { mode: e.target.value as Fee['mode'] })}
                    options={[
                      { value: 'fixed', label: t('Fixed ₮') },
                      { value: 'percent', label: t('Percent') },
                    ]}
                  />
                  <Input
                    aria-label={t('Amount')}
                    type="number"
                    value={String(f.amount)}
                    onChange={(v) => set(f.kind, { amount: v.trim() === '' ? 0 : Number(v) })}
                  />
                </div>
              ))}
              <div className="flex justify-end border-t border-secondary pt-4">
                <Button size="sm" isLoading={busy} onPress={save}>
                  {t('Save')}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

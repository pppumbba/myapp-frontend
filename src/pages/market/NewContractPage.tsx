import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/AppShell';
import { Alert } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { contractApi, marketApi, type ContractTerms, type MarketMe } from '../../lib/marketApi';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { blankTerms, ContractEditor } from './ContractEditor';
import { Card, Pulse } from './parts';
import { t } from '@/i18n';

/** A direct contract: the user buys (as themselves or for a company they sign for) from a vendor they name. */
export default function NewContractPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MarketMe | null>(null);
  const [buyer, setBuyer] = useState('');
  const [vendor, setVendor] = useState('');
  const [terms, setTerms] = useState<ContractTerms>(blankTerms);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    marketApi.me().then(setMe, (err) => setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.')));
  }, []);

  const create = () => {
    setBusy(true);
    setError(null);
    contractApi.create({ ...terms, buyer_company_id: buyer ? Number(buyer) : null, vendor_registry_number: vendor.trim() }).then(
      (c) => navigate(`/market/contracts/${c.id}`, { replace: true }),
      (err) => {
        setBusy(false);
        setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
      },
    );
  };

  const signable = me?.memberships.filter((m) => m.can_sign && !m.company.frozen) ?? [];

  return (
    <>
      <PageHeader title={t('New contract')} subtitle={t('Agree terms with a vendor directly. Both sides sign with DAN.')} />
      <div className="max-w-4xl space-y-5">
        {error && <Alert>{error}</Alert>}
        {!me ? (
          !error && <Pulse className="h-64" />
        ) : !me.verified ? (
          <Card title={t('Verify first')}>
            <p className="text-sm text-tertiary">
              {t('Contracts need you to be verified through DAN.')}{' '}
              <Link to="/market/account" className="font-semibold text-brand-secondary hover:underline">
                {t('Verify with DAN')}
              </Link>
            </p>
          </Card>
        ) : (
          <>
            <Card title={t('Parties')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <NativeSelect
                  label={t('You buy as')}
                  value={buyer}
                  onChange={(e) => setBuyer(e.target.value)}
                  options={[
                    { value: '', label: `${me.verified.name} (${t('yourself')})` },
                    ...signable.map((m) => ({ value: String(m.company.id), label: m.company.name })),
                  ]}
                />
                <Input
                  label={t('Vendor registry number')}
                  hint={t('A company’s 7 digits, or a person’s registry number.')}
                  value={vendor}
                  onChange={setVendor}
                  isRequired
                />
              </div>
            </Card>
            <ContractEditor value={terms} onChange={setTerms} />
            <div className="flex justify-end gap-2">
              <Button size="sm" color="secondary" onPress={() => navigate('/market/contracts')}>
                {t('Cancel')}
              </Button>
              <Button size="sm" isLoading={busy} isDisabled={!vendor.trim() || !terms.title.trim()} onPress={create}>
                {t('Send to the vendor')}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/AppShell';
import { Alert } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { marketApi, type MarketMe } from '../../../lib/marketApi';
import { tenderApi, type Category, type TenderInput } from '../../../lib/tenderApi';
import { Button } from '@/components/base/buttons/button';
import { NativeSelect } from '@/components/base/select/select-native';
import { Card, Pulse } from '../parts';
import { blankTender, inputOf, payloadOf, TenderEditor } from './TenderEditor';
import { t } from '@/i18n';

/**
 * A new tender (as the user or a company they sign for), or a draft being changed (/:id/edit).
 * It is saved as a draft; publishing happens on the tender's page.
 */
export default function NewTenderPage() {
  const { id } = useParams();
  const editing = id ? Number(id) : null;
  const navigate = useNavigate();
  const [me, setMe] = useState<MarketMe | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [value, setValue] = useState<TenderInput | null>(editing ? null : blankTender());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fail = (err: unknown) => setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));

  useEffect(() => {
    marketApi.me().then(setMe, fail);
    tenderApi.categories().then(setCategories, () => setCategories([]));
    if (editing) {
      tenderApi.get(editing).then((tender) => {
        if (!tender.can.edit) navigate(`/market/tenders/${editing}`, { replace: true });
        else setValue(inputOf(tender));
      }, fail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const save = () => {
    if (!value) return;
    setBusy(true);
    setError(null);
    const body = payloadOf(value);
    const request = editing ? tenderApi.update(editing, body) : tenderApi.create({ ...body, company_id: companyId ? Number(companyId) : null });
    request.then(
      (tender) => navigate(`/market/tenders/${tender.id}`, { replace: true }),
      (err) => {
        setBusy(false);
        fail(err);
      },
    );
  };

  const signable = me?.memberships.filter((m) => m.can_sign && !m.company.frozen) ?? [];
  const ready = !!value && value.title.trim() !== '' && value.items.every((it) => it.name.trim() !== '');

  return (
    <>
      <PageHeader
        title={editing ? t('Change the draft') : t('Post a tender')}
        subtitle={t('Save it as a draft, add documents, then publish it when it is ready.')}
      />
      <div className="max-w-5xl space-y-5">
        {error && <Alert>{error}</Alert>}
        {!me || !value ? (
          !error && <Pulse className="h-64" />
        ) : !me.verified ? (
          <Card title={t('Verify first')}>
            <p className="text-sm text-tertiary">
              {t('Tenders need you to be verified through DAN.')}{' '}
              <Link to="/market/account" className="font-semibold text-brand-secondary hover:underline">
                {t('Verify with DAN')}
              </Link>
            </p>
          </Card>
        ) : (
          <>
            {!editing && (
              <Card title={t('Organizer')}>
                <NativeSelect
                  label={t('You post as')}
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  options={[{ value: '', label: `${me.verified.name} (${t('yourself')})` }, ...signable.map((m) => ({ value: String(m.company.id), label: m.company.name }))]}
                />
              </Card>
            )}
            <TenderEditor value={value} onChange={setValue} categories={categories} />
            <div className="flex justify-end gap-2">
              <Button size="sm" color="secondary" onPress={() => navigate(editing ? `/market/tenders/${editing}` : '/market/tenders/mine')}>
                {t('Cancel')}
              </Button>
              <Button size="sm" isLoading={busy} isDisabled={!ready} onPress={save}>
                {t('Save draft')}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/AppShell';
import { Alert } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { marketApi, type MarketMe, type MarketPayment } from '../../../lib/marketApi';
import { tenderApi, type Bid, type Claim, type Tender } from '../../../lib/tenderApi';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { money } from '../labels';
import { PayModal } from '../PayModal';
import { Card, Pulse } from '../parts';
import { claimLabel, specText, when } from './tenderLabels';
import { t } from '@/i18n';

interface LineState {
  include: boolean;
  price: string;
  quantity: string;
  lead: string;
}

interface SpecState {
  value: string;
  claim: Claim;
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A bid on a tender: a price (and, when allowed, a quantity) per item, a delivery time, and an
 * answer to every spec. With ?revise=<bid> it sends a shortlisted bidder's better offer instead.
 */
export default function BidEditor() {
  const { id } = useParams();
  const tenderId = Number(id);
  const [params] = useSearchParams();
  const reviseId = params.get('revise') ? Number(params.get('revise')) : null;
  const navigate = useNavigate();
  const [tender, setTender] = useState<Tender | null>(null);
  const [me, setMe] = useState<MarketMe | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [lead, setLead] = useState('');
  const [lines, setLines] = useState<Record<number, LineState>>({});
  const [specs, setSpecs] = useState<Record<number, SpecState>>({});
  const [toPay, setToPay] = useState<MarketPayment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fail = (err: unknown) => setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));

  useEffect(() => {
    marketApi.me().then(setMe, fail);
    Promise.all([tenderApi.get(tenderId), reviseId ? tenderApi.getBid(reviseId) : Promise.resolve(null as Bid | null)]).then(([tn, old]) => {
      setTender(tn);
      setLines(
        Object.fromEntries(
          tn.items.map((it) => {
            const was = old?.lines.find((l) => l.item_id === it.id);
            return [it.id, { include: !old || !!was, price: was ? String(was.price) : '', quantity: String(was?.quantity ?? it.quantity ?? 1), lead: was?.lead_time_days != null ? String(was.lead_time_days) : '' }];
          }),
        ),
      );
      setSpecs(
        Object.fromEntries(
          tn.items.flatMap((it) => it.specs).map((s) => {
            const was = old?.specs.find((a) => a.spec_id === s.id);
            return [s.id, { value: was?.value ?? '', claim: was?.bidder_claim ?? 'meets' }];
          }),
        ),
      );
      if (old) setLead(old.lead_time_days != null ? String(old.lead_time_days) : '');
    }, fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId, reviseId]);

  const total = useMemo(() => {
    if (!tender) return 0;
    return tender.items.reduce((sum, it) => {
      const l = lines[it.id];
      return l?.include ? sum + round2((num(l.price) ?? 0) * (num(l.quantity) ?? 0)) : sum;
    }, 0);
  }, [tender, lines]);

  if (!tender || !me) {
    return (
      <>
        <PageHeader title={reviseId ? t('Revise your offer') : t('Bid')} />
        {error ? <Alert>{error}</Alert> : <Pulse className="h-64" />}
      </>
    );
  }

  const rule = tender.rule;
  const chooseItems = rule.split !== 'none' || rule.partial;
  const bidders = me.memberships.filter((m) => m.can_bid && !m.company.frozen);
  const setLine = (itemId: number, patch: Partial<LineState>) => setLines({ ...lines, [itemId]: { ...lines[itemId], ...patch } });
  const setSpec = (specId: number, patch: Partial<SpecState>) => setSpecs({ ...specs, [specId]: { ...specs[specId], ...patch } });
  const included = tender.items.filter((it) => lines[it.id]?.include);
  const ready = included.length > 0 && included.every((it) => num(lines[it.id].price) !== null);

  const send = () => {
    setBusy(true);
    setError(null);
    const body = {
      lead_time_days: num(lead),
      lines: included.map((it) => ({
        item_id: it.id,
        price: num(lines[it.id].price) ?? 0,
        quantity: rule.partial ? num(lines[it.id].quantity) : undefined,
        lead_time_days: num(lines[it.id].lead),
      })),
      specs: included.flatMap((it) => it.specs).map((s) => ({ spec_id: s.id, value: specs[s.id]?.value || null, claim: specs[s.id]?.claim ?? 'fails' })),
    };
    if (reviseId) {
      tenderApi.revise(reviseId, body).then(
        () => navigate(`/market/tenders/${tenderId}`, { replace: true }),
        (err) => {
          setBusy(false);
          fail(err);
        },
      );
      return;
    }
    tenderApi.bid(tenderId, { ...body, company_id: companyId ? Number(companyId) : null }).then(
      ({ payments }) => {
        setBusy(false);
        const pending = payments.filter((p) => p.status === 'pending');
        if (pending.length) setToPay(pending);
        else navigate(`/market/tenders/${tenderId}`, { replace: true });
      },
      (err) => {
        setBusy(false);
        fail(err);
      },
    );
  };

  return (
    <>
      <PageHeader
        title={reviseId ? t('Revise your offer') : t('Bid')}
        subtitle={`${tender.title} · ${tender.code} · ${t('Closes {when}', { when: when(tender.final_round_closes_at ?? tender.closes_at) })}`}
        actions={
          <Link to={`/market/tenders/${tender.id}`} className="text-sm font-semibold text-brand-secondary hover:underline">
            {t('Back to the tender')}
          </Link>
        }
      />
      <div className="max-w-5xl space-y-5">
        {error && <Alert>{error}</Alert>}
        {!reviseId && (
          <Card title={t('You bid as')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <NativeSelect
                aria-label={t('You bid as')}
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                options={[{ value: '', label: `${me.verified?.name ?? ''} (${t('yourself')})` }, ...bidders.map((m) => ({ value: String(m.company.id), label: m.company.name }))]}
              />
              <p className="text-sm text-tertiary">
                {rule.security > 0 && t('A bid security of {amount} is held until the tender ends.', { amount: money(rule.security) })}{' '}
                {rule.irrevocable && t('Bids cannot be withdrawn while they are valid.')}
              </p>
            </div>
          </Card>
        )}

        <Card title={t('Prices')} description={chooseItems ? t('Price the items you offer; you need not offer all of them.') : t('Price every item.')}>
          <div className="space-y-3">
            {tender.items.map((it) => {
              const l = lines[it.id];
              if (!l) return null;
              return (
                <div key={it.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_9rem_7rem_7rem_8rem]">
                  <div className="col-span-2 min-w-0 pb-2 sm:col-span-1">
                    {chooseItems ? (
                      <Checkbox label={it.name} isSelected={l.include} onChange={(on) => setLine(it.id, { include: on })} />
                    ) : (
                      <p className="truncate text-sm font-medium text-primary">{it.name}</p>
                    )}
                    <p className="text-sm text-tertiary">
                      {it.quantity ?? 1} {it.unit ?? ''}
                      {it.best !== null && ` · ${t('Lowest so far {price}', { price: money(it.best) })}`}
                      {it.budget !== null && ` · ${t('Budget {amount}', { amount: money(it.budget) })}`}
                    </p>
                  </div>
                  <Input aria-label={t('Unit price')} placeholder={t('Unit price')} type="number" value={l.price} isDisabled={!l.include} onChange={(v) => setLine(it.id, { price: v })} />
                  <Input aria-label={t('Quantity')} type="number" value={l.quantity} isDisabled={!l.include || !rule.partial} onChange={(v) => setLine(it.id, { quantity: v })} />
                  <Input aria-label={t('Days to deliver')} placeholder={t('Days')} type="number" value={l.lead} isDisabled={!l.include} onChange={(v) => setLine(it.id, { lead: v })} />
                  <p className="pb-2.5 text-right text-sm font-medium text-primary tabular-nums">{l.include ? money(round2((num(l.price) ?? 0) * (num(l.quantity) ?? 0))) : '—'}</p>
                </div>
              );
            })}
            <div className="flex flex-wrap items-end justify-end gap-4 border-t border-secondary pt-4">
              <div className="w-48">
                <Input label={t('Days to deliver everything')} type="number" value={lead} onChange={setLead} />
              </div>
              <div className="text-right">
                <p className="text-sm text-tertiary">{t('Total')}</p>
                <p className="text-lg font-semibold text-primary tabular-nums">{money(total)}</p>
              </div>
            </div>
          </div>
        </Card>

        {included.some((it) => it.specs.length > 0) && (
          <Card title={t('Specs')} description={t('Say what you offer for each. A must-have you do not meet rules the bid out.')}>
            <div className="space-y-4">
              {included
                .filter((it) => it.specs.length > 0)
                .map((it) => (
                  <div key={it.id} className="space-y-2">
                    <p className="text-sm font-semibold text-primary">{it.name}</p>
                    {it.specs.map((s) => (
                      <div key={s.id} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_10rem_10rem]">
                        <p className="col-span-2 text-sm text-secondary sm:col-span-1">
                          {specText(s)}
                          {s.must && <span className="ml-2 text-xs font-semibold text-error-primary">{t('Must have')}</span>}
                        </p>
                        <Input aria-label={t('What you offer')} placeholder={s.kind === 'number' ? (s.value ?? '') : t('What you offer')} value={specs[s.id]?.value ?? ''} onChange={(v) => setSpec(s.id, { value: v })} />
                        <NativeSelect
                          aria-label={t('Claim')}
                          value={specs[s.id]?.claim ?? 'meets'}
                          onChange={(e) => setSpec(s.id, { claim: e.target.value as Claim })}
                          options={(['meets', 'exceeds', 'fails'] as const).map((c) => ({ value: c, label: claimLabel(c) }))}
                        />
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" color="secondary" onPress={() => navigate(`/market/tenders/${tenderId}`)}>
            {t('Cancel')}
          </Button>
          <Button size="sm" isLoading={busy} isDisabled={!ready} onPress={send}>
            {reviseId ? t('Send the revised offer') : t('Send the bid')}
          </Button>
        </div>
      </div>
      {toPay.length > 0 && (
        <PayModal
          key={toPay[0].id}
          payment={toPay[0]}
          onClose={() => navigate(`/market/tenders/${tenderId}`, { replace: true })}
          onPaid={() => {
            const rest = toPay.slice(1);
            if (rest.length) setToPay(rest);
            else navigate(`/market/tenders/${tenderId}`, { replace: true });
          }}
        />
      )}
    </>
  );
}

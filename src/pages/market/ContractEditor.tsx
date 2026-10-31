import { useEffect, useState } from 'react';
import { Plus, Trash01 } from '@untitledui/icons';
import { IconAction } from '../../components/ui';
import { paymentApi, type Contract, type ContractTerms, type Fee, type Middleman } from '../../lib/marketApi';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { middlemanLabel, money } from './labels';
import { Card } from './parts';
import { t } from '@/i18n';

/** Blank terms for a new contract: one empty line, paid in full. */
export const blankTerms = (): ContractTerms => ({
  title: '',
  items: [{ name: '', description: null, quantity: 1, unit: null, unit_price: 0 }],
  discount: 0,
  delivery_date: null,
  payment_terms: null,
  pledge: null,
  pledge_amount: null,
  middleman: 'off',
  steps: [{ label: t('Full payment'), percent: 100 }],
});

/** The terms of an existing contract, to edit. */
export const termsOf = (c: Contract): ContractTerms => ({
  title: c.title,
  items: c.items.map(({ name, description, quantity, unit, unit_price }) => ({ name, description, quantity, unit, unit_price })),
  discount: c.discount,
  delivery_date: c.delivery_date,
  payment_terms: c.payment_terms,
  pledge: c.pledge,
  pledge_amount: c.pledge_amount,
  middleman: c.middleman,
  steps: c.steps.map(({ label, percent }) => ({ label, percent })),
});

const num = (v: string) => (v.trim() === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** What the buyer will pay the market, worked out as the server does. */
function quote(fees: Fee[], kind: Fee['kind'], value: number) {
  const fee = fees.find((f) => f.kind === kind);
  if (!fee) return 0;
  return Math.round(fee.mode === 'percent' ? (value * fee.amount) / 100 : fee.amount);
}

/** Title, items, price, delivery, payment steps, pledge and the middleman choice. */
export function ContractEditor({ value, onChange }: { value: ContractTerms; onChange: (terms: ContractTerms) => void }) {
  const [fees, setFees] = useState<Fee[]>([]);
  useEffect(() => {
    paymentApi.fees().then(setFees, () => setFees([]));
  }, []);

  const set = (patch: Partial<ContractTerms>) => onChange({ ...value, ...patch });
  const setItem = (i: number, patch: Partial<ContractTerms['items'][number]>) =>
    set({ items: value.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const setStep = (i: number, patch: Partial<ContractTerms['steps'][number]>) =>
    set({ steps: value.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const subtotal = value.items.reduce((sum, it) => sum + round2(it.quantity * it.unit_price), 0);
  const total = Math.max(0, subtotal - value.discount);
  const percent = value.steps.reduce((sum, s) => sum + s.percent, 0);
  const contractFee = quote(fees, 'contract', total);
  const middlemanFee = value.middleman === 'off' ? 0 : quote(fees, 'middleman', total);

  return (
    <div className="space-y-5">
      <Card title={t('What is agreed')}>
        <div className="space-y-4">
          <Input label={t('Title')} value={value.title} onChange={(v) => set({ title: v })} isRequired />
          <div className="space-y-2">
            {value.items.map((it, i) => (
              <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_6rem_5rem_8rem_7rem_auto]">
                <Input label={i === 0 ? t('Item') : undefined} aria-label={t('Item')} value={it.name} onChange={(v) => setItem(i, { name: v })} wrapperClassName="col-span-2 sm:col-span-1" />
                <Input label={i === 0 ? t('Quantity') : undefined} aria-label={t('Quantity')} type="number" value={String(it.quantity)} onChange={(v) => setItem(i, { quantity: num(v) })} />
                <Input label={i === 0 ? t('Unit') : undefined} aria-label={t('Unit')} value={it.unit ?? ''} onChange={(v) => setItem(i, { unit: v || null })} />
                <Input label={i === 0 ? t('Unit price') : undefined} aria-label={t('Unit price')} type="number" value={String(it.unit_price)} onChange={(v) => setItem(i, { unit_price: num(v) })} />
                <p className="pb-2.5 text-right text-sm font-medium text-primary tabular-nums">{money(round2(it.quantity * it.unit_price))}</p>
                <IconAction icon={Trash01} danger label={t('Remove this line')} onPress={() => set({ items: value.items.filter((_, j) => j !== i) })} className="mb-1.5" />
              </div>
            ))}
            <Button size="sm" color="link-gray" iconLeading={Plus} onPress={() => set({ items: [...value.items, { name: '', description: null, quantity: 1, unit: null, unit_price: 0 }] })}>
              {t('Add a line')}
            </Button>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-4 border-t border-secondary pt-4">
            <Input label={t('Discount')} type="number" value={String(value.discount)} onChange={(v) => set({ discount: num(v) })} wrapperClassName="w-36" />
            <div className="text-right">
              <p className="text-sm text-tertiary">{t('Total')}</p>
              <p className="text-lg font-semibold text-primary tabular-nums">{money(total)}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card title={t('Delivery and payment')}>
        <div className="space-y-4">
          <Input label={t('Delivery date')} type="date" value={value.delivery_date ?? ''} onChange={(v) => set({ delivery_date: v || null })} wrapperClassName="w-48" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-secondary">{t('Payment steps')}</p>
            {value.steps.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_7rem_auto] items-end gap-2">
                <Input aria-label={t('Step')} value={s.label} onChange={(v) => setStep(i, { label: v })} />
                <Input aria-label={t('Percent')} type="number" value={String(s.percent)} onChange={(v) => setStep(i, { percent: num(v) })} />
                <p className="pb-2.5 text-right text-sm text-tertiary tabular-nums">{money(round2((total * s.percent) / 100))}</p>
                <IconAction icon={Trash01} danger label={t('Remove this step')} onPress={() => set({ steps: value.steps.filter((_, j) => j !== i) })} className="mb-1.5" />
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button size="sm" color="link-gray" iconLeading={Plus} onPress={() => set({ steps: [...value.steps, { label: '', percent: Math.max(0, 100 - percent) }] })}>
                {t('Add a step')}
              </Button>
              <p className={`text-sm tabular-nums ${Math.abs(percent - 100) < 0.001 ? 'text-tertiary' : 'font-semibold text-error-primary'}`}>
                {t('{percent}% of 100%', { percent: round2(percent) })}
              </p>
            </div>
          </div>
          <TextArea label={t('Payment terms')} value={value.payment_terms ?? ''} onChange={(v) => set({ payment_terms: v || null })} rows={2} />
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <TextArea label={t('Pledge')} value={value.pledge ?? ''} onChange={(v) => set({ pledge: v || null })} rows={2} />
            <Input label={t('Pledge amount')} type="number" value={value.pledge_amount === null ? '' : String(value.pledge_amount)} onChange={(v) => set({ pledge_amount: v.trim() === '' ? null : Number(v) })} />
          </div>
        </div>
      </Card>

      <Card title={t('Middleman')} description={t('The market can stand between you, and hold each payment until the buyer confirms.')}>
        <div className="space-y-2">
          <NativeSelect
            aria-label={t('Middleman')}
            value={value.middleman}
            onChange={(e) => set({ middleman: e.target.value as Middleman })}
            options={(['off', 'on', 'escrow'] as const).map((m) => ({ value: m, label: middlemanLabel(m) }))}
          />
          <p className="text-sm text-tertiary">
            {t('The buyer pays the market {fees} once both sides sign.', { fees: money(contractFee + middlemanFee) })}
          </p>
        </div>
      </Card>
    </div>
  );
}

import { Plus, Trash01 } from '@untitledui/icons';
import { IconAction } from '../../../components/ui';
import type { Category, ItemInput, SpecInput, Tender, TenderInput, TenderRule } from '../../../lib/tenderApi';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { middlemanLabel } from '../labels';
import { Card } from '../parts';
import { awardLabel, splitLabel, typeLabel } from './tenderLabels';
import { t } from '@/i18n';

/** The rule a new tender starts with: the server's defaults. */
export const defaultRule = (): TenderRule => ({
  award: 'lowest_price',
  weights: { price: 60, lead: 20, quality: 20 },
  visibility: 'sealed',
  partial: false,
  split: 'none',
  irrevocable: true,
  valid_until: null,
  security: 0,
  procedure: 'single',
  prequalification: false,
  middleman: 'off',
});

const blankSpec = (): SpecInput => ({ label: '', kind: 'text', operator: null, value: null, unit: null, must: false });
const blankItem = (): ItemInput => ({ name: '', quantity: 1, unit: null, category_id: null, description: null, budget: null, show_budget: false, specs: [] });

/** "YYYY-MM-DDTHH:mm" in the user's own time, for a datetime-local input. */
export const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** A blank tender: one item, open from now for a week. */
export const blankTender = (): TenderInput => ({
  title: '',
  type: 'goods',
  description: null,
  category_id: null,
  incoterm: null,
  starts_at: localInput(new Date()),
  closes_at: localInput(new Date(Date.now() + 7 * 86_400_000)),
  rule: defaultRule(),
  items: [blankItem()],
});

/** A draft as the editor holds it. */
export const inputOf = (tender: Tender): TenderInput => ({
  title: tender.title,
  type: tender.type,
  description: tender.description,
  category_id: tender.category?.id ?? null,
  incoterm: tender.incoterm,
  starts_at: localInput(new Date(tender.starts_at)),
  closes_at: localInput(new Date(tender.closes_at)),
  rule: tender.rule,
  items: tender.items.map(({ name, quantity, unit, category_id, description, budget, show_budget, specs }) => ({
    name,
    quantity,
    unit,
    category_id,
    description,
    budget,
    show_budget,
    specs: specs.map(({ label, kind, operator, value, unit: u, must }) => ({ label, kind, operator, value, unit: u, must })),
  })),
});

/** What goes to the server: dates as instants, blank specs dropped. */
export const payloadOf = (value: TenderInput): TenderInput => ({
  ...value,
  starts_at: new Date(value.starts_at).toISOString(),
  closes_at: new Date(value.closes_at).toISOString(),
  items: value.items.map((it) => ({ ...it, specs: it.specs.filter((s) => s.label.trim() !== '') })),
});

const num = (v: string) => (v.trim() === '' ? null : Number(v));
const INCOTERMS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'];

/** Title and dates, how bids are judged, and the items with their specs. */
export function TenderEditor({ value, onChange, categories }: { value: TenderInput; onChange: (v: TenderInput) => void; categories: Category[] }) {
  const rule = { ...defaultRule(), ...value.rule };
  const set = (patch: Partial<TenderInput>) => onChange({ ...value, ...patch });
  const setRule = (patch: Partial<TenderRule>) => set({ rule: { ...rule, ...patch } });
  const setItem = (i: number, patch: Partial<ItemInput>) => set({ items: value.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const setSpec = (i: number, k: number, patch: Partial<SpecInput>) =>
    setItem(i, { specs: value.items[i].specs.map((s, j) => (j === k ? { ...s, ...patch } : s)) });
  const weightSum = rule.weights.price + rule.weights.lead + rule.weights.quality;
  const categoryOptions = [{ value: '', label: t('No category') }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))];

  /** Adds the category's usual specs that the item does not have yet. */
  const takeCategorySpecs = (i: number) => {
    const category = categories.find((c) => c.id === value.items[i].category_id);
    if (!category) return;
    const have = new Set(value.items[i].specs.map((s) => s.label.trim().toLowerCase()));
    const add = category.specs.filter((s) => !have.has(s.label.toLowerCase())).map((s) => ({ ...s }));
    setItem(i, { specs: [...value.items[i].specs.filter((s) => s.label.trim() !== ''), ...add] });
  };

  return (
    <div className="space-y-5">
      <Card title={t('The tender')}>
        <div className="space-y-4">
          <Input label={t('Title')} value={value.title} onChange={(v) => set({ title: v })} isRequired />
          <div className="grid gap-4 sm:grid-cols-3">
            <NativeSelect
              label={t('Type')}
              value={value.type}
              onChange={(e) => set({ type: e.target.value as TenderInput['type'] })}
              options={(['goods', 'services', 'works'] as const).map((k) => ({ value: k, label: typeLabel(k) }))}
            />
            <NativeSelect label={t('Category')} value={value.category_id ? String(value.category_id) : ''} onChange={(e) => set({ category_id: e.target.value ? Number(e.target.value) : null })} options={categoryOptions} />
            <NativeSelect
              label={t('Incoterm')}
              value={value.incoterm ?? ''}
              onChange={(e) => set({ incoterm: e.target.value || null })}
              options={[{ value: '', label: t('None') }, ...INCOTERMS.map((k) => ({ value: k, label: k }))]}
            />
          </div>
          <TextArea label={t('Description')} value={value.description ?? ''} onChange={(v) => set({ description: v || null })} rows={3} />
          <div className="grid gap-4 sm:grid-cols-2">
            <DateTime label={t('Bids open')} value={value.starts_at} onChange={(v) => set({ starts_at: v })} />
            <DateTime label={t('Bids close')} value={value.closes_at} onChange={(v) => set({ closes_at: v })} />
          </div>
        </div>
      </Card>

      <Card title={t('How bids are judged')} description={t('Bidders see these rules before they bid.')}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <NativeSelect
              label={t('The winner is')}
              value={rule.award}
              onChange={(e) => setRule({ award: e.target.value as TenderRule['award'] })}
              options={(['lowest_price', 'fastest', 'highest_quality', 'best_value'] as const).map((k) => ({ value: k, label: awardLabel(k) }))}
            />
            <NativeSelect
              label={t('Bids are')}
              value={rule.visibility}
              onChange={(e) => setRule({ visibility: e.target.value as TenderRule['visibility'] })}
              options={[
                { value: 'sealed', label: t('Sealed: no one sees prices until the close') },
                { value: 'open', label: t('Open: bidders see the lowest price per item') },
              ]}
            />
          </div>
          {rule.award === 'best_value' && (
            <div className="space-y-1">
              <div className="grid grid-cols-3 gap-2">
                {(['price', 'lead', 'quality'] as const).map((k) => (
                  <Input
                    key={k}
                    label={{ price: t('Price weight'), lead: t('Delivery weight'), quality: t('Quality weight') }[k]}
                    type="number"
                    value={String(rule.weights[k])}
                    onChange={(v) => setRule({ weights: { ...rule.weights, [k]: num(v) ?? 0 } })}
                  />
                ))}
              </div>
              <p className={`text-sm tabular-nums ${weightSum === 100 ? 'text-tertiary' : 'font-semibold text-error-primary'}`}>{t('{percent}% of 100%', { percent: weightSum })}</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <NativeSelect
              label={t('Winners')}
              value={rule.split}
              onChange={(e) => {
                const split = e.target.value as TenderRule['split'];
                setRule({ split, partial: split === 'quantity' ? true : rule.partial });
              }}
              options={(['none', 'item', 'quantity'] as const).map((k) => ({ value: k, label: splitLabel(k) }))}
            />
            <NativeSelect
              label={t('Procedure')}
              value={rule.procedure}
              onChange={(e) => setRule({ procedure: e.target.value as TenderRule['procedure'] })}
              options={[
                { value: 'single', label: t('One round: the best bid wins') },
                { value: 'negotiated', label: t('Negotiated: shortlist, talk, final offers') },
              ]}
            />
          </div>
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <Checkbox label={t('Bidders may offer part of a quantity')} isSelected={rule.partial} isDisabled={rule.split === 'quantity'} onChange={(on) => setRule({ partial: on })} />
            <Checkbox label={t('Only approved bidders may bid (prequalification)')} isSelected={rule.prequalification} onChange={(on) => setRule({ prequalification: on })} />
            <Checkbox label={t('Bids cannot be withdrawn while valid')} isSelected={rule.irrevocable} onChange={(on) => setRule({ irrevocable: on })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label={t('Bids valid until')} type="date" hint={t('Empty: 30 days after the close.')} value={rule.valid_until ?? ''} onChange={(v) => setRule({ valid_until: v || null })} />
            <Input label={t('Bid security')} type="number" hint={t('Paid by each bidder, refunded at the end.')} value={String(rule.security)} onChange={(v) => setRule({ security: num(v) ?? 0 })} />
            <NativeSelect
              label={t('Middleman')}
              value={rule.middleman}
              onChange={(e) => setRule({ middleman: e.target.value as TenderRule['middleman'] })}
              options={(['off', 'on', 'escrow'] as const).map((m) => ({ value: m, label: middlemanLabel(m) }))}
            />
          </div>
        </div>
      </Card>

      <Card title={t('Items')} description={t('What you want, how many, and what it must have.')}>
        <div className="space-y-5">
          {value.items.map((it, i) => (
            <div key={i} className="space-y-3 rounded-lg p-3 ring-1 ring-secondary">
              <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_6rem_5rem_9rem_auto]">
                <Input label={t('Item')} value={it.name} onChange={(v) => setItem(i, { name: v })} wrapperClassName="col-span-2 sm:col-span-1" isRequired />
                <Input label={t('Quantity')} type="number" value={it.quantity === null ? '' : String(it.quantity)} onChange={(v) => setItem(i, { quantity: num(v) })} />
                <Input label={t('Unit')} value={it.unit ?? ''} onChange={(v) => setItem(i, { unit: v || null })} />
                <Input label={t('Budget')} type="number" value={it.budget === null ? '' : String(it.budget)} onChange={(v) => setItem(i, { budget: num(v) })} />
                {value.items.length > 1 ? (
                  <IconAction icon={Trash01} danger label={t('Remove this item')} onPress={() => set({ items: value.items.filter((_, j) => j !== i) })} className="mb-1.5" />
                ) : (
                  <span className="size-8" aria-hidden="true" />
                )}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <NativeSelect label={t('Category')} className="w-56" value={it.category_id ? String(it.category_id) : ''} onChange={(e) => setItem(i, { category_id: e.target.value ? Number(e.target.value) : null })} options={categoryOptions} />
                {it.category_id && (categories.find((c) => c.id === it.category_id)?.specs.length ?? 0) > 0 && (
                  <Button size="sm" color="secondary" onPress={() => takeCategorySpecs(i)}>
                    {t('Add the category’s specs')}
                  </Button>
                )}
                <Checkbox label={t('Show the budget to bidders')} isSelected={it.show_budget} onChange={(on) => setItem(i, { show_budget: on })} />
              </div>
              <TextArea aria-label={t('Item description')} placeholder={t('Item description')} value={it.description ?? ''} onChange={(v) => setItem(i, { description: v || null })} rows={2} />
              <div className="space-y-2">
                <p className="text-sm font-medium text-secondary">{t('Specs')}</p>
                {it.specs.map((s, k) => (
                  <div key={k} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_7rem_5rem_7rem_5rem_auto_auto]">
                    <Input aria-label={t('Spec')} placeholder={t('e.g. Memory')} value={s.label} onChange={(v) => setSpec(i, k, { label: v })} wrapperClassName="col-span-2 sm:col-span-1" />
                    <NativeSelect
                      aria-label={t('Kind')}
                      value={s.kind}
                      onChange={(e) => setSpec(i, k, e.target.value === 'number' ? { kind: 'number', operator: s.operator ?? 'gte' } : { kind: 'text', operator: null })}
                      options={[
                        { value: 'text', label: t('Text') },
                        { value: 'number', label: t('Number') },
                      ]}
                    />
                    <NativeSelect
                      aria-label={t('Comparison')}
                      value={s.operator ?? ''}
                      disabled={s.kind !== 'number'}
                      onChange={(e) => setSpec(i, k, { operator: (e.target.value || null) as SpecInput['operator'] })}
                      options={s.kind === 'number' ? [{ value: 'gte', label: '≥' }, { value: 'lte', label: '≤' }, { value: 'eq', label: '=' }] : [{ value: '', label: '—' }]}
                    />
                    <Input aria-label={t('Value')} placeholder={s.kind === 'number' ? '8' : t('e.g. Full HD')} value={s.value ?? ''} onChange={(v) => setSpec(i, k, { value: v || null })} />
                    <Input aria-label={t('Unit')} placeholder="GB" value={s.unit ?? ''} onChange={(v) => setSpec(i, k, { unit: v || null })} />
                    <Checkbox label={t('Must have')} isSelected={s.must} onChange={(on) => setSpec(i, k, { must: on })} />
                    <IconAction icon={Trash01} danger label={t('Remove this spec')} onPress={() => setItem(i, { specs: it.specs.filter((_, j) => j !== k) })} />
                  </div>
                ))}
                <Button size="sm" color="link-gray" iconLeading={Plus} onPress={() => setItem(i, { specs: [...it.specs, blankSpec()] })}>
                  {t('Add a spec')}
                </Button>
              </div>
            </div>
          ))}
          <Button size="sm" color="secondary" iconLeading={Plus} onPress={() => set({ items: [...value.items, blankItem()] })}>
            {t('Add an item')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function DateTime({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-secondary">
      {label}
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-lg bg-primary px-3 text-md text-primary shadow-xs ring-1 ring-primary outline-none ring-inset focus:ring-2 focus:ring-brand"
      />
    </label>
  );
}

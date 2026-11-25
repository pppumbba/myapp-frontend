import { useId, useMemo, useState } from 'react';
import { Grid01, SearchLg, XClose } from '@untitledui/icons';
import type { MetaOption } from '../../lib/metaApi';
import { Input } from '@/components/base/input/input';
import { Label } from '@/components/base/input/label';
import { HintText } from '@/components/base/input/hint-text';
import { Button } from '@/components/base/buttons/button';
import { CheckboxBase } from '@/components/base/checkbox/checkbox';
import { Modal } from '../../components/Modal';
import { TypeIcon } from '../../components/TypeIcon';
import { IconAction } from '../../components/ui';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

/** A meta to pick: value is what the field stores (its id, or a key for one not saved yet). */
export interface MetaChoice {
  value: string;
  name: string;
  type: string | null;
  code?: string;
}

export const metaChoices = (options: MetaOption[]): MetaChoice[] =>
  options.map((o) => ({
    value: String(o.id),
    name: o.name,
    type: o.type,
    code: o.code,
  }));

/**
 * Picks a meta (e.g. Refers to) in a lookup dialog instead of a long dropdown: the field shows
 * the picked meta, a press opens the dialog to search the metas by name or code and narrow them
 * by type; the cross empties it. '' is none. Without a label, aria-label names it; placeholder
 * says what none means.
 */
export function MetaLookupField({
  label,
  'aria-label': ariaLabel,
  placeholder,
  isRequired,
  isOptional,
  hint,
  value,
  items,
  onChange,
  size = 'md',
}: {
  label?: string;
  'aria-label'?: string;
  placeholder?: string;
  isRequired?: boolean;
  /** Shows "(optional)" after the label. */
  isOptional?: boolean;
  hint?: string;
  value: string;
  items: MetaChoice[];
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const picked = items.find((o) => o.value === value);
  const name = label ?? ariaLabel ?? t('meta');

  return (
    <div className="w-full">
      {label && (
        <Label id={id} isRequired={isRequired} isOptional={isOptional} className="mb-1.5">
          {label}
        </Label>
      )}
      <div className="flex items-center gap-1 rounded-lg bg-primary shadow-xs ring-1 ring-primary ring-inset">
        <button
          type="button"
          aria-labelledby={label ? id : undefined}
          aria-label={label ? undefined : ariaLabel}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className={cx('flex min-w-0 flex-1 items-center gap-2 rounded-lg pl-3 text-left outline-focus-ring focus-visible:outline-2', size === 'sm' ? 'py-1.5 text-sm' : 'py-2 text-md')}
        >
          {picked ? (
            <>
              <span className={cx('shrink-0', size === 'sm' ? 'size-5' : 'size-6')}>
                <TypeIcon code={picked.type} size="fill" />
              </span>
              <span className="min-w-0 truncate font-medium text-primary">{picked.name}</span>
              <span className="shrink-0 text-sm text-tertiary">{picked.type ?? t('no type')}</span>
            </>
          ) : (
            <span className="text-placeholder">{value ? `#${value}` : (placeholder ?? t('Nothing'))}</span>
          )}
        </button>
        {value && <IconAction icon={XClose} label={t('Clear {name}', { name })} onPress={() => onChange('')} />}
        <span className="mr-1">
          <IconAction icon={Grid01} label={t('Browse {name}', { name })} onPress={() => setOpen(true)} />
        </span>
      </div>
      {hint && <HintText className="mt-1.5">{hint}</HintText>}
      {open && (
        <MetaLookupDialog
          title={name}
          value={value}
          items={items}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * The lookup dialog. With onPickMany it picks several: each press ticks or unticks a meta, and
 * the footer button hands over the ticked ones in the order they were ticked.
 */
export function MetaLookupDialog({
  title,
  value = '',
  items,
  onPick,
  onPickMany,
  pickManyLabel,
  heading,
  onClose,
}: {
  title: string;
  /** The dialog's whole title, instead of "Choose for {title}". */
  heading?: string;
  value?: string;
  items: MetaChoice[];
  onPick?: (value: string) => void;
  onPickMany?: (values: string[]) => void;
  /** The footer button's text for a count, e.g. "Add {count} steps". */
  pickManyLabel?: (count: number) => string;
  onClose: () => void;
}) {
  const many = !!onPickMany;
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (v: string) => setChosen((list) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]));
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string | null>(null);
  // The types there are, most metas first, to narrow the list by.
  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of items) counts.set(o.type ?? '', (counts.get(o.type ?? '') ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((o) => type === null || (o.type ?? '') === type)
      .filter((o) => !q || o.name.toLowerCase().includes(q) || !!o.code?.toLowerCase().includes(q) || o.value === q)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, query, type]);

  return (
    <Modal title={heading ?? t('Choose for {name}', { name: title })} onClose={onClose} size="lg" fill>
      <div className="modal-split gap-3">
        <div className="shrink-0 space-y-3 px-4 sm:px-6">
          <Input aria-label={t('Search metas')} icon={SearchLg} placeholder={t('Search by name or code')} value={query} onChange={setQuery} autoFocus />
          {types.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Type')}>
              <TypeChip label={t('All')} count={items.length} picked={type === null} onPress={() => setType(null)} />
              {types.map(([code, count]) => (
                <TypeChip key={code} label={code || t('no type')} count={count} picked={type === code} onPress={() => setType(type === code ? null : code)} />
              ))}
            </div>
          )}
        </div>
        {/* A steady height, so the dialog doesn't jump while the list narrows. */}
        <div className="modal-scroll">
          <div className="sm:min-h-[50vh]">
            {shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-tertiary">{t('No meta matches.')}</p>
            ) : (
              <ul className="-mx-2 space-y-0.5 pb-2">
                {shown.map((o) => {
                  const isPicked = many ? chosen.includes(o.value) : o.value === value;
                  return (
                    <li key={o.value}>
                      <button
                        type="button"
                        aria-pressed={isPicked}
                        onClick={() => (many ? toggle(o.value) : onPick?.(o.value))}
                        className={cx(
                          'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2',
                          isPicked ? 'bg-brand-primary_alt' : 'hover:bg-primary_hover',
                        )}
                      >
                        {many && <CheckboxBase isSelected={isPicked} />}
                        <TypeIcon code={o.type} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className={cx('block truncate text-sm font-medium', isPicked ? 'text-brand-secondary' : 'text-primary')}>{o.name}</span>
                          {o.code && <span className="block truncate text-xs text-tertiary">{o.code}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-quaternary">{o.type ?? t('no type')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <div className="modal-footer flex shrink-0 items-center justify-between gap-3 border-t border-secondary py-3 text-sm text-tertiary">
          <span>{many ? t('{count} picked', { count: chosen.length }) : t('{count} metas', { count: shown.length })}</span>
          {many ? (
            <div className="flex gap-2">
              <Button size="sm" color="secondary" onPress={onClose}>
                {t('Cancel')}
              </Button>
              <Button size="sm" isDisabled={!chosen.length} onPress={() => onPickMany?.(chosen)}>
                {pickManyLabel ? pickManyLabel(chosen.length) : t('Choose {count}', { count: chosen.length })}
              </Button>
            </div>
          ) : (
            value && (
              <button type="button" onClick={() => onPick?.('')} className="font-semibold text-tertiary hover:text-tertiary_hover">
                {t('Choose nothing')}
              </button>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}

function TypeChip({ label, count, picked, onPress }: { label: string; count: number; picked: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={onPress}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2',
        picked ? 'bg-brand-primary_alt text-brand-secondary ring-brand' : 'bg-primary text-secondary ring-primary hover:bg-primary_hover',
      )}
    >
      {label}
      <span className={picked ? 'text-brand-secondary' : 'text-quaternary'}>{count}</span>
    </button>
  );
}

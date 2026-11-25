import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Tag01 } from '@untitledui/icons';
import type { MetaType, Tag } from '../../lib/metaApi';
import { TypeIcon } from '../../components/TypeIcon';
import { Button } from '@/components/base/buttons/button';
import { Dropdown } from '@/components/base/dropdown/dropdown';
import { tagDot } from './MetaTags';
import { t } from '@/i18n';

/*
 * The filters, view switch and list end shared by the Metas and Deleted metas pages.
 */

export type View = 'grid' | 'list';

/** How long ago, in words ("5 minutes ago", "yesterday"); a date once it is over a month. */
export function ago(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
  ] as const) {
    const n = seconds / (unit === 'second' ? 1 : unit === 'minute' ? 60 : unit === 'hour' ? 3600 : 86400);
    if (Math.abs(n) < size) return rtf.format(Math.round(n), unit);
  }
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** Cards or a list, remembered per page under [key] (when storage is allowed). */
export function useView(key: string): [View, (view: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(key) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const change = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // Storage can be blocked; the switch still works for this visit.
    }
  };
  return [view, change];
}

/** One type at a time, from a menu like New meta's: each type with its icon and count. */
export function TypeFilterMenu({
  types,
  counts,
  total,
  value,
  onChange,
}: {
  types: MetaType[];
  counts: Map<number, number>;
  /** How many there are of every type. */
  total: number;
  value: number | 'all';
  onChange: (value: number | 'all') => void;
}) {
  const picked = value === 'all' ? null : (types.find((item) => item.id === value) ?? null);
  return (
    <Dropdown.Root>
      <Button size="sm" color="secondary" iconTrailing={ChevronDown} aria-label={t('Filter by type')}>
        {picked ? (
          <span className="flex items-center gap-2">
            {/* Small enough to keep the button as tall as the Tags one. */}
            <span className="-my-0.5 size-5 [&_svg]:size-3.5!">
              <TypeIcon code={picked.code} size="fill" />
            </span>
            {picked.name}
          </span>
        ) : (
          t('All types')
        )}
      </Button>
      <Dropdown.Popover placement="bottom start" className="max-h-[70vh] w-64">
        <Dropdown.Menu
          aria-label={t('Filter by type')}
          selectionMode="single"
          selectedKeys={[value === 'all' ? 'all' : `type-${value}`]}
          onAction={(key) => onChange(key === 'all' ? 'all' : Number(String(key).slice(5)))}
        >
          <Dropdown.Section aria-label={t('All')}>
            <Dropdown.Item id="all" textValue={t('All types')}>
              <span className="flex items-center gap-2">
                <span className="flex-1 truncate">{t('All types')}</span>
                <span className="text-xs tabular-nums text-tertiary">{total}</span>
              </span>
            </Dropdown.Item>
          </Dropdown.Section>
          <Dropdown.Separator />
          <Dropdown.Section aria-label={t('Type')}>
            {types.map((item) => (
              <Dropdown.Item key={item.id} id={`type-${item.id}`} textValue={item.name}>
                <span className="flex items-center gap-2">
                  <TypeIcon code={item.code} size="sm" />
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="text-xs tabular-nums text-tertiary">{counts.get(item.id) ?? 0}</span>
                </span>
              </Dropdown.Item>
            ))}
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  );
}

/** Any number of tags (a meta must have each one); only tags in use are offered. Nothing when none are. */
export function TagFilterMenu({ tags, counts, value, onChange }: { tags: Tag[]; counts: Map<number, number>; value: number[]; onChange: (ids: number[]) => void }) {
  const used = tags.filter((item) => counts.has(item.id));
  if (!used.length) return null;
  return (
    <Dropdown.Root>
      <Button size="sm" color="secondary" iconLeading={Tag01} iconTrailing={ChevronDown} aria-label={t('Filter by tag')}>
        {value.length === 0 ? t('All tags') : value.length === 1 ? (tags.find((item) => item.id === value[0])?.name ?? t('1 tag')) : t('{count} tags', { count: value.length })}
      </Button>
      <Dropdown.Popover placement="bottom start" className="max-h-80 w-64">
        <Dropdown.Menu
          aria-label={t('Filter by tag')}
          selectionMode="multiple"
          selectedKeys={value.map(String)}
          onSelectionChange={(keys) => onChange(keys === 'all' ? used.map((item) => item.id) : [...keys].map(Number))}
          items={used}
        >
          {(item) => (
            <Dropdown.Item id={String(item.id)} textValue={item.name}>
              <span className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: tagDot(item) }} aria-hidden="true" />
                <span className="flex-1 truncate">{item.name}</span>
                <span className="text-xs tabular-nums text-tertiary">{counts.get(item.id) ?? 0}</span>
              </span>
            </Dropdown.Item>
          )}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  );
}

/**
 * The end of the list: asks for more when it comes within a screen of view (and again while it
 * stays there, since the observer is renewed after each batch), with a button as a fallback.
 */
export function LoadMore({ shown, total, onMore, loading = false }: { shown: number; total: number; onMore: () => void; loading?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const more = shown < total;
  useEffect(() => {
    const el = end.current;
    if (!more || loading || !el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onMore(), { rootMargin: '0px 0px 600px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [more, loading, shown, onMore]);

  return (
    <div ref={end} className="mt-4 flex flex-col items-center gap-2 text-sm text-tertiary">
      <span>{t('Showing {shown} of {total}', { shown, total })}</span>
      {more && (
        <Button size="sm" color="secondary" isLoading={loading} showTextWhileLoading onPress={onMore}>
          {t('Show more')}
        </Button>
      )}
    </div>
  );
}

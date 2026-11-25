import { useState } from 'react';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

/** "12 Nov" for a yyyy-mm-dd day. */
export const shortDay = (day: string) => new Date(`${day}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** "+12% on the 30 days before", or null when there is nothing to compare with. */
export function changeText(total: number, previous: number, days: number): string | null {
  if (previous <= 0) return null;
  const change = Math.round(((total - previous) / previous) * 100);
  return t('{change}% on the {n} days before', { change: change > 0 ? `+${change}` : change, n: days });
}

/**
 * Page views per day as bars in the brand colour, each with its own hover readout. One series;
 * the pages that use it list the numbers in a table too.
 */
export function DailyBars({ daily, height = 'h-40' }: { daily: { day: string; views: number }[]; height?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.views));
  if (!daily.length) return null;

  return (
    <div className="relative">
      <div className={cx('flex items-end gap-0.5', height)} role="img" aria-label={t('Page views per day')}>
        {daily.map((d, i) => (
          <div key={d.day} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))}>
            <div
              className={cx('w-full rounded-t-[4px] bg-brand-solid transition-opacity motion-reduce:transition-none', hover !== null && hover !== i && 'opacity-50')}
              style={{ height: `${d.views ? Math.max(2, (d.views / max) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="border-t border-secondary" />
      {hover !== null && daily[hover] && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-primary px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-secondary"
          style={{ left: `${((hover + 0.5) / daily.length) * 100}%` }}
        >
          <span className="font-semibold text-primary tabular-nums">{daily[hover].views.toLocaleString()}</span>
          <span className="text-tertiary"> · {shortDay(daily[hover].day)}</span>
        </div>
      )}
      <div className="mt-1 flex justify-between text-xs text-tertiary">
        <span>{shortDay(daily[0].day)}</span>
        <span>{shortDay(daily[daily.length - 1].day)}</span>
      </div>
    </div>
  );
}

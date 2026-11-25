import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DeskRelease } from '../../lib/siteApi';
import { ago } from '../metas/MetaFilters';
import { Badge } from '@/components/base/badges/badges';
import { t } from '@/i18n';

/*
 * Pieces the Website management pages share (overview, releases, domains, messages, visits).
 */

/** A count on the overview: a label, the number and a line under it; the whole tile links on. */
export function DeskStat({ to, label, value, hint }: { to: string; label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Link to={to} className="block rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary transition duration-100 ease-linear ring-inset outline-focus-ring hover:shadow-md focus-visible:outline-2">
      <p className="truncate text-sm text-tertiary">{label}</p>
      <p className="mt-1 text-display-xs font-semibold text-primary tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-tertiary">{hint}</p>}
    </Link>
  );
}

/** What a release is: about to go out, what visitors see now, a take-down, or replaced since. */
export function ReleaseBadge({ release: r }: { release: DeskRelease }) {
  if (r.scheduled)
    return (
      <Badge type="pill-color" size="sm" color="brand">
        {t('Scheduled')}
      </Badge>
    );
  if (r.taken_down)
    return (
      <Badge type="pill-color" size="sm" color={r.current ? 'warning' : 'gray'}>
        {r.current ? t('Taken down') : t('Was taken down')}
      </Badge>
    );
  return r.current ? (
    <Badge type="pill-color" size="sm" color="success">
      {t('Live')}
    </Badge>
  ) : (
    <Badge type="pill-color" size="sm" color="gray">
      {t('Replaced')}
    </Badge>
  );
}

/** When it goes or went out, in words, with the date and time on hover. */
export function ReleaseWhen({ release: r }: { release: DeskRelease }) {
  const at = new Date(r.publish_at);
  return (
    <time dateTime={r.publish_at} title={at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}>
      {r.scheduled ? t('Goes out {when}', { when: ago(r.publish_at) }) : ago(r.publish_at)}
    </time>
  );
}

/** One release as a compact line: address, site, when, who; actions on the right. */
export function ReleaseLine({ release: r, actions }: { release: DeskRelease; actions?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm font-medium text-primary">{r.path ?? t('(page removed)')}</span>
          <ReleaseBadge release={r} />
          {r.restored && <span className="text-xs text-tertiary">{t('restored')}</span>}
        </p>
        <p className="mt-0.5 truncate text-sm text-tertiary">
          <Link to={`/sites/${r.site.id}`} className="font-medium text-secondary hover:underline">
            {r.site.name}
          </Link>
          {' · '}
          <ReleaseWhen release={r} />
          {r.publisher && ` · ${r.publisher}`}
          {r.note && ` · “${r.note}”`}
        </p>
      </div>
      {actions}
    </li>
  );
}

/** A card with a title, an optional link on the right and its body. */
export function DeskCard({ title, link, children }: { title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={title}>
      <div className="flex items-center justify-between gap-3 border-b border-secondary px-4 py-3">
        <h2 className="text-md font-semibold text-primary">{title}</h2>
        {link && (
          <Link to={link.to} className="text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

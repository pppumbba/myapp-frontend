import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, ClockRewind, Edit05, Grid01, LayoutAlt01, Plus, Share07, Star01 } from '@untitledui/icons';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta } from '../../lib/metaApi';
import type { LibraryEntry } from '../../lib/libraryApi';
import { PageHeader } from '../../components/AppShell';
import { CountUp } from '../../components/motion';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { MetaCard, MetaRow } from './MetaCard';
import { ago } from './MetaFilters';
import { useMetaLibrary } from './useMetaLibrary';
import { t } from '@/i18n';

/** How many cards each part of Home shows before "See all". */
const SHOWN = { recent: 8, starred: 8, shared: 4, changed: 6 };

/**
 * The Meta studio's first page: counts, then what the user opened lately, starred, was shared
 * with them and what changed lately, each with a way to the full list.
 */
export default function MetasHomePage() {
  const { user, isAdmin } = useAuth();
  const [all, setAll] = useState<Meta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { library, starred, toggleStar } = useMetaLibrary();

  useEffect(() => {
    metaApi.list().then(setAll, (err) => setError(err instanceof ApiError ? err.message : t('Metas could not be loaded.')));
  }, []);

  const sharedIds = useMemo(() => new Set(library?.shared.map((e) => e.meta_id) ?? []), [library]);
  // What the user may build: every meta for an admin, their own and shared ones for a builder.
  const metas = useMemo(() => (all ?? []).filter((m) => isAdmin || m.created_by === user?.id || sharedIds.has(m.id)), [all, isAdmin, user?.id, sharedIds]);
  const byId = useMemo(() => new Map(metas.map((m) => [m.id, m])), [metas]);
  const pick = (entries: LibraryEntry[] | undefined) => (entries ?? []).flatMap((e) => (byId.has(e.meta_id) ? [{ meta: byId.get(e.meta_id)!, entry: e }] : []));
  const recent = pick(library?.recent);
  const stars = pick(library?.starred);
  const shared = pick(library?.shared);
  const changed = useMemo(() => [...metas].filter((m) => m.updated_at).sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')), [metas]);
  const apps = metas.filter((m) => m.type?.code === 'app').length;
  const onStar = useCallback((m: Meta) => void toggleStar(m.id), [toggleStar]);
  const loading = !all || !library;
  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <>
      <PageHeader
        title={firstName ? t('Welcome back, {name}', { name: firstName }) : t('Home')}
        subtitle={t('Pick up where you left off, or start something new.')}
        actions={
          <div className="flex gap-2">
            <Button size="sm" color="secondary" iconLeading={Grid01} href="/metas">
              {t('All metas')}
            </Button>
            <Button size="sm" iconLeading={Plus} href="/metas?new=1">
              {t('New meta')}
            </Button>
          </div>
        }
      />
      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat to="/metas" icon={Grid01} label={t('Metas')} value={loading ? null : metas.length} />
        <Stat to="/metas" icon={LayoutAlt01} label={t('Apps')} value={loading ? null : apps} />
        <Stat to="/metas/starred" icon={Star01} label={t('Starred')} value={loading ? null : stars.length} />
        <Stat to="/metas/shared" icon={Share07} label={t('Shared with me')} value={loading ? null : shared.length} />
      </div>

      <Section title={t('Recent')} icon={ClockRewind} to="/metas/recent" count={recent.length} loading={loading} empty={t('Metas you open show here.')}>
        <Cards items={recent.slice(0, SHOWN.recent)} note={(e) => t('Opened {when}', { when: ago(e.at) })} starred={starred} onStar={onStar} />
      </Section>
      <Section title={t('Starred')} icon={Star01} to="/metas/starred" count={stars.length} loading={loading} empty={t('Star a meta from its card to keep it here.')}>
        <Cards items={stars.slice(0, SHOWN.starred)} starred={starred} onStar={onStar} />
      </Section>
      <Section title={t('Shared with me')} icon={Share07} to="/metas/shared" count={shared.length} loading={loading} empty={t('Metas others share with you show here.')}>
        <Cards
          items={shared.slice(0, SHOWN.shared)}
          note={(e) => (e.by ? t('Shared by {name} {when}', { name: e.by.name, when: ago(e.at) }) : t('Shared {when}', { when: ago(e.at) }))}
          starred={starred}
          onStar={onStar}
        />
      </Section>
      <Section title={t('Changed lately')} icon={Edit05} to="/metas" count={changed.length} loading={loading} empty={t('Nothing changed yet.')} list>
        <div className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {changed.slice(0, SHOWN.changed).map((m) => (
            <MetaRow key={m.id} meta={m} starred={starred.has(m.id)} onStar={onStar} note={t('Changed {when}', { when: ago(m.updated_at!) })} />
          ))}
        </div>
      </Section>
    </>
  );
}

function Stat({ to, icon: Icon, label, value }: { to: string; icon: typeof Star01; label: string; value: number | null }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary transition duration-100 ease-linear ring-inset outline-focus-ring hover:shadow-md focus-visible:outline-2"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-fg-quaternary ring-1 ring-secondary ring-inset group-hover:text-fg-brand-secondary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-tertiary">{label}</span>
        {value === null ? (
          <span className="mt-1 block h-7 w-10 animate-pulse rounded bg-secondary motion-reduce:animate-none" aria-busy="true" />
        ) : (
          <span className="block text-display-xs font-semibold text-primary tabular-nums">
            <CountUp value={value} format={(n) => String(Math.round(n))} />
          </span>
        )}
      </span>
    </Link>
  );
}

function Section({
  title,
  icon: Icon,
  to,
  count,
  loading,
  empty,
  list = false,
  children,
}: {
  title: string;
  icon: typeof Star01;
  to: string;
  count: number;
  loading: boolean;
  empty: string;
  /** Rows, not cards, while loading. */
  list?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="mb-8" aria-labelledby={`home-${to}-${title}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={`home-${to}-${title}`} className="flex items-center gap-2 text-md font-semibold text-primary">
          <Icon className="size-4 text-fg-quaternary" aria-hidden="true" />
          {title}
          {!loading && count > 0 && <span className="text-sm font-normal text-tertiary tabular-nums">{count}</span>}
        </h2>
        {!loading && count > 0 && (
          <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
            {t('See all')}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      {loading ? (
        <div
          className={list ? 'h-48 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none' : 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3'}
          aria-busy="true"
        >
          {!list && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />)}
        </div>
      ) : count === 0 ? (
        <p className="rounded-xl border border-dashed border-primary px-4 py-6 text-center text-sm text-tertiary">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}

function Cards({ items, note, starred, onStar }: { items: { meta: Meta; entry: LibraryEntry }[]; note?: (e: LibraryEntry) => string; starred: Set<number>; onStar: (m: Meta) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      {items.map(({ meta, entry }) => (
        <MetaCard key={meta.id} meta={meta} starred={starred.has(meta.id)} onStar={onStar} note={note?.(entry)} />
      ))}
    </div>
  );
}

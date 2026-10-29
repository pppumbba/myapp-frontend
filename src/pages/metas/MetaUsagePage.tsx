import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, SearchLg } from '@untitledui/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { metaApi, type MetaUse, type UsageMeta } from '../../lib/metaApi';
import { AppShell, PageHeader } from '../../components/AppShell';
import { Alert } from '../../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { t } from '@/i18n';

type Row = UsageMeta & { used_by: MetaUse[] };
type Show = 'all' | 'used' | 'unused';

/**
 * Where each meta is used: every meta with the fields, buttons, settings, process steps,
 * links, page widgets and schedules that point at it, so one can be changed or removed
 * knowing what it touches. ?meta=id opens with that meta found and open.
 */
export default function MetaUsagePage() {
  const [params] = useSearchParams();
  const focus = Number(params.get('meta')) || null;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<Set<number>>(() => new Set(focus ? [focus] : []));

  useEffect(() => {
    metaApi
      .usage()
      .then((data) => {
        setRows(data);
        const found = focus ? data.find((r) => r.id === focus) : undefined;
        if (found) setQuery(found.code);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('The list could not be loaded.')));
  }, [focus]);

  const types = useMemo(() => {
    const seen = new Map<string, string>();
    rows?.forEach((r) => r.type.code && seen.set(r.type.code, r.type.name ?? r.type.code));
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (!type || r.type.code === type) &&
        (show === 'all' || (show === 'used') === r.used_by.length > 0) &&
        (!q || [r.name, r.code, ...r.used_by.flatMap((u) => [u.where, u.meta?.name ?? '', u.meta?.code ?? ''])].some((s) => s.toLowerCase().includes(q))),
    );
  }, [rows, query, type, show]);

  const unused = rows?.filter((r) => r.used_by.length === 0).length ?? 0;
  const allOpen = shown.length > 0 && shown.every((r) => r.used_by.length === 0 || open.has(r.id));
  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <AppShell>
      <PageHeader
        title={t('Where used')}
        subtitle={t('Each meta and the fields, buttons, settings, process steps, links and pages that use it. Check here before you change or delete one.')}
        actions={
          <Button size="sm" color="secondary" href="/metas">
            {t('Back to metas')}
          </Button>
        }
      />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          aria-label={t('Search')}
          type="search"
          size="sm"
          icon={SearchLg}
          value={query}
          onChange={setQuery}
          placeholder={t('Name, code or where it is used')}
          className="flex-1 sm:max-w-80"
        />
        <div className="w-48">
          <NativeSelect
            aria-label={t('Type')}
            size="sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[{ value: '', label: t('All types') }, ...types.map(([value, label]) => ({ value, label }))]}
          />
        </div>
        <ButtonGroup size="sm" aria-label={t('Show')} selectionMode="single" disallowEmptySelection selectedKeys={[show]} onSelectionChange={(keys) => setShow(([...keys][0] as Show) ?? 'all')}>
          <ButtonGroupItem id="all">{t('All')}</ButtonGroupItem>
          <ButtonGroupItem id="used">{t('Used')}</ButtonGroupItem>
          <ButtonGroupItem id="unused">{t('Not used')}</ButtonGroupItem>
        </ButtonGroup>
        {rows && (
          <p className="ml-auto text-sm text-tertiary">
            {t('{count} metas · {unused} not used anywhere', { count: rows.length, unused })}
          </p>
        )}
      </div>

      {!rows ? (
        !error && <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : shown.length === 0 ? (
        <div className="rounded-xl bg-primary p-8 text-center ring-1 ring-secondary">
          <p className="text-sm font-semibold text-primary">{t('Nothing matches')}</p>
          <p className="mt-1 text-sm text-tertiary">{t('Try another word, type or filter.')}</p>
        </div>
      ) : (
        <>
          <div className="mb-2 flex justify-end">
            <Button size="sm" color="link-color" onPress={() => setOpen(allOpen ? new Set() : new Set(shown.map((r) => r.id)))}>
              {allOpen ? t('Close all') : t('Open all')}
            </Button>
          </div>
          <ul className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            {shown.map((r) => (
              <UsageRow key={r.id} row={r} open={open.has(r.id)} onToggle={() => toggle(r.id)} />
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}

/** One meta: its name and how many places use it; opened, those places. */
function UsageRow({ row: r, open, onToggle }: { row: Row; open: boolean; onToggle: () => void }) {
  const count = r.used_by.length;
  const Chevron = open ? ChevronDown : ChevronRight;
  const panel = `usage-${r.id}`;
  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={count === 0}
          aria-expanded={count ? open : undefined}
          aria-controls={count ? panel : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-focus-ring focus-visible:outline-2 disabled:cursor-default"
        >
          <Chevron className={count ? 'size-4 shrink-0 text-fg-quaternary' : 'invisible size-4 shrink-0'} aria-hidden="true" />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-primary">{r.name}</span>
              <Badge type="color" size="sm" color="gray">
                {r.code}
              </Badge>
              {!r.is_active && (
                <Badge type="color" size="sm" color="warning">
                  {t('Inactive')}
                </Badge>
              )}
            </span>
            <span className="block text-sm text-tertiary">{r.type.name ?? r.type.code ?? '—'}</span>
          </span>
          <span className={count ? 'ml-auto shrink-0 text-sm font-medium text-secondary' : 'ml-auto shrink-0 text-sm text-quaternary'}>
            {count === 0 ? t('Not used') : count === 1 ? t('Used in 1 place') : t('Used in {count} places', { count })}
          </span>
        </button>
        <Link to={`/metas/${r.id}`} className="shrink-0 rounded-md text-sm font-semibold text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2">
          {t('Open')}
        </Link>
      </div>
      {open && count > 0 && (
        <ul id={panel} className="mb-3 ml-11 mr-4 divide-y divide-secondary rounded-lg bg-secondary_subtle px-3 ring-1 ring-secondary">
          {r.used_by.map((u, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-2 text-sm">
              {u.meta ? (
                <>
                  <Link to={`/metas/${u.meta.id}`} className="font-medium text-brand-secondary hover:underline">
                    {u.meta.name}
                  </Link>
                  <span className="text-quaternary">{u.meta.type.name ?? u.meta.type.code}</span>
                  <span className="text-tertiary">· {u.where}</span>
                </>
              ) : (
                <span className="text-secondary">{u.where}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

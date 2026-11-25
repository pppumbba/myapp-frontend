import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClockRewind, Grid01, List, SearchLg, Trash01 } from '@untitledui/icons';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { metaApi, type MetaType, type Tag } from '../../lib/metaApi';
import { versionApi, type DeletedMeta } from '../../lib/versionApi';
import { PageHeader } from '../../components/AppShell';
import { ConfirmDialog } from '../../components/Modal';
import { TypeIcon } from '../../components/TypeIcon';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Input } from '@/components/base/input/input';
import { LoadMore, TagFilterMenu, TypeFilterMenu, useView } from './MetaFilters';
import { Tags, TypeTag } from './MetaCard';
import { when } from './VersionsPanel';
import { t } from '@/i18n';

/** A deleted meta with its type and tags looked up, as the cards draw it. */
type Row = DeletedMeta & { type: MetaType | null; tags: Tag[] };

/**
 * Metas that were deleted, laid out like the Metas page: type and tag filters, search, cards or
 * a list, 20 at a time and more as the end scrolls into view. Each can be restored (from the
 * version saved as it was deleted, under its old id) or deleted for good.
 */
export default function DeletedMetasPage() {
  const navigate = useNavigate();
  const [types, setTypes] = useState<MetaType[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [rows, setRows] = useState<DeletedMeta[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typeCounts, setTypeCounts] = useState(new Map<number, number>());
  const [tagCounts, setTagCounts] = useState(new Map<number, number>());
  const [everything, setEverything] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<number | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<number[]>([]);
  const [view, changeView] = useView('deleted_metas_view');
  const [busy, setBusy] = useState<number | null>(null);
  const [purging, setPurging] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Each load is numbered, so an answer to an older filter is dropped.
  const loadNo = useRef(0);

  useEffect(() => {
    Promise.all([metaApi.types(), metaApi.tags()]).then(
      ([ty, tg]) => {
        setTypes(ty);
        setTags(tg);
      },
      () => undefined,
    );
  }, []);

  // The search waits for typing to pause.
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const load = useCallback(
    async (nextPage: number) => {
      const no = ++loadNo.current;
      if (nextPage > 1) setLoadingMore(true);
      try {
        const res = await versionApi.deleted({ q: search, type_id: typeFilter === 'all' ? undefined : typeFilter, tag_ids: tagFilter, page: nextPage });
        if (no !== loadNo.current) return;
        setRows((list) => (nextPage === 1 ? res.data : [...(list ?? []), ...res.data]));
        setTotal(res.total);
        setPage(nextPage);
        setHasMore(res.has_more);
        const typeMap = new Map(Object.entries(res.type_counts).map(([k, v]) => [Number(k), v]));
        setTypeCounts(typeMap);
        setTagCounts(new Map(Object.entries(res.tag_counts).map(([k, v]) => [Number(k), v])));
        setEverything([...typeMap.values()].reduce((a, b) => a + b, 0));
        setError(null);
      } catch (err) {
        if (no === loadNo.current) setError(err instanceof ApiError ? err.message : t('The deleted metas could not be loaded.'));
      } finally {
        if (no === loadNo.current) setLoadingMore(false);
      }
    },
    [search, typeFilter, tagFilter],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const more = useCallback(() => {
    if (hasMore && !loadingMore) void load(page + 1);
  }, [hasMore, loadingMore, load, page]);

  const shown: Row[] = useMemo(
    () =>
      (rows ?? []).map((r) => ({
        ...r,
        type: types.find((item) => item.id === r.type_id) ?? null,
        tags: r.tag_ids.map((id) => tags.find((item) => item.id === id)).filter((item): item is Tag => !!item),
      })),
    [rows, types, tags],
  );
  // Types that have deleted metas, for the type menu.
  const typesUsed = types.filter((item) => typeCounts.has(item.id));
  const filtered = typeFilter !== 'all' || tagFilter.length > 0;
  const clear = () => {
    setQuery('');
    setTypeFilter('all');
    setTagFilter([]);
  };

  async function restore(r: Row) {
    setBusy(r.id);
    setError(null);
    try {
      await versionApi.restore(r.id);
      navigate(`/metas/${r.meta_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The meta could not be restored.'));
      setBusy(null);
    }
  }

  async function purge() {
    if (!purging) return;
    setBusy(purging.id);
    try {
      await versionApi.purge(purging.meta_id);
      setPurging(null);
      await load(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The meta could not be deleted.'));
      setPurging(null);
    } finally {
      setBusy(null);
    }
  }

  const actions = (r: Row) => ({ busy: busy === r.id, disabled: busy !== null && busy !== r.id, onRestore: () => restore(r), onPurge: () => setPurging(r) });

  return (
    <>
      <PageHeader title={t('Deleted metas')} subtitle={t('A meta is saved as a version when it is deleted, so it can come back with its fields, actions and settings.')} />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Toolbar, as on the Metas page: it stays at the top while the list scrolls. */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-col gap-3 bg-secondary px-4 py-3 sm:-mx-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <TypeFilterMenu types={typesUsed} counts={typeCounts} total={everything} value={typeFilter} onChange={setTypeFilter} />
          <TagFilterMenu tags={tags} counts={tagCounts} value={tagFilter} onChange={setTagFilter} />
          {filtered && (
            <Button size="sm" color="link-gray" onPress={clear}>
              {t('Clear filters')}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Input
            aria-label={t('Search deleted metas')}
            type="search"
            size="sm"
            icon={SearchLg}
            value={query}
            onChange={setQuery}
            placeholder={t('Name, code or who deleted it')}
            className="flex-1 lg:w-72 lg:flex-none"
          />
          <ButtonGroup
            size="sm"
            aria-label={t('Layout')}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[view]}
            onSelectionChange={(keys) => changeView([...keys][0] === 'list' ? 'list' : 'grid')}
          >
            <ButtonGroupItem id="grid" iconLeading={Grid01} aria-label={t('Cards')} />
            <ButtonGroupItem id="list" iconLeading={List} aria-label={t('List')} />
          </ButtonGroup>
        </div>
      </div>

      {!rows ? (
        !error && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3" aria-busy="true" aria-label={t('Loading')}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
            ))}
          </div>
        )
      ) : everything === 0 && !search ? (
        <div className="rounded-xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary">
          <Trash01 className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
          <p className="mt-3 text-md font-semibold text-primary">{t('No deleted metas')}</p>
          <p className="mt-1 text-sm text-tertiary">{t('Metas you delete show here, ready to restore.')}</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl bg-primary px-6 py-12 text-center shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-md font-semibold text-primary">{t('No deleted metas match these filters.')}</p>
          <p className="mt-1 text-sm text-tertiary">{t('Try another search, type or tag.')}</p>
          <Button color="secondary" className="mt-5" onPress={clear}>
            {t('Clear filters')}
          </Button>
        </div>
      ) : view === 'grid' ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {shown.map((r) => (
              <DeletedCard key={r.id} row={r} {...actions(r)} />
            ))}
          </div>
          <LoadMore shown={shown.length} total={total} onMore={more} loading={loadingMore} />
        </>
      ) : (
        <>
          <div className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            {shown.map((r) => (
              <DeletedRow key={r.id} row={r} {...actions(r)} />
            ))}
          </div>
          <LoadMore shown={shown.length} total={total} onMore={more} loading={loadingMore} />
        </>
      )}

      {purging && (
        <ConfirmDialog
          title={t('Delete {name} permanently?', { name: purging.name })}
          message={t("Every saved version of it goes too, so it can't be restored any more. This can't be undone.")}
          confirmLabel={t('Delete permanently')}
          busy={busy === purging.id}
          onConfirm={purge}
          onCancel={() => setPurging(null)}
        />
      )}
    </>
  );
}

interface RowProps {
  row: Row;
  busy: boolean;
  disabled: boolean;
  onRestore: () => void;
  onPurge: () => void;
}

/** When and by whom it was deleted, and which version it comes back as. */
const deletedText = (r: Row) => [t('Deleted {when}', { when: when(r.created_at) }), r.creator?.name, t('version {n}', { n: r.version_no })].filter(Boolean).join(' · ');

/** Restore and Delete permanently; on a card the delete is an icon so both fit on one row. */
function Actions({ busy, disabled, onRestore, onPurge, compact = false }: Omit<RowProps, 'row'> & { compact?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" color="secondary" iconLeading={ClockRewind} isLoading={busy} showTextWhileLoading isDisabled={disabled} onPress={onRestore} className={compact ? 'flex-1' : undefined}>
        {t('Restore')}
      </Button>
      {compact ? (
        <ButtonUtility
          size="sm"
          color="tertiary"
          icon={Trash01}
          tooltip={t('Delete permanently')}
          isDisabled={busy || disabled}
          onPress={onPurge}
          className="shrink-0 text-fg-error-secondary hover:bg-error-primary hover:text-fg-error-primary"
        />
      ) : (
        <Button size="sm" color="tertiary-destructive" iconLeading={Trash01} isDisabled={busy || disabled} onPress={onPurge}>
          {t('Delete permanently')}
        </Button>
      )}
    </div>
  );
}

/** Card view, like a meta's card on the Metas page. */
function DeletedCard({ row: r, ...actions }: RowProps) {
  return (
    <article className="flex flex-col gap-2.5 rounded-xl bg-primary p-3.5 shadow-xs ring-1 ring-secondary ring-inset">
      <div className="flex items-center gap-2.5">
        <TypeIcon code={r.type?.code} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-primary">{r.name}</p>
          <p className="truncate text-xs text-tertiary">{r.code}</p>
        </div>
      </div>
      {r.description && <p className="line-clamp-2 text-xs text-tertiary">{r.description}</p>}
      <Tags meta={r} max={2} />
      <div className="mt-auto flex flex-col gap-2.5 border-t border-secondary pt-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-tertiary">
          <TypeTag meta={r} />
          <span>{deletedText(r)}</span>
        </div>
        <Actions {...actions} compact />
      </div>
    </article>
  );
}

/** List view: one row per deleted meta, same information. */
function DeletedRow({ row: r, ...actions }: RowProps) {
  return (
    <article className="flex flex-wrap items-center gap-4 px-4 py-3">
      <TypeIcon code={r.type?.code} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-md font-semibold text-primary">{r.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-tertiary">
          <span>{r.code}</span>
          <TypeTag meta={r} />
          <span>{deletedText(r)}</span>
          <Tags meta={r} />
        </div>
      </div>
      <Actions {...actions} />
    </article>
  );
}

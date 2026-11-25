import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaType, type Tag } from '../../lib/metaApi';
import { Link, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/AppShell';
import { ChevronDown, ClockRewind, Table, Grid01, List, Plus, SearchLg, Share07, Star01, Tag01, Upload01 } from '@untitledui/icons';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Dropdown } from '@/components/base/dropdown/dropdown';
import { ConfirmDialog } from '../../components/Modal';
import { typeLook } from '../../components/TypePreview';
import { TypeIcon } from '../../components/TypeIcon';
import { MetaCard, MetaRow } from './MetaCard';
import { ExcelStructureModal } from './ExcelStructureModal';
import { MetaContextMenu, ReplaceMetaModal, type MenuAt } from './MetaContextMenu';
import { MetaFormModal } from './MetaFormModal';
import { ImportMetasModal } from './MetaTransferModals';
import { TagsModal } from './MetaTags';
import { ago, LoadMore, TagFilterMenu, TypeFilterMenu, useView } from './MetaFilters';
import { ShareMetaModal } from './ShareMetaModal';
import { useMetaLibrary } from './useMetaLibrary';
import type { LibraryEntry } from '../../lib/libraryApi';
import { t } from '@/i18n';

const VIEW_KEY = 'metas_view';

/** The list as it was when last left: its data, filters, how far it was drawn and scrolled. */
interface Snapshot {
  allMetas: Meta[];
  types: MetaType[];
  options: MetaOption[];
  tags: Tag[];
  query: string;
  typeFilter: number | 'all';
  tagFilter: number[];
  count: number;
  scrollY: number;
}

/**
 * Per list (all metas or a collection), for this visit. Coming back shows the list at once and
 * refreshes it behind; back from a meta (All metas, or the browser's Back) it is also as you left it.
 */
const snapshots = new Map<string, Snapshot>();

/** The user's own lists, each a page of the Meta studio app shown like Metas. */
export type MetaCollection = 'starred' | 'recent' | 'shared';

const COLLECTIONS: Record<MetaCollection, { title: string; subtitle: string; icon: typeof Star01; empty: string; emptyHint: string; note: (e: LibraryEntry) => string }> = {
  starred: {
    title: 'Starred',
    subtitle: 'Metas you starred, newest first. Star one from its card or its right-click menu.',
    icon: Star01,
    empty: 'Nothing starred yet',
    emptyHint: 'Star the metas you come back to and they wait for you here.',
    note: (e) => t('Starred {when}', { when: ago(e.at) }),
  },
  recent: {
    title: 'Recent',
    subtitle: 'Metas you opened lately, the last one first.',
    icon: ClockRewind,
    empty: 'Nothing opened yet',
    emptyHint: 'Metas you open show here, so you can get back to them.',
    note: (e) => t('Opened {when}', { when: ago(e.at) }),
  },
  shared: {
    title: 'Shared with me',
    subtitle: 'Metas others shared with you. You can change them as if you had made them.',
    icon: Share07,
    empty: 'Nothing shared with you yet',
    emptyHint: 'When someone shares a meta with you, it shows here and you get a notification.',
    note: (e) => (e.by ? t('Shared by {name} {when}', { name: e.by.name, when: ago(e.at) }) : t('Shared {when}', { when: ago(e.at) })),
  },
};

/**
 * Every meta the user may build, or one of their lists (collection): starred, opened lately,
 * shared with them. The lists keep their own order (newest first) and the same filters.
 */
export default function MetasPage({ collection }: { collection?: MetaCollection }) {
  const snapshotKey = collection ?? 'all';
  const location = useLocation();
  const navigationType = useNavigationType();
  const [saved] = useState(() => snapshots.get(snapshotKey));
  const [restore] = useState(() => !!saved && (navigationType === 'POP' || !!(location.state as { keepScroll?: boolean } | null)?.keepScroll));
  const [fromExcel, setFromExcel] = useState(false);
  const [allMetas, setAllMetas] = useState<Meta[]>(saved?.allMetas ?? []);
  const { library, starred, toggleStar } = useMetaLibrary();
  const [sharing, setSharing] = useState<Meta | null>(null);
  const [types, setTypes] = useState<MetaType[]>(saved?.types ?? []);
  const [options, setOptions] = useState<MetaOption[]>(saved?.options ?? []);
  const [tags, setTags] = useState<Tag[]>(saved?.tags ?? []);
  const [managingTags, setManagingTags] = useState(false);
  const { isAdmin, user, access } = useAuth();
  const [loading, setLoading] = useState(!saved);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState(restore ? saved!.query : '');
  const [typeFilter, setTypeFilter] = useState<number | 'all'>(restore ? saved!.typeFilter : 'all');
  // A meta shows when it has every one of these tags.
  const [tagFilter, setTagFilter] = useState<number[]>(restore ? saved!.tagFilter : []);
  const [view, changeView] = useView(VIEW_KEY);

  // The New meta dialog: open, and the type picked from the New meta menu (it opens on it).
  const [searchParams, setSearchParams] = useSearchParams();
  // ?new=1 (from Home's New meta) opens the New meta dialog.
  const [creating, setCreating] = useState(() => !collection && searchParams.get('new') === '1');
  const navigate = useNavigate();
  useEffect(() => {
    if (searchParams.has('new')) setSearchParams({}, { replace: true });
  }, []);
  const [newTypeId, setNewTypeId] = useState<number | undefined>(undefined);
  const [deleting, setDeleting] = useState<Meta | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [menu, setMenu] = useState<{ meta: Meta; at: MenuAt } | null>(null);
  const [replacing, setReplacing] = useState<Meta | null>(null);
  // The import dialog (export is a section of each meta's page).
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const openMenu = useCallback((meta: Meta, at: MenuAt) => setMenu({ meta, at }), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuError = useCallback((m: string) => setError(m), []);

  async function loadAll() {
    setError(null);
    try {
      const [m, item, o, g] = await Promise.all([metaApi.list(), metaApi.types(), metaApi.options(), metaApi.tags()]);
      // Every meta, apps too (the Apps page only opens them). A builder sees the metas they made
      // or were shared with them (below), and makes only the types they may.
      setAllMetas(m);
      setTypes(item.filter((x) => isAdmin || !!access?.build_types?.includes(x.code)));
      setOptions(o);
      setTags(g);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Metas could not be loaded. Check that the API is running at the address in .env.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const sharedIds = useMemo(() => new Set(library?.shared.map((e) => e.meta_id) ?? []), [library]);
  const entries = useMemo(() => new Map((collection ? (library?.[collection] ?? []) : []).map((e) => [e.meta_id, e])), [collection, library]);
  const metas = useMemo(() => {
    const mine = allMetas.filter((x) => isAdmin || x.created_by === user?.id || sharedIds.has(x.id));
    if (!collection) return mine;
    const byId = new Map(mine.map((m) => [m.id, m]));
    return [...entries.keys()].map((id) => byId.get(id)).filter((m): m is Meta => !!m);
  }, [allMetas, isAdmin, user?.id, sharedIds, collection, entries]);
  const look = collection ? COLLECTIONS[collection] : null;
  const noteOf = (m: Meta) => {
    const e = look && entries.get(m.id);
    return e ? look.note(e) : undefined;
  };
  const onStar = useCallback((m: Meta) => void toggleStar(m.id), [toggleStar]);

  const counts = useMemo(() => {
    const byType = new Map<number, number>();
    for (const m of metas) if (m.type_id) byType.set(m.type_id, (byType.get(m.type_id) ?? 0) + 1);
    return byType;
  }, [metas]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return metas.filter(
      (m) =>
        (typeFilter === 'all' || m.type_id === typeFilter) &&
        tagFilter.every((id) => m.tags?.some((item) => item.id === id)) &&
        (!q || m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q) || !!m.tags?.some((item) => item.name.toLowerCase().includes(q))),
    );
  }, [metas, query, typeFilter, tagFilter]);

  // Cards are drawn PAGE at a time, PAGE more as the list's end scrolls into view; a new search,
  // filter or view starts again from the top.
  const listKey = `${query}|${typeFilter}|${tagFilter.join(',')}|${view}`;
  const [page, setPage] = useState({ key: listKey, count: restore ? saved!.count : PAGE });
  if (page.key !== listKey) setPage({ key: listKey, count: PAGE });
  const shown = visible.slice(0, page.key === listKey ? page.count : PAGE);
  const showMore = useCallback(() => setPage((p) => ({ ...p, count: p.count + PAGE })), []);

  // Kept up to date so leaving the page can save it; the scroll is read as it goes, before the next page moves it.
  const current = useRef<Omit<Snapshot, 'scrollY'> | null>(null);
  current.current = loading ? null : { allMetas, types, options, tags, query, typeFilter, tagFilter, count: page.count };
  useLayoutEffect(() => {
    if (restore) window.scrollTo(0, saved!.scrollY);
    return () => {
      if (current.current) snapshots.set(snapshotKey, { ...current.current, scrollY: window.scrollY });
    };
  }, []);

  const tagCounts = useMemo(() => {
    const byTag = new Map<number, number>();
    for (const m of metas) for (const item of m.tags ?? []) byTag.set(item.id, (byTag.get(item.id) ?? 0) + 1);
    return byTag;
  }, [metas]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await metaApi.remove(deleting.id);
      setDeleting(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The meta could not be deleted.'));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={look ? t(look.title) : t('Metas')}
        subtitle={look ? t(look.subtitle) : t('Your apps and the grids, forms, calendars and other screens they link to. Open one to build it.')}
        actions={
          !look && (
            <div className="flex gap-2">
              {isAdmin && (
                <Button size="sm" color="secondary" iconLeading={Tag01} onPress={() => setManagingTags(true)}>
                  {t('Tags')}
                </Button>
              )}
              {/* New meta: pick its type, or bring metas in from a file or an Excel sheet. */}
              <Dropdown.Root>
                <Button size="sm" iconLeading={Plus} iconTrailing={ChevronDown}>
                  {t('New meta')}
                </Button>
                <Dropdown.Popover placement="bottom end" className="max-h-[70vh] w-64">
                  <Dropdown.Menu
                    onAction={(key) => {
                      const id = String(key);
                      if (id === 'import') setImporting(true);
                      else if (id === 'excel') setFromExcel(true);
                      else {
                        setNewTypeId(Number(id.slice(5)));
                        setCreating(true);
                      }
                    }}
                  >
                    <Dropdown.Section aria-label={t('Type')}>
                      {types.map((item) => (
                        <Dropdown.Item key={item.id} id={`type-${item.id}`} textValue={item.name}>
                          <span className="flex items-center gap-2">
                            <TypeIcon code={item.code} size="sm" />
                            <span className="truncate">{item.name}</span>
                          </span>
                        </Dropdown.Item>
                      ))}
                    </Dropdown.Section>
                    {isAdmin && (
                      <>
                        <Dropdown.Separator />
                        <Dropdown.Section>
                          <Dropdown.Item id="import" icon={Upload01} label={t('Import')} />
                          <Dropdown.Item id="excel" icon={Table} label={t('Create from Excel')} />
                        </Dropdown.Section>
                      </>
                    )}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown.Root>
            </div>
          )
        }
      />
      {fromExcel && <ExcelStructureModal onClose={() => setFromExcel(false)} />}
      {importing && (
        <ImportMetasModal
          onClose={() => setImporting(false)}
          onDone={(n) => {
            setImporting(false);
            setNotice(n);
            void loadAll();
          }}
        />
      )}
      {managingTags && <TagsModal tags={tags} onClose={() => setManagingTags(false)} onChanged={loadAll} />}

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}
      {notice && !error && (
        <p role="status" className="mb-4 text-sm font-medium text-success-primary">
          {notice}
        </p>
      )}

      {/* Toolbar: type and tag filters, search, view toggle. It stays at the top while the list scrolls,
          on the page colour edge to edge (the negative margins cover the main area's padding). */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-col gap-3 bg-secondary px-4 py-3 sm:-mx-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <TypeFilterMenu types={types} counts={counts} total={metas.length} value={typeFilter} onChange={setTypeFilter} />
          <TagFilterMenu tags={tags} counts={tagCounts} value={tagFilter} onChange={setTagFilter} />
          {(typeFilter !== 'all' || tagFilter.length > 0) && (
            <Button
              size="sm"
              color="link-gray"
              onPress={() => {
                setTypeFilter('all');
                setTagFilter([]);
              }}
            >
              {t('Clear filters')}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Input
            aria-label={t('Search metas')}
            type="search"
            size="sm"
            icon={SearchLg}
            value={query}
            onChange={setQuery}
            placeholder={t('Search by name or code')}
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

      {loading || (look && !library) ? (
        <SkeletonGrid />
      ) : metas.length === 0 && look ? (
        <div className="rounded-xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary">
          <look.icon className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
          <p className="mt-3 text-md font-semibold text-primary">{t(look.empty)}</p>
          <p className="mt-1 text-sm text-tertiary">{t(look.emptyHint)}</p>
          <Link to="/metas" className="mt-4 inline-block text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
            {t('Browse metas')}
          </Link>
        </div>
      ) : metas.length === 0 ? (
        <EmptyState types={types} onCreate={() => setCreating(true)} />
      ) : visible.length === 0 ? (
        <div className="rounded-xl bg-primary px-6 py-12 text-center shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-md font-semibold text-primary">{t('No metas match these filters.')}</p>
          <p className="mt-1 text-sm text-tertiary">{t('Try another search, type or tag.')}</p>
          <Button
            color="secondary"
            className="mt-5"
            onPress={() => {
              setQuery('');
              setTypeFilter('all');
              setTagFilter([]);
            }}
          >
            {t('Clear filters')}
          </Button>
        </div>
      ) : view === 'grid' ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {shown.map((m) => (
              <MetaCard key={m.id} meta={m} onMenu={openMenu} starred={starred.has(m.id)} onStar={onStar} note={noteOf(m)} />
            ))}
          </div>
          <LoadMore shown={shown.length} total={visible.length} onMore={showMore} />
        </>
      ) : (
        <>
          <div className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            {shown.map((m) => (
              <MetaRow key={m.id} meta={m} onMenu={openMenu} starred={starred.has(m.id)} onStar={onStar} note={noteOf(m)} />
            ))}
          </div>
          <LoadMore shown={shown.length} total={visible.length} onMore={showMore} />
        </>
      )}

      {creating && (
        <MetaFormModal
          meta={null}
          types={types}
          options={options}
          presetTypeId={newTypeId}
          onClose={() => {
            setCreating(false);
            setNewTypeId(undefined);
          }}
          // A new meta opens on its own page, to be built there.
          onSaved={(saved) => navigate(`/metas/${saved.id}`)}
        />
      )}

      {menu && (
        <MetaContextMenu
          key={`${menu.meta.id}-${menu.at.x}-${menu.at.y}`}
          meta={menu.meta}
          at={menu.at}
          tags={tags}
          onClose={closeMenu}
          full={isAdmin}
          starred={starred.has(menu.meta.id)}
          onStar={onStar}
          onShare={isAdmin || menu.meta.created_by === user?.id || sharedIds.has(menu.meta.id) ? setSharing : undefined}
          onDelete={setDeleting}
          onReplace={setReplacing}
          onChanged={(n) => {
            setError(null);
            if (n) setNotice(n);
            void loadAll();
          }}
          onError={menuError}
        />
      )}

      {sharing && <ShareMetaModal meta={sharing} onClose={() => setSharing(null)} onShared={(n) => setNotice(n)} />}

      {replacing && (
        <ReplaceMetaModal
          target={replacing}
          metas={metas}
          onClose={() => setReplacing(null)}
          onDone={(n) => {
            setReplacing(null);
            setNotice(n);
            void loadAll();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('Delete {name}?', { name: deleting.name })}
          message={t("This also deletes its {count} {rows}. Other metas that link to it will lose that link. This can't be undone.", {
            count: deleting.params_count ?? 0,
            rows: t(`${typeLook(deleting.type?.code).rowNoun}s`),
          })}
          confirmLabel={t('Delete meta')}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3" aria-label={t('Loading metas')}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ))}
    </div>
  );
}

/**
 * How many metas are drawn at a time: enough to fill a wide screen at once, or the next pages
 * follow one after another while it opens. Off-screen cards are cheap (content-visibility).
 */
const PAGE = 100;

function EmptyState({ types, onCreate }: { types: MetaType[]; onCreate: () => void }) {
  const shown = types.length ? types.slice(0, 5).map((item) => item.code) : ['app', 'datagrid', 'form', 'calendar', 'tabs'];
  return (
    <div className="rounded-2xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary ring-inset">
      <div className="mx-auto flex max-w-md justify-center gap-3">
        {shown.map((code) => (
          <TypeIcon key={code} code={code} size="lg" />
        ))}
      </div>
      <h2 className="mt-8 text-lg font-semibold text-primary">{t('Start with your first app')}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-tertiary">{t('Create an app meta, then add grids and forms and link them from its menu.')}</p>
      <Button size="lg" iconLeading={Plus} className="mt-6" onPress={onCreate}>
        {t('New meta')}
      </Button>
    </div>
  );
}

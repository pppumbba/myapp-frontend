import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaType, type Tag } from '../../lib/metaApi';
import { useAuth } from '../../auth/AuthContext';
import { AppShell, PageHeader } from '../../components/AppShell';
import { ClockRewind, Download01, Table, Grid01, Link03, List, Plus, SearchLg, Tag01, Upload01 } from '@untitledui/icons';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { ConfirmDialog } from '../../components/Modal';
import { TypePreview, typeLook } from '../../components/TypePreview';
import { MetaCard, MetaRow } from './MetaCard';
import { DeletedMetasModal } from './DeletedMetasModal';
import { ExcelStructureModal } from './ExcelStructureModal';
import { MetaContextMenu, ReplaceMetaModal, type MenuAt } from './MetaContextMenu';
import { MetaFormModal } from './MetaFormModal';
import { ExportMetasModal, ImportMetasModal } from './MetaTransferModals';
import { TagsModal, tagColor } from './MetaTags';
import { t } from '@/i18n';

type View = 'grid' | 'list';
const VIEW_KEY = 'metas_view';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage can be blocked; the toggle still works for this visit.
  }
}

export default function MetasPage() {
  const [showDeleted, setShowDeleted] = useState(false);
  const [fromExcel, setFromExcel] = useState(false);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [types, setTypes] = useState<MetaType[]>([]);
  const [options, setOptions] = useState<MetaOption[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [managingTags, setManagingTags] = useState(false);
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<number | 'all'>('all');
  // A meta shows when it has every one of these tags.
  const [tagFilter, setTagFilter] = useState<number[]>([]);
  const [view, setView] = useState<View>(readView);

  // undefined: closed, null: creating, Meta: editing.
  const [editing, setEditing] = useState<Meta | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Meta | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [menu, setMenu] = useState<{ meta: Meta; at: MenuAt } | null>(null);
  const [replacing, setReplacing] = useState<Meta | null>(null);
  // Metas picked to export (the one right-clicked, or none from the header), and the import dialog.
  const [exporting, setExporting] = useState<number[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const openMenu = useCallback((meta: Meta, at: MenuAt) => setMenu({ meta, at }), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuError = useCallback((m: string) => setError(m), []);

  async function loadAll() {
    setError(null);
    try {
      const [m, item, o, g] = await Promise.all([metaApi.list(), metaApi.types(), metaApi.options(), metaApi.tags()]);
      // Apps have their own page; this one is for the screens they link to.
      setMetas(m.filter((x) => x.type?.code !== 'app'));
      setTypes(item.filter((x) => x.code !== 'app'));
      setOptions(o);
      setTags(g);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Metas could not be loaded. Check that the API is running at the address in .env."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function changeView(v: View) {
    setView(v);
    saveView(v);
  }

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
      setError(err instanceof ApiError ? err.message : t("The meta could not be deleted."));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title={t("Metas")}
        subtitle={t("The grids, forms, calendars, Gantt charts and tab sets your apps link to. Open one to edit its columns or fields.")}
        actions={
          <div className="flex gap-2">
            {isAdmin && (
              <Button size="sm" color="secondary" iconLeading={Tag01} onPress={() => setManagingTags(true)}>
                {t("Tags")}
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" color="secondary" iconLeading={Link03} href="/metas/usage">
                {t("Where used")}
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" color="secondary" iconLeading={Download01} onPress={() => setExporting([])}>
                {t("Export")}
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" color="secondary" iconLeading={Upload01} onPress={() => setImporting(true)}>
                {t("Import")}
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" color="secondary" iconLeading={Table} onPress={() => setFromExcel(true)}>
                {t("Create from Excel")}
              </Button>
            )}
            <Button size="sm" color="secondary" iconLeading={ClockRewind} onPress={() => setShowDeleted(true)}>
              {t("Deleted")}
            </Button>
            <Button size="sm" iconLeading={Plus} onPress={() => setEditing(null)}>
              {t("New meta")}
            </Button>
          </div>
        }
      />
      {showDeleted && <DeletedMetasModal onClose={() => setShowDeleted(false)} />}
      {fromExcel && <ExcelStructureModal onClose={() => setFromExcel(false)} />}
      {exporting && <ExportMetasModal metas={metas} initial={exporting} onClose={() => setExporting(null)} />}
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

      {/* Toolbar: search, type filters, view toggle */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("Filter by type")}>
          <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} count={metas.length}>
            {t("All")}
          </FilterChip>
          {types.map((item) => (
            <FilterChip
              key={item.id}
              active={typeFilter === item.id}
              onClick={() => setTypeFilter(item.id)}
              count={counts.get(item.id) ?? 0}
              color={typeLook(item.code).ink}
            >
              {item.name}
            </FilterChip>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Input
            aria-label={t("Search metas")}
            type="search"
            size="sm"
            icon={SearchLg}
            value={query}
            onChange={setQuery}
            placeholder={t("Search by name or code")}
            className="flex-1 lg:w-72 lg:flex-none"
          />
          <ButtonGroup
            size="sm"
            aria-label={t("Layout")}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[view]}
            onSelectionChange={(keys) => changeView([...keys][0] === 'list' ? 'list' : 'grid')}
          >
            <ButtonGroupItem id="grid" iconLeading={Grid01} aria-label={t("Cards")} />
            <ButtonGroupItem id="list" iconLeading={List} aria-label={t("List")} />
          </ButtonGroup>
        </div>
      </div>

      {tags.some((item) => tagCounts.has(item.id)) && (
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label={t("Filter by tag")}>
          <span className="text-sm font-medium text-tertiary">{t("Tags")}</span>
          {tags
            .filter((item) => tagCounts.has(item.id))
            .map((item) => (
              <FilterChip
                key={item.id}
                active={tagFilter.includes(item.id)}
                onClick={() => setTagFilter((f) => (f.includes(item.id) ? f.filter((id) => id !== item.id) : [...f, item.id]))}
                count={tagCounts.get(item.id) ?? 0}
                color={`var(--color-utility-${tagColor(item)}-500)`}
              >
                {item.name}
              </FilterChip>
            ))}
        </div>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : metas.length === 0 ? (
        <EmptyState types={types} onCreate={() => setEditing(null)} />
      ) : visible.length === 0 ? (
        <div className="rounded-xl bg-primary px-6 py-12 text-center shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-md font-semibold text-primary">{t("No metas match these filters.")}</p>
          <p className="mt-1 text-sm text-tertiary">{t("Try another search, type or tag.")}</p>
          <Button
            color="secondary"
            className="mt-5"
            onPress={() => {
              setQuery('');
              setTypeFilter('all');
              setTagFilter([]);
            }}
          >
            {t("Clear filters")}
          </Button>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {visible.map((m) => (
            <MetaCard key={m.id} meta={m} onEdit={setEditing} onDelete={setDeleting} onMenu={isAdmin ? openMenu : undefined} />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {visible.map((m) => (
            <MetaRow key={m.id} meta={m} onEdit={setEditing} onDelete={setDeleting} onMenu={isAdmin ? openMenu : undefined} />
          ))}
        </div>
      )}

      {editing !== undefined && (
        <MetaFormModal
          meta={editing}
          types={types}
          options={options}
          presetTypeId={typeFilter === 'all' ? undefined : typeFilter}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            loadAll();
          }}
        />
      )}

      {menu && (
        <MetaContextMenu
          key={`${menu.meta.id}-${menu.at.x}-${menu.at.y}`}
          meta={menu.meta}
          at={menu.at}
          tags={tags}
          onClose={closeMenu}
          onEdit={setEditing}
          onDelete={setDeleting}
          onReplace={setReplacing}
          onExport={(m) => setExporting([m.id])}
          onChanged={(n) => {
            setError(null);
            if (n) setNotice(n);
            void loadAll();
          }}
          onError={menuError}
        />
      )}

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
          message={t("This also deletes its {count} {rows}. Other metas that link to it will lose that link. This can't be undone.", { count: deleting.params_count ?? 0, rows: t(`${typeLook(deleting.type?.code).rowNoun}s`) })}
          confirmLabel={t("Delete meta")}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </AppShell>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  color?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold shadow-xs ring-1 ring-inset transition duration-100 ease-linear ${
        active ? 'bg-active text-secondary_hover ring-primary' : 'bg-primary text-secondary ring-primary hover:bg-primary_hover hover:text-secondary_hover'
      }`}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />}
      {children}
      <span className="rounded-full bg-secondary px-1.5 text-xs font-medium tabular-nums text-tertiary ring-1 ring-secondary ring-inset">{count}</span>
    </button>
  );
}


function SkeletonGrid() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4" aria-label={t("Loading metas")}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-60 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function EmptyState({ types, onCreate }: { types: MetaType[]; onCreate: () => void }) {
  const shown = types.length ? types.slice(0, 5).map((item) => item.code) : ['app', 'datagrid', 'form', 'calendar', 'tabs'];
  return (
    <div className="rounded-2xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary ring-inset">
      <div className="mx-auto flex max-w-md justify-center gap-3">
        {shown.map((code) => (
          <div key={code} className="w-16 rounded-lg p-1.5" style={{ background: typeLook(code).tint }}>
            <TypePreview code={code} className="w-full" />
          </div>
        ))}
      </div>
      <h2 className="mt-8 text-lg font-semibold text-primary">{t("Start with your first app")}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-tertiary">
        {t("Create an app meta, then add grids and forms and link them from its menu.")}
      </p>
      <Button size="lg" iconLeading={Plus} className="mt-6" onPress={onCreate}>
        {t("New meta")}
      </Button>
    </div>
  );
}

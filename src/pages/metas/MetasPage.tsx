import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaType } from '../../lib/metaApi';
import { AppShell, PageHeader } from '../../components/AppShell';
import { ClockRewind, Grid01, List, Plus, SearchLg } from '@untitledui/icons';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { ConfirmDialog } from '../../components/Modal';
import { TypePreview, typeLook } from '../../components/TypePreview';
import { MetaCard, MetaRow } from './MetaCard';
import { DeletedMetasModal } from './DeletedMetasModal';
import { MetaFormModal } from './MetaFormModal';

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
  const [metas, setMetas] = useState<Meta[]>([]);
  const [types, setTypes] = useState<MetaType[]>([]);
  const [options, setOptions] = useState<MetaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<number | 'all'>('all');
  const [view, setView] = useState<View>(readView);

  // undefined: closed, null: creating, Meta: editing.
  const [editing, setEditing] = useState<Meta | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Meta | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function loadAll() {
    setError(null);
    try {
      const [m, t, o] = await Promise.all([metaApi.list(), metaApi.types(), metaApi.options()]);
      // Apps have their own page; this one is for the screens they link to.
      setMetas(m.filter((x) => x.type?.code !== 'app'));
      setTypes(t.filter((x) => x.code !== 'app'));
      setOptions(o);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Metas could not be loaded. Check that the API is running at the address in .env.');
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
        (!q || m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)),
    );
  }, [metas, query, typeFilter]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await metaApi.remove(deleting.id);
      setDeleting(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The meta could not be deleted.');
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Metas"
        subtitle="The grids, forms, calendars, Gantt charts and tab sets your apps link to. Open one to edit its columns or fields."
        actions={
          <div className="flex gap-2">
            <Button size="sm" color="secondary" iconLeading={ClockRewind} onPress={() => setShowDeleted(true)}>
              Deleted
            </Button>
            <Button size="sm" iconLeading={Plus} onPress={() => setEditing(null)}>
              New meta
            </Button>
          </div>
        }
      />
      {showDeleted && <DeletedMetasModal onClose={() => setShowDeleted(false)} />}

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Toolbar: search, type filters, view toggle */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} count={metas.length}>
            All
          </FilterChip>
          {types.map((t) => (
            <FilterChip
              key={t.id}
              active={typeFilter === t.id}
              onClick={() => setTypeFilter(t.id)}
              count={counts.get(t.id) ?? 0}
              color={typeLook(t.code).ink}
            >
              {t.name}
            </FilterChip>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Input
            aria-label="Search metas"
            type="search"
            size="sm"
            icon={SearchLg}
            value={query}
            onChange={setQuery}
            placeholder="Search by name or code"
            className="flex-1 lg:w-72 lg:flex-none"
          />
          <ButtonGroup
            size="sm"
            aria-label="Layout"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[view]}
            onSelectionChange={(keys) => changeView([...keys][0] === 'list' ? 'list' : 'grid')}
          >
            <ButtonGroupItem id="grid" iconLeading={Grid01} aria-label="Cards" />
            <ButtonGroupItem id="list" iconLeading={List} aria-label="List" />
          </ButtonGroup>
        </div>
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : metas.length === 0 ? (
        <EmptyState types={types} onCreate={() => setEditing(null)} />
      ) : visible.length === 0 ? (
        <div className="rounded-xl bg-primary px-6 py-12 text-center shadow-xs ring-1 ring-secondary ring-inset">
          <p className="text-md font-semibold text-primary">No metas match these filters.</p>
          <p className="mt-1 text-sm text-tertiary">Try another search or type.</p>
          <Button
            color="secondary"
            className="mt-5"
            onPress={() => {
              setQuery('');
              setTypeFilter('all');
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {visible.map((m) => (
            <MetaCard key={m.id} meta={m} onEdit={setEditing} onDelete={setDeleting} />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {visible.map((m) => (
            <MetaRow key={m.id} meta={m} onEdit={setEditing} onDelete={setDeleting} />
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

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message={`This also deletes its ${deleting.params_count ?? 0} ${typeLook(deleting.type?.code).rowNoun}(s). Other metas that link to it will lose that link. This can't be undone.`}
          confirmLabel="Delete meta"
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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4" aria-label="Loading metas">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-60 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function EmptyState({ types, onCreate }: { types: MetaType[]; onCreate: () => void }) {
  const shown = types.length ? types.slice(0, 5).map((t) => t.code) : ['app', 'datagrid', 'form', 'calendar', 'tabs'];
  return (
    <div className="rounded-2xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary ring-inset">
      <div className="mx-auto flex max-w-md justify-center gap-3">
        {shown.map((code) => (
          <div key={code} className="w-16 rounded-lg p-1.5" style={{ background: typeLook(code).tint }}>
            <TypePreview code={code} className="w-full" />
          </div>
        ))}
      </div>
      <h2 className="mt-8 text-lg font-semibold text-primary">Start with your first app</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-tertiary">
        Create an app meta, then add grids and forms and link them from its menu.
      </p>
      <Button size="lg" iconLeading={Plus} className="mt-6" onPress={onCreate}>
        New meta
      </Button>
    </div>
  );
}

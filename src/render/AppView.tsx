import type { FC } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart01,
  Calendar,
  Circle,
  Database01,
  File06,
  Folder,
  Grid01,
  HomeLine,
  Package,
  Plus,
  Receipt,
  SearchLg,
  Settings01,
  ShoppingCart01,
  Truck01,
  Users01,
} from '@untitledui/icons';
import type { MetaParam } from '../lib/metaApi';
import { MetaView } from './MetaView';
import { title, useMetaDef, type MetaDef } from './definitions';

// icon_cls on a menu item picks one of these.
const icons: Record<string, FC<{ className?: string }>> = {
  cart: ShoppingCart01,
  plus: Plus,
  file: File06,
  receipt: Receipt,
  database: Database01,
  folder: Folder,
  grid: Grid01,
  home: HomeLine,
  package: Package,
  chart: BarChart01,
  calendar: Calendar,
  users: Users01,
  truck: Truck01,
  search: SearchLg,
  settings: Settings01,
};

const menuLabel = (p: MetaParam) => p.label_name || p.param_name;

/** Menu items that open something, in menu order, for picking the first screen. */
function screens(items: MetaParam[]): MetaParam[] {
  return items.flatMap((p) => (p.is_show ? [...(p.ref_meta_id ? [p] : []), ...screens(p.children ?? [])] : []));
}

/**
 * An app meta: its params are the menu. Items with ref_meta_id open that screen; items
 * without one but with children are group headings. The open screen is kept in ?screen=.
 */
export function AppView({ def }: { def: MetaDef }) {
  const [search, setSearch] = useSearchParams();
  const all = screens(def.params);
  const current = all.find((p) => String(p.id) === search.get('screen')) ?? all[0];

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-secondary bg-primary px-4 py-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0 lg:py-6">
        <div className="flex items-center gap-3 lg:px-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-solid text-md font-semibold text-white" aria-hidden="true">
            {title(def.meta).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-md font-semibold text-primary">{title(def.meta)}</p>
            {def.meta.description && <p className="truncate text-xs text-tertiary">{def.meta.description}</p>}
          </div>
        </div>

        <nav aria-label={`${title(def.meta)} menu`} className="mt-4 flex gap-1 overflow-x-auto lg:mt-8 lg:flex-col lg:overflow-visible">
          <MenuItems items={def.params} currentId={current?.id} onOpen={(p) => setSearch({ screen: String(p.id) })} />
        </nav>

        <div className="mt-4 hidden lg:mt-auto lg:block lg:border-t lg:border-secondary lg:px-2 lg:pt-5">
          <Link
            to={`/metas/${def.meta.id}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-tertiary hover:text-tertiary_hover"
          >
            <ArrowLeft className="size-4 text-fg-quaternary" />
            Back to builder
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-6xl">
          {current?.ref_meta_id ? (
            <>
              <h1 className="mb-6 text-display-xs font-semibold text-primary">{menuLabel(current)}</h1>
              <MetaView key={current.id} metaId={current.ref_meta_id} />
            </>
          ) : (
            <div className="rounded-xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary">
              <p className="text-md font-semibold text-primary">This app has no screens yet</p>
              <p className="mt-1 text-sm text-tertiary">Add menu items that refer to a grid, form or tab set.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function MenuItems({
  items,
  currentId,
  onOpen,
  depth = 0,
}: {
  items: MetaParam[];
  currentId?: number;
  onOpen: (p: MetaParam) => void;
  depth?: number;
}) {
  return (
    <>
      {items
        .filter((p) => p.is_show)
        .map((p) => {
          const Icon = (p.icon_cls && icons[p.icon_cls]) || Circle;
          const children = p.children ?? [];

          // A heading for its children.
          if (!p.ref_meta_id) {
            return children.length ? (
              <div key={p.id} className="flex gap-1 lg:mt-4 lg:flex-col lg:first:mt-0">
                <p className="hidden px-3 pb-1 text-xs font-semibold tracking-wide text-quaternary uppercase lg:block">{menuLabel(p)}</p>
                <MenuItems items={children} currentId={currentId} onOpen={onOpen} depth={depth + 1} />
              </div>
            ) : null;
          }

          const active = p.id === currentId;
          return (
            <div key={p.id} className="flex gap-1 lg:flex-col">
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onOpen(p)}
                className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-left text-md font-semibold whitespace-nowrap outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 ${
                  active ? 'bg-active text-secondary_hover' : 'text-secondary hover:bg-primary_hover hover:text-secondary_hover'
                }`}
              >
                <Icon className="size-5 shrink-0 text-fg-quaternary" />
                {menuLabel(p)}
              </button>
              {children.length > 0 && (
                <div className="flex gap-1 lg:ml-4 lg:flex-col lg:border-l lg:border-secondary lg:pl-2">
                  <MenuItems items={children} currentId={currentId} onOpen={onOpen} depth={depth + 1} />
                </div>
              )}
            </div>
          );
        })}
    </>
  );
}

/** Loads a meta and shows it full-screen: apps with their own menu, anything else in a simple frame. */
export function RunMeta({ metaId }: { metaId: number }) {
  const { def, error } = useMetaDef(metaId);

  if (def?.meta.type?.code === 'app') return <AppView def={def} />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-secondary bg-primary px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <p className="truncate text-md font-semibold text-primary">{def ? title(def.meta) : error ? 'Not available' : 'Loading…'}</p>
          <Link to={`/metas/${metaId}`} className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-tertiary hover:text-tertiary_hover">
            <ArrowLeft className="size-4 text-fg-quaternary" />
            Back to builder
          </Link>
        </div>
      </header>
      <main className="px-4 py-8 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-6xl">
          <MetaView metaId={metaId} />
        </div>
      </main>
    </div>
  );
}

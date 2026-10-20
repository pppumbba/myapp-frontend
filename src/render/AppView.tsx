import type { FC } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart01,
  Calendar,
  ChevronRight,
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
import { AppSidebar } from '../components/AppSidebar';
import type { NavItemType } from '@/components/application/app-navigation/config';
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

/** The menu items leading to the one with this id, itself included. */
function trail(items: MetaParam[], id: number): MetaParam[] | null {
  for (const p of items) {
    if (p.id === id) return [p];
    const below = trail(p.children ?? [], id);
    if (below) return [p, ...below];
  }
  return null;
}

/**
 * An app meta: its params are the menu. Items with ref_meta_id open that screen; items
 * without one but with children are collapsible groups. The open screen is kept in ?screen=.
 */
export function AppView({ def }: { def: MetaDef }) {
  const [search] = useSearchParams();
  const all = screens(def.params);
  const current = all.find((p) => String(p.id) === search.get('screen')) ?? all[0];
  const mark = (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-solid text-sm font-semibold text-white" aria-hidden="true">
      {title(def.meta).charAt(0).toUpperCase()}
    </span>
  );

  // The app's logo is the way home, to the builder's start page.
  const homeLink = 'rounded-lg outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <AppSidebar
      label={`${title(def.meta)} menu`}
      logo={
        <Link to="/" aria-label="Home" className={`flex items-center gap-2.5 ${homeLink}`}>
          {mark}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary">{title(def.meta)}</p>
            {def.meta.description && <p className="truncate text-xs text-tertiary">{def.meta.description}</p>}
          </div>
        </Link>
      }
      logoMark={
        <Link to="/" aria-label="Home" className={homeLink}>
          {mark}
        </Link>
      }
      items={navItems(def.params)}
      activeUrl={current ? screenUrl(current) : undefined}    >
      {current?.ref_meta_id ? (
        <>
          {/* Each screen draws its own title, so the page only says where you are. */}
          <nav aria-label="Breadcrumb" className="mb-5">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm">
              {[title(def.meta), ...(trail(def.params, current.id) ?? [current]).map(menuLabel)].map((label, i, all) => (
                <li key={i} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="size-4 text-fg-quaternary" aria-hidden="true" />}
                  <span
                    aria-current={i === all.length - 1 ? 'page' : undefined}
                    className={i === all.length - 1 ? 'rounded-md bg-primary_hover px-2 py-0.5 font-semibold text-secondary' : 'font-medium text-tertiary'}
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ol>
          </nav>
          <MetaView key={current.id} metaId={current.ref_meta_id} />
        </>
      ) : (
        <div className="rounded-xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary">
          <p className="text-md font-semibold text-primary">This app has no screens yet</p>
          <p className="mt-1 text-sm text-tertiary">Add menu items that refer to a grid, form or tab set.</p>
        </div>
      )}
    </AppSidebar>
  );
}

const screenUrl = (p: MetaParam) => `?screen=${p.id}`;

/**
 * The menu params as Untitled UI nav items. An item with children becomes a collapsible
 * group listing every screen beneath it (deeper levels are flattened into the group).
 */
function navItems(items: MetaParam[]): NavItemType[] {
  return items
    .filter((p) => p.is_show)
    .flatMap((p): NavItemType[] => {
      const icon = (p.icon_cls && icons[p.icon_cls]) || Circle;
      const children = screens(p.children ?? []);
      if (children.length) {
        const inside = p.ref_meta_id ? [p, ...children] : children;
        return [{ label: menuLabel(p), icon, items: inside.map((c) => ({ label: menuLabel(c), href: screenUrl(c) })) }];
      }
      return p.ref_meta_id ? [{ label: menuLabel(p), icon, href: screenUrl(p) }] : [];
    });
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

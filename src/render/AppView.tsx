import { useMemo, type FC } from 'react';
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
  LogIn01,
  Package,
  Plus,
  Receipt,
  SearchLg,
  Settings01,
  ShoppingCart01,
  Tool01,
  Truck01,
  Users01,
  Zap,
} from '@untitledui/icons';
import type { MetaParam } from '../lib/metaApi';
import { AppSidebar } from '../components/AppSidebar';
import type { NavItemType } from '@/components/application/app-navigation/config';
import { DrilldownHost } from './DrilldownHost';
import { MetaView } from './MetaView';
import { AppMetaContext } from './appContext';
import { presetOf, title, useMetaDef, type MetaDef } from './definitions';
import { useAuth } from '../auth/AuthContext';
import { useAppTheme } from '../components/ThemeProvider';
import { t } from '@/i18n';

// icon_cls on a menu item picks one of these.
// Exported for the studio's icon picker.
export const MENU_ICONS: Record<string, FC<{ className?: string }>> = {
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
  tool: Tool01,
  zap: Zap,
};

const menuLabel = (p: MetaParam) => p.label_name || p.param_name;

/** Menu items that open something, in menu order, for picking the first screen. */
function screens(items: MetaParam[]): MetaParam[] {
  return items.flatMap((p) => (p.is_show ? [...(p.ref_meta_id ? [p] : []), ...screens(p.children ?? [])] : []));
}

/**
 * The menu as this user may see it: items whose screen they may not view lose their link,
 * and groups left with nothing to open drop out.
 */
function allowedMenu(items: MetaParam[], canView: (metaId: number) => boolean): MetaParam[] {
  return items.flatMap((p) => {
    const children = allowedMenu(p.children ?? [], canView);
    const opens = !!p.ref_meta_id && canView(p.ref_meta_id);
    return opens || children.length ? [{ ...p, ref_meta_id: opens ? p.ref_meta_id : null, children }] : [];
  });
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
 * home is where its logo leads: the builder's start page, or on a portal the portal itself.
 */
export function AppView({ def, home = '/' }: { def: MetaDef; home?: string }) {
  const { user, can } = useAuth();
  useAppTheme(def.meta.id);
  const [search] = useSearchParams();
  const menu = useMemo(() => allowedMenu(def.params, (id) => can(id, 'view')), [def.params, can]);
  const all = screens(menu);
  const current = all.find((p) => String(p.id) === search.get('screen')) ?? all[0];
  const mark = (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-solid text-sm font-semibold text-white" aria-hidden="true">
      {title(def.meta).charAt(0).toUpperCase()}
    </span>
  );

  // The app's logo is the way home.
  const homeLink = 'rounded-lg outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <AppSidebar
      label={t('{name} menu', { name: title(def.meta) })}
      logo={
        <Link to={home} aria-label={t("Home")} className={`flex items-center gap-2.5 ${homeLink}`}>
          {mark}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary">{title(def.meta)}</p>
            {def.meta.description && <p className="truncate text-xs text-tertiary">{def.meta.description}</p>}
          </div>
        </Link>
      }
      logoMark={
        <Link to={home} aria-label={t("Home")} className={homeLink}>
          {mark}
        </Link>
      }
      items={navItems(menu)}
      activeUrl={current ? screenUrl(current) : undefined}    >
      {current?.ref_meta_id ? (
        <>
          {/* Each screen draws its own title, so the page only says where you are. */}
          <nav aria-label={t("Breadcrumb")} className="mb-5">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm">
              {[title(def.meta), ...(trail(menu, current.id) ?? [current]).map(menuLabel)].map((label, i, all) => (
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
          <AppMetaContext.Provider value={def.meta.id}>
            <DrilldownHost>
              <MetaView key={current.id} metaId={current.ref_meta_id} preset={presetOf(current, user)} fill />
            </DrilldownHost>
          </AppMetaContext.Provider>
        </>
      ) : (
        <div className="rounded-xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary">
          <p className="text-md font-semibold text-primary">{t("This app has no screens yet")}</p>
          <p className="mt-1 text-sm text-tertiary">{t("Add menu items that refer to a grid, form or tab set.")}</p>
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
      const icon = (p.icon_cls && MENU_ICONS[p.icon_cls]) || Circle;
      const children = screens(p.children ?? []);
      if (children.length) {
        const inside = p.ref_meta_id ? [p, ...children] : children;
        return [{ label: menuLabel(p), icon, items: inside.map((c) => ({ label: menuLabel(c), href: screenUrl(c) })) }];
      }
      return p.ref_meta_id ? [{ label: menuLabel(p), icon, href: screenUrl(p) }] : [];
    });
}

/**
 * Loads a meta and shows it full-screen: apps with their own menu, anything else in a simple
 * frame. On a portal (a public meta opened by anyone, see PortalPage) there is no way back to the builder.
 */
export function RunMeta({ metaId, portal = false }: { metaId: number; portal?: boolean }) {
  const { def, error } = useMetaDef(metaId);
  const { user } = useAuth();

  if (def?.meta.type?.code === 'app') return <AppView def={def} home={portal ? `/portal/${metaId}` : '/'} />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-secondary bg-primary px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <p className="truncate text-md font-semibold text-primary">{def ? title(def.meta) : error ? t("Not available") : t("Loading…")}</p>
          {!portal ? (
            <Link to={`/metas/${metaId}`} className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-tertiary hover:text-tertiary_hover">
              <ArrowLeft className="size-4 text-fg-quaternary" />
              {t("Back to builder")}
            </Link>
          ) : (
            !user && (
              <Link to="/login" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-tertiary hover:text-tertiary_hover">
                <LogIn01 className="size-4 text-fg-quaternary" />
                {t("Log in")}
              </Link>
            )
          )}
        </div>
      </header>
      <main className="px-4 py-8 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-6xl">
          <DrilldownHost>
            <MetaView metaId={metaId} fill />
          </DrilldownHost>
        </div>
      </main>
    </div>
  );
}

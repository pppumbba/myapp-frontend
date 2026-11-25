import { useMemo, type FC, type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart01,
  Calendar,
  Circle,
  ClockRewind,
  Database01,
  File06,
  Folder,
  Globe01,
  Grid01,
  HomeLine,
  Link01,
  LogIn01,
  Mail01,
  Package,
  Plus,
  Receipt,
  SearchLg,
  Settings01,
  Share07,
  ShoppingCart01,
  Star01,
  Tool01,
  Trash01,
  Truck01,
  Users01,
  Zap,
} from '@untitledui/icons';
import type { MetaParam } from '../lib/metaApi';
import { AppSidebar, menuSideOf, menuStyleOf } from '../components/AppSidebar';
import { useMenuStyles } from '../lib/menuStyle';
import { LogoMark } from '../components/AppShell';
import { AppImage } from '../components/AppArt';
import type { NavItemType } from '@/components/application/app-navigation/config';
import { DrilldownHost } from './DrilldownHost';
import { MetaView } from './MetaView';
import { useScreens } from '../lib/screenApi';
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
  trash: Trash01,
  zap: Zap,
  star: Star01,
  clock: ClockRewind,
  share: Share07,
  globe: Globe01,
  link: Link01,
  mail: Mail01,
};

export const menuLabel = (p: MetaParam) => p.label_name || p.param_name;

/** Menu items that open something, in menu order, for picking the first screen. */
export function screens(items: MetaParam[]): MetaParam[] {
  return items.flatMap((p) => (p.is_show ? [...(p.ref_meta_id ? [p] : []), ...screens(p.children ?? [])] : []));
}

/**
 * The menu as this user may see it: items whose screen they may not view lose their link,
 * and groups left with nothing to open drop out.
 */
export function allowedMenu(items: MetaParam[], canView: (metaId: number) => boolean): MetaParam[] {
  return items.flatMap((p) => {
    const children = allowedMenu(p.children ?? [], canView);
    const opens = !!p.ref_meta_id && canView(p.ref_meta_id);
    return opens || children.length ? [{ ...p, ref_meta_id: opens ? p.ref_meta_id : null, children }] : [];
  });
}

/** The menu items leading to the one with this id, itself included. */
export function trail(items: MetaParam[], id: number): MetaParam[] | null {
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
 *
 * Items that open a screen meta (a built-in page) link to the page's own address. Such a page
 * shows inside the app as children, with activePath naming its screen (see ScreenApp).
 */
export function AppView({ def, home = '/', children, activePath }: { def: MetaDef; home?: string; children?: ReactNode; activePath?: string }) {
  const { user, can } = useAuth();
  useAppTheme(def.meta.id);
  const [search] = useSearchParams();
  const screenList = useScreens();
  const menuStyles = useMenuStyles();
  // A picked menu style that is gone or turned off falls back to the built-in style.
  const customMenu = menuStyles?.find((s) => s.id === Number(def.meta.json_config?.menu_style_meta_id))?.menu ?? null;
  const menu = useMemo(() => allowedMenu(def.params, (id) => can(id, 'view')), [def.params, can]);
  const all = screens(menu);
  const paths = useMemo(() => new Map((screenList ?? []).map((s) => [s.id, s.path])), [screenList]);
  const pathOf = (p: MetaParam) => (p.ref_meta_id ? paths.get(p.ref_meta_id) : undefined);
  // Inside a built-in page, the other items lead back to the app's own address.
  const hrefOf = (p: MetaParam) => pathOf(p) ?? (children ? `/run/${def.meta.id}?screen=${p.id}` : screenUrl(p));
  const current = children
    ? all.find((p) => activePath !== undefined && pathOf(p) === activePath)
    : (all.find((p) => String(p.id) === search.get('screen')) ?? all[0]);
  const currentPath = current ? pathOf(current) : undefined;
  const menuStyle = menuStyleOf(def.meta.json_config?.menu_style);
  // The header style names the screen (its menu label and description) rather than the path to it,
  // except dashboards and forms, which draw their own title.
  const { def: screenDef } = useMetaDef(menuStyle === 'header' && !children ? current?.ref_meta_id : null);
  const selfTitled = ['dashboard', 'form'].includes(screenDef?.meta.type?.code ?? '');
  const heading = menuStyle === 'header' && current && (!current.ref_meta_id || screenDef) && !selfTitled ? { title: menuLabel(current), description: screenDef?.meta.description } : undefined;
  // The app's brand: its uploaded picture, round in the header's pill. With none (or its icon
  // switched off), the Wand mark, in its own indigo whatever the app's theme; the header's pill
  // holds it small, white in a brand circle.
  const mark =
    def.meta.image_path && def.meta.json_config?.show_icon !== false ? (
      <AppImage app={def.meta} variant="icon" className={menuStyle === 'header' ? 'size-9 shrink-0 rounded-full' : 'size-8 shrink-0 rounded-lg ring-1 ring-black/5'} />
    ) : menuStyle === 'header' ? (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-solid">
        <LogoMark size={16} className="translate-x-px translate-y-px text-white" />
      </span>
    ) : (
      <LogoMark size={32} />
    );

  // The app's logo is the way home.
  const homeLink = 'rounded-lg outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <AppSidebar
      label={t('{name} menu', { name: title(def.meta) })}
      menuStyle={menuStyle}
      menuSide={menuSideOf(def.meta.json_config?.menu_side)}
      customMenu={customMenu}
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
      items={navItems(menu, hrefOf)}
      activeUrl={current ? hrefOf(current) : undefined}
    >
      {children ? (
        children
      ) : current?.ref_meta_id && !screenList ? (
        <div className="h-64" aria-busy="true" />
      ) : currentPath ? (
        <Navigate to={currentPath} replace />
      ) : current?.ref_meta_id ? (
        <>
          <AppMetaContext.Provider value={def.meta.id}>
            {/* Each screen draws its own title, so the page's breadcrumb only says where you are. */}
            <DrilldownHost
              key={current.id}
              trail={menuStyle === 'header' ? undefined : [title(def.meta), ...(trail(menu, current.id) ?? [current]).map(menuLabel)]}
              heading={heading}
            >
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
function navItems(items: MetaParam[], hrefOf: (p: MetaParam) => string): NavItemType[] {
  return items
    .filter((p) => p.is_show)
    .flatMap((p): NavItemType[] => {
      const icon = (p.icon_cls && MENU_ICONS[p.icon_cls]) || Circle;
      const children = screens(p.children ?? []);
      if (children.length) {
        const inside = p.ref_meta_id ? [p, ...children] : children;
        return [{ label: menuLabel(p), icon, items: inside.map((c) => ({ label: menuLabel(c), href: hrefOf(c) })) }];
      }
      return p.ref_meta_id ? [{ label: menuLabel(p), icon, href: hrefOf(p) }] : [];
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
  // A built-in page lives at its own address.
  if (def?.meta.type?.code === 'screen' && typeof def.meta.json_config?.path === 'string') return <Navigate to={def.meta.json_config.path} replace />;
  // Until it's known whether this is an app (own layout) or not (the frame below), show nothing:
  // no builder bar flashing before an app opens.
  if (!def && !error) return <div className="min-h-screen" aria-busy="true" />;

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

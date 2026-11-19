import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeftDouble, ChevronRightDouble, Circle, LogIn01 } from '@untitledui/icons';
import { Button as AriaButton, Link as AriaLink } from 'react-aria-components';
import { MobileNavigationHeader } from '@/components/application/app-navigation/base-components/mobile-header';
import { NavItemBase } from '@/components/application/app-navigation/base-components/nav-item';
import { NavList } from '@/components/application/app-navigation/base-components/nav-list';
import type { NavItemDividerType, NavItemType } from '@/components/application/app-navigation/config';
import { Dropdown } from '@/components/base/dropdown/dropdown';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import { AppHeader } from './AppHeader';
import { NotificationsMenu } from './NotificationsMenu';
import { Messenger } from './messenger/Messenger';
import { UserMenu } from './UserMenu';
import { useAuth } from '../auth/AuthContext';
import { MENU_WIDTH_PX, menuSurface, type MenuSettings } from '../lib/menuStyle';
import { t } from '@/i18n';

const WIDTH = 256;
const RAIL_WIDTH = 64;
/** How long folding the menu takes; menu-motion in index.css uses the same. */
const FOLD_MS = 220;
const COLLAPSED_KEY = 'sidebar_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // Storage can be blocked; the toggle still works for this visit.
  }
}

type Item = NavItemType | NavItemDividerType;

/** How an app's menu sits on the page (an app meta's json_config.menu_style). */
export type MenuStyle = 'classic' | 'floating' | 'compact' | 'inset' | 'dark' | 'topbar' | 'header';

export const MENU_STYLES: { id: MenuStyle; name: string; hint: string }[] = [
  { id: 'classic', name: 'Classic', hint: 'Fixed to the page edge, with a line beside it.' },
  { id: 'floating', name: 'Floating', hint: 'A rounded panel lifted off the page edge.' },
  { id: 'compact', name: 'Compact', hint: 'A small floating bar of icons, centred on the page edge; groups open beside it.' },
  { id: 'inset', name: 'Inset', hint: 'The menu sits on the frame; the screen is a rounded panel inside it.' },
  { id: 'dark', name: 'Dark', hint: 'A dark menu beside the screen, whatever the light or dark mode.' },
  { id: 'topbar', name: 'Top bar', hint: 'The menu runs across the top; groups open as dropdowns.' },
  { id: 'header', name: 'Header', hint: 'A bar across the top with the app, a search, notifications, settings and you; the menu is a column of icons.' },
];

export const menuStyleOf = (value: unknown): MenuStyle => (MENU_STYLES.some((m) => m.id === value) ? (value as MenuStyle) : 'classic');

/** Which side of the screen an app's side menu is on (an app meta's json_config.menu_side). The top bar has no side. */
export type MenuSide = 'left' | 'right';

export const menuSideOf = (value: unknown): MenuSide => (value === 'right' ? 'right' : 'left');

/** Per side style: the menu panel, the fixed column holding it, the space it takes, and the main area. The top bar is drawn by TopBar. */
const LOOKS: Record<Exclude<MenuStyle, 'topbar' | 'header'>, { aside: string; column: string; gap: number; frame: string; main: string }> = {
  classic: { aside: 'border-secondary bg-primary md:border-r', column: '', gap: 0, frame: '', main: '' },
  floating: { aside: 'border-secondary bg-primary md:border-r lg:rounded-xl lg:border-r-0 lg:shadow-lg lg:ring-1 lg:ring-secondary', column: 'lg:p-3', gap: 12, frame: '', main: '' },
  // Floating, but always the icon rail, as tall as its icons and centred top to bottom (up to the screen's height, then the icons scroll).
  compact: {
    aside: 'border-secondary bg-primary md:border-r lg:h-auto lg:max-h-full lg:rounded-xl lg:border-r-0 lg:shadow-lg lg:ring-1 lg:ring-secondary',
    column: 'lg:items-center lg:p-3',
    gap: 12,
    frame: '',
    main: '',
  },
  inset: {
    aside: 'border-secondary bg-primary md:border-r lg:border-r-0 lg:bg-transparent',
    column: '',
    gap: 0,
    frame: 'lg:bg-tertiary',
    main: 'lg:my-2 lg:mr-2 lg:rounded-xl lg:bg-secondary lg:ring-1 lg:ring-secondary',
  },
  // The Untitled UI dark tokens, scoped to the menu.
  dark: { aside: 'dark-mode border-secondary bg-primary scheme-dark md:border-r', column: '', gap: 0, frame: '', main: '' },
};

/** What a style adds with the menu on the right: the line moves to the menu's other edge, and the inset screen's margin with it. */
const ON_RIGHT: Record<Exclude<MenuStyle, 'topbar' | 'header'>, { aside: string; main: string }> = {
  classic: { aside: 'lg:border-r-0 lg:border-l', main: '' },
  floating: { aside: '', main: '' },
  compact: { aside: '', main: '' },
  inset: { aside: '', main: 'lg:mr-0 lg:ml-2' },
  dark: { aside: 'lg:border-r-0 lg:border-l', main: '' },
};

/**
 * A menu style meta's look, in the same parts as LOOKS. The colour, corners, gap and width are
 * CSS variables (menuSurface) set on the layout; menu-style.css marks the items.
 */
function customLook(s: MenuSettings, onRight: boolean) {
  const { dark, glass, vars } = menuSurface(s);
  const line = onRight ? 'md:border-r lg:border-r-0 lg:border-l' : 'md:border-r';
  return {
    aside: cx(
      'border-secondary',
      // The phone drawer may render outside the layout, so the variable falls back to the surface.
      '[background:var(--menu-fill,var(--color-bg-primary))]',
      // On a frame the menu is the frame's colour, unless it is glass over the frame.
      s.frame && !glass && 'lg:[background:transparent]',
      glass && 'menu-glass',
      dark && 'dark-mode scheme-dark',
      s.edge === 'line' ? line : 'md:border-r lg:border-r-0',
      s.edge === 'shadow' && 'lg:shadow-lg lg:ring-1 lg:ring-secondary',
      'lg:rounded-(--menu-radius)',
    ),
    column: 'lg:p-(--menu-gap)',
    gap: s.gap,
    // The backdrop, else the menu's own colour when framed.
    frame: s.backdrop ? 'lg:[background:var(--menu-backdrop)]' : s.frame ? 'lg:[background:var(--menu-fill)]' : '',
    // With a backdrop the screen lets it through: a light glass pane when framed, else nothing,
    // and menu-style.css turns the panels inside frosted.
    main: s.frame
      ? cx('lg:my-2 lg:rounded-xl lg:ring-1', s.backdrop ? 'menu-glass-pane lg:ring-white/15' : 'lg:bg-secondary lg:ring-secondary', onRight ? 'lg:ml-2' : 'lg:mr-2')
      : '',
    backdrop: !!s.backdrop,
    width: MENU_WIDTH_PX[s.width],
    vars,
    item: s.item,
  };
}

/**
 * The Untitled UI sidebar used by the builder and by running apps, with the notifications
 * bell and the signed-in user at the foot (a guest, e.g. on a portal, gets Log in instead). On large screens it's fixed to the left (or menuSide right) and can fold into an icon rail (the
 * choice is remembered); below that it becomes a top bar whose menu button opens it as a
 * drawer.
 */
export function AppSidebar({
  logo,
  logoMark,
  items,
  activeUrl,
  footerItems: ownFooterItems = [],
  label,
  menuStyle = 'classic',
  menuSide = 'left',
  customMenu = null,
  children,
}: {
  logo: ReactNode;
  /** The small logo shown when the sidebar is folded. */
  logoMark: ReactNode;
  items: Item[];
  /** href of the current item; a group holding it starts open. */
  activeUrl?: string;
  footerItems?: NavItemType[];
  /** Accessible name of the navigation. */
  label: string;
  menuStyle?: MenuStyle;
  menuSide?: MenuSide;
  /** A menu style meta's settings; when set they replace menuStyle (side menus only). */
  customMenu?: MenuSettings | null;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const footerItems: NavItemType[] = user ? ownFooterItems : [...ownFooterItems, { label: t('Log in'), icon: LogIn01, href: '/login' }];
  const [folded, setCollapsed] = useState(readCollapsed);
  // The header style's menu is the compact rail; the top bar's phone drawer is classic.
  const sideStyle = menuStyle === 'topbar' ? 'classic' : menuStyle === 'header' ? 'compact' : menuStyle;
  const across = menuStyle === 'topbar' || menuStyle === 'header';
  const onRight = menuSide === 'right' && !across;
  const custom = customMenu && !across ? customLook(customMenu, onRight) : null;
  // Compact is always the rail, with no way to unfold it, whatever was remembered from other apps.
  const foldable = !!custom || sideStyle !== 'compact';
  const collapsed = !foldable || folded;
  const look =
    custom ??
    (onRight
      ? { ...LOOKS[sideStyle], aside: cx(LOOKS[sideStyle].aside, ON_RIGHT[sideStyle].aside), main: cx(LOOKS[sideStyle].main, ON_RIGHT[sideStyle].main) }
      : LOOKS[sideStyle]);
  const fullWidth = custom?.width ?? WIDTH;
  // The arrows point the way the menu folds: towards its own edge.
  const FoldIcon = onRight ? ChevronRightDouble : ChevronLeftDouble;
  const UnfoldIcon = onRight ? ChevronLeftDouble : ChevronRightDouble;
  // While folding, the full menu shows at the width it is moving to (see toggle); null otherwise.
  const [foldWidth, setFoldWidth] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => clearTimeout(id)), []);
  /**
   * Folding slides: the full menu's width moves between its own and the rail's (a CSS
   * transition, FOLD_MS) while its content fades; the rail takes over once it has shrunk.
   * Unfolding starts the full menu at the rail's width and lets it grow on the next frame.
   */
  const toggle = (next: boolean) => {
    if (!foldable) return;
    saveCollapsed(next);
    timers.current.forEach((id) => clearTimeout(id));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFoldWidth(null);
      return setCollapsed(next);
    }
    const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    if (next) {
      setFoldWidth(RAIL_WIDTH);
      later(() => {
        setCollapsed(true);
        setFoldWidth(null);
      }, FOLD_MS);
    } else {
      setCollapsed(false);
      setFoldWidth(RAIL_WIDTH);
      requestAnimationFrame(() => requestAnimationFrame(() => setFoldWidth(fullWidth)));
      later(() => setFoldWidth(null), FOLD_MS + 40);
    }
  };
  const folding = foldWidth !== null;
  const menuWidth = foldWidth ?? (collapsed ? RAIL_WIDTH : fullWidth);
  const growing = folding && foldWidth === fullWidth;

  const full = (withToggle: boolean) => (
    // Only the menu scrolls: the app name, the collapse button and the profile stay put.
    <aside
      className={cx(
        'flex h-full w-full max-w-full flex-col overflow-hidden pt-4',
        // On large screens the width moves while folding; the phone drawer is always full.
        withToggle && 'menu-motion lg:w-(--menu-now)',
        withToggle && folding && (growing ? 'menu-folding menu-folding-in' : 'menu-folding'),
        !withToggle && 'lg:w-(--width)',
        look.aside,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 lg:px-4">
        <div className="min-w-0 flex-1">{logo}</div>
        {withToggle && foldable && (
          <Tooltip title={t("Collapse menu")} placement="right">
            <TooltipTrigger aria-label={t("Collapse menu")} onPress={() => toggle(true)} className={railButton}>
              <FoldIcon className="size-4" />
            </TooltipTrigger>
          </Tooltip>
        )}
      </div>

      <nav aria-label={label} className="min-h-0 flex-1 overflow-y-auto">
        <NavList activeUrl={activeUrl} items={items} className="px-3 py-4" />
      </nav>

      <div className="flex shrink-0 flex-col gap-2 border-t border-secondary px-3 py-3">
        {footerItems.length > 0 && (
          <ul className="flex flex-col">
            {footerItems.map((item) => (
              <li key={item.label} className="py-px">
                <NavItemBase icon={item.icon} badge={item.badge} href={item.href} type="link" current={item.href === activeUrl}>
                  {item.label}
                </NavItemBase>
              </li>
            ))}
          </ul>
        )}
        {user && (
          <>
            <NotificationsMenu />
            <div className="border-t border-secondary pt-3">
              <UserMenu />
            </div>
          </>
        )}
      </div>
    </aside>
  );

  // Folded: one icon per top-level item. A group's icon opens a dropdown of its screens. Bare (under the header): only the items.
  const rail = (bare = false) => (
    // The compact rail blurs in (after the header's first pill), its icons after it (SpringRailList).
    <aside
      className={cx('flex h-full w-(--rail) flex-col items-center overflow-hidden border-r py-4', look.aside, bare ? 'blur-in lg:rounded-full lg:py-2 [&_a]:rounded-full [&_button]:rounded-full' : 'menu-rail-in')}
      style={bare ? ({ '--i': 1 } as React.CSSProperties) : undefined}
    >
      {!bare && <div className="mb-3 shrink-0">{logoMark}</div>}
      {foldable && (
        <Tooltip title={t("Expand menu")} placement="right">
          <TooltipTrigger aria-label={t("Expand menu")} onPress={() => toggle(false)} className={cx(railButton, 'mb-3 shrink-0')}>
            <UnfoldIcon className="size-4" />
          </TooltipTrigger>
        </Tooltip>
      )}

      {/* The pill fits its icons: no scrollbar (it showed while they rose in); a long menu still scrolls. */}
      <nav aria-label={label} className={cx('min-h-0 w-full flex-1 overflow-y-auto', bare && 'no-scrollbar')}>
        {bare ? (
          <SpringRailList items={items} activeUrl={activeUrl} />
        ) : (
          <ul className="flex flex-col items-center gap-1 px-2 py-1">
            {items.map((item, i) =>
              item.divider ? (
                <li key={i} className="w-full py-1.5" aria-hidden="true">
                  <hr className="h-px border-none bg-border-secondary" />
                </li>
              ) : (
                <li key={item.label}>
                  <RailItem item={item} activeUrl={activeUrl} onExpand={() => toggle(false)} />
                </li>
              ),
            )}
          </ul>
        )}
      </nav>

      {!bare && (
        <div className="flex shrink-0 flex-col items-center gap-2 border-t border-secondary pt-3">
          {footerItems.map((item) => (
            <RailItem key={item.label} item={item} activeUrl={activeUrl} onExpand={() => toggle(false)} />
          ))}
          {user && (
            <>
              <NotificationsMenu collapsed />
              <div className="border-t border-secondary pt-3">
                <UserMenu collapsed />
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );

  const width = menuWidth + look.gap;

  // The header across the top, the compact rail of icons under it on the left. Phones keep the drawer.
  if (menuStyle === 'header') {
    return (
      <div className="min-h-screen" style={{ '--rail': `${RAIL_WIDTH}px` } as React.CSSProperties}>
        <MobileNavigationHeader key={activeUrl} logo={logo}>
          {full(false)}
        </MobileNavigationHeader>
        <AppHeader logo={logo} items={items} signedIn={!!user} />
        <div className="lg:flex">
          <div className={cx('sidebar-fixed hidden lg:fixed lg:top-19 lg:bottom-0 lg:left-0 lg:z-20 lg:flex', look.column)}>{rail(true)}</div>
          <div className="hidden shrink-0 lg:block" style={{ width }} />
          <main className="sidebar-main min-w-0 flex-1 px-4 py-5 sm:px-6 lg:py-6">
            <div className="page-enter">{children}</div>
          </main>
        </div>
        <Messenger />
      </div>
    );
  }

  // Across the top on large screens; phones keep the same top bar and drawer as every style.
  if (menuStyle === 'topbar') {
    return (
      <div className="min-h-screen">
        <MobileNavigationHeader key={activeUrl} logo={logo}>
          {full(false)}
        </MobileNavigationHeader>
        <TopBar logo={logo} items={items} footerItems={footerItems} activeUrl={activeUrl} label={label} signedIn={!!user} />
        <main className="sidebar-main min-w-0 px-4 py-5 sm:px-6 lg:py-6">
          <div className="page-enter">{children}</div>
        </main>
        <Messenger />
      </div>
    );
  }

  return (
    <div
      className={cx('min-h-screen lg:flex', onRight && 'lg:flex-row-reverse', look.frame)}
      data-menu-item={custom?.item}
      data-menu-backdrop={custom?.backdrop || undefined}
      style={{ ...custom?.vars, '--width': `${fullWidth}px`, '--rail': `${RAIL_WIDTH}px`, '--menu-now': `${menuWidth}px` } as React.CSSProperties}
    >
      {/* Keyed on the page so the drawer closes once a link is followed. */}
      <MobileNavigationHeader key={activeUrl} logo={logo}>
        {full(false)}
      </MobileNavigationHeader>
      <div className={cx('sidebar-fixed hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex', onRight ? 'lg:right-0' : 'lg:left-0', look.column)}>
        {collapsed && !folding ? rail() : full(true)}
      </div>
      {/* Takes the fixed sidebar's space in the layout, and moves with it while folding. */}
      <div className="menu-motion hidden shrink-0 lg:block" style={{ width }} />

      <main className={cx('sidebar-main min-w-0 flex-1 px-4 py-5 sm:px-6 lg:py-6', look.main)}>
        <div className="page-enter">{children}</div>
      </main>
      <Messenger menuRight={onRight ? width : 0} />
    </div>
  );
}

const railButton =
  'flex size-8 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2';

/**
 * The menu as a bar across the top: the logo, one entry per top-level item (a group opens a
 * dropdown of its screens), then the footer items, the bell and the user. Too many items
 * scroll sideways rather than wrap.
 */
function TopBar({ logo, items, footerItems, activeUrl, label, signedIn }: { logo: ReactNode; items: Item[]; footerItems: NavItemType[]; activeUrl?: string; label: string; signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 hidden border-b border-secondary bg-primary lg:block">
      <div className="flex h-15 items-center gap-6 px-6">
        <div className="w-56 shrink-0">{logo}</div>
        <nav aria-label={label} className="min-w-0 flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1 py-1">
            {items.map((item, i) =>
              item.divider ? (
                <li key={i} className="h-5 w-px shrink-0 bg-border-secondary" aria-hidden="true" />
              ) : (
                <li key={item.label} className="shrink-0">
                  <TopItem item={item} activeUrl={activeUrl} />
                </li>
              ),
            )}
          </ul>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          {footerItems.map((item) => (
            <TopItem key={item.label} item={item} activeUrl={activeUrl} />
          ))}
          {signedIn && (
            <>
              <NotificationsMenu collapsed below />
              <div className="ml-1">
                <UserMenu collapsed below />
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function TopItem({ item, activeUrl }: { item: NavItemType; activeUrl?: string }) {
  const Icon = item.icon;
  const current = item.href === activeUrl || !!item.items?.some((c) => c.href === activeUrl);
  const look = cx(
    'flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold whitespace-nowrap outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2',
    current ? 'bg-secondary text-secondary_hover' : 'text-secondary hover:bg-primary_hover hover:text-secondary_hover',
  );
  const content = (
    <>
      {Icon && <Icon className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />}
      {item.label}
    </>
  );

  if (item.items?.length) {
    return (
      <Dropdown.Root>
        <AriaButton className={look}>
          {content}
          <ChevronDown className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
        </AriaButton>
        <Dropdown.Popover placement="bottom start" offset={6} className="w-60">
          <Dropdown.Menu aria-label={item.label}>
            {item.items.map((child) => (
              <Dropdown.Item key={child.href} id={child.href} href={child.href} label={child.label} icon={child.icon} className={child.href === activeUrl ? '[&>div]:bg-secondary' : undefined} />
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.Root>
    );
  }

  return item.href ? (
    <AriaLink href={item.href} aria-current={current ? 'page' : undefined} className={look}>
      {content}
    </AriaLink>
  ) : null;
}

const isCurrent = (item: Item, activeUrl?: string) => !item.divider && (item.href === activeUrl || !!item.items?.some((c) => c.href === activeUrl));

/** Where the highlight sits: its top and height in px within the list. */
interface Mark {
  top: number;
  height: number;
}

/**
 * The header style's rail items with one highlight behind the current item. On a new pick it
 * springs there and stretches as it goes: the edge in front races ahead, the one behind catches
 * up, it overshoots a little and settles. It starts on the click (not when the new screen has
 * rendered) and moves by transform, so a busy page doesn't make it stutter.
 */
function SpringRailList({ items, activeUrl }: { items: Item[]; activeUrl?: string }) {
  const rows = useRef(new Map<number, HTMLLIElement>());
  const blob = useRef<HTMLSpanElement>(null);
  const last = useRef<Mark | null>(null);
  const [mark, setMark] = useState<Mark | null>(null);
  // The item just clicked, until the page catches up with it.
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => setPending(null), [activeUrl]);
  const index = pending ?? items.findIndex((item) => isCurrent(item, activeUrl));

  useLayoutEffect(() => {
    const li = rows.current.get(index);
    const next = li ? { top: li.offsetTop, height: li.offsetHeight } : null;
    const before = last.current;
    last.current = next;
    setMark(next);
    const el = blob.current;
    if (!el || !next || !before || before.top === next.top || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Drawn at the new place; the keyframes start it at the old one. T: the top edge, H: the height, both from the new place.
    const dy = before.top - next.top;
    const h = next.height;
    const down = dy < 0;
    const at = (top: number, height: number) => `translateY(${top}px) scaleY(${height / h})`;
    // Each phase eases on its own, so the stretch gets its share of the time.
    el.animate(
      [
        { transform: at(dy, h), offset: 0, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
        // Stretched between the two: the edge in front is nearly there, the one behind still far back.
        { transform: down ? at(dy * 0.6, h - dy * 0.6) : at(-2, dy * 0.6 + h + 2), offset: 0.4, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
        // Past the item and squashed, then back.
        { transform: down ? at(5, h - 3) : at(-5, h - 3), offset: 0.72, easing: 'ease-out' },
        { transform: at(0, h), offset: 1 },
      ],
      { duration: 620 },
    );
  }, [index, items.length]);

  return (
    <ul className="relative flex flex-col items-center gap-1 px-2 py-1">
      {mark && (
        <span
          ref={blob}
          aria-hidden="true"
          className="blur-in pointer-events-none absolute left-1/2 w-10 origin-top -translate-x-1/2 rounded-full bg-secondary will-change-transform"
          style={{ top: mark.top, height: mark.height, '--i': index + 2 } as React.CSSProperties}
        />
      )}
      {items.map((item, i) =>
        item.divider ? (
          <li key={i} className="blur-in w-full py-1.5" style={{ '--i': i + 2 } as React.CSSProperties} aria-hidden="true">
            <hr className="h-px border-none bg-border-secondary" />
          </li>
        ) : (
          <li
            key={item.label}
            // Icons arrive one after another, top to bottom.
            className="blur-in relative"
            style={{ '--i': i + 2 } as React.CSSProperties}
            // A link moves the highlight now; a group's icon only opens its dropdown.
            onClickCapture={() => item.href && item.href !== activeUrl && setPending(i)}
            ref={(el) => {
              if (el) rows.current.set(i, el);
              else rows.current.delete(i);
            }}
          >
            <RailItem item={item} activeUrl={activeUrl} onExpand={() => {}} plain />
          </li>
        ),
      )}
    </ul>
  );
}

function RailItem({ item, activeUrl, onExpand, plain = false }: { item: NavItemType; activeUrl?: string; onExpand: () => void; /** The highlight is drawn behind it (SpringRailList). */ plain?: boolean }) {
  const Icon = item.icon ?? Circle;
  const current = item.href === activeUrl || !!item.items?.some((c) => c.href === activeUrl);
  const look = cx(
    'flex size-10 items-center justify-center rounded-md outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2',
    current
      ? cx('text-fg-quaternary_hover', !plain && 'bg-secondary')
      : 'text-fg-quaternary hover:bg-primary_hover hover:text-fg-quaternary_hover',
  );

  // A group opens a dropdown of its screens beside the rail, without unfolding the sidebar.
  if (item.items?.length) {
    return (
      <Dropdown.Root>
        <AriaButton aria-label={t('{name} menu', { name: item.label })} className={look}>
          <Icon className="size-5" />
        </AriaButton>
        <Dropdown.Popover placement="right top" offset={8} className="w-56">
          <Dropdown.Menu aria-label={item.label}>
            <Dropdown.Section>
              <Dropdown.SectionHeader className="px-4 pt-1.5 pb-1 text-xs font-semibold text-quaternary">{item.label}</Dropdown.SectionHeader>
              {item.items.map((child) => (
                <Dropdown.Item
                  key={child.href}
                  id={child.href}
                  href={child.href}
                  label={child.label}
                  icon={child.icon}
                  className={child.href === activeUrl ? '[&>div]:bg-secondary' : undefined}
                />
              ))}
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.Root>
    );
  }

  return (
    <Tooltip title={item.label} placement="right">
      {item.href ? (
        <AriaLink href={item.href} aria-label={item.label} aria-current={current ? 'page' : undefined} className={look}>
          <Icon className="size-5" />
        </AriaLink>
      ) : (
        <TooltipTrigger aria-label={t('{name} (opens the menu)', { name: item.label })} onPress={onExpand} className={look}>
          <Icon className="size-5" />
        </TooltipTrigger>
      )}
    </Tooltip>
  );
}

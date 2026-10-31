import { useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown, ChevronLeftDouble, ChevronRightDouble, Circle, LogIn01 } from '@untitledui/icons';
import { Button as AriaButton, Link as AriaLink } from 'react-aria-components';
import { MobileNavigationHeader } from '@/components/application/app-navigation/base-components/mobile-header';
import { NavItemBase } from '@/components/application/app-navigation/base-components/nav-item';
import { NavList } from '@/components/application/app-navigation/base-components/nav-list';
import type { NavItemDividerType, NavItemType } from '@/components/application/app-navigation/config';
import { Dropdown } from '@/components/base/dropdown/dropdown';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import { NotificationsMenu } from './NotificationsMenu';
import { Messenger } from './messenger/Messenger';
import { UserMenu } from './UserMenu';
import { useAuth } from '../auth/AuthContext';
import { t } from '@/i18n';

const WIDTH = 256;
const RAIL_WIDTH = 64;
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
export type MenuStyle = 'classic' | 'floating' | 'inset' | 'dark' | 'topbar';

export const MENU_STYLES: { id: MenuStyle; name: string; hint: string }[] = [
  { id: 'classic', name: 'Classic', hint: 'Fixed to the left edge, with a line beside it.' },
  { id: 'floating', name: 'Floating', hint: 'A rounded panel lifted off the page edge.' },
  { id: 'inset', name: 'Inset', hint: 'The menu sits on the frame; the screen is a rounded panel inside it.' },
  { id: 'dark', name: 'Dark', hint: 'A dark menu beside the screen, whatever the light or dark mode.' },
  { id: 'topbar', name: 'Top bar', hint: 'The menu runs across the top; groups open as dropdowns.' },
];

export const menuStyleOf = (value: unknown): MenuStyle => (MENU_STYLES.some((m) => m.id === value) ? (value as MenuStyle) : 'classic');

/** Per side style: the menu panel, the fixed column holding it, the space it takes, and the main area. The top bar is drawn by TopBar. */
const LOOKS: Record<Exclude<MenuStyle, 'topbar'>, { aside: string; column: string; gap: number; frame: string; main: string }> = {
  classic: { aside: 'border-secondary bg-primary md:border-r', column: '', gap: 0, frame: '', main: '' },
  floating: { aside: 'border-secondary bg-primary md:border-r lg:rounded-xl lg:border-r-0 lg:shadow-lg lg:ring-1 lg:ring-secondary', column: 'lg:p-3', gap: 12, frame: '', main: '' },
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

/**
 * The Untitled UI sidebar used by the builder and by running apps, with the notifications
 * bell and the signed-in user at the foot (a guest, e.g. on a portal, gets Log in instead). On large screens it's fixed on the left and can fold into an icon rail (the
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
  children: ReactNode;
}) {
  const { user } = useAuth();
  const footerItems: NavItemType[] = user ? ownFooterItems : [...ownFooterItems, { label: t('Log in'), icon: LogIn01, href: '/login' }];
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const look = LOOKS[menuStyle === 'topbar' ? 'classic' : menuStyle];
  const toggle = (next: boolean) => {
    const apply = () => {
      setCollapsed(next);
      saveCollapsed(next);
    };
    // Folding animates as a view transition (see index.css); browsers without one just switch.
    const doc = document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };
    if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
    const root = document.documentElement;
    root.classList.add('sidebar-folding');
    doc.startViewTransition(() => flushSync(apply)).finished.finally(() => root.classList.remove('sidebar-folding'));
  };

  const full = (withToggle: boolean) => (
    // Only the menu scrolls: the app name, the collapse button and the profile stay put.
    <aside className={cx('flex h-full w-full max-w-full flex-col overflow-hidden pt-4 lg:w-(--width)', look.aside)}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 lg:px-4">
        <div className="min-w-0 flex-1">{logo}</div>
        {withToggle && (
          <Tooltip title={t("Collapse menu")} placement="right">
            <TooltipTrigger aria-label={t("Collapse menu")} onPress={() => toggle(true)} className={railButton}>
              <ChevronLeftDouble className="size-4" />
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

  // Folded: one icon per top-level item. A group's icon opens a dropdown of its screens.
  const rail = (
    <aside className={cx('flex h-full w-(--rail) flex-col items-center overflow-hidden border-r py-4', look.aside)}>
      <div className="shrink-0">{logoMark}</div>
      <Tooltip title={t("Expand menu")} placement="right">
        <TooltipTrigger aria-label={t("Expand menu")} onPress={() => toggle(false)} className={cx(railButton, 'mt-3 shrink-0')}>
          <ChevronRightDouble className="size-4" />
        </TooltipTrigger>
      </Tooltip>

      <nav aria-label={label} className="mt-3 min-h-0 w-full flex-1 overflow-y-auto">
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
      </nav>

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
    </aside>
  );

  const width = (collapsed ? RAIL_WIDTH : WIDTH) + look.gap;

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
    <div className={cx('min-h-screen lg:flex', look.frame)} style={{ '--width': `${WIDTH}px`, '--rail': `${RAIL_WIDTH}px` } as React.CSSProperties}>
      {/* Keyed on the page so the drawer closes once a link is followed. */}
      <MobileNavigationHeader key={activeUrl} logo={logo}>
        {full(false)}
      </MobileNavigationHeader>
      <div className={cx('sidebar-fixed hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex', look.column)}>{collapsed ? rail : full(true)}</div>
      {/* Takes the fixed sidebar's space in the layout. */}
      <div className="hidden shrink-0 lg:block" style={{ width }} />

      <main className={cx('sidebar-main min-w-0 flex-1 px-4 py-5 sm:px-6 lg:py-6', look.main)}>
        <div className="page-enter">{children}</div>
      </main>
      <Messenger />
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

function RailItem({ item, activeUrl, onExpand }: { item: NavItemType; activeUrl?: string; onExpand: () => void }) {
  const Icon = item.icon ?? Circle;
  const current = item.href === activeUrl || !!item.items?.some((c) => c.href === activeUrl);
  const look = cx(
    'flex size-10 items-center justify-center rounded-md outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2',
    current ? 'bg-secondary text-fg-quaternary_hover' : 'text-fg-quaternary hover:bg-primary_hover hover:text-fg-quaternary_hover',
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

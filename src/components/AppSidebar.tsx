import { useState, type ReactNode } from 'react';
import { ChevronLeftDouble, ChevronRightDouble, Circle } from '@untitledui/icons';
import { Button as AriaButton, Link as AriaLink } from 'react-aria-components';
import { MobileNavigationHeader } from '@/components/application/app-navigation/base-components/mobile-header';
import { NavItemBase } from '@/components/application/app-navigation/base-components/nav-item';
import { NavList } from '@/components/application/app-navigation/base-components/nav-list';
import type { NavItemDividerType, NavItemType } from '@/components/application/app-navigation/config';
import { Dropdown } from '@/components/base/dropdown/dropdown';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import { NotificationsMenu } from './NotificationsMenu';
import { UserMenu } from './UserMenu';

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

/**
 * The Untitled UI sidebar used by the builder and by running apps, with the notifications
 * bell and the signed-in user at the foot. On large screens it's fixed on the left and can fold into an icon rail (the
 * choice is remembered); below that it becomes a top bar whose menu button opens it as a
 * drawer.
 */
export function AppSidebar({
  logo,
  logoMark,
  items,
  activeUrl,
  footerItems = [],
  label,
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
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = (next: boolean) => {
    setCollapsed(next);
    saveCollapsed(next);
  };

  const full = (withToggle: boolean) => (
    <aside className="flex h-full w-full max-w-full flex-col overflow-auto border-secondary bg-primary pt-4 md:border-r lg:w-(--width)">
      <div className="flex items-center justify-between gap-2 px-3 lg:px-4">
        <div className="min-w-0 flex-1">{logo}</div>
        {withToggle && (
          <Tooltip title="Collapse menu" placement="right">
            <TooltipTrigger aria-label="Collapse menu" onPress={() => toggle(true)} className={railButton}>
              <ChevronLeftDouble className="size-4" />
            </TooltipTrigger>
          </Tooltip>
        )}
      </div>

      <nav aria-label={label}>
        <NavList activeUrl={activeUrl} items={items} className="px-3 pt-4" />
      </nav>

      <div className="mt-auto flex flex-col gap-2 px-3 py-3">
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
        <NotificationsMenu />
        <div className="border-t border-secondary pt-3">
          <UserMenu />
        </div>
      </div>
    </aside>
  );

  // Folded: one icon per top-level item. A group's icon opens a dropdown of its screens.
  const rail = (
    <aside className="flex h-full w-(--rail) flex-col items-center overflow-y-auto border-r border-secondary bg-primary py-4">
      {logoMark}
      <Tooltip title="Expand menu" placement="right">
        <TooltipTrigger aria-label="Expand menu" onPress={() => toggle(false)} className={cx(railButton, 'mt-3')}>
          <ChevronRightDouble className="size-4" />
        </TooltipTrigger>
      </Tooltip>

      <nav aria-label={label} className="mt-3 w-full">
        <ul className="flex flex-col items-center gap-1 px-2">
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

      <div className="mt-auto flex flex-col items-center gap-2 pt-3">
        {footerItems.map((item) => (
          <RailItem key={item.label} item={item} activeUrl={activeUrl} onExpand={() => toggle(false)} />
        ))}
        <NotificationsMenu collapsed />
        <div className="border-t border-secondary pt-3">
          <UserMenu collapsed />
        </div>
      </div>
    </aside>
  );

  const width = collapsed ? RAIL_WIDTH : WIDTH;

  return (
    <div className="min-h-screen lg:flex" style={{ '--width': `${WIDTH}px`, '--rail': `${RAIL_WIDTH}px` } as React.CSSProperties}>
      {/* Keyed on the page so the drawer closes once a link is followed. */}
      <MobileNavigationHeader key={activeUrl} logo={logo}>
        {full(false)}
      </MobileNavigationHeader>
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex">{collapsed ? rail : full(true)}</div>
      {/* Takes the fixed sidebar's space in the layout. */}
      <div className="hidden shrink-0 transition-[width] duration-150 lg:block" style={{ width }} />

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:py-6">
        <div>{children}</div>
      </main>
    </div>
  );
}

const railButton =
  'flex size-8 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2';

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
        <AriaButton aria-label={`${item.label} menu`} className={look}>
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
        <TooltipTrigger aria-label={`${item.label} (opens the menu)`} onPress={onExpand} className={look}>
          <Icon className="size-5" />
        </TooltipTrigger>
      )}
    </Tooltip>
  );
}

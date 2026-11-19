import { useEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react';
import { SearchLg, Settings01 } from '@untitledui/icons';
import { useFilter } from 'react-aria';
import { Link as AriaLink, ComboBox, Group, Input, ListBox } from 'react-aria-components';
import { useNavigate } from 'react-router-dom';
import type { NavItemDividerType, NavItemType } from '@/components/application/app-navigation/config';
import { Popover } from '@/components/base/select/popover';
import { SelectItem } from '@/components/base/select/select-item';
import { SelectContext } from '@/components/base/select/select-shared';
import { Tooltip } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import { NotificationsMenu } from './NotificationsMenu';
import { UserMenu } from './UserMenu';
import { t } from '@/i18n';

type Item = NavItemType | NavItemDividerType;

/** A screen the search can open: a menu item, or a screen inside a group (named with its group). */
interface Hit {
  id: string;
  label: string;
  supportingText?: string;
  icon?: FC<{ className?: string }>;
}

function hitsOf(items: Item[]): Hit[] {
  return items.flatMap((item): Hit[] => {
    if (item.divider) return [];
    const own = item.href ? [{ id: item.href, label: item.label, icon: item.icon }] : [];
    const inside = (item.items ?? []).filter((c) => c.href !== item.href).map((c) => ({ id: c.href, label: c.label, supportingText: item.label, icon: c.icon ?? item.icon }));
    return [...own, ...inside];
  });
}

const iconButton =
  'flex size-10 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2';

const pill = 'flex items-center rounded-full bg-primary shadow-xs ring-1 ring-secondary';

/**
 * The header menu style's bar across the top (lg and up), as three pills: the app's logo and
 * name; a search over the app's screens (an icon that grows into a field, Ctrl/⌘ K),
 * notifications and settings; and the signed-in user. The menu itself is the icon rail beside
 * the screen (AppSidebar).
 */
export function AppHeader({ logo, items, signedIn }: { logo: ReactNode; items: Item[]; signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 hidden pt-3 backdrop-blur-sm lg:block">
      <div className="flex h-16 items-center gap-3 px-3">
        {/* The pills blur in one after another (.blur-in, --i in index.css). */}
        <div className={cx(pill, 'blur-in max-w-80 min-w-0 py-1.5 pr-5 pl-1.5 *:min-w-0')}>{logo}</div>
        <div className="flex-1" />
        <div className={cx(pill, 'blur-in gap-0.5 p-1 [&_a]:rounded-full [&_button]:rounded-full')} style={{ '--i': 1 } as React.CSSProperties}>
          <ScreenSearch items={items} />
          {signedIn && (
            <>
              <NotificationsMenu collapsed below />
              <Tooltip title={t('Settings')} placement="bottom">
                <AriaLink href="/profile" aria-label={t('Settings')} className={iconButton}>
                  <Settings01 className="size-5" />
                </AriaLink>
              </Tooltip>
            </>
          )}
        </div>
        {signedIn && <div className={cx(pill, 'blur-in w-60 p-0.5 pr-1 *:rounded-full')} style={{ '--i': 2 } as React.CSSProperties}><UserMenu below /></div>}
      </div>
    </header>
  );
}

/** Finds a screen of the app by name (or its group's) and opens it. */
function ScreenSearch({ items }: { items: Item[] }) {
  const navigate = useNavigate();
  const { contains } = useFilter({ sensitivity: 'base' });
  const groupRef = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => hitsOf(items), [items]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  // Shut, only the icon shows; focusing the field grows it, and leaving it shrinks it back.
  const [open, setOpen] = useState(false);
  const shown = hits.filter((h) => contains(h.label, text) || (!!h.supportingText && contains(h.supportingText, text)));

  // Ctrl/⌘ K, as the hint in the field says.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <SelectContext.Provider value={{ size: 'sm' }}>
      <ComboBox
        aria-label={t('Search screens')}
        items={shown}
        inputValue={text}
        onInputChange={setText}
        // Never keeps a pick: the text empties again once a screen opens.
        selectedKey={null}
        onSelectionChange={(key) => {
          if (key === null) return;
          setText('');
          inputRef.current?.blur();
          navigate(String(key));
        }}
        menuTrigger="focus"
        allowsEmptyCollection
      >
        <Group
          ref={groupRef}
          className={cx(
            'flex h-10 items-center overflow-hidden rounded-full transition-[width,background-color] duration-200 ease-out motion-reduce:transition-none',
            open ? 'w-80 bg-secondary pr-3' : 'w-10',
          )}
        >
          {/* Shut, the icon opens the field; open, it only marks it. */}
          <button
            type="button"
            tabIndex={open ? -1 : 0}
            aria-label={t('Search screens')}
            onClick={() => inputRef.current?.focus()}
            className={cx(iconButton, 'shrink-0', open && 'pointer-events-none hover:bg-transparent')}
          >
            <SearchLg className="size-5" />
          </button>
          <Input
            ref={inputRef}
            placeholder={t('Search')}
            tabIndex={open ? 0 : -1}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setText('');
            }}
            className={cx('min-w-0 flex-1 bg-transparent text-sm text-primary outline-hidden placeholder:text-placeholder', !open && 'w-0 opacity-0')}
          />
          {open && (
            <kbd className="pointer-events-none shrink-0 rounded px-1 py-px text-xs font-medium text-quaternary ring-1 ring-secondary select-none ring-inset" aria-hidden="true">
              {navigator.platform.startsWith('Mac') ? '⌘K' : 'Ctrl K'}
            </kbd>
          )}
        </Group>
        <Popover size="sm" triggerRef={groupRef} placement="bottom end" className="w-80">
          <ListBox className="outline-hidden" renderEmptyState={() => <p className="px-3 py-2 text-sm text-tertiary">{t('No matches')}</p>}>
            {(hit: Hit) => <SelectItem id={hit.id} label={hit.label} supportingText={hit.supportingText} icon={hit.icon} selectionIndicator="none" />}
          </ListBox>
        </Popover>
      </ComboBox>
    </SelectContext.Provider>
  );
}

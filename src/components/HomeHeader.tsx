import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Grid01, SearchLg } from '@untitledui/icons';
import { useFilter } from 'react-aria';
import { ComboBox, Group, Input, ListBox } from 'react-aria-components';
import { Link, useNavigate } from 'react-router-dom';
import type { Meta } from '../lib/metaApi';
import { Popover } from '@/components/base/select/popover';
import { SelectItem } from '@/components/base/select/select-item';
import { SelectContext } from '@/components/base/select/select-shared';
import { cx } from '@/utils/cx';
import { Logo, LogoMark } from './AppShell';
import { Messenger } from './messenger/Messenger';
import { NotificationsMenu } from './NotificationsMenu';
import { UserMenu } from './UserMenu';
import { t } from '@/i18n';

/** Home and Apps: no sidebar, the top bar over the page, and the chat box. */
export function HomeLayout({ apps, children }: { apps: Meta[]; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <HomeHeader apps={apps} />
      <main className="mx-auto max-w-7xl min-w-0 px-4 py-5 sm:px-6 lg:py-6">
        <div className="page-enter">{children}</div>
      </main>
      <Messenger />
    </div>
  );
}

const pill = 'flex items-center rounded-full bg-primary shadow-xs ring-1 ring-secondary';

/**
 * The home page's bar across the top, in place of the sidebar: the logo on the left, a search
 * over the apps in the middle (Ctrl/⌘ K), notifications and the signed-in user on the right.
 */
export function HomeHeader({ apps }: { apps: Meta[] }) {
  return (
    <header className="sticky top-0 z-30 px-4 pt-3 backdrop-blur-sm sm:px-6">
      {/* The pills blur in one after another (.blur-in, --i in index.css). */}
      <div className="grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[1fr_minmax(0,34rem)_1fr]">
        {/* The logo leads home. */}
        <Link to="/" aria-label={t('Home')} className="blur-in min-w-0 justify-self-start rounded-md outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2">
          <span className="sm:hidden">
            <LogoMark />
          </span>
          <span className="hidden sm:inline-flex">
            <Logo />
          </span>
        </Link>
        <div className="blur-in" style={{ '--i': 1 } as React.CSSProperties}>
          <AppSearch apps={apps} />
        </div>
        <div className="blur-in flex items-center justify-end gap-2" style={{ '--i': 2 } as React.CSSProperties}>
          <div className={cx(pill, 'p-1 [&_button]:rounded-full')}>
            <NotificationsMenu collapsed below />
          </div>
          <div className={cx(pill, 'p-0.5 *:rounded-full sm:hidden')}>
            <UserMenu collapsed below />
          </div>
          <div className={cx(pill, 'hidden w-60 p-0.5 pr-1 *:rounded-full sm:flex')}>
            <UserMenu below />
          </div>
        </div>
      </div>
    </header>
  );
}

interface Hit {
  id: number;
  label: string;
  supportingText?: string;
}

/** Finds an app by name or code and opens it the way its users see it. */
function AppSearch({ apps }: { apps: Meta[] }) {
  const navigate = useNavigate();
  const { contains } = useFilter({ sensitivity: 'base' });
  const groupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const hits = useMemo<Hit[]>(() => apps.map((app) => ({ id: app.id, label: app.label_name || app.name, supportingText: app.code })), [apps]);
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
        aria-label={t('Search apps')}
        items={shown}
        inputValue={text}
        onInputChange={setText}
        // Never keeps a pick: the text empties again once an app opens.
        selectedKey={null}
        onSelectionChange={(key) => {
          if (key === null) return;
          setText('');
          inputRef.current?.blur();
          navigate(`/run/${key}`);
        }}
        menuTrigger="focus"
        allowsEmptyCollection
      >
        <Group ref={groupRef} className={cx(pill, 'h-11 gap-2 px-4 transition duration-100 ease-linear focus-within:ring-2 focus-within:ring-brand')}>
          <SearchLg className="size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
          <Input ref={inputRef} placeholder={t('Search apps')} onBlur={() => setText('')} className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-hidden placeholder:text-placeholder" />
          <kbd className="pointer-events-none hidden shrink-0 rounded px-1 py-px text-xs font-medium text-quaternary ring-1 ring-secondary select-none ring-inset sm:block" aria-hidden="true">
            {navigator.platform.startsWith('Mac') ? '⌘K' : 'Ctrl K'}
          </kbd>
        </Group>
        <Popover size="sm" triggerRef={groupRef} placement="bottom" className="w-(--trigger-width)">
          <ListBox className="outline-hidden" renderEmptyState={() => <p className="px-3 py-2 text-sm text-tertiary">{apps.length ? t('No matches') : t('You have no apps yet.')}</p>}>
            {(hit: Hit) => <SelectItem id={hit.id} label={hit.label} supportingText={hit.supportingText} icon={Grid01} selectionIndicator="none" />}
          </ListBox>
        </Popover>
      </ComboBox>
    </SelectContext.Provider>
  );
}

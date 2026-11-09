import { createContext, useContext, useMemo, useState, type FC, type ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button as AriaButton, Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { ArrowLeft, Circle, DotsHorizontal, LogOut01 } from '@untitledui/icons';
import { useAuth } from '../auth/AuthContext';
import { NotificationsMenu } from '../components/NotificationsMenu';
import { Alert } from '../components/ui';
import { initials } from '../lib/initials';
import type { MetaParam } from '../lib/metaApi';
import { mobileCustomerCode } from '../lib/mobileApi';
import { useScreens } from '../lib/screenApi';
import { allowedMenu, MENU_ICONS, menuLabel, screens } from '../render/AppView';
import { AppMetaContext } from '../render/appContext';
import { presetOf, title, useMetaDef, type MetaDef } from '../render/definitions';
import { DrilldownHost } from '../render/DrilldownHost';
import { MetaView } from '../render/MetaView';
import { useAppTheme } from '../components/ThemeProvider';
import { Avatar } from '@/components/base/avatar/avatar';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

/** Bottom tabs hold this many screens; with more, the last tab is More and lists the rest. */
const TABS = 4;

interface Shell {
  def: MetaDef;
  /** The app's menu as this user may see it. */
  menu: MetaParam[];
  /** Every menu item that opens a screen, in menu order. */
  all: MetaParam[];
  /** The menu item on screen, if the page is one of the app's own. */
  current: MetaParam | undefined;
  hrefOf: (p: MetaParam) => string;
}

const ShellContext = createContext<Shell | null>(null);

const iconOf = (p: MetaParam): FC<{ className?: string }> => (p.icon_cls && MENU_ICONS[p.icon_cls]) || Circle;

/**
 * The phone app's frame around one app meta: a top bar with the screen's name, the app's screens
 * as bottom tabs (the first four; More for the rest) and the page between them. Built-in pages the
 * menu holds (screen metas, e.g. the market's) open at their own address inside the frame.
 */
export function MobileShell({ appId }: { appId: number }) {
  const { customer } = useAuth();
  const wanted = mobileCustomerCode();
  const { def, error } = useMetaDef(appId);
  useAppTheme(appId);

  // Signed in to another of the person's customers: the built app works in its own.
  if (wanted && customer?.code !== wanted) return <Navigate to="/start" replace />;
  if (error) {
    return (
      <main className="min-h-dvh bg-secondary p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <Alert>{error}</Alert>
      </main>
    );
  }
  if (!def) return <div className="min-h-dvh animate-pulse bg-secondary motion-reduce:animate-none" />;
  return <Frame def={def} />;
}

function Frame({ def }: { def: MetaDef }) {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const [search] = useSearchParams();
  const screenList = useScreens();
  const menu = useMemo(() => allowedMenu(def.params, (id) => can(id, 'view')), [def.params, can]);
  const all = useMemo(() => screens(menu), [menu]);
  const paths = useMemo(() => new Map((screenList ?? []).map((s) => [s.id, s.path])), [screenList]);
  const pathOf = (p: MetaParam) => (p.ref_meta_id ? paths.get(p.ref_meta_id) : undefined);
  const hrefOf = (p: MetaParam) => pathOf(p) ?? `/?screen=${p.id}`;
  const current =
    pathname === '/'
      ? (all.find((p) => String(p.id) === search.get('screen')) ?? all[0])
      : all.find((p) => {
          const path = pathOf(p);
          return !!path && (pathname === path || pathname.startsWith(`${path}/`));
        });
  // On a screen's own address (not a record or page opened from it), the tabs are the way around.
  const atTab = !!current && (pathname === '/' || pathname === pathOf(current));
  const shell = { def, menu, all, current, hrefOf };

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex min-h-dvh flex-col bg-secondary">
        <TopBar heading={current ? menuLabel(current) : title(def.meta)} showBack={!atTab} />
        <main className="min-w-0 flex-1 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
          <AppMetaContext.Provider value={def.meta.id}>
            <DrilldownHost>
              <Outlet />
            </DrilldownHost>
          </AppMetaContext.Provider>
        </main>
        <TabBar />
      </div>
    </ShellContext.Provider>
  );
}

function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error('Inside MobileShell only');
  return shell;
}

/** The screen's name, a way back from anything opened off a tab, and the bell and account. */
function TopBar({ heading, showBack }: { heading: string; showBack: boolean }) {
  const navigate = useNavigate();
  const { key } = useLocation();
  // Opened straight at a deeper page (a notification's link), there is nothing behind it: go home.
  const back = () => (key === 'default' ? navigate('/', { replace: true }) : navigate(-1));
  return (
    <header className="sticky top-0 z-20 border-b border-secondary bg-primary pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-1 px-2">
        {showBack ? (
          <AriaButton aria-label={t('Back')} onPress={back} className="flex size-10 items-center justify-center rounded-lg text-fg-secondary outline-focus-ring pressed:bg-primary_hover focus-visible:outline-2">
            <ArrowLeft className="size-5" />
          </AriaButton>
        ) : (
          <span className="w-2" />
        )}
        <h1 className="min-w-0 flex-1 truncate text-md font-semibold text-primary">{heading}</h1>
        <NotificationsMenu collapsed below />
        <AccountButton />
      </div>
    </header>
  );
}

/** A bottom sheet: slides up over the app, closed by tapping outside or the item chosen. */
function Sheet({ isOpen, onOpenChange, label, children }: { isOpen: boolean; onOpenChange: (open: boolean) => void; label: string; children: ReactNode }) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={({ isEntering, isExiting }) =>
        cx('fixed inset-0 z-50 flex items-end bg-overlay/60', isEntering && 'duration-200 ease-out animate-in fade-in', isExiting && 'duration-150 ease-in animate-out fade-out')
      }
    >
      <Modal
        className={({ isEntering, isExiting }) =>
          cx(
            'max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl bg-primary pb-[env(safe-area-inset-bottom)] shadow-xl',
            isEntering && 'duration-200 ease-out animate-in slide-in-from-bottom motion-reduce:animate-none',
            isExiting && 'duration-150 ease-in animate-out slide-out-to-bottom motion-reduce:animate-none',
          )
        }
      >
        <Dialog aria-label={label} className="outline-hidden">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-quaternary" aria-hidden="true" />
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** The person, and signing out. Switching company and the builder belong to the web app. */
function AccountButton() {
  const { user, customer, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <>
      <AriaButton aria-label={user?.name ? t('Account menu for {name}', { name: user.name }) : t('Account menu')} onPress={() => setOpen(true)} className="rounded-full p-1 outline-focus-ring focus-visible:outline-2">
        <Avatar size="sm" initials={initials(user?.name)} alt={user?.name} />
      </AriaButton>
      <Sheet isOpen={open} onOpenChange={setOpen} label={t('Account')}>
        <div className="flex items-center gap-3 border-b border-secondary px-5 py-4">
          <Avatar size="md" initials={initials(user?.name)} alt={user?.name} />
          <div className="min-w-0">
            <p className="truncate text-md font-semibold text-primary">{user?.name}</p>
            <p className="truncate text-sm text-tertiary">{user?.email}</p>
            {customer && <p className="truncate text-sm text-tertiary">{customer.name}</p>}
          </div>
        </div>
        <div className="p-2">
          <AriaButton
            onPress={() => void logout().then(() => navigate('/login', { replace: true }))}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-md font-medium text-secondary outline-focus-ring pressed:bg-primary_hover focus-visible:outline-2"
          >
            <LogOut01 className="size-5 text-fg-quaternary" />
            {t('Log out')}
          </AriaButton>
        </div>
      </Sheet>
    </>
  );
}

/** The app's first screens as tabs; past four, the fourth place is More, a sheet with the rest in their groups. */
function TabBar() {
  const { menu, all, current, hrefOf } = useShell();
  const [more, setMore] = useState(false);
  if (!all.length) return null;
  const overflow = all.length > TABS + 1;
  const tabs = overflow ? all.slice(0, TABS) : all;
  const inMore = overflow && !!current && !tabs.includes(current);
  const tab = 'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs font-medium outline-focus-ring focus-visible:outline-2';
  return (
    <nav aria-label={t('Screens')} className="fixed inset-x-0 bottom-0 z-20 border-t border-secondary bg-primary pb-[env(safe-area-inset-bottom)]">
      <ul className="flex px-2 pt-1">
        {tabs.map((p) => {
          const Icon = iconOf(p);
          const on = p === current;
          return (
            <li key={p.id} className="flex min-w-0 flex-1">
              <Link to={hrefOf(p)} replace aria-current={on ? 'page' : undefined} className={cx(tab, on ? 'text-brand-secondary' : 'text-tertiary')}>
                <Icon className="size-6" />
                <span className="w-full truncate text-center">{menuLabel(p)}</span>
              </Link>
            </li>
          );
        })}
        {overflow && (
          <li className="flex min-w-0 flex-1">
            <AriaButton onPress={() => setMore(true)} aria-current={inMore ? 'page' : undefined} className={cx(tab, inMore ? 'text-brand-secondary' : 'text-tertiary')}>
              <DotsHorizontal className="size-6" />
              <span>{t('More')}</span>
            </AriaButton>
          </li>
        )}
      </ul>
      <Sheet isOpen={more} onOpenChange={setMore} label={t('More')}>
        <MoreList items={menu} skip={tabs} onPick={() => setMore(false)} />
      </Sheet>
    </nav>
  );
}

/** The screens not on a tab, under their menu groups. */
function MoreList({ items, skip, onPick }: { items: MetaParam[]; skip: MetaParam[]; onPick: () => void }) {
  const { current, hrefOf } = useShell();
  const shown = (list: MetaParam[]) => screens(list).filter((p) => !skip.includes(p));
  const groups = items.filter((p) => p.is_show).map((p) => ({ group: p, entries: shown([p]) })).filter((g) => g.entries.length);
  return (
    <div className="flex flex-col gap-4 px-2 py-3">
      {groups.map(({ group, entries }) => (
        <section key={group.id}>
          {(entries.length > 1 || entries[0] !== group) && <h2 className="px-3 pb-1 text-sm font-semibold text-tertiary">{menuLabel(group)}</h2>}
          <ul>
            {entries.map((p) => {
              const Icon = iconOf(p);
              return (
                <li key={p.id}>
                  <Link
                    to={hrefOf(p)}
                    replace
                    onClick={onPick}
                    aria-current={p === current ? 'page' : undefined}
                    className={cx('flex items-center gap-3 rounded-lg px-3 py-3 text-md font-medium outline-focus-ring focus-visible:outline-2', p === current ? 'bg-active text-primary' : 'text-secondary')}
                  >
                    <Icon className="size-5 text-fg-quaternary" />
                    {menuLabel(p)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** "/": the app's screen picked in ?screen= (else its first), or the built-in page it stands for. */
export function MobileHome() {
  const { current, hrefOf, def } = useShell();
  const { user } = useAuth();
  const screenList = useScreens();
  if (!current?.ref_meta_id) {
    return (
      <div className="rounded-xl bg-primary px-6 py-14 text-center ring-1 ring-secondary">
        <p className="text-md font-semibold text-primary">{t('This app has no screens yet')}</p>
        <p className="mt-1 text-sm text-tertiary">{t('Ask the person who built {name} to add some.', { name: title(def.meta) })}</p>
      </div>
    );
  }
  if (!screenList) return <div className="h-64 animate-pulse rounded-xl bg-primary motion-reduce:animate-none" />;
  const href = hrefOf(current);
  if (!href.startsWith('/?')) return <Navigate to={href} replace />;
  return <MetaView key={current.id} metaId={current.ref_meta_id} preset={presetOf(current, user)} fill />;
}

/** /run/:id: a meta opened from a link (a notification, a shared record) inside the app's frame. */
export function MobileRun() {
  const { id } = useParams();
  return <MetaView key={id} metaId={Number(id)} fill />;
}

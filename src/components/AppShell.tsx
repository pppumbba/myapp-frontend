import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { Clock, Dataflow03, Database01, Globe01, Grid01, HomeLine, LayersThree01, LayoutAlt01, Package, UserSquare, Users01 } from '@untitledui/icons';
import { useAuth } from '../auth/AuthContext';
import { AppSidebar } from './AppSidebar';
import { t } from '@/i18n';

const everyone = [
  { href: '/', label: 'Home', icon: HomeLine },
  { href: '/apps', label: 'Apps', icon: Grid01 },
];
// The builder and user management.
const admins = [
  { href: '/metas', label: 'Metas', icon: LayersThree01 },
  { href: '/studio', label: 'Studio', icon: Dataflow03 },
  { href: '/query-builder', label: 'Query builder', icon: Database01 },
  { href: '/widgets', label: 'Widget library', icon: LayoutAlt01 },
  { href: '/sites', label: 'Websites', icon: Globe01 },
  { href: '/schedules', label: 'Schedules', icon: Clock },
  { href: '/patches', label: 'Patches', icon: Package },
  { href: '/session-values', label: 'Session values', icon: UserSquare },
  { href: '/admin', label: 'Users & roles', icon: Users01 },
];

/** Three squares stepping down the diagonal, each smaller and fainter (src/assets/logo.svg). Always Wand indigo (--color-logo), never the theme's brand colour. */
export function LogoMark({ size = 28, className = 'text-(--color-logo)' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={`shrink-0 ${className}`} fill="currentColor">
      <rect width="14" height="14" rx="2" />
      <rect x="15.5" y="15.5" width="9.5" height="9.5" rx="1.5" fillOpacity="0.55" />
      <rect x="26.5" y="26.5" width="5.5" height="5.5" rx="1" fillOpacity="0.25" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className="text-md font-semibold text-primary">Wand Studio</span>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const { isAdmin } = useAuth();
  // A new screen starts at the top; Back and Forward leave the scroll where the browser puts it.
  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navigationType]);
  const nav = (isAdmin ? [...everyone, ...admins] : everyone).map((item) => ({ ...item, label: t(item.label) }));
  // /metas/12 still highlights Metas; the longest match wins, so /admin/roles/3 is Users & roles, not Home.
  const activeUrl =
    nav
      .filter((item) => item.href !== '/' && pathname.startsWith(item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? pathname;

  return (
    <AppSidebar label={t("Main")} logo={<Logo />} logoMark={<LogoMark />} items={nav} activeUrl={activeUrl}>
      {children}
    </AppSidebar>
  );
}

/** Page title row with optional actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-secondary pb-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-primary">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-prose text-sm text-tertiary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

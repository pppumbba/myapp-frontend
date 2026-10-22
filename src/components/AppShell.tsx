import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Clock, Grid01, HomeLine, LayersThree01, LayoutAlt01, UserSquare, Users01 } from '@untitledui/icons';
import { useAuth } from '../auth/AuthContext';
import { AppSidebar } from './AppSidebar';

const everyone = [
  { href: '/', label: 'Home', icon: HomeLine },
  { href: '/apps', label: 'Apps', icon: Grid01 },
];
// The builder and user management.
const admins = [
  { href: '/metas', label: 'Metas', icon: LayersThree01 },
  { href: '/widgets', label: 'Widget library', icon: LayoutAlt01 },
  { href: '/schedules', label: 'Schedules', icon: Clock },
  { href: '/session-values', label: 'Session values', icon: UserSquare },
  { href: '/admin', label: 'Users & roles', icon: Users01 },
];

export function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="#4F46E5" />
      <rect x="8" y="8" width="7" height="7" rx="2" fill="#fff" />
      <rect x="17" y="8" width="7" height="7" rx="2" fill="#C7D2FE" />
      <rect x="8" y="17" width="16" height="7" rx="2" fill="#A5B4FC" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className="text-md font-semibold text-primary">Blue Sky</span>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();
  const nav = isAdmin ? [...everyone, ...admins] : everyone;
  // /metas/12 still highlights Metas.
  const activeUrl = nav.find((item) => item.href !== '/' && pathname.startsWith(item.href))?.href ?? pathname;

  return (
    <AppSidebar label="Main" logo={<Logo />} logoMark={<LogoMark />} items={nav} activeUrl={activeUrl}>
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

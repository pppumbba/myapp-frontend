import type { FC, ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { HomeLine, LayersThree01, LogOut01 } from '@untitledui/icons';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '@/components/base/avatar/avatar';
import { IconAction } from './ui';

const nav: { to: string; label: string; icon: FC<{ className?: string }>; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: HomeLine, end: true },
  { to: '/metas', label: 'Metas', icon: LayersThree01 },
];

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#4F46E5" />
        <rect x="8" y="8" width="7" height="7" rx="2" fill="#fff" />
        <rect x="17" y="8" width="7" height="7" rx="2" fill="#C7D2FE" />
        <rect x="8" y="17" width="16" height="7" rx="2" fill="#A5B4FC" />
      </svg>
      <span className="text-md font-semibold text-primary">Blue Sky</span>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const initials = (user?.name ?? '?')
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen lg:flex">
      <aside className="flex items-center justify-between gap-4 border-b border-secondary bg-primary px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:flex-col lg:items-stretch lg:justify-start lg:border-r lg:border-b-0 lg:px-4 lg:py-6">
        <div className="lg:px-2">
          <Logo />
        </div>

        <nav className="flex gap-1 lg:mt-8 lg:flex-col" aria-label="Main">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-md px-3 py-2 text-md font-semibold transition duration-100 ease-linear ${
                  isActive ? 'bg-active text-secondary_hover' : 'text-secondary hover:bg-primary_hover hover:text-secondary_hover'
                }`
              }
            >
              <item.icon className="size-5 shrink-0 text-fg-quaternary" />
              <span className="hidden sm:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 lg:mt-auto lg:border-t lg:border-secondary lg:px-2 lg:pt-6">
          <Avatar size="md" initials={initials} alt={user?.name} />
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-sm font-semibold text-primary">{user?.name}</p>
            <p className="truncate text-sm text-tertiary">{user?.email}</p>
          </div>
          <IconAction icon={LogOut01} label="Log out" onPress={onLogout} />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

/** Page title row with optional actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-secondary pb-5">
      <div className="min-w-0">
        <h1 className="text-display-xs font-semibold text-primary">{title}</h1>
        {subtitle && <p className="mt-1 max-w-prose text-md text-tertiary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-3">{actions}</div>}
    </div>
  );
}

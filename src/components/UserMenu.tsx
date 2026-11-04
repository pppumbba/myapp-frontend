import type { Key } from 'react-aria-components';
import { Button as AriaButton } from 'react-aria-components';
import { useNavigate } from 'react-router-dom';
import { Building07, Check, ChevronSelectorVertical, Grid01, HomeLine, LayersThree01, LogOut01, Plus, Server01, User01, Users01 } from '@untitledui/icons';
import { useAuth } from '../auth/AuthContext';
import { customerApi } from '../lib/customerApi';
import { clearRenderCache } from '../render/definitions';
import { initials } from '../lib/initials';
import { Avatar } from '@/components/base/avatar/avatar';
import { Dropdown } from '@/components/base/dropdown/dropdown';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

const pages: Record<string, string> = { profile: '/profile', home: '/', apps: '/apps', metas: '/metas', admin: '/admin', start: '/start', platform: '/platform/customers' };

/**
 * The signed-in user at the foot of every sidebar. Pressing it opens a menu: their customers to
 * switch between, profile, the builder's pages and log out. Collapsed, only the avatar shows.
 */
export function UserMenu({ collapsed = false, below = false }: { collapsed?: boolean; /** In a top bar: opens downwards. */ below?: boolean }) {
  const { user, logout, isAdmin, customer, customers, openCustomer } = useAuth();
  const navigate = useNavigate();

  async function onAction(key: Key) {
    const other = String(key).match(/^customer-(\d+)$/);
    if (other) {
      if (Number(other[1]) === customer?.id) return;
      await openCustomer(await customerApi.open(Number(other[1])));
      // Another customer's metas: nothing kept from this one may show.
      clearRenderCache();
      navigate('/', { replace: true });
    } else if (key === 'logout') {
      await logout();
      navigate('/login', { replace: true });
    } else if (pages[String(key)]) {
      navigate(pages[String(key)]);
    }
  }

  const avatar = <Avatar size="sm" initials={initials(user?.name)} alt={user?.name} />;

  return (
    <Dropdown.Root>
      <AriaButton
        aria-label={user?.name ? t('Account menu for {name}', { name: user.name }) : t('Account menu')}
        className={({ isPressed, isFocusVisible }) =>
          cx(
            'flex items-center rounded-lg outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover',
            collapsed ? 'rounded-full' : 'w-full gap-2.5 p-1.5 text-left',
            isPressed && 'bg-primary_hover',
            isFocusVisible && 'outline-2 outline-offset-2',
          )
        }
      >
        {avatar}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-primary">{user?.name}</span>
              <span className="block truncate text-xs text-tertiary">{user?.email}</span>
            </span>
            <ChevronSelectorVertical className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
          </>
        )}
      </AriaButton>

      <Dropdown.Popover placement={below ? 'bottom end' : collapsed ? 'right bottom' : 'top'} offset={6}>
        <div className="flex items-center gap-2.5 border-b border-secondary px-3 py-2.5">
          {avatar}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary">{user?.name}</p>
            <p className="truncate text-xs text-tertiary">{user?.email}</p>
          </div>
        </div>
        <Dropdown.Menu onAction={onAction}>
          <Dropdown.Section aria-label={t('Customers')}>
            {customers.map((c) => (
              <Dropdown.Item key={c.id} id={`customer-${c.id}`} icon={c.id === customer?.id ? Check : Building07} label={c.name} />
            ))}
            <Dropdown.Item id="start" icon={Plus} label={t('New or join a customer')} />
          </Dropdown.Section>
          <Dropdown.Separator />
          <Dropdown.Section>
            <Dropdown.Item id="profile" icon={User01} label={t('Profile')} />
            <Dropdown.Item id="home" icon={HomeLine} label={t('Home')} />
            <Dropdown.Item id="apps" icon={Grid01} label={t('Apps')} />
          </Dropdown.Section>
          {isAdmin && (
            <Dropdown.Section>
              <Dropdown.Item id="metas" icon={LayersThree01} label={t('Metas')} />
              <Dropdown.Item id="admin" icon={Users01} label={t('Users & roles')} />
            </Dropdown.Section>
          )}
          {user?.is_platform_owner && (
            <Dropdown.Section>
              <Dropdown.Item id="platform" icon={Server01} label={t('All customers')} />
            </Dropdown.Section>
          )}
          <Dropdown.Separator />
          <Dropdown.Section>
            <Dropdown.Item id="logout" icon={LogOut01} label={t('Log out')} />
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  );
}

import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Bell01, CheckCircle, CheckDone01, InfoCircle, Trash01 } from '@untitledui/icons';
import { Button as AriaButton, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { accessApi, type AppNotification, type NotificationPage } from '../lib/accessApi';
import { notificationsChanged, useUnreadCount } from '../lib/useUnread';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import { IconAction } from './ui';

export const notificationLooks: Record<string, { icon: typeof InfoCircle; color: string }> = {
  info: { icon: InfoCircle, color: 'text-fg-brand-primary' },
  success: { icon: CheckCircle, color: 'text-fg-success-primary' },
  alert: { icon: AlertTriangle, color: 'text-fg-warning-primary' },
  danger: { icon: AlertCircle, color: 'text-fg-error-primary' },
};

export function notificationTime(at: string): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * The bell at the foot of the sidebar, above the user. It shows the unread count and opens
 * the notifications in a dropdown: newest first, opened to follow their link, with older
 * ones loaded on request. Collapsed, only the bell shows.
 */
export function NotificationsMenu({ collapsed = false }: { collapsed?: boolean }) {
  const unread = useUnreadCount();
  const [isOpen, setOpen] = useState(false);
  const count = unread > 99 ? '99+' : unread;
  const name = unread ? `Notifications, ${unread} unread` : 'Notifications';

  const popover = (
    <Popover
      placement={collapsed ? 'right bottom' : 'top start'}
      offset={6}
      className={({ isEntering, isExiting }) =>
        cx(
          'w-96 max-w-[calc(100vw-2rem)] origin-(--trigger-anchor-point) overflow-hidden rounded-xl bg-primary shadow-lg ring-1 ring-secondary_alt outline-hidden will-change-transform',
          isEntering && 'duration-150 ease-out animate-in fade-in placement-right:slide-in-from-left-0.5 placement-top:slide-in-from-bottom-0.5',
          isExiting && 'duration-100 ease-in animate-out fade-out',
        )
      }
    >
      <Dialog aria-label="Notifications" className="outline-hidden">
        <NotificationList onDone={() => setOpen(false)} />
      </Dialog>
    </Popover>
  );

  if (collapsed) {
    return (
      <DialogTrigger isOpen={isOpen} onOpenChange={setOpen}>
        <Tooltip title="Notifications" placement="right">
          <TooltipTrigger
            aria-label={name}
            className={cx(
              'relative flex size-10 items-center justify-center rounded-md outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2',
              isOpen ? 'bg-secondary text-fg-quaternary_hover' : 'text-fg-quaternary hover:bg-primary_hover hover:text-fg-quaternary_hover',
            )}
          >
            <Bell01 className="size-5" />
            {unread > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-error-solid ring-2 ring-bg-primary" aria-hidden="true" />}
          </TooltipTrigger>
        </Tooltip>
        {popover}
      </DialogTrigger>
    );
  }

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setOpen}>
      <AriaButton
        aria-label={name}
        className={cx(
          'group/item flex w-full items-center rounded-md p-2 outline-focus-ring transition duration-100 ease-linear select-none focus-visible:outline-2 focus-visible:outline-offset-2',
          isOpen ? 'bg-secondary' : 'hover:bg-primary_hover',
        )}
      >
        <Bell01 aria-hidden="true" className="mr-2 size-5 shrink-0 text-fg-quaternary group-hover/item:text-fg-quaternary_hover" />
        <span className="flex-1 truncate text-left text-sm font-semibold text-secondary group-hover/item:text-secondary_hover">Notifications</span>
        {unread > 0 && (
          <Badge className="ml-3" color="gray" type="pill-color" size="sm">
            {count}
          </Badge>
        )}
      </AriaButton>
      {popover}
    </DialogTrigger>
  );
}

/** The dropdown's contents, loaded each time it opens. onDone closes it after following a link. */
function NotificationList({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [last, setLast] = useState<NotificationPage | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown, fallback: string) => setError(err instanceof ApiError ? err.message : fallback);

  useEffect(() => {
    let live = true;
    setItems(null);
    accessApi.notifications(1, onlyUnread).then(
      (r) => {
        if (!live) return;
        setItems(r.data);
        setLast(r);
        setError(null);
      },
      (err) => live && fail(err, 'Notifications could not be loaded.'),
    );
    return () => {
      live = false;
    };
  }, [onlyUnread]);

  async function more() {
    if (!last) return;
    setLoadingMore(true);
    try {
      const r = await accessApi.notifications(last.current_page + 1, onlyUnread);
      setItems((all) => [...(all ?? []), ...r.data.filter((n) => !all?.some((a) => a.id === n.id))]);
      setLast(r);
    } catch (err) {
      fail(err, 'Older notifications could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function open(n: AppNotification) {
    if (!n.read_at) {
      try {
        const read = await accessApi.read(n.id);
        setItems((all) => all?.map((a) => (a.id === n.id ? read : a)) ?? null);
        notificationsChanged();
      } catch (err) {
        fail(err, 'That did not work. Try again.');
      }
    }
    if (n.link) {
      onDone();
      navigate(n.link);
    }
  }

  async function remove(n: AppNotification) {
    try {
      await accessApi.removeNotification(n.id);
      setItems((all) => all?.filter((a) => a.id !== n.id) ?? null);
      notificationsChanged();
    } catch (err) {
      fail(err, 'That did not work. Try again.');
    }
  }

  async function readAll() {
    try {
      await accessApi.readAll();
      const now = new Date().toISOString();
      setItems((all) => (onlyUnread ? [] : (all?.map((a) => ({ ...a, read_at: a.read_at ?? now })) ?? null)));
      notificationsChanged();
    } catch (err) {
      fail(err, 'That did not work. Try again.');
    }
  }

  const hasUnread = items?.some((n) => !n.read_at) || (onlyUnread && !!items?.length);

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-secondary px-4 py-3">
        <h2 className="text-md font-semibold text-primary">Notifications</h2>
        <div className="flex items-center gap-1">
          <Button size="sm" color="link-gray" onPress={() => setOnlyUnread((u) => !u)}>
            {onlyUnread ? 'Show all' : 'Only unread'}
          </Button>
          <span className="mx-1.5 h-4 w-px bg-border-secondary" aria-hidden="true" />
          <Button size="sm" color="link-color" iconLeading={CheckDone01} isDisabled={!hasUnread} onPress={readAll}>
            Mark all read
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="border-b border-secondary bg-error-primary px-4 py-2.5 text-sm font-medium text-error-primary">{error}</p>}

      <div className="max-h-[min(28rem,60vh)] overflow-y-auto">
        {!items && !error && (
          <div className="space-y-3 p-4" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
            ))}
          </div>
        )}

        {items && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <Bell01 className="size-6 text-fg-quaternary" aria-hidden="true" />
            <p className="text-sm font-semibold text-primary">{onlyUnread ? 'Nothing unread' : 'No notifications yet'}</p>
            <p className="text-sm text-tertiary">When a record is waiting for your next step, it shows up here.</p>
          </div>
        )}

        {items && items.length > 0 && (
          <ul className="divide-y divide-secondary">
            {items.map((n) => {
              const look = notificationLooks[n.type] ?? notificationLooks.info;
              const Icon = look.icon;
              return (
                <li key={n.id} className={cx('flex items-start gap-3 px-4 py-3', !n.read_at && 'bg-brand-primary_alt')}>
                  <Icon className={cx('mt-0.5 size-5 shrink-0', look.color)} aria-hidden="true" />
                  <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 rounded-md text-left outline-focus-ring focus-visible:outline-2">
                    <span className={cx('block text-sm text-primary', !n.read_at && 'font-semibold')}>
                      {n.title}
                      {!n.read_at && <span className="sr-only"> (unread)</span>}
                    </span>
                    {n.body && <span className="mt-0.5 block text-sm text-tertiary">{n.body}</span>}
                    <span className="mt-1 block text-xs text-quaternary">{notificationTime(n.created_at)}</span>
                  </button>
                  <IconAction icon={Trash01} danger label="Remove notification" onPress={() => remove(n)} />
                </li>
              );
            })}
          </ul>
        )}

        {last && last.current_page < last.last_page && (
          <div className="border-t border-secondary px-4 py-2.5 text-center">
            <Button size="sm" color="link-gray" isLoading={loadingMore} showTextWhileLoading onPress={more}>
              Show older
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

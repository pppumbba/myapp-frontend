import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell01, CheckDone01, Trash01 } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { accessApi, type AppNotification, type NotificationPage } from '../lib/accessApi';
import { notificationsChanged } from '../lib/useUnread';
import { AppShell, PageHeader } from '../components/AppShell';
import { notificationLooks, notificationTime } from '../components/NotificationsMenu';
import { Alert, IconAction } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

/** The signed-in user's notifications: newest first, opened to follow their link. */
export default function NotificationsPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<NotificationPage | null>(null);
  const [page, setPage] = useState(1);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    accessApi.notifications(page, onlyUnread).then(
      (r) => {
        if (!live) return;
        setResult(r);
        setError(null);
      },
      (err) => live && setError(err instanceof ApiError ? err.message : t("Notifications could not be loaded.")),
    );
    return () => {
      live = false;
    };
  }, [page, onlyUnread, reload]);

  const changed = () => {
    setReload((n) => n + 1);
    notificationsChanged();
  };

  async function act(task: () => Promise<unknown>) {
    try {
      await task();
      changed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("That did not work. Try again."));
    }
  }

  async function open(n: AppNotification) {
    if (!n.read_at) await act(() => accessApi.read(n.id));
    if (n.link) navigate(n.link);
  }

  const items = result?.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title={t("Notifications")}
        subtitle={result ? (result.unread ? t('{count} unread', { count: result.unread }) : t("All caught up.")) : undefined}
        actions={
          <>
            <Button size="sm" color="secondary" onPress={() => { setPage(1); setOnlyUnread((u) => !u); }}>
              {onlyUnread ? t("Show all") : t("Only unread")}
            </Button>
            <Button size="sm" color="secondary" iconLeading={CheckDone01} isDisabled={!result?.unread} onPress={() => act(accessApi.readAll)}>
              {t("Mark all read")}
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {!result && !error && <div className="h-40 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />}

      {result && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-primary px-5 py-12 text-center ring-1 ring-secondary ring-inset">
          <Bell01 className="size-6 text-fg-quaternary" aria-hidden="true" />
          <p className="text-sm font-semibold text-primary">{onlyUnread ? t("Nothing unread") : t("No notifications yet")}</p>
          <p className="text-sm text-tertiary">{t("When a record is waiting for your next step, it shows up here.")}</p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {items.map((n) => {
            const look = notificationLooks[n.type] ?? notificationLooks.info;
            const Icon = look.icon;
            return (
              <li key={n.id} className={cx('flex items-start gap-3 px-4 py-3.5 sm:px-5', !n.read_at && 'bg-brand-primary_alt')}>
                <Icon className={cx('mt-0.5 size-5 shrink-0', look.color)} aria-hidden="true" />
                <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 rounded-md text-left outline-focus-ring focus-visible:outline-2">
                  <span className={cx('block text-sm text-primary', !n.read_at && 'font-semibold')}>
                    {n.title}
                    {!n.read_at && <span className="sr-only"> {t("(unread)")}</span>}
                  </span>
                  {n.body && <span className="mt-0.5 block text-sm text-tertiary">{n.body}</span>}
                  <span className="mt-1 block text-xs text-quaternary">{notificationTime(n.created_at)}</span>
                </button>
                <IconAction icon={Trash01} danger label={t("Remove notification")} onPress={() => act(() => accessApi.removeNotification(n.id))} />
              </li>
            );
          })}
        </ul>
      )}

      {result && result.last_page > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-tertiary">
          <Button size="sm" color="secondary" isDisabled={page <= 1} onPress={() => setPage((p) => p - 1)}>
            {t("Newer")}
          </Button>
          <span>
            {t('Page {page} of {pages}', { page: result.current_page, pages: result.last_page })}
          </span>
          <Button size="sm" color="secondary" isDisabled={page >= result.last_page} onPress={() => setPage((p) => p + 1)}>
            {t("Older")}
          </Button>
        </div>
      )}
    </AppShell>
  );
}

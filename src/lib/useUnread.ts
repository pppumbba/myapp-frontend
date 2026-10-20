import { useEffect, useState } from 'react';
import { accessApi } from './accessApi';

const CHANGED = 'notifications-changed';
const EVERY_MS = 60_000;

/** Tells every unread counter to look again, e.g. after notifications are read. */
export function notificationsChanged() {
  window.dispatchEvent(new Event(CHANGED));
}

/** How many notifications the user hasn't read; checked every minute and on changes. */
export function useUnreadCount(): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let live = true;
    const check = () =>
      accessApi.notifications(1, true).then(
        (r) => live && setUnread(r.unread),
        () => {},
      );
    check();
    const timer = window.setInterval(check, EVERY_MS);
    window.addEventListener(CHANGED, check);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener(CHANGED, check);
    };
  }, []);

  return unread;
}

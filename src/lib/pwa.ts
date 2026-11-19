import { useSyncExternalStore } from 'react';

/** Chrome and Edge's install prompt (not in the DOM types). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/**
 * Makes the app installable: adds the manifest, registers the service worker (public/sw.js,
 * built app only) and holds the browser's install prompt for the Install app menu item.
 * Not on a website's own domain, which shows a site rather than the app.
 */
export function registerPwa() {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.webmanifest';
  document.head.appendChild(link);

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own banner away; the menu item asks instead.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

/** Shows the install prompt; true when the user installed the app. */
export async function installApp() {
  if (!deferred) return false;
  const event = deferred;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // A prompt can be shown only once.
  deferred = null;
  changed();
  return outcome === 'accepted';
}

/** Whether the browser offers to install the app now (not where it is installed already or cannot be). */
export function useCanInstall() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => deferred !== null,
  );
}

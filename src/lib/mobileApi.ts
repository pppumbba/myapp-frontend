import { api, ApiError, tokenStore } from './api';
import { t } from '@/i18n';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

/** What an app meta keeps about its phone app (json_config.mobile). */
export interface MobileSettings {
  enabled?: boolean;
  /** The app's name on the phone; empty: the meta's name. */
  name?: string | null;
  /** The Android package id, e.g. mn.wand.assets: names the app in the store, so it never changes once published. */
  package_id?: string | null;
  /** The phone's bars and the sign-in screen, as #rrggbb. */
  color?: string | null;
  /** The uploaded launcher icon's file name (set by mobileApi.uploadIcon); empty: the Wand mark. */
  icon?: string | null;
}

/** GET /mobile/{id}: the phone app as it shows before anyone signs in. */
export interface MobileApp {
  id: number;
  name: string;
  description: string | null;
  package_id: string | null;
  color: string | null;
  icon: string | null;
  customer: { code: string; name: string } | null;
}

/**
 * The app meta this phone app opens: fixed when it is built (VITE_MOBILE_APP), or ?app= when the
 * mobile page is previewed in a browser (mobile.html?app=160).
 */
export function mobileAppId(): number | null {
  const id = Number(import.meta.env.VITE_MOBILE_APP || new URLSearchParams(window.location.search).get('app'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The customer a built phone app works in; a browser preview works in the one already open. */
export const mobileCustomerCode = (): string | null => import.meta.env.VITE_MOBILE_CUSTOMER || null;

export const mobileApi = {
  show: (appId: number) => api<MobileApp>(`/mobile/${appId}`, { notify: false }),
  /** A square PNG, JPG or WebP (at least 192 px) as the app's phone icon; answers json_config.mobile. */
  uploadIcon: (appId: number, file: File) => {
    const form = new FormData();
    form.append('icon', file);
    return api<MobileSettings>(`/metas/${appId}/mobile-icon`, { method: 'POST', body: form });
  },
  removeIcon: (appId: number) => api<MobileSettings>(`/metas/${appId}/mobile-icon`, { method: 'DELETE' }),
  /** The saved icon for an <img> (fetched with the token, so it comes from this customer). The caller revokes it. */
  iconUrl: async (appId: number) => {
    const token = tokenStore.get();
    const res = await fetch(`${BASE_URL}/mobile/${appId}/icon`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, t('The icon could not be loaded.'));
    return URL.createObjectURL(await res.blob());
  },
};

/** Where an app's phone preview opens. */
export const mobilePreviewUrl = (appId: number) => `/mobile.html?app=${appId}#/`;

import { api } from './api';
import type { Meta } from './metaApi';
import type { PageItem } from './pageApi';
import type { ThemeSettings } from './theme';

/** A website's settings (json_config.site). */
export type SiteHeaderStyle = 'masthead' | 'edge' | 'pill' | 'slab' | 'banner';
export type SiteFooterStyle = 'letter' | 'mast' | 'statement' | 'colophon' | 'columns';

/** Social networks a site can link to, in the order they show (Sites::SOCIALS). */
export const SOCIAL_NETWORKS = ['instagram', 'facebook', 'youtube', 'tiktok', 'x', 'linkedin'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export interface SiteSettings {
  title: string | null;
  tagline: string | null;
  description: string | null;
  logo: string | null;
  theme_meta_id: number | null;
  /** One of the Hallmark looks (pages/sites/looks.ts). */
  look: string;
  /** Buttons and links in the theme's brand colour instead of the look's accent. */
  brand_accent: boolean;
  header: SiteHeaderStyle;
  /** The banner header's line. */
  announcement: string | null;
  footer_style: SiteFooterStyle;
  footer: string | null;
  lang: string;
  /** The site's pages on social networks (only the ones set). */
  social: Partial<Record<SocialNetwork, string>>;
}

export type PageStatus = 'draft' | 'live' | 'changed' | 'down';

/** One page of a site in the manager: where it is, what it says to search engines, and where it stands. */
export interface SitePage {
  param_id: number;
  parent_id: number | null;
  page_meta_id: number | null;
  page: { id: number; code: string; name: string } | null;
  label: string | null;
  /** In the header's menu. */
  in_menu: boolean;
  in_footer: boolean;
  slug: string;
  title: string | null;
  description: string | null;
  image: string | null;
  path: string;
  status: PageStatus;
  published_at: string | null;
  release_id: number | null;
  scheduled: { id: number; publish_at: string; live: boolean }[];
  children: SitePage[];
}

export interface SiteDomain {
  id?: number;
  host: string;
  is_primary: boolean;
}

export type CheckLevel = 'floor' | 'reflex' | 'finish';

/** Something the checks found; item is the widget's param_id on the page. */
export interface SiteIssue {
  level: CheckLevel;
  code: string;
  message: string;
  item?: number;
}

export interface Site {
  meta: Meta;
  site: SiteSettings;
  domains: SiteDomain[];
  pages: SitePage[];
  issues: SiteIssue[];
}

export interface SiteSummary {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  title: string | null;
  host: string | null;
  pages: number;
  live: number;
  views_7_days: number;
}

/** What the manager saves for a page; new_page makes an empty page meta for it. */
export interface SitePageInput {
  param_id?: number;
  page_meta_id?: number | null;
  new_page?: boolean;
  label: string | null;
  slug: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  in_menu: boolean;
  in_footer: boolean;
  children: SitePageInput[];
}

export interface SiteRelease {
  id: number;
  path: string | null;
  note: string | null;
  checks: SiteIssue[] | null;
  restored_from_id: number | null;
  publish_at: string;
  created_at: string;
  live: boolean;
  current: boolean;
  scheduled: boolean;
  publisher: string | null;
}

export interface SiteStats {
  days: number;
  total: number;
  previous: number;
  daily: { day: string; views: number }[];
  pages: { path: string; views: number }[];
}

export interface SiteForm {
  id: number;
  code: string;
  name: string;
  is_public: boolean;
  pages: string[];
  sent_30_days: number | null;
  sent_total: number | null;
  last_sent_at: string | null;
  notifications: number;
}

export interface NavItem {
  label: string;
  path: string;
  children: NavItem[];
}

/** A site as a visitor's browser draws it: its look, its menus, and the page at the address (null: none there). */
export interface PublicSite {
  site: SiteSettings & { id: number; code: string; name: string; title: string; theme: ThemeSettings; host: string | null };
  /** The header's menu. */
  nav: NavItem[];
  footer_nav: NavItem[];
  page: {
    path: string;
    title: string;
    description: string | null;
    image: string | null;
    /** The published pages under this one. */
    children: { label: string; path: string; description: string | null }[];
    items: PageItem[];
    /** Composite widgets' parts, by template meta id. */
    templates: Record<string, PageItem[]>;
  } | null;
}

/** Websites (backend: SiteController, PublicSiteController). */
export const siteApi = {
  list: () => api<SiteSummary[]>('/sites'),
  create: (name: string) => api<Site>('/sites', { method: 'POST', body: JSON.stringify({ name }) }),
  get: (id: number) => api<Site>(`/sites/${id}`),
  save: (id: number, input: { name?: string; site?: SiteSettings; domains?: SiteDomain[]; pages?: SitePageInput[] }) =>
    api<Site>(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  check: (id: number, paramId: number) => api<{ issues: SiteIssue[] }>(`/sites/${id}/pages/${paramId}/check`),
  publish: (id: number, paramId: number, input: { publish_at?: string | null; note?: string | null }) =>
    api<SiteRelease>(`/sites/${id}/pages/${paramId}/publish`, { method: 'POST', body: JSON.stringify(input) }),
  unpublish: (id: number, paramId: number) => api<SiteRelease>(`/sites/${id}/pages/${paramId}/unpublish`, { method: 'POST', body: '{}' }),
  releases: (id: number, paramId: number) => api<SiteRelease[]>(`/sites/${id}/pages/${paramId}/releases`),
  restore: (releaseId: number) => api<SiteRelease>(`/site-releases/${releaseId}/restore`, { method: 'POST', body: '{}' }),
  cancel: (releaseId: number) => api<null>(`/site-releases/${releaseId}`, { method: 'DELETE' }),
  stats: (id: number, days: number) => api<SiteStats>(`/sites/${id}/stats?days=${days}`),
  forms: (id: number) => api<SiteForm[]>(`/sites/${id}/forms`),
  preview: (id: number, path: string) => api<PublicSite>(`/sites/${id}/preview?path=${encodeURIComponent(path)}`),

  /** A published page, by the site's own domain or by its code. */
  byHost: (host: string, path: string) => api<PublicSite>(`/site?host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`),
  byCode: (code: string, path: string) => api<PublicSite>(`/site?code=${encodeURIComponent(code)}&path=${encodeURIComponent(path)}`),
};

/**
 * Host names the app itself runs on (VITE_APP_HOSTS, comma separated). Any other host is a
 * website's own domain: the browser draws that site instead of the app. Without the setting,
 * every host is the app and sites open at /site/{code}.
 */
export function siteHost(hostname = window.location.hostname): string | null {
  const configured = (import.meta.env.VITE_APP_HOSTS as string | undefined)?.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!configured?.length) return null;
  const host = hostname.toLowerCase();
  return configured.includes(host) ? null : host;
}

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../lib/api';
import { siteApi, type PublicSite, type SiteFooterStyle, type SiteHeaderStyle } from '../../lib/siteApi';
import { applyTheme } from '../../lib/theme';
import { useTheme } from '../../components/ThemeProvider';
import { Alert } from '../../components/ui';
import { DrilldownHost } from '../../render/DrilldownHost';
import { LinkBaseContext, seedTemplates } from '../../render/WidgetView';
import { SiteItems } from './SiteBlocks';
import { href, SiteFooter, SiteHeader } from './SiteChrome';
import { SiteSocialContext } from './SiteSocial';
import { siteLook } from './looks';
import './looks.css';
import './site.css';
import { t } from '@/i18n';

/** Sets (or with null removes) one <meta> or <link> in the page's head. */
function headTag(selector: string, make: () => HTMLElement, attr: string, value: string | null) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (value === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = make();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}
const metaName = (name: string, value: string | null) => headTag(`meta[name="${name}"]`, () => Object.assign(document.createElement('meta'), { name }), 'content', value);

function setHead(data: PublicSite) {
  const { site, page } = data;
  const title = page ? (page.title.includes(site.title) ? page.title : `${page.title} · ${site.title}`) : `${t('Page not found')} · ${site.title}`;
  document.title = title;
  document.documentElement.lang = site.lang || 'en';
  const description = page?.description ?? site.description;
  metaName('description', description);
  for (const [name, value] of [['og:title', title], ['og:description', description], ['og:image', page?.image ?? null], ['og:type', 'website']] as const) {
    headTag(`meta[property="${name}"]`, () => {
      const el = document.createElement('meta');
      el.setAttribute('property', name);
      return el;
    }, 'content', value);
  }
  const canonical = site.host && page ? `https://${site.host}${page.path === '/' ? '/' : page.path}` : null;
  headTag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), 'href', canonical);
  metaName('robots', page ? null : 'noindex');
}

/**
 * The site's theme while it is open; signed in, through the provider so the app's comes back after.
 * Its mode follows the site's look, not the visitor's, so forms inside the page sit on its paper.
 */
function useSiteTheme(data: PublicSite, dark: boolean) {
  const { user, loading } = useAuth();
  const { setPreview } = useTheme();
  const theme = useMemo(() => ({ ...data.site.theme, mode: dark ? ('dark' as const) : ('light' as const) }), [data.site.theme, dark]);
  useEffect(() => {
    // Until sign-in is known, a signed-in admin would look like a guest.
    if (loading) return;
    if (user) {
      setPreview(theme);
      return () => setPreview(null);
    }
    applyTheme(theme, dark);
  }, [user, loading, theme, dark, setPreview]);
}

/** The look's faces, loaded once a site wearing it is open. */
function useSiteFont(href: string | null) {
  useEffect(() => {
    if (!href || document.head.querySelector(`link[href="${CSS.escape(href)}"]`)) return;
    document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
  }, [href]);
}

/**
 * A website page as visitors see it: the site's header and menu (SiteChrome), the page's
 * widgets, its footer. base is where the site's addresses start ("" on its own domain, /site/{code} else).
 */
export function SiteView({ data, base, banner }: { data: PublicSite; base: string; banner?: ReactNode }) {
  const { nav, footer_nav, page } = data;
  const { search } = useLocation();
  // ?look=, ?header= and ?footer= try another one on the page without saving it.
  const query = new URLSearchParams(search);
  const site = { ...data.site, header: (query.get('header') ?? data.site.header) as SiteHeaderStyle, footer_style: (query.get('footer') ?? data.site.footer_style) as SiteFooterStyle };
  const look = siteLook(query.get('look') ?? site.look);
  useSiteTheme(data, look.dark);
  useSiteFont(look.font);
  useMemo(() => page && seedTemplates(page.templates), [page]);
  useEffect(() => setHead(data), [data]);

  const chrome = { site, nav, base, current: page?.path ?? null };

  return (
    <div className="hm-site" data-theme={look.slug} data-brand={site.theme_meta_id && site.brand_accent ? '' : undefined}>
      <a href="#content" className="hm-skip">
        {t('Skip to content')}
      </a>
      {banner}
      <SiteHeader {...chrome} />

      <main id="content" className="hm-main">
        <div className="container">
          {page ? (
            <LinkBaseContext.Provider value={base}>
              <SiteSocialContext.Provider value={site.social}>
                <DrilldownHost>
                  <SiteItems items={page.items} />
                </DrilldownHost>
              </SiteSocialContext.Provider>
              {page.children.length > 0 && (
                <nav className="hm-index hm-subpages" aria-labelledby="subpages-title">
                  <h2 id="subpages-title">{t('In this section')}</h2>
                  <ul className="hm-index__list">
                    {page.children.map((child) => (
                      <li key={child.path}>
                        <Link to={href(base, child.path)} className="hm-index__row">
                          <span className="hm-index__label">{child.label}</span>
                          {child.description && <span className="hm-index__text">{child.description}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </LinkBaseContext.Provider>
          ) : (
            <div className="hm-missing">
              <p className="hm-missing__code">404</p>
              <h1>{t("We couldn't find that page")}</h1>
              <p className="lead">{t('It may have moved, or the address may be mistyped.')}</p>
              <div className="hm-actions">
                <Link to={href(base, '/')} className="hm-btn hm-btn--primary">
                  {t('Go to the home page')}
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      <SiteFooter {...chrome} nav={footer_nav ?? nav} />
    </div>
  );
}

/**
 * Loads the page at the browser's address (after base) and draws it. load gets the path
 * within the site.
 */
export function SiteLoader({ base, load, banner }: { base: string; load: (path: string) => Promise<PublicSite>; banner?: ReactNode }) {
  const { pathname } = useLocation();
  const path = pathname.startsWith(base) ? pathname.slice(base.length) || '/' : '/';
  const [data, setData] = useState<PublicSite | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    load(path).then(
      (d) => {
        if (!live) return;
        setData(d);
        window.scrollTo(0, 0);
      },
      (err) => live && setError(err instanceof ApiError && err.status === 404 ? t('There is no website at this address.') : t('This page could not be loaded. Try again in a moment.')),
    );
    return () => {
      live = false;
    };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (!data) return <div className="hm-site" aria-busy="true" />;
  return <SiteView data={data} base={base} banner={banner} />;
}

/** /site/:code/* — a website's published pages at the app's own address, before (or besides) its domain. */
export function PublicSitePage() {
  const { code = '' } = useParams();
  return <SiteLoader key={code} base={`/site/${code}`} load={(path) => siteApi.byCode(code, path)} />;
}

/** /site-preview/:id/* — admins see every page of a site as it is in the builder, unpublished changes too. */
export function SitePreviewPage() {
  const id = Number(useParams().id);
  return (
    <SiteLoader
      key={id}
      base={`/site-preview/${id}`}
      load={(path) => siteApi.preview(id, path)}
      banner={
        <div className="hm-notice" role="status">
          <div className="container">
            <span>{t('Preview: pages as they are in the builder, published or not. Visitors don’t see this.')}</span>
            <Link to={`/sites/${id}`}>{t('Back to the website manager')}</Link>
          </div>
        </div>
      }
    />
  );
}

/** The whole browser on a website's own domain: every address is one of its pages. */
export function SiteHostApp({ host }: { host: string }) {
  return (
    <Routes>
      <Route path="*" element={<SiteLoader base="" load={(path) => siteApi.byHost(host, path)} />} />
    </Routes>
  );
}

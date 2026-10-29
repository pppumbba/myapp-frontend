import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { NavItem, PublicSite } from '../../lib/siteApi';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

// A website's header and footer in the style its settings pick (site.header, site.footer_style).
// Every header folds into the same Menu button under 60rem.

export const href = (base: string, path: string) => (path === '/' ? base || '/' : base + path);

type Site = PublicSite['site'];

/** The headers drawn as one bar; anything else is the masthead. */
const BARS: string[] = ['edge', 'pill', 'slab', 'banner'];

interface ChromeProps {
  site: Site;
  nav: NavItem[];
  base: string;
  /** The open page's path, for the current menu item. */
  current: string | null;
}

const isCurrent = (item: NavItem, current: string | null) => item.path === current || (item.path !== '/' && !!current?.startsWith(item.path + '/'));

function NavLink({ base, item, current, className }: { base: string; item: NavItem; current: string | null; className: string }) {
  return (
    <Link to={href(base, item.path)} aria-current={isCurrent(item, current) ? 'page' : undefined} className={className}>
      {item.label}
    </Link>
  );
}

/** The menu as a list; sub pages in a nested list with subClass. */
function Menu({ nav, base, current, linkClass, subClass }: Omit<ChromeProps, 'site'> & { linkClass: string; subClass: string }) {
  return (
    <ul>
      {nav.map((item) => (
        <li key={item.path}>
          <NavLink base={base} item={item} current={current} className={linkClass} />
          {item.children.length > 0 && (
            <ul className={subClass}>
              {item.children.map((child) => (
                <li key={child.path}>
                  <NavLink base={base} item={child} current={current} className={linkClass} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function Mark({ site, base, className }: { site: Site; base: string; className: string }) {
  return (
    <Link to={href(base, '/')} className={className} aria-label={t('{name}, home', { name: site.title })}>
      {site.logo && <img src={site.logo} alt="" className="hm-mast__logo" />}
      <span>{site.title}</span>
    </Link>
  );
}

export function SiteHeader(props: ChromeProps) {
  const { site, nav, base, current } = props;
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  const toggle = (className: string) => (
    <button type="button" className={cx('hm-btn', className)} aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((o) => !o)}>
      {open ? t('Close menu') : t('Menu')}
    </button>
  );
  const drawer = (
    <nav id="site-menu" aria-label={t('Main')} className="hm-mast__drawer" data-open={open}>
      <Menu nav={nav} base={base} current={current} linkClass="hm-mast__link" subClass="hm-mast__sublist" />
    </nav>
  );

  if (!BARS.includes(site.header)) {
    return (
      <header className="hm-mast">
        <div className="container hm-mast__head">
          <Mark site={site} base={base} className="hm-mast__mark" />
          {site.tagline && <p className="hm-mast__tag">{site.tagline}</p>}
        </div>
        {nav.length > 0 && (
          <div className="hm-mast__bar">
            <nav aria-label={t('Main')} className="container hm-mast__nav">
              <Menu nav={nav} base={base} current={current} linkClass="hm-mast__link" subClass="hm-mast__sub" />
            </nav>
            <div className="hm-mast__toggle">{toggle('hm-mast__toggle-btn')}</div>
            {drawer}
          </div>
        )}
      </header>
    );
  }

  // Edge, pill, slab and banner share one bar: the name at one edge, the menu at the other.
  const style = site.header;
  return (
    <header className={cx('hm-bar', `hm-bar--${style}`, style === 'slab' && 'hm-on-ink')}>
      {style === 'banner' && site.announcement && (
        <p className="hm-announce">
          <span className="container">{site.announcement}</span>
        </p>
      )}
      <div className={cx(style === 'pill' ? 'hm-bar__float' : 'container')}>
        <div className="hm-bar__inner">
          <Mark site={site} base={base} className="hm-bar__mark" />
          {nav.length > 0 && (
            <>
              <nav aria-label={t('Main')} className="hm-bar__nav">
                <Menu nav={nav} base={base} current={current} linkClass="hm-bar__link" subClass="hm-mast__sub" />
              </nav>
              <div className="hm-bar__toggle">{toggle('')}</div>
            </>
          )}
        </div>
        {nav.length > 0 && drawer}
      </div>
    </header>
  );
}

export function SiteFooter({ site, nav, base, current }: ChromeProps) {
  const year = new Date().getFullYear();
  const legal = (
    <p className="hm-close__legal">
      © {year} {site.title}
    </p>
  );
  const links = nav.length > 0 && (
    <ul className="hm-close__links">
      {nav.map((item) => (
        <li key={item.path}>
          <NavLink base={base} item={item} current={current} className="" />
        </li>
      ))}
    </ul>
  );
  const style = site.footer_style || 'letter';

  if (style === 'mast') {
    return (
      <footer className="hm-close hm-close--mast">
        <div className="container">
          <div className="hm-close__row">
            {site.footer && <p className="hm-close__letter">{site.footer}</p>}
            {links}
          </div>
          <p className="hm-close__giant" aria-hidden="true">
            {site.title}
          </p>
          {legal}
        </div>
      </footer>
    );
  }

  if (style === 'statement') {
    // The first line of the footer text is the closing sentence; the rest sits under it.
    const [first, ...rest] = (site.footer || site.tagline || site.title).split('\n');
    return (
      <footer className="hm-close hm-close--statement">
        <div className="container">
          <p className="hm-close__statement">{first}</p>
          <div className="hm-close__row">
            {rest.length > 0 && <p className="hm-close__letter">{rest.join('\n')}</p>}
            {links}
          </div>
          {legal}
        </div>
      </footer>
    );
  }

  if (style === 'colophon') {
    return (
      <footer className="hm-close hm-close--colophon">
        <div className="container">
          <p>
            © {year} {site.title}
          </p>
          {site.footer && <p className="hm-close__inline">{site.footer.split('\n').join(', ')}</p>}
          {links}
        </div>
      </footer>
    );
  }

  if (style === 'columns') {
    // Pages with sub pages get a column each; the rest share the first.
    const loose = nav.filter((item) => item.children.length === 0);
    const groups = nav.filter((item) => item.children.length > 0);
    return (
      <footer className="hm-close hm-close--columns" style={{ '--cols': (loose.length > 0 ? 1 : 0) + groups.length || 1 } as CSSProperties}>
        <div className="container">
          <div className="hm-close__sign">
            <p className="hm-close__name">{site.title}</p>
            {site.footer && <p className="hm-close__letter">{site.footer}</p>}
          </div>
          {loose.length > 0 && (
            <nav aria-label={site.title} className="hm-close__col">
              <ul>
                {loose.map((item) => (
                  <li key={item.path}>
                    <NavLink base={base} item={item} current={current} className="" />
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {groups.map((group) => (
            <nav key={group.path} aria-label={group.label} className="hm-close__col">
              <NavLink base={base} item={group} current={current} className="hm-close__colhead" />
              <ul>
                {group.children.map((child) => (
                  <li key={child.path}>
                    <NavLink base={base} item={child} current={current} className="" />
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          {legal}
        </div>
      </footer>
    );
  }

  return (
    <footer className="hm-close">
      <div className="container">
        <div className="hm-close__sign">
          <p className="hm-close__name">{site.title}</p>
          {site.footer && <p className="hm-close__letter">{site.footer}</p>}
        </div>
        {links}
        {legal}
      </div>
    </footer>
  );
}

import { createContext, type ReactNode } from 'react';
import { SOCIAL_NETWORKS, type SiteSettings, type SocialNetwork } from '../../lib/siteApi';
import { cx } from '@/utils/cx';

// A website's social pages (settings.social): icons in its header and footer, and the
// Social links widget. Icons are drawn in the text colour, so every look and the slab's ink
// bar colour them without CSS of their own.

export const SOCIAL_NAMES: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  x: 'X',
  linkedin: 'LinkedIn',
};

export const SOCIAL_EXAMPLES: Record<SocialNetwork, string> = {
  instagram: 'https://instagram.com/yourname',
  facebook: 'https://facebook.com/yourpage',
  youtube: 'https://youtube.com/@yourchannel',
  tiktok: 'https://tiktok.com/@yourname',
  x: 'https://x.com/yourname',
  linkedin: 'https://linkedin.com/company/yourcompany',
};

/** Outline marks on a 24 grid, stroked like the rest of the site's icons. */
const PATHS: Record<SocialNetwork, ReactNode> = {
  instagram: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <path d="M17.5 6.5h.01" />
    </>
  ),
  facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
  youtube: (
    <>
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </>
  ),
  tiktok: <path d="M21 7.917v4.034a9.948 9.948 0 0 1-5-1.951v4.5a6.5 6.5 0 1 1-8-6.326v4.326a2.5 2.5 0 1 0 4 2v-11.5h4.083a6.005 6.005 0 0 0 4.917 4.917z" />,
  x: (
    <>
      <path d="M4 4l11.733 16H20L8.267 4z" />
      <path d="M4 20l6.768-6.768M13.232 10.768 20 4" />
    </>
  ),
  linkedin: (
    <>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </>
  ),
};

export function SocialIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {PATHS[network]}
    </svg>
  );
}

/** The site's social pages, for widgets drawn inside it (SiteView provides it). */
export const SiteSocialContext = createContext<SiteSettings['social']>({});

/** The networks the site has set, in their order. */
export const socialLinks = (social: SiteSettings['social'] | undefined) => SOCIAL_NETWORKS.filter((network) => !!social?.[network]);

/** The site's social pages as a row of links; with labels each names its network, else the icon alone does (to screen readers). */
export function SocialLinks({ social, labels = false, className }: { social: SiteSettings['social'] | undefined; labels?: boolean; className?: string }) {
  const networks = socialLinks(social);
  if (!networks.length) return null;
  return (
    <ul className={cx('hm-social', labels && 'hm-social--labels', className)}>
      {networks.map((network) => (
        <li key={network}>
          <a href={social![network]} target="_blank" rel="noopener noreferrer me" className="hm-social__link" aria-label={labels ? undefined : SOCIAL_NAMES[network]}>
            <SocialIcon network={network} className="hm-social__icon" />
            {labels && <span>{SOCIAL_NAMES[network]}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

import { useEffect, useState } from 'react';
import { api } from './api';

/** A menu style meta's settings (json_config.menu), as the API fills them in. See MenuStyles.php. */
export interface MenuSettings {
  /** surface, subtle, brand and dark follow the theme; gradient uses `gradient`; a #hex colour is fixed. */
  background: 'surface' | 'subtle' | 'brand' | 'dark' | 'gradient' | string;
  edge: 'line' | 'shadow' | 'none';
  radius: 'none' | 'sm' | 'md' | 'lg';
  /** Px between the menu and the page edge. */
  gap: 0 | 8 | 12 | 16;
  width: 'narrow' | 'default' | 'wide';
  /** How the current item is marked. */
  item: 'pill' | 'bar' | 'plain';
  /** The screen sits as a rounded panel inside a frame the menu's colour. */
  frame: boolean;
  /** The colours a gradient background runs between. */
  gradient: MenuGradient;
  /** See-through and blurred, so the backdrop shows through. */
  glass: boolean;
  /** A gradient painted on the app's frame, behind the menu. */
  backdrop: MenuGradient | null;
}

/** Each end is brand (the theme's) or a #hex colour. */
export interface MenuGradient {
  from: string;
  to: string;
  angle: 0 | 45 | 90 | 135 | 180;
}

export interface MenuStyleMeta {
  id: number;
  code: string;
  name: string;
  menu: MenuSettings;
}

/** The Classic menu. */
export const BASE_MENU: MenuSettings = {
  background: 'surface',
  edge: 'line',
  radius: 'none',
  gap: 0,
  width: 'default',
  item: 'pill',
  frame: false,
  gradient: { from: 'brand', to: '#ec4899', angle: 135 },
  glass: false,
  backdrop: null,
};

/** Ready-made backdrops for the designer. */
export const BACKDROP_PRESETS: { name: string; gradient: MenuGradient }[] = [
  { name: 'Indigo to pink', gradient: { from: '#6366f1', to: '#ec4899', angle: 135 } },
  { name: 'Teal to blue', gradient: { from: '#14b8a6', to: '#3b82f6', angle: 135 } },
  { name: 'Sunset', gradient: { from: '#f97316', to: '#db2777', angle: 45 } },
  { name: 'Night', gradient: { from: '#0f172a', to: '#4338ca', angle: 180 } },
];
export const MENU_ANGLES: MenuGradient['angle'][] = [0, 45, 90, 135, 180];

/** The built-in side styles as settings: where a new style starts from, and what their sketches draw. */
export const MENU_STARTS: Record<'classic' | 'floating' | 'inset' | 'dark', MenuSettings> = {
  classic: BASE_MENU,
  floating: { ...BASE_MENU, edge: 'shadow', radius: 'lg', gap: 12 },
  inset: { ...BASE_MENU, background: 'subtle', edge: 'none', frame: true },
  dark: { ...BASE_MENU, background: 'dark' },
};

export const MENU_BACKGROUNDS = ['surface', 'subtle', 'brand', 'dark', 'gradient'] as const;
export const MENU_EDGES: MenuSettings['edge'][] = ['line', 'shadow', 'none'];
export const MENU_RADII: MenuSettings['radius'][] = ['none', 'sm', 'md', 'lg'];
export const MENU_GAPS: MenuSettings['gap'][] = [0, 8, 12, 16];
export const MENU_WIDTHS: MenuSettings['width'][] = ['narrow', 'default', 'wide'];
export const MENU_ITEMS: MenuSettings['item'][] = ['pill', 'bar', 'plain'];

const RADIUS_PX: Record<MenuSettings['radius'], number> = { none: 0, sm: 6, md: 10, lg: 14 };
/** The expanded menu's width; default is AppSidebar's own. */
export const MENU_WIDTH_PX: Record<MenuSettings['width'], number> = { narrow: 240, default: 256, wide: 340 };

export const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

/** Relative luminance of a #rrggbb colour, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Below this, white text reads better than black (where both contrast ratios meet). */
const DARK_BELOW = 0.179;
/** How much of a glass menu's own colour stays; the rest is the blurred backdrop. */
const GLASS_TINT = 60;

const endColour = (end: string) => (end === 'brand' ? 'var(--color-brand-600)' : end);
/** The theme's brand is only known in CSS; brand-600 is dark enough for white text in every seeded theme. */
const endLuminance = (end: string) => (end === 'brand' ? 0.08 : isHex(end) ? luminance(end) : 0.08);
const gradientLuminance = (g: MenuGradient) => (endLuminance(g.from) + endLuminance(g.to)) / 2;

/** A gradient as CSS; with a tint, each colour is that % see-through. */
export function gradientCss(g: MenuGradient, tint?: number): string {
  const c = (end: string) => (tint ? `color-mix(in srgb, ${endColour(end)} ${tint}%, transparent)` : endColour(end));
  return `linear-gradient(${g.angle}deg, ${c(g.from)}, ${c(g.to)})`;
}

/**
 * What a style puts on the menu: whether it needs the dark tokens (so its text stays readable)
 * and the CSS variables menu-style.css and AppSidebar read:
 * - --menu-solid: one colour, for glass in browsers without blur;
 * - --menu-fill: the menu's whole background (a colour or a gradient, see-through for glass);
 * - --menu-backdrop: the frame's gradient, when there is one.
 * The dark background is the raw colour the dark tokens' surface uses: a var() in a custom
 * property is resolved where the property is set (the layout, in light tokens), so
 * var(--color-bg-primary) would come out white even under .dark-mode.
 */
export function menuSurface(s: MenuSettings): { dark: boolean; glass: boolean; vars: Record<string, string> } {
  const solid =
    s.background === 'subtle' ? 'var(--color-bg-secondary)'
    : s.background === 'brand' ? 'var(--color-brand-600)'
    : s.background === 'dark' ? 'var(--color-neutral-950)'
    : s.background === 'gradient' ? endColour(s.gradient.from)
    : isHex(s.background) ? s.background
    : 'var(--color-bg-primary)';
  // Surface and subtle follow the user's light or dark mode, so only fixed colours are measured.
  const own =
    s.background === 'brand' ? endLuminance('brand')
    : s.background === 'dark' ? 0
    : s.background === 'gradient' ? gradientLuminance(s.gradient)
    : isHex(s.background) ? luminance(s.background)
    : null;
  // On glass the backdrop shows through, so it counts too.
  const behind = s.glass && s.backdrop ? gradientLuminance(s.backdrop) : null;
  const seen = own !== null && behind !== null ? (own * GLASS_TINT + behind * (100 - GLASS_TINT)) / 100 : (own ?? behind);
  const fill =
    s.background === 'gradient' ? gradientCss(s.gradient, s.glass ? GLASS_TINT : undefined)
    : s.glass ? `color-mix(in srgb, ${solid} ${GLASS_TINT}%, transparent)`
    : solid;
  return {
    dark: seen !== null && seen < DARK_BELOW,
    glass: s.glass,
    vars: {
      '--menu-bg': solid,
      '--menu-solid': solid,
      '--menu-fill': fill,
      ...(s.backdrop ? { '--menu-backdrop': gradientCss(s.backdrop) } : {}),
      '--menu-radius': `${RADIUS_PX[s.radius]}px`,
      '--menu-gap': `${s.gap}px`,
      '--menu-width': `${MENU_WIDTH_PX[s.width]}px`,
    },
  };
}

/** Settings as saved, with keys added since filled in from the base. */
export const withMenuDefaults = (menu: Partial<MenuSettings> | null | undefined): MenuSettings => ({ ...BASE_MENU, ...(menu ?? {}) });

export const menuStyleApi = {
  list: () => api<{ styles: MenuStyleMeta[] }>('/menu-styles').then((r) => r.styles),
  save: (metaId: number, menu: MenuSettings) => api<MenuSettings>(`/metas/${metaId}/menu-style`, { method: 'PUT', body: JSON.stringify({ menu }) }),
};

const CACHE_KEY = 'menu_styles';

function readCache(): MenuStyleMeta[] | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as MenuStyleMeta[] | null;
  } catch {
    return null;
  }
}

/**
 * Every active menu style; null while loading, empty when the list can't be read. It starts
 * from the last list seen, so an app opens in its own menu instead of flashing Classic first.
 */
export function useMenuStyles(): MenuStyleMeta[] | null {
  const [styles, setStyles] = useState<MenuStyleMeta[] | null>(readCache);
  useEffect(() => {
    let live = true;
    menuStyleApi.list().then(
      (list) => {
        if (!live) return;
        setStyles(list);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(list));
        } catch {
          // Storage can be blocked; the list still works for this visit.
        }
      },
      () => live && setStyles((cached) => cached ?? []),
    );
    return () => {
      live = false;
    };
  }, []);
  return styles;
}

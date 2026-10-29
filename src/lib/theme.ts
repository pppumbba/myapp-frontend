import { api } from './api';

/** A theme meta's settings (json_config.theme), as the API fills them in. */
export interface ThemeSettings {
  brand: string;
  gray: Gray;
  radius: Radius;
  font: Font;
  density: Density;
  /** any: the user's own light or dark; light or dark: always that. */
  mode: 'any' | 'light' | 'dark';
  /** The theme everyone gets unless they pick another. */
  default: boolean;
  /** Apps (meta ids) that look like this while open, whatever the user picked. */
  apps: number[];
}
export type Gray = 'neutral' | 'slate' | 'zinc' | 'stone' | 'warm';
export type Radius = 'none' | 'small' | 'default' | 'large' | 'round';
export type Font = 'inter' | 'system' | 'serif' | 'rounded';
export type Density = 'compact' | 'default' | 'comfortable';

export interface ThemeMeta {
  id: number;
  code: string;
  name: string;
  theme: ThemeSettings;
}

export interface ThemeList {
  themes: ThemeMeta[];
  default_id: number | null;
  /** app meta id → theme meta id */
  apps: Record<string, number>;
}

export const BASE_THEME: ThemeSettings = { brand: '#4f46e5', gray: 'neutral', radius: 'default', font: 'inter', density: 'default', mode: 'any', default: false, apps: [] };

export const themeApi = {
  list: () => api<ThemeList>('/themes'),
  save: (metaId: number, theme: ThemeSettings) => api<ThemeSettings>(`/metas/${metaId}/theme`, { method: 'PUT', body: JSON.stringify({ theme }) }),
  /** The user's own choice: mode null follows the system, theme null is the default theme. */
  mine: (mode: 'light' | 'dark' | null, themeMetaId: number | null, size: UiSize | null) =>
    api<{ theme_mode: 'light' | 'dark' | null; theme_meta_id: number | null; ui_size: UiSize | null }>('/user/theme', {
      method: 'PUT',
      body: JSON.stringify({ mode, theme_meta_id: themeMetaId, size }),
    }),
};

export const GRAYS: { id: Gray; name: string }[] = [
  { id: 'neutral', name: 'Neutral' },
  { id: 'slate', name: 'Slate (cool)' },
  { id: 'zinc', name: 'Zinc' },
  { id: 'stone', name: 'Stone' },
  { id: 'warm', name: 'Warm' },
];
export const RADII: { id: Radius; name: string }[] = [
  { id: 'none', name: 'Square' },
  { id: 'small', name: 'Small' },
  { id: 'default', name: 'Default' },
  { id: 'large', name: 'Large' },
  { id: 'round', name: 'Round' },
];
export const FONTS: { id: Font; name: string }[] = [
  { id: 'inter', name: 'Inter' },
  { id: 'system', name: 'System' },
  { id: 'serif', name: 'Serif' },
  { id: 'rounded', name: 'Rounded' },
];
export const DENSITIES: { id: Density; name: string }[] = [
  { id: 'compact', name: 'Compact' },
  { id: 'default', name: 'Default' },
  { id: 'comfortable', name: 'Comfortable' },
];
export const BRAND_SWATCHES = ['#4f46e5', '#2563eb', '#0284c7', '#0d9488', '#15803d', '#65a30d', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#8b5cf6', '#334155'];

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Greys other than the app's own neutral, lightest to darkest. */
const GRAY_HEX: Record<Exclude<Gray, 'neutral'>, string[]> = {
  slate: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617'],
  zinc: ['#fafafa', '#f4f4f5', '#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46', '#27272a', '#18181b', '#09090b'],
  stone: ['#fafaf9', '#f5f5f4', '#e7e5e4', '#d6d3d1', '#a8a29e', '#78716c', '#57534e', '#44403c', '#292524', '#1c1917', '#0c0a09'],
  warm: ['#fbf9f6', '#f5f1ea', '#e9e2d6', '#d7ccba', '#b3a58e', '#8a7c66', '#6b5f4d', '#514839', '#362f25', '#221d17', '#120f0b'],
};

const NEUTRAL_HEX = ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717', '#0a0a0a'];

/** A grey palette as plain colours (50 to 950), for drawing swatches. */
export const grayHex = (gray: Gray) => (gray === 'neutral' ? NEUTRAL_HEX : GRAY_HEX[gray]);

/** A corner size in rem, for a theme's base radius (the app's lg, 0.5rem). */
export const radiusRem = (radius: Radius, base = 0.5) => base * RADIUS_SCALE[radius];

const RADIUS_SCALE: Record<Radius, number> = { none: 0, small: 0.5, default: 1, large: 1.5, round: 2 };
const RADIUS_BASE = { xs: 0.125, sm: 0.25, DEFAULT: 0.25, md: 0.375, lg: 0.5, xl: 0.75, '2xl': 1, '3xl': 1.5 };

const FONT_STACK: Record<Font, string | null> = {
  inter: null,
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI Variable Display", system-ui, sans-serif',
};
/** The root font size (px) of each density; Tailwind and Untitled UI sizes are in rem, so it scales everything. */
const FONT_SIZE: Record<Density, number> = { compact: 14, default: 15, comfortable: 16 };

/** How big each user wants the app, on top of the theme's density. */
export type UiSize = 'sm' | 'md' | 'lg';
const SIZE_SCALE: Record<UiSize, number> = { sm: 0.9, md: 1, lg: 1.15 };

/** sRGB hex → OKLCH (lightness 0–1, chroma, hue in degrees). */
function oklch(hex: string): [number, number, number] {
  const lin = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

/**
 * A full brand scale from one colour: the colour itself is 600 (buttons, links), the others
 * keep its hue at Tailwind-like lightness, with less colour towards white and black.
 */
export function brandScale(hex: string): Record<(typeof SHADES)[number], string> {
  const [, c, h] = oklch(hex);
  const light = [0.977, 0.943, 0.885, 0.805, 0.705, 0.62, 0, 0.47, 0.4, 0.345, 0.26];
  const chroma = [0.12, 0.25, 0.45, 0.7, 0.9, 1, 1, 0.9, 0.78, 0.62, 0.48];
  return Object.fromEntries(
    SHADES.map((shade, i) => [shade, shade === 600 ? hex : `oklch(${light[i]} ${(c * chroma[i]).toFixed(4)} ${h.toFixed(2)})`]),
  ) as Record<(typeof SHADES)[number], string>;
}

/** The CSS variables a theme sets on <html>, over the stylesheet's own. */
export function themeVariables(t: ThemeSettings): Record<string, string> {
  const vars: Record<string, string> = {};
  if (t.brand.toLowerCase() !== BASE_THEME.brand) {
    for (const [shade, value] of Object.entries(brandScale(t.brand))) vars[`--color-brand-${shade}`] = value;
  }
  if (t.gray !== 'neutral') GRAY_HEX[t.gray].forEach((hex, i) => (vars[`--color-neutral-${SHADES[i]}`] = hex));
  if (t.radius !== 'default') {
    for (const [k, rem] of Object.entries(RADIUS_BASE)) vars[`--radius-${k}`] = `${rem * RADIUS_SCALE[t.radius]}rem`;
  }
  const font = FONT_STACK[t.font];
  if (font) {
    vars['--font-body'] = font;
    vars['--font-display'] = font;
  }
  return vars;
}

/** Whether a theme shows dark: its own mode, else the user's, else the system's. */
export function isDark(t: ThemeSettings, userMode: 'light' | 'dark' | null, systemDark: boolean): boolean {
  return t.mode === 'any' ? (userMode ?? (systemDark ? 'dark' : 'light')) === 'dark' : t.mode === 'dark';
}

let applied: string[] = [];

/** Puts a theme on the page. The last one is kept in this browser, so the next load starts with it. */
export function applyTheme(t: ThemeSettings, dark: boolean, size: UiSize = 'md') {
  const root = document.documentElement;
  const vars = themeVariables(t);
  for (const name of applied) if (!(name in vars)) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  applied = Object.keys(vars);
  const px = (FONT_SIZE[t.density] ?? 15) * (SIZE_SCALE[size] ?? 1);
  root.style.fontSize = `${Math.round(px * 10) / 10}px`;
  root.classList.toggle('dark-mode', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  try {
    localStorage.setItem('theme', JSON.stringify({ t, dark, size }));
  } catch {
    // A blocked storage only means the next load starts with the standard look.
  }
}

/** The theme from the last visit, before the user and the themes are loaded. */
export function applyStoredTheme() {
  try {
    const stored = JSON.parse(localStorage.getItem('theme') ?? 'null') as { t: ThemeSettings; dark: boolean; size?: UiSize } | null;
    if (stored?.t) applyTheme({ ...BASE_THEME, ...stored.t }, stored.dark, stored.size);
  } catch {
    // Nothing usable stored: the stylesheet's look stays.
  }
}

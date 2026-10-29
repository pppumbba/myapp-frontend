import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { applyStoredTheme, applyTheme, BASE_THEME, isDark, themeApi, type ThemeList, type ThemeMeta, type ThemeSettings, type UiSize } from '../lib/theme';

interface ThemeState {
  /** Every theme to pick from, the default and the apps' own; null until loaded. */
  list: ThemeList | null;
  /** The theme showing now, and whether it shows dark. */
  current: ThemeSettings;
  dark: boolean;
  /** The user's choice: mode null follows the system, theme null is the default theme. */
  mode: 'light' | 'dark' | null;
  themeId: number | null;
  /** How big the app is for this user. */
  size: UiSize;
  choose: (mode: 'light' | 'dark' | null, themeId: number | null, size?: UiSize) => Promise<void>;
  /** Loads the themes again, after one is changed in the builder. */
  reload: () => Promise<void>;
  /** While an app is open: its own theme, if it has one. null when it closes. */
  setAppId: (appId: number | null) => void;
  /** Shows unsaved settings everywhere while a theme is being designed; null stops. */
  setPreview: (theme: ThemeSettings | null) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

applyStoredTheme();

const systemQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

/**
 * Puts the right theme on the page: a theme being designed, else the open app's own, else
 * the one the user picked, else the default. Its mode wins over the user's light or dark
 * when it has one; otherwise the user's, otherwise the system's.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useAuth();
  const [list, setList] = useState<ThemeList | null>(null);
  const [appId, setAppId] = useState<number | null>(null);
  const [preview, setPreview] = useState<ThemeSettings | null>(null);
  const [systemDark, setSystemDark] = useState(() => !!systemQuery()?.matches);

  useEffect(() => {
    const q = systemQuery();
    if (!q) return;
    const change = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    q.addEventListener('change', change);
    return () => q.removeEventListener('change', change);
  }, []);

  const reload = useCallback(async () => {
    setList(await themeApi.list().catch(() => null));
  }, []);
  useEffect(() => {
    if (user) void reload();
    else setList(null);
  }, [user?.id, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const mode = user?.theme_mode ?? null;
  const themeId = user?.theme_meta_id ?? null;
  const size: UiSize = user?.ui_size ?? 'md';
  const find = (id: number | null | undefined): ThemeMeta | undefined => (id ? list?.themes.find((t) => t.id === id) : undefined);
  const current =
    preview ?? find(appId ? list?.apps[String(appId)] : null)?.theme ?? find(themeId)?.theme ?? find(list?.default_id)?.theme ?? BASE_THEME;
  const dark = isDark(current, mode, systemDark);

  // Signed out, the last theme stays (the sign-in page looks as it did); signed in, it follows the choice.
  useEffect(() => {
    if (user && list) applyTheme(current, dark, size);
  }, [user, list, current, dark, size]);

  const choose = useCallback(
    async (nextMode: 'light' | 'dark' | null, nextTheme: number | null, nextSize: UiSize = size) => {
      if (!user) return;
      const saved = await themeApi.mine(nextMode, nextTheme, nextSize);
      updateUser({ ...user, ...saved });
    },
    [user, updateUser, size],
  );

  const value = useMemo(
    () => ({ list, current, dark, mode, themeId, size, choose, reload, setAppId, setPreview }),
    [list, current, dark, mode, themeId, size, choose, reload],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/** An open app shows in its own theme, if one is set for it. */
export function useAppTheme(appId: number) {
  const { setAppId } = useTheme();
  useEffect(() => {
    setAppId(appId);
    return () => setAppId(null);
  }, [appId, setAppId]);
}

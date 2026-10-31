import { useEffect, useState } from 'react';
import { api } from './api';

/** A screen meta: a built-in page (e.g. market contracts) placed in apps' menus like any meta. */
export interface Screen {
  id: number;
  code: string;
  name: string;
  /** Where the page lives, e.g. /market/contracts. */
  path: string;
  /** The apps whose menu holds this screen. */
  app_ids: number[];
}

export const screenApi = {
  /** The screens this user may open. */
  list: () => api<Screen[]>('/screens'),
};

/** The screens this user may open; null while loading, [] if they could not be read. */
export function useScreens(): Screen[] | null {
  const [screens, setScreens] = useState<Screen[] | null>(null);
  useEffect(() => {
    let live = true;
    screenApi.list().then(
      (list) => live && setScreens(list),
      () => live && setScreens([]),
    );
    return () => {
      live = false;
    };
  }, []);
  return screens;
}

/**
 * The screen an address belongs to: the longest screen path it starts with, else a screen in
 * the same first segment (so /market/companies/5 still opens inside the market app).
 */
export function screenFor(screens: Screen[], pathname: string): Screen | undefined {
  const within = screens
    .filter((s) => s.app_ids.length && (pathname === s.path || pathname.startsWith(`${s.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (within) return within;
  const segment = pathname.split('/')[1];
  return screens.find((s) => s.app_ids.length && s.path.split('/')[1] === segment);
}

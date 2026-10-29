import { useSyncExternalStore } from 'react';

/**
 * The platform's own text in the user's language. The English text is the key: t('Save')
 * looks it up in src/i18n/{locale}.json and falls back to the English when a language or
 * an entry is missing. {name} placeholders are filled from vars, after translating, so
 * t('{count} records', { count: 3 }) works whatever the word order.
 *
 * Screen labels written in the builder are translated on the server (translations table);
 * this is only for the text built into the app.
 */
type Dictionary = Record<string, string>;

const dictionaries = import.meta.glob<Dictionary>('./*.json', { import: 'default' });
const STORE_KEY = 'ui_locale';

let locale = 'en';
let dictionary: Dictionary = {};
const listeners = new Set<() => void>();

/** The base code: mn-MN → mn. */
const baseOf = (code: string) => code.toLowerCase().split(/[-_]/)[0];

function remembered(): string {
  try {
    return localStorage.getItem(STORE_KEY) || baseOf(navigator.language || 'en');
  } catch {
    return 'en';
  }
}

/** Switches the language, loading its dictionary first. Screens remount afterwards (see useLocale). */
export async function setLocale(code: string): Promise<void> {
  const next = baseOf(code);
  try {
    localStorage.setItem(STORE_KEY, next);
  } catch {
    // Private windows may refuse; the server's choice still arrives with every response.
  }
  if (next === locale) return;
  const load = dictionaries[`./${next}.json`];
  dictionary = load ? await load() : {};
  locale = next;
  document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}

/** Before the first render: the language used last time, else the browser's. */
export const bootLocale = () => setLocale(remembered());

export const currentLocale = () => locale;

/** Translates the platform's own English text, filling {placeholders} from vars. */
export function t(text: string, vars?: Record<string, string | number | null | undefined>): string {
  const found = dictionary[text] || text;
  if (!vars) return found;
  return found.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name] ?? '') : all));
}

/** A list of { label } options with the labels translated, for option lists kept in constants. */
export function tLabels<T extends { label: string }>(items: readonly T[]): T[] {
  return items.map((item) => ({ ...item, label: t(item.label) }));
}

/** The current language; a component using it re-renders when the language changes. */
export function useLocale(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => locale,
  );
}

// json_config.colors on calendar and gantt metas maps a field value to one of these names.
export const palette = {
  blue: { chip: 'bg-utility-blue-50 text-utility-blue-700 ring-utility-blue-200', dot: 'bg-utility-blue-500', track: 'bg-utility-blue-100 ring-utility-blue-300' },
  red: { chip: 'bg-utility-red-50 text-utility-red-700 ring-utility-red-200', dot: 'bg-utility-red-500', track: 'bg-utility-red-100 ring-utility-red-300' },
  purple: { chip: 'bg-utility-purple-50 text-utility-purple-700 ring-utility-purple-200', dot: 'bg-utility-purple-500', track: 'bg-utility-purple-100 ring-utility-purple-300' },
  amber: { chip: 'bg-utility-amber-50 text-utility-amber-700 ring-utility-amber-200', dot: 'bg-utility-amber-500', track: 'bg-utility-amber-100 ring-utility-amber-300' },
  green: { chip: 'bg-utility-green-50 text-utility-green-700 ring-utility-green-200', dot: 'bg-utility-green-500', track: 'bg-utility-green-100 ring-utility-green-300' },
  gray: { chip: 'bg-utility-neutral-50 text-utility-neutral-700 ring-utility-neutral-200', dot: 'bg-utility-neutral-500', track: 'bg-utility-neutral-100 ring-utility-neutral-300' },
};

export type Swatch = (typeof palette)[keyof typeof palette];

/** The swatch json_config.colors gives a value, gray when it names none. */
export function swatchFor(colors: unknown, value: unknown): Swatch {
  const name = colors && typeof colors === 'object' ? (colors as Record<string, unknown>)[String(value ?? '')] : undefined;
  return palette[name as keyof typeof palette] ?? palette.gray;
}

/** Local "YYYY-MM-DD". */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "2026-10-20 09:30:00" -> a local Date, without the browser guessing a time zone. */
export function parseLocal(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const [y, m, d, h = 0, min = 0] = value.split(/[-T :]/).map(Number);
  return y && m && d ? new Date(y, m - 1, d, h, min) : null;
}

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

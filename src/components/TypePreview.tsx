import type { CSSProperties } from 'react';

/**
 * Each meta type gets its own colour (with its icon in TypeIcon), so a datagrid card reads
 * differently from a form card at a glance.
 */
export interface TypeLook {
  ink: string;
  tint: string;
  /** What one row of a meta of this type is called. */
  rowNoun: string;
}

const looks: Record<string, TypeLook> = {
  app: { ink: '#4F46E5', tint: '#EEF2FF', rowNoun: 'menu item' },
  datagrid: { ink: '#0D9488', tint: '#F0FDFA', rowNoun: 'column' },
  form: { ink: '#7C3AED', tint: '#F5F3FF', rowNoun: 'field' },
  calendar: { ink: '#D97706', tint: '#FFFBEB', rowNoun: 'event field' },
  gantt: { ink: '#0284C7', tint: '#F0F9FF', rowNoun: 'task field' },
  tabs: { ink: '#DB2777', tint: '#FDF2F8', rowNoun: 'tab' },
  get: { ink: '#059669', tint: '#ECFDF5', rowNoun: 'parameter' },
  workflow: { ink: '#EA580C', tint: '#FFF7ED', rowNoun: 'status' },
  dashboard: { ink: '#2563EB', tint: '#EFF6FF', rowNoun: 'chart' },
  chart: { ink: '#0891B2', tint: '#ECFEFF', rowNoun: 'setting' },
  statement: { ink: '#4D7C0F', tint: '#F7FEE7', rowNoun: 'column' },
  report: { ink: '#9333EA', tint: '#FAF5FF', rowNoun: 'field' },
  excel_import: { ink: '#15803D', tint: '#F0FDF4', rowNoun: 'column' },
  page: { ink: '#C026D3', tint: '#FDF4FF', rowNoun: 'widget' },
  widget: { ink: '#7C3AED', tint: '#F5F3FF', rowNoun: 'setting' },
  widget_template: { ink: '#7C3AED', tint: '#F5F3FF', rowNoun: 'part' },
  notification: { ink: '#E11D48', tint: '#FFF1F2', rowNoun: 'recipient' },
  workspace: { ink: '#0E7490', tint: '#ECFEFF', rowNoun: 'section' },
  matrix: { ink: '#4D7C0F', tint: '#F7FEE7', rowNoun: 'row' },
  stage_query: { ink: '#B45309', tint: '#FFFBEB', rowNoun: 'parameter' },
  theme: { ink: '#C026D3', tint: '#FDF4FF', rowNoun: 'setting' },
  structure: { ink: '#475569', tint: '#F1F5F9', rowNoun: 'column' },
};

const fallback: TypeLook = { ink: '#64748B', tint: '#F1F5F9', rowNoun: 'row' };

export function typeLook(code?: string | null): TypeLook {
  return (code && looks[code]) || fallback;
}

/**
 * A surface in the type's colours: its light tint in light mode; in dark mode a dim wash of its
 * ink with a lighter ink on top, so tiles and labels don't glare.
 */
export function typeColors(code?: string | null): { className: string; style: CSSProperties } {
  const look = typeLook(code);
  return {
    className:
      'bg-(--type-tint) text-(--type-ink) dark:bg-[color-mix(in_oklab,var(--type-ink)_22%,transparent)] dark:text-[color-mix(in_oklab,var(--type-ink)_55%,white)]',
    style: { '--type-ink': look.ink, '--type-tint': look.tint } as CSSProperties,
  };
}

import { FileNames } from './FileField';
import { useMemo } from 'react';
import type { MetaParam } from '../lib/metaApi';
import { Badge, BadgeWithDot } from '@/components/base/badges/badges';
import { useLookup } from './definitions';
import { t } from '@/i18n';

type StatusColor = 'gray' | 'brand' | 'success' | 'warning' | 'error';

// Common workflow words get a colour; anything else stays gray.
const statusColors: Record<string, StatusColor> = {
  approved: 'success',
  received: 'success',
  done: 'success',
  completed: 'success',
  submitted: 'warning',
  sent: 'warning',
  pending: 'warning',
  'partially received': 'warning',
  ordered: 'brand',
  'in progress': 'brand',
  published: 'brand',
  enrolled: 'warning',
  rejected: 'error',
  cancelled: 'error',
  dropped: 'error',
  blocked: 'error',
};

/** "2026-11-03" -> "Nov 3, 2026", read as a local date so it never shifts a day. */
export function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "2026-11-03 09:30:00" -> "Nov 3, 2026, 9:30 AM"; midnight shows the date alone. */
export function formatDateTime(value: string): string {
  const [h, min] = value.slice(11, 16).split(':').map(Number);
  if (!h && !min) return formatDate(value);
  const item = new Date(2000, 0, 1, h, min).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${formatDate(value)}, ${item}`;
}

export function formatNumber(value: unknown, decimals = 2): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: decimals }) : String(value);
}

/** Shows one value the way its param describes it. */
export function Cell({ param, value, lookup }: { param: MetaParam; value: unknown; lookup?: Map<string, string> }) {
  if (value === null || value === undefined || value === '') return null;

  if (lookup) return <>{lookup.get(String(value)) ?? `#${value}`}</>;

  if (param.render_type === 'active') {
    const on = value === true || value === 1 || value === '1';
    return (
      <BadgeWithDot type="pill-color" size="sm" color={on ? 'success' : 'gray'}>
        {on ? t('Active') : t('Inactive')}
      </BadgeWithDot>
    );
  }

  if (param.render_type === 'status') {
    const text = String(value);
    return (
      <Badge type="pill-color" size="sm" color={statusColors[text.toLowerCase()] ?? 'gray'}>
        {text.charAt(0).toUpperCase() + text.slice(1)}
      </Badge>
    );
  }

  switch (param.data_type) {
    case 'singlefile':
    case 'multifile':
    case 'document':
      return <FileNames value={value} />;
    case 'boolean':
      return <>{value === true || value === 1 || value === '1' ? t('Yes') : t('No')}</>;
    case 'date':
      return <>{formatDate(String(value))}</>;
    case 'datetime':
      return <>{formatDateTime(String(value))}</>;
    case 'decimal':
      return <span className="tabular-nums">{formatNumber(value)}</span>;
    case 'integer':
      return <span className="tabular-nums">{formatNumber(value, 0)}</span>;
    default:
      return <>{String(value)}</>;
  }
}

/** A grid column's value; a lookup column shows the looked-up record's label. */
export function ColumnValue({ param, value }: { param: MetaParam; value: unknown }) {
  return param.is_select && param.ref_meta_id ? <LookupValue param={param} value={value} /> : <Cell param={param} value={value} />;
}

/** A lookup column needs its own hook, so it gets its own component. */
function LookupValue({ param, value }: { param: MetaParam; value: unknown }) {
  const options = useLookup(param);
  const map = useMemo(() => (options ? new Map(options.map((o) => [o.value, o.label])) : undefined), [options]);
  return <Cell param={param} value={value} lookup={map} />;
}

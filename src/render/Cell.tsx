import type { MetaParam } from '../lib/metaApi';
import { Badge, BadgeWithDot } from '@/components/base/badges/badges';

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
  rejected: 'error',
  cancelled: 'error',
};

/** "2026-11-03" -> "Nov 3, 2026", read as a local date so it never shifts a day. */
export function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatNumber(value: unknown, decimals = 2): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: decimals }) : String(value);
}

/** Shows one value the way its param describes it. */
export function Cell({ param, value, lookup }: { param: MetaParam; value: unknown; lookup?: Map<string, string> }) {
  if (value === null || value === undefined || value === '') return <span className="text-quaternary">—</span>;

  if (lookup) return <>{lookup.get(String(value)) ?? `#${value}`}</>;

  if (param.render_type === 'active') {
    const on = value === true || value === 1 || value === '1';
    return (
      <BadgeWithDot type="pill-color" size="sm" color={on ? 'success' : 'gray'}>
        {on ? 'Active' : 'Inactive'}
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
    case 'boolean':
      return <>{value === true || value === 1 || value === '1' ? 'Yes' : 'No'}</>;
    case 'date':
    case 'datetime':
      return <>{formatDate(String(value))}</>;
    case 'decimal':
      return <span className="tabular-nums">{formatNumber(value)}</span>;
    case 'integer':
      return <span className="tabular-nums">{formatNumber(value, 0)}</span>;
    default:
      return <>{String(value)}</>;
  }
}

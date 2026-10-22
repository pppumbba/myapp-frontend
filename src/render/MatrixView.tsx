import { useEffect, useMemo, useState } from 'react';
import { Trophy01 } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { matrixApi, type Matrix } from '../lib/matrixApi';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';
import { formatNumber } from './Cell';
import { title, type MetaDef } from './definitions';

const cellKey = (row: number, column: number) => `${row}:${column}`;

const TOTAL_LABELS = { sum: 'Total', avg: 'Average', weighted: 'Weighted score', amount: 'Total amount' } as const;

/**
 * A matrix meta: a value for each pair of records from two grids, typed straight into the
 * table, e.g. bidders' prices for each item. The best value in each row is marked
 * (json_config.best), and each column adds up (json_config.total); the best total is the
 * leader. scope keeps both grids to one record, e.g. a workspace's tender.
 */
export function MatrixView({ def, scope }: { def: MetaDef; scope?: Record<string, string> }) {
  const { can } = useAuth();
  const editable = can(def.meta.id, 'edit');
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  // Typed values not saved yet, by "rowId:columnId".
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scopeKey = JSON.stringify(scope ?? {});

  useEffect(() => {
    let live = true;
    setMatrix(null);
    setDraft({});
    matrixApi.get(def.meta.id, scope).then(
      (m) => live && setMatrix(m),
      (err) => live && setError(err instanceof ApiError ? err.message : 'The matrix could not be loaded.'),
    );
    return () => {
      live = false;
    };
  }, [def.meta.id, scopeKey]);

  const numeric = matrix?.type !== 'string';
  const value = (row: number, column: number): number | string | null => {
    const k = cellKey(row, column);
    if (k in draft) return draft[k] === '' ? null : numeric ? Number(draft[k]) : draft[k];
    const v = matrix?.cells[k];
    return v === null || v === undefined ? null : numeric ? Number(v) : v;
  };

  // Each column's total, and which column leads (lowest when lower is better, as for prices).
  const totals = useMemo(() => {
    if (!matrix?.total || !numeric) return null;
    return matrix.columns.map((c) => {
      const values = matrix.rows.map((r) => ({ v: value(r.id, c.id) as number | null, w: r.weight ?? 1 })).filter((x) => x.v !== null && Number.isFinite(x.v));
      if (!values.length) return null;
      switch (matrix.total) {
        case 'sum':
          return values.reduce((s, x) => s + x.v!, 0);
        case 'avg':
          return values.reduce((s, x) => s + x.v!, 0) / values.length;
        case 'amount':
          return values.reduce((s, x) => s + x.v! * x.w, 0);
        case 'weighted': {
          const weight = values.reduce((s, x) => s + x.w, 0);
          return weight ? values.reduce((s, x) => s + x.v! * x.w, 0) / weight : null;
        }
        default:
          return null;
      }
    });
  }, [matrix, draft]);
  const leader = useMemo(() => {
    if (!totals || !matrix?.best) return null;
    const present = totals.filter((t): t is number => t !== null);
    if (present.length < 2) return null;
    return matrix.best === 'min' ? Math.min(...present) : Math.max(...present);
  }, [totals, matrix]);

  if (error && !matrix) return <Alert>{error}</Alert>;
  if (!matrix) return <div className="h-48 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />;
  if (!matrix.rows.length || !matrix.columns.length) {
    return (
      <div className="rounded-xl border border-dashed border-primary px-5 py-8 text-center text-sm text-tertiary">
        {title(def.meta)} fills in once there are both rows and columns to pair up.
      </div>
    );
  }

  const changed = Object.keys(draft).length;
  const bestIn = (row: number) => {
    if (!matrix.best || !numeric) return null;
    const values = matrix.columns.map((c) => value(row, c.id)).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length < 2) return null;
    return matrix.best === 'min' ? Math.min(...values) : Math.max(...values);
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const cells = Object.entries(draft).map(([k, v]) => {
        const [row, column] = k.split(':').map(Number);
        return { row, column, value: v === '' ? null : numeric ? Number(v) : v };
      });
      setMatrix(await matrixApi.save(def.meta.id, scope ?? {}, cells));
      setDraft({});
    } catch (err) {
      setError(err instanceof ApiError ? (err.errors ? Object.values(err.errors)[0][0] : err.message) : 'The values could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label={title(def.meta)} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-md font-semibold text-primary">{title(def.meta)}</h3>
          {def.meta.description && <p className="text-sm text-tertiary">{def.meta.description}</p>}
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            {changed > 0 && (
              <Button size="sm" color="secondary" onPress={() => setDraft({})}>
                Discard
              </Button>
            )}
            <Button size="sm" isDisabled={!changed} isLoading={saving} showTextWhileLoading onPress={save}>
              {changed ? `Save ${changed} ${changed === 1 ? 'change' : 'changes'}` : 'Saved'}
            </Button>
          </div>
        )}
      </div>
      {error && <Alert>{error}</Alert>}

      <div className="overflow-x-auto rounded-xl bg-primary ring-1 ring-secondary">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs font-medium text-tertiary">
            <tr>
              <th scope="col" className="min-w-48 px-3 py-2 text-left font-medium">
                {/* The rows' grid, e.g. Items */}
              </th>
              {matrix.weighted && (
                <th scope="col" className="w-24 px-3 py-2 text-right font-medium">
                  {matrix.total === 'amount' ? 'Qty' : 'Weight'}
                </th>
              )}
              {matrix.columns.map((c, i) => (
                <th key={c.id} scope="col" className="min-w-36 px-3 py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    {totals && leader !== null && totals[i] === leader && <Trophy01 className="size-3.5 text-fg-warning-primary" aria-label="Leading" />}
                    {c.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {matrix.rows.map((r) => {
              const best = bestIn(r.id);
              return (
                <tr key={r.id}>
                  <th scope="row" className="px-3 py-1.5 text-left font-medium text-secondary">
                    {r.label}
                  </th>
                  {matrix.weighted && <td className="px-3 py-1.5 text-right text-tertiary tabular-nums">{formatNumber(r.weight)}</td>}
                  {matrix.columns.map((c) => {
                    const k = cellKey(r.id, c.id);
                    const v = value(r.id, c.id);
                    const isBest = best !== null && v === best;
                    const shown = k in draft ? draft[k] : v === null ? '' : String(v);
                    return (
                      <td key={c.id} className={cx('px-1.5 py-1', isBest && 'bg-success-primary')}>
                        {editable ? (
                          <input
                            aria-label={`${r.label}, ${c.label}`}
                            type={numeric ? 'number' : 'text'}
                            step="any"
                            value={shown}
                            onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                            className={cx(
                              'w-full rounded-md bg-transparent px-2 py-1.5 text-right tabular-nums text-primary outline-none ring-inset hover:ring-1 hover:ring-primary focus:ring-2 focus:ring-brand',
                              isBest && 'font-semibold text-success-primary',
                              k in draft && 'bg-warning-primary',
                            )}
                          />
                        ) : (
                          <p className={cx('px-2 py-1.5 text-right tabular-nums', isBest && 'font-semibold text-success-primary')}>{v === null ? '—' : numeric ? formatNumber(v) : v}</p>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {totals && matrix.total && (
            <tfoot className="border-t border-secondary bg-secondary">
              <tr>
                <th scope="row" className="px-3 py-2.5 text-left text-sm font-semibold text-primary">
                  {TOTAL_LABELS[matrix.total]}
                </th>
                {matrix.weighted && <td />}
                {totals.map((t, i) => (
                  <td key={matrix.columns[i].id} className={cx('px-3 py-2.5 text-right text-sm font-semibold tabular-nums', leader !== null && t === leader ? 'text-success-primary' : 'text-primary')}>
                    {t === null ? '—' : formatNumber(Math.round(t * 100) / 100)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {matrix.best && (
        <p className="text-xs text-quaternary">
          Green marks the {matrix.best === 'min' ? 'lowest' : 'highest'} value in each row{totals ? ', and the leading total' : ''}.
        </p>
      )}
    </section>
  );
}

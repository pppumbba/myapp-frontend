import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Download01, FilterLines, Printer } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { dataApi, type DataRow, type StatementResult } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';
import { Cell, formatDate, formatNumber } from './Cell';
import { title, useLookupLabels, visibleParams, type MetaDef } from './definitions';
import { drilldownOf, drillParams, useDrilldown } from './drilldown';
import { GridFilters, type Filters } from './GridFilters';
import { downloadCsv, printElement } from './print';

type Aggregate = 'count' | 'sum' | 'avg' | 'min' | 'max';
const AGGREGATES = ['count', 'sum', 'avg', 'min', 'max'];

export const aggregateOf = (p: MetaParam): Aggregate | null => {
  const a = p.json_config?.aggregate;
  return typeof a === 'string' && AGGREGATES.includes(a) ? (a as Aggregate) : null;
};

/** A column's total over some rows, the way the backend works out the grand total. */
function aggregate(rows: DataRow[], field: string, how: Aggregate): number | string | null {
  const values = rows.map((r) => r[field]).filter((v) => v !== null && v !== undefined && v !== '');
  if (how === 'count') return values.length;
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return null;
  if (how === 'sum') return numbers.reduce((a, b) => a + b, 0);
  if (how === 'avg') return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  return how === 'min' ? Math.min(...numbers) : Math.max(...numbers);
}

interface Group {
  /** Path of group values, unique across the statement. */
  key: string;
  param: MetaParam;
  value: unknown;
  rows: DataRow[];
  children: Group[];
}

/** Rows (already ordered by the group columns) split into nested groups, one level per column. */
function groupRows(rows: DataRow[], levels: MetaParam[], prefix = ''): Group[] {
  if (!levels.length) return [];
  const [level, ...rest] = levels;
  const groups: Group[] = [];
  for (const row of rows) {
    const value = row[level.field_path];
    const last = groups[groups.length - 1];
    if (last && String(last.value ?? '') === String(value ?? '')) last.rows.push(row);
    else groups.push({ key: `${prefix}/${String(value ?? '')}`, param: level, value, rows: [row], children: [] });
  }
  for (const g of groups) g.children = groupRows(g.rows, rest, g.key);
  return groups;
}

const isNumeric = (p: MetaParam) => (p.data_type === 'integer' || p.data_type === 'decimal') && !p.is_select;

/**
 * A statement meta: its records grouped by json_config.group_by (outer column first), each
 * group with subtotals for the columns whose json_config.aggregate says how, and a grand
 * total over every matching record. json_config.show_details: false shows one line per
 * group instead of the records. Filters are the params marked is_criteria; it prints and
 * downloads as CSV. A drilldown on the statement opens from each record; one on a column
 * opens from that column's values.
 *
 * fixed: filter values set from outside, e.g. by a drilldown.
 */
export function StatementView({ def, fixed, scope, initialFilters }: { def: MetaDef; fixed?: Filters; scope?: Filters; initialFilters?: Filters }) {
  const { meta, params } = def;
  const config = meta.json_config ?? {};
  const showDetails = config.show_details !== false;
  const filterParams = useMemo(() => params.filter((p) => p.is_criteria && !(fixed && p.field_path in fixed) && !(scope && p.field_path in scope)), [params, fixed, scope]);
  const [filters, setFilters] = useState<Filters>({});
  const [showFilters, setShowFilters] = useState(() => filterParams.some((p) => p.is_mandatory_criteria));
  const [result, setResult] = useState<StatementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const paper = useRef<HTMLDivElement>(null);
  const drill = useDrilldown();
  const rowDrill = drill ? drilldownOf(config) : null;

  const visible = useMemo(() => visibleParams(params), [params]);
  const groupFields = result?.group_by ?? (Array.isArray(config.group_by) ? (config.group_by as string[]) : []);
  const levels = groupFields.map((f) => params.find((p) => p.field_path === f)).filter((p): p is MetaParam => !!p);
  const columns = visible.filter((p) => !groupFields.includes(p.field_path));
  const labels = useLookupLabels(visible);

  const fixedKey = JSON.stringify([fixed ?? {}, scope ?? {}]);
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    let live = true;
    setError(null);
    dataApi.statement(meta.id, { filter: { ...filters, ...fixed }, scope }).then(
      (r) => live && setResult(r),
      (err) => live && setError(err instanceof ApiError ? err.message : 'This statement could not be loaded.'),
    );
    return () => {
      live = false;
    };
  }, [meta.id, filterKey, fixedKey]);

  const groups = useMemo(() => (result ? groupRows(result.rows, levels) : []), [result, levels.map((l) => l.field_path).join()]);
  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** A value as text, for headings and the CSV. */
  const text = (p: MetaParam, value: unknown): string => {
    if (value === null || value === undefined || value === '') return '';
    const label = labels.get(p.field_path)?.get(String(value));
    if (label) return label;
    if (p.data_type === 'date') return formatDate(String(value));
    return String(value);
  };

  const shownFilters = Object.entries({ ...filters, ...fixed })
    .filter(([, v]) => v !== '')
    .map(([k, v]) => {
      const p = params.find((x) => x.field_path === k);
      return `${p?.label_name || k}: ${p ? text(p, v) : v}`;
    });

  /** The rows in group order, without subtotals, as .xlsx; the CSV carries the grand total. */
  async function exportExcel() {
    setExporting(true);
    try {
      await dataApi.exportExcel(meta.id, meta.code, { filter: { ...filters, ...fixed } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The statement could not be exported.');
    } finally {
      setExporting(false);
    }
  }

  function exportCsv() {
    if (!result) return;
    const head = [...levels, ...columns];
    const lines: (string | number | null)[][] = [head.map((p) => p.label_name || p.param_name)];
    for (const row of result.rows) lines.push(head.map((p) => (isNumeric(p) ? (row[p.field_path] as number | null) : text(p, row[p.field_path]))));
    lines.push(head.map((p, i) => (i === 0 ? 'Grand total' : aggregateOf(p) ? (result.totals[p.field_path] as number | null) : '')));
    downloadCsv(meta.code, lines);
  }

  const totalCell = (p: MetaParam, value: number | string | null | undefined) => {
    if (value === null || value === undefined) return null;
    return aggregateOf(p) === 'count' ? <span className="tabular-nums">{formatNumber(value, 0)}</span> : <Cell param={p} value={value} />;
  };

  const valueCell = (p: MetaParam, row: DataRow, i: number) => {
    const colDrill = drill ? drilldownOf(p.json_config) : null;
    const content = <Cell param={p} value={row[p.field_path]} lookup={labels.get(p.field_path)} />;
    const target = colDrill ?? (i === 0 ? rowDrill : null);
    if (!target || !drill) return content;
    return (
      <button
        type="button"
        onClick={() => drill({ metaId: target.meta_id, params: drillParams(target, row), label: text(p, row[p.field_path]) || title(meta) })}
        className="rounded text-left font-medium text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
      >
        {content}
      </button>
    );
  };

  const indent = (depth: number) => ({ paddingLeft: `${0.75 + depth * 1.25}rem` });

  function renderGroups(list: Group[], depth: number): ReactNode {
    return list.map((g) => {
      const open = !collapsed.has(g.key);
      const leaf = !g.children.length;
      const summaryOnly = leaf && !showDetails;
      return (
        <Fragment key={g.key}>
          <tr className={cx('border-t border-secondary', depth === 0 ? 'bg-secondary' : 'bg-secondary_alt')}>
            <th scope="rowgroup" colSpan={summaryOnly ? 1 : columns.length || 1} className="py-2 pr-3 text-left" style={indent(depth)}>
              {summaryOnly ? (
                <span className="font-semibold text-primary">{text(g.param, g.value) || '(empty)'}</span>
              ) : (
                <button type="button" onClick={() => toggle(g.key)} aria-expanded={open} className="flex items-center gap-1.5 rounded text-left outline-focus-ring focus-visible:outline-2">
                  {open ? <ChevronDown className="no-print size-4 text-fg-quaternary" aria-hidden="true" /> : <ChevronRight className="no-print size-4 text-fg-quaternary" aria-hidden="true" />}
                  <span className="text-xs font-medium text-tertiary">{g.param.label_name || g.param.param_name}:</span>
                  <span className="font-semibold text-primary">{text(g.param, g.value) || '(empty)'}</span>
                  <span className="text-xs text-quaternary">({g.rows.length})</span>
                </button>
              )}
            </th>
            {summaryOnly &&
              columns.slice(1).map((p) => (
                <td key={p.field_path} className={cx('py-2 pr-3 font-semibold text-primary', isNumeric(p) && 'text-right')}>
                  {aggregateOf(p) && totalCell(p, aggregate(g.rows, p.field_path, aggregateOf(p)!))}
                </td>
              ))}
          </tr>
          {open && !summaryOnly && (leaf ? g.rows.map((row, r) => (
            <tr key={`${g.key}#${r}`} className="border-t border-secondary">
              {columns.map((p, i) => (
                <td key={p.field_path} className={cx('py-2 pr-3 text-tertiary', i === 0 && 'text-primary', isNumeric(p) && 'text-right')} style={i === 0 ? indent(depth + 1) : undefined}>
                  {valueCell(p, row, i)}
                </td>
              ))}
            </tr>
          )) : renderGroups(g.children, depth + 1))}
          {open && !summaryOnly && columns.some(aggregateOf) && (
            <tr className="border-t border-secondary">
              {columns.map((p, i) => (
                <td key={p.field_path} className={cx('py-2 pr-3 font-semibold text-primary', isNumeric(p) && 'text-right')} style={i === 0 ? indent(depth + 1) : undefined}>
                  {i === 0 && <span className="mr-2 text-xs font-medium text-tertiary">Subtotal · {text(g.param, g.value) || '(empty)'}</span>}
                  {aggregateOf(p) && totalCell(p, aggregate(g.rows, p.field_path, aggregateOf(p)!))}
                </td>
              ))}
            </tr>
          )}
        </Fragment>
      );
    });
  }

  const missing = result?.missing_filters ?? [];

  return (
    <div ref={paper} className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-primary">{title(meta)}</h2>
          {meta.description && <p className="mt-0.5 text-sm text-tertiary">{meta.description}</p>}
          {shownFilters.length > 0 && <p className="mt-1 text-sm text-tertiary">{shownFilters.join(' · ')}</p>}
          <p className="mt-1 hidden text-xs text-quaternary print:block">Printed {new Date().toLocaleString()}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {filterParams.length > 0 && (
            <Button size="sm" color="secondary" iconLeading={FilterLines} onPress={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
              Filters{Object.keys(filters).length ? ` (${Object.keys(filters).length})` : ''}
            </Button>
          )}
          <Button size="sm" color="secondary" iconLeading={Download01} isDisabled={!result?.rows.length} isLoading={exporting} onPress={exportExcel}>
            Excel
          </Button>
          <Button size="sm" color="secondary" iconLeading={Download01} isDisabled={!result?.rows.length} onPress={exportCsv}>
            CSV
          </Button>
          <Button size="sm" color="secondary" iconLeading={Printer} isDisabled={!result?.rows.length} onPress={() => printElement(paper.current, title(meta))}>
            Print
          </Button>
        </div>
      </div>

      {showFilters && filterParams.length > 0 && (
        <div className="no-print">
          <GridFilters params={filterParams} applied={filters} onApply={setFilters} />
        </div>
      )}

      <div className="px-4 py-4 sm:px-5">
        {error ? (
          <Alert>{error}</Alert>
        ) : !result ? (
          <div className="h-48 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
        ) : missing.length ? (
          <p className="py-10 text-center text-sm text-tertiary">{`Fill in ${missing.join(', ')} to see this statement.`}</p>
        ) : !result.rows.length ? (
          <p className="py-10 text-center text-sm text-tertiary">Nothing matches these filters.</p>
        ) : (
          <>
            {result.truncated && (
              <p role="status" className="mb-3 rounded-lg bg-warning-primary px-3 py-2 text-sm text-warning-primary">
                Only the first {result.rows.length.toLocaleString()} records are listed, so group subtotals are incomplete. The grand total covers them all. Narrow the filters to see everything.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-medium text-tertiary">
                  <tr>
                    {columns.map((p, i) => (
                      <th key={p.field_path} scope="col" className={cx('pb-2 pr-3 font-medium', isNumeric(p) && 'text-right')} style={i === 0 ? indent(levels.length && showDetails ? 1 : 0) : undefined}>
                        {p.label_name || p.param_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {levels.length
                    ? renderGroups(groups, 0)
                    : result.rows.map((row, r) => (
                        <tr key={r} className="border-t border-secondary">
                          {columns.map((p, i) => (
                            <td key={p.field_path} className={cx('py-2 pr-3 text-tertiary', i === 0 && 'text-primary', isNumeric(p) && 'text-right')}>
                              {valueCell(p, row, i)}
                            </td>
                          ))}
                        </tr>
                      ))}
                </tbody>
                {columns.some(aggregateOf) && (
                  <tfoot>
                    <tr className="border-t-2 border-primary">
                      {columns.map((p, i) => (
                        <td key={p.field_path} className={cx('pt-3 pr-3 font-semibold text-primary', isNumeric(p) && 'text-right')}>
                          {i === 0 && <span className="mr-2">Grand total</span>}
                          {aggregateOf(p) && totalCell(p, result.totals[p.field_path])}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

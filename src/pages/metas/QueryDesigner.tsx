import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Database01, Plus, SearchLg, Trash01, XClose } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import type { Meta } from '../../lib/metaApi';
import {
  queryApi,
  type Aggregate,
  type Bind,
  type Condition,
  type ConditionGroup,
  type InlineOperand,
  type InlineSubquery,
  type JoinCondition,
  type JoinType,
  type Operand,
  type Operator,
  type QueryColumn,
  type QueryDesignDef,
  type QueryLevel,
  type QueryRun,
  type QueryTable,
  type SchemaColumn,
  type SchemaTable,
  type StoredQuery,
  type SubqueryOperand,
  type TableInfo,
} from '../../lib/queryApi';
import { Alert, IconAction } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Toggle } from '@/components/base/toggle/toggle';
import { clearRenderCache } from '../../render/definitions';
import { ResultTable } from '../../render/QueryView';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

const BOX_W = 216;
const HEAD_H = 36;
const ROW_H = 24;
const PAD = 4;

const JOINS: { value: JoinType; label: string }[] = [
  { value: 'inner', label: 'Inner join' },
  { value: 'left', label: 'Left join' },
  { value: 'right', label: 'Right join' },
  { value: 'cross', label: 'Cross join' },
];
const JOIN_SIGN: Record<JoinType, string> = { inner: '⋈', left: '⟕', right: '⟖', cross: '×' };
const AGGREGATES: { value: Aggregate; label: string }[] = [
  { value: 'group', label: 'Group by' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
  { value: 'count_distinct', label: 'Count distinct' },
];
const OPERATORS: { value: Operator; label: string }[] = [
  { value: '=', label: '=' },
  { value: '<>', label: '≠' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: 'contains', label: 'contains' },
  { value: 'starts', label: 'starts with' },
  { value: 'ends', label: 'ends with' },
  { value: 'like', label: 'like' },
  { value: 'not_like', label: 'not like' },
  { value: 'in', label: 'in list' },
  { value: 'not_in', label: 'not in list' },
  { value: 'between', label: 'between' },
  { value: 'not_between', label: 'not between' },
  { value: 'null', label: 'is empty' },
  { value: 'not_null', label: 'is not empty' },
  { value: 'exists', label: 'rows exist in' },
  { value: 'not_exists', label: 'no rows in' },
];
const DATA_TYPES = ['string', 'text', 'integer', 'decimal', 'boolean', 'date', 'datetime'];

const field = 'rounded-md bg-primary px-2 py-1 text-sm text-primary shadow-xs ring-1 ring-primary ring-inset outline-none focus:ring-2 focus:ring-brand';
const blankGroup = (): ConditionGroup => ({ logic: 'and', items: [] });
const blankLevel = (): QueryLevel => ({ tables: [], columns: [], where: blankGroup(), having: blankGroup(), unions: [], distinct: false, limit: null, offset: null });
const blank = (): QueryDesignDef => ({ ...blankLevel(), subqueries: [] });

type Info = { columns: SchemaColumn[]; fks: TableInfo['foreign_keys'] };
type Ref = { table: string; column: string };
type Point = { x: number; y: number };

const sourceKey = (entry: Pick<QueryTable, 'source' | 'name' | 'meta_id'>) => `${entry.source}:${entry.source === 'query' ? entry.meta_id : entry.name}`;
const isColumn = (o: Operand | Bind | null | undefined): o is Ref => !!o && 'table' in o;
const isSubquery = (o: Operand | null | undefined): o is SubqueryOperand => !!o && 'subquery' in o;
const isInline = (o: Operand | null | undefined): o is InlineOperand => !!o && 'inline' in o;
/** A stored query or one of this query's own sub-queries. */
const isQueryRef = (o: Operand | null | undefined): o is SubqueryOperand | InlineOperand => isSubquery(o) || isInline(o);
const operandText = (o: Operand) => (isColumn(o) ? `${o.table}.${o.column}` : isQueryRef(o) ? '' : o.custom);
const levels = (d: QueryDesignDef): QueryLevel[] => [d, ...d.subqueries.map((s) => s.design)];

/** Whether anything in a design (or part of one) uses a sub-query: as an operand, a table or a union. */
function usesInline(node: unknown, key: string): boolean {
  if (!node || typeof node !== 'object') return false;
  const o = node as Record<string, unknown>;
  if (o.inline === key || (o.source === 'inline' && o.name === key)) return true;
  return Object.values(o).some((v) => usesInline(v, key));
}

/** A design with a sub-query's key changed wherever it is used. */
function renameInline<T>(node: T, from: string, to: string): T {
  if (Array.isArray(node)) return node.map((v) => renameInline(v, from, to)) as T;
  if (!node || typeof node !== 'object') return node;
  const o = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, renameInline(v, from, to)])) as Record<string, unknown>;
  if (o.inline === from) o.inline = to;
  if (o.source === 'inline' && o.name === from) o.name = to;
  return o as T;
}
/** Whether an operand uses a table: its column, or a stored query filled from one. */
const usesTable = (o: Operand | Bind | null | undefined, key: string): boolean =>
  isColumn(o) ? o.table === key : !!o && 'subquery' in o && Object.values(o.bind ?? {}).some((b) => usesTable(b, key));
/** An operand with a table alias swapped, inside stored queries' bind too. */
function swapTable<T extends Operand | Bind | null | undefined>(o: T, from: string, to: string): T {
  if (isColumn(o)) return (o.table === from ? { ...o, table: to } : o) as T;
  if (o && 'subquery' in o) return { ...o, bind: Object.fromEntries(Object.entries(o.bind ?? {}).map(([k, b]) => [k, swapTable(b, from, to)])) } as T;
  return o;
}

/** The stored queries a design can read, and their columns and parameters as they load. */
type Stored = { list: StoredQuery[]; info: Record<number, Info & { params: string[] }>; need: (id: number) => void };
const StoredQueries = createContext<Stored>({ list: [], info: {}, need: () => undefined });

/** This query's own sub-queries, with the columns they select, and the one being drawn (it can't use itself). */
type Inline = { key: string; label: string | null; columns: SchemaColumn[] };
const Inlines = createContext<{ list: Inline[]; current: string | null }>({ list: [], current: null });

/** A short alias from a table's name: proc_purchase_orders → ppo, made unique. */
function aliasFor(name: string, taken: string[]) {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let base = words.map((w) => w[0]).join('').slice(0, 4) || 't';
  if (/^\d/.test(base)) base = `t${base}`;
  let alias = base;
  for (let n = 2; taken.includes(alias); n++) alias = `${base}${n}`;
  return alias;
}

/** Drops the conditions that use a table. */
function withoutTable(group: ConditionGroup, key: string): ConditionGroup {
  return {
    ...group,
    items: group.items
      .map((item) => (item.type === 'group' ? { ...withoutTable(item, key), type: 'group' as const } : item))
      .filter((item) => (item.type === 'group' ? item.items.length > 0 : !usesTable(item.left, key) && !usesTable(item.right, key))),
  };
}

/**
 * The query builder. Drag tables, views and other queries onto the canvas; they join on
 * their foreign keys, or drag a column onto another table's column to join them. Tick
 * columns to select them; below, set their names, totals (group by, sum, count…), order,
 * the filters (WHERE) and filters on totals (HAVING), DISTINCT, limits and unions. Saving
 * keeps the design as the query meta's params and its SQL as the query_string.
 */
export function QueryDesigner({ meta, tall = false }: { meta: Meta; tall?: boolean }) {
  const navigate = useNavigate();
  const [design, setDesign] = useState<QueryDesignDef>(blank);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(blank()));
  const [savedSql, setSavedSql] = useState(meta.query_string ?? '');
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<SchemaTable[]>([]);
  const [infos, setInfos] = useState<Record<string, Info>>({});
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'columns' | 'where' | 'having' | 'options' | 'sql' | 'results'>('columns');
  const [run, setRun] = useState<QueryRun | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'run' | 'grid' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = JSON.stringify(design) !== savedJson;
  /** The SELECT being drawn: null for the query itself, else one of its sub-queries' keys. */
  const [level, setLevel] = useState<string | null>(null);
  const sub = level === null ? undefined : design.subqueries.find((s) => s.key === level);
  const cur: QueryLevel = sub?.design ?? design;
  const inlineList = useMemo<Inline[]>(
    () => design.subqueries.map((s) => ({ key: s.key, label: s.label, columns: s.design.columns.filter((c) => c.show).map((c) => ({ name: c.alias, type: c.data_type, data_type: c.data_type, nullable: true })) })),
    [design.subqueries],
  );
  const inlines = useMemo(() => ({ list: inlineList, current: sub?.key ?? null }), [inlineList, sub?.key]);
  const allKeys = levels(design).flatMap((l) => l.tables.map((entry) => entry.key));

  // Every meta with a stored SELECT can be read: as a table, a column, a list or EXISTS.
  const [storedList, setStoredList] = useState<StoredQuery[]>([]);
  const [storedInfo, setStoredInfo] = useState<Stored['info']>({});
  const asked = useRef(new Set<number>());
  const queries = useMemo(() => storedList.filter((q) => q.id !== meta.id), [storedList, meta.id]);
  const need = useCallback((id: number) => {
    if (asked.current.has(id)) return;
    asked.current.add(id);
    queryApi.source(id).then(
      (s) => setStoredInfo((m) => ({ ...m, [id]: { columns: s.columns, fks: [], params: s.params } })),
      () => asked.current.delete(id),
    );
  }, []);
  const stored = useMemo<Stored>(() => ({ list: queries, info: storedInfo, need }), [queries, storedInfo, need]);

  const loadInfo = useCallback(async (entry: Pick<QueryTable, 'source' | 'name' | 'meta_id'>): Promise<Info> => {
    if (entry.source === 'inline') return { columns: [], fks: [] };
    if (entry.source === 'query') {
      const s = await queryApi.source(entry.meta_id!);
      const info = { columns: s.columns, fks: [], params: s.params };
      asked.current.add(s.id);
      setStoredInfo((m) => ({ ...m, [s.id]: info }));
      return info;
    }
    const info = await queryApi.table(entry.name!);
    return { columns: info.columns, fks: info.foreign_keys };
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [tables, saved, sources] = await Promise.all([queryApi.tables(), queryApi.get(meta.id), queryApi.sources()]);
        if (live) setStoredList(sources);
        const loaded: Record<string, Info> = {};
        await Promise.all(levels(saved.design).flatMap((l) => l.tables).filter((entry) => entry.source !== 'inline').map(async (entry) => {
          loaded[sourceKey(entry)] = await loadInfo(entry).catch(() => ({ columns: [], fks: [] }));
        }));
        if (!live) return;
        setSchema(tables);
        setInfos(loaded);
        setDesign(saved.design);
        setSavedJson(JSON.stringify(saved.design));
        setSavedSql(saved.sql);
      } catch (err) {
        if (live) setError(err instanceof ApiError ? err.message : t('The query builder could not be loaded.'));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [meta.id, loadInfo]);

  const columnsOf = useCallback(
    (entry: QueryTable) => (entry.source === 'inline' ? (inlineList.find((s) => s.key === entry.name)?.columns ?? []) : (infos[sourceKey(entry)]?.columns ?? [])),
    [infos, inlineList],
  );
  // A sub-query also sees the query's own tables: using their columns runs it once per row.
  const operands = useMemo(
    () => [...cur.tables, ...(sub ? design.tables : [])].flatMap((entry) => columnsOf(entry).map((c) => ({ table: entry.key, column: c.name, data_type: c.data_type }))),
    [cur.tables, sub, design.tables, columnsOf],
  );

  /** Changes the SELECT being drawn. */
  const update = (change: (d: QueryLevel) => QueryLevel) =>
    setDesign((d) => {
      const at = level === null ? undefined : d.subqueries.find((s) => s.key === level);
      if (!at) return { ...d, ...change(d) };
      return { ...d, subqueries: d.subqueries.map((s) => (s === at ? { ...s, design: change(s.design) } : s)) };
    });

  async function addTable(source: 'table' | 'query' | 'inline', name: string | null, metaId: number | null, at?: Point) {
    setError(null);
    try {
      const probe = { source, name, meta_id: metaId };
      const key = sourceKey(probe);
      const info = source === 'inline' ? { columns: [], fks: [] } : (infos[key] ?? (await loadInfo(probe)));
      if (source !== 'inline') setInfos((m) => ({ ...m, [key]: info }));
      update((d) => {
        const base = source === 'query' ? (queries.find((q) => q.id === metaId)?.code.replace(/_query$/, '') ?? 'q') : name!;
        const alias = aliasFor(base, [...allKeys, ...d.tables.map((entry) => entry.key)]);
        const spot = at ?? { x: 24 + (d.tables.length % 4) * (BOX_W + 56), y: 24 + Math.floor(d.tables.length / 4) * 280 };
        // Joins itself on a foreign key either way between it and a table already there.
        const on: JoinCondition[] = [];
        for (const other of d.tables) {
          const otherInfo = infos[sourceKey(other)];
          if (source === 'table') {
            for (const fk of info.fks) {
              if (other.source === 'table' && fk.foreign_table === other.name && fk.columns.length === 1) {
                on.push({ left: { table: other.key, column: fk.foreign_columns[0] }, op: '=', right: { table: alias, column: fk.columns[0] } });
              }
            }
          }
          for (const fk of otherInfo?.fks ?? []) {
            if (source === 'table' && fk.foreign_table === name && fk.columns.length === 1) {
              on.push({ left: { table: other.key, column: fk.columns[0] }, op: '=', right: { table: alias, column: fk.foreign_columns[0] } });
            }
          }
          if (on.length) break;
        }
        const label = source === 'query' ? (queries.find((q) => q.id === metaId)?.name ?? null) : source === 'inline' ? (inlineList.find((q) => q.key === name)?.label ?? name) : null;
        const table: QueryTable = { key: alias, source, name, meta_id: metaId, label, x: Math.max(0, Math.round(spot.x)), y: Math.max(0, Math.round(spot.y)), join: d.tables.length ? { type: 'inner', on } : null };
        return { ...d, tables: [...d.tables, table] };
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('That table could not be added.'));
    }
  }

  function removeTable(key: string) {
    update((d) => {
      const tables = d.tables
        .filter((entry) => entry.key !== key)
        .map((entry, i) => ({ ...entry, join: i === 0 ? null : entry.join ? { ...entry.join, on: entry.join.on.filter((c) => c.left.table !== key && c.right.table !== key) } : { type: 'inner' as const, on: [] } }));
      return {
        ...d,
        tables,
        columns: d.columns.filter((c) => !usesTable(c.expr, key)),
        // A stored query in FROM never takes another table's column, so nothing else to drop.
        where: withoutTable(d.where, key),
        having: withoutTable(d.having, key),
      };
    });
  }

  function renameTable(key: string) {
    const next = window.prompt(t('Alias for this table (letters, digits and _):'), key)?.trim();
    if (!next || next === key) return;
    if (!/^[A-Za-z_]\w*$/.test(next) || allKeys.includes(next)) {
      setError(t('"{name}" can\'t be used: aliases are letters, digits and _, and each is used once.', { name: next }));
      return;
    }
    const swap = <T extends Operand | null | undefined>(o: T): T => swapTable(o, key, next);
    const swapRef = (r: Ref): Ref => (r.table === key ? { ...r, table: next } : r);
    const swapGroup = (g: ConditionGroup): ConditionGroup => ({
      ...g,
      items: g.items.map((item) => (item.type === 'group' ? { ...swapGroup(item), type: 'group' as const } : { ...item, left: swap(item.left)!, right: swap(item.right) ?? null })),
    });
    const swapLevel = <L extends QueryLevel>(d: L): L => ({
      ...d,
      tables: d.tables.map((entry) => ({ ...entry, key: entry.key === key ? next : entry.key, join: entry.join && { ...entry.join, on: entry.join.on.map((c) => ({ ...c, left: swapRef(c.left), right: swapRef(c.right) })) } })),
      columns: d.columns.map((c) => ({ ...c, expr: swap(c.expr)! })),
      where: swapGroup(d.where),
      having: swapGroup(d.having),
    });
    setDesign((d) => ({ ...swapLevel(d), subqueries: d.subqueries.map((s) => ({ ...s, design: swapLevel(s.design) })) }));
  }

  /** Joins two columns: the condition belongs to whichever table comes later. */
  function connect(a: Ref, b: Ref) {
    if (a.table === b.table) return;
    update((d) => {
      const ia = d.tables.findIndex((entry) => entry.key === a.table);
      const ib = d.tables.findIndex((entry) => entry.key === b.table);
      const [left, right, owner] = ia < ib ? [a, b, ib] : [b, a, ia];
      return {
        ...d,
        tables: d.tables.map((entry, i) =>
          i === owner ? { ...entry, join: { type: entry.join?.type === 'cross' ? 'inner' : (entry.join?.type ?? 'inner'), on: [...(entry.join?.on ?? []), { left, op: '=', right }] } } : entry,
        ),
      };
    });
  }

  function toggleColumn(table: QueryTable, column: SchemaColumn) {
    update((d) => {
      const existing = d.columns.filter((c) => isColumn(c.expr) && c.expr.table === table.key && c.expr.column === column.name);
      if (existing.length) return { ...d, columns: d.columns.filter((c) => !existing.includes(c)) };
      const taken = d.columns.map((c) => c.alias);
      let alias = taken.includes(column.name) ? `${table.key}_${column.name}` : column.name;
      for (let n = 2; taken.includes(alias); n++) alias = `${table.key}_${column.name}_${n}`;
      return { ...d, columns: [...d.columns, { expr: { table: table.key, column: column.name }, alias, label: null, data_type: column.data_type, show: true, aggregate: null, sort: null, sort_order: null }] };
    });
  }

  function addSubquery() {
    let n = design.subqueries.length + 1;
    while (design.subqueries.some((s) => s.key === `sub${n}`)) n++;
    const key = `sub${n}`;
    setDesign((d) => ({ ...d, subqueries: [...d.subqueries, { key, label: null, design: blankLevel() }] }));
    setLevel(key);
    setTab('columns');
  }

  function renameSubquery(from: string, to: string, label: string | null) {
    if (to !== from && (!/^[A-Za-z_]\w*$/.test(to) || design.subqueries.some((s) => s.key === to))) {
      setError(t('"{name}" can\'t name a sub-query: use letters, digits and _, and a name not used yet.', { name: to }));
      return;
    }
    setError(null);
    setDesign((d) => {
      const next = to === from ? d : renameInline(d, from, to);
      return { ...next, subqueries: next.subqueries.map((s) => (s.key === to ? { ...s, label } : s)) };
    });
    setLevel(to);
  }

  function removeSubquery(key: string) {
    const rest = { ...design, subqueries: design.subqueries.filter((s) => s.key !== key) };
    if (usesInline(rest, key)) {
      setError(t('"{name}" is still used. Take it out of the columns, filters, tables and unions that use it first.', { name: key }));
      return;
    }
    setError(null);
    setDesign(rest);
    setLevel(null);
  }

  async function doRun() {
    setBusy('run');
    setError(null);
    try {
      setRun(await queryApi.preview(meta.id, design, paramValues));
    } catch (err) {
      setRun(null);
      setError(err instanceof ApiError ? err.message : t('The query could not be run.'));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      const saved = await queryApi.save(meta.id, design);
      setDesign(saved.design);
      setSavedJson(JSON.stringify(saved.design));
      setSavedSql(saved.sql);
      clearRenderCache();
      setNotice(t('Saved. Grids that read this query show it now.'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The query could not be saved.'));
    } finally {
      setBusy(null);
    }
  }

  async function makeGrid() {
    setBusy('grid');
    setError(null);
    try {
      const grid = await queryApi.makeGrid(meta.id);
      navigate(`/metas/${grid.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The grid could not be made.'));
      setBusy(null);
    }
  }

  const shownTables = schema.filter((entry) => entry.name.toLowerCase().includes(search.trim().toLowerCase()));
  const shownQueries = queries.filter((q) => `${q.name} ${q.code}`.toLowerCase().includes(search.trim().toLowerCase()));
  const params = run?.params ?? [];

  return (
    <StoredQueries.Provider value={stored}>
    <Inlines.Provider value={inlines}>
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={t('Query builder')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-primary">{t('Query builder')}</h2>
          <p className="mt-0.5 text-sm text-tertiary">
            {t("Drag tables, views or other queries onto the canvas. They join on their foreign keys; drag a column onto another table's column to join them yourself. Tick the columns to select.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" color="secondary" isLoading={busy === 'run'} showTextWhileLoading onPress={() => { setTab('results'); void doRun(); }} isDisabled={!design.tables.length}>
            {t('Run')}
          </Button>
          <Button size="sm" color="secondary" isLoading={busy === 'grid'} showTextWhileLoading onPress={makeGrid} isDisabled={dirty || !savedSql}>
            {t('Make a grid')}
          </Button>
          <Button size="sm" isLoading={busy === 'save'} showTextWhileLoading onPress={save} isDisabled={!dirty}>
            {dirty ? t('Save') : t('Saved')}
          </Button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5 sm:px-5">
        {error && <Alert>{error}</Alert>}
        {notice && !error && <p role="status" className="text-sm font-medium text-success-primary">{notice}</p>}

        {!loading && (
          <LevelBar
            subqueries={design.subqueries}
            current={sub ?? null}
            onPick={(key) => {
              setLevel(key);
              setTab('columns');
            }}
            onAdd={addSubquery}
            onRename={renameSubquery}
            onRemove={removeSubquery}
          />
        )}

        {loading ? (
          <div className="h-96 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <aside className={cx('flex w-full shrink-0 flex-col rounded-lg ring-1 ring-secondary lg:w-56', tall ? 'max-h-[calc(100vh-20rem)] min-h-[480px]' : 'max-h-[480px]')}>
              <label className="flex items-center gap-2 border-b border-secondary px-2.5 py-2">
                <SearchLg className="size-4 text-fg-quaternary" aria-hidden="true" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Find a table')} aria-label={t('Find a table')} className="w-full bg-transparent text-sm text-primary outline-none placeholder:text-placeholder" />
              </label>
              <div className="min-h-0 flex-1 overflow-auto py-1">
                {inlineList.some((q) => q.key !== level) && <p className="px-2.5 pt-2 pb-1 text-xs font-semibold text-tertiary uppercase">{t('In this query')}</p>}
                {inlineList.filter((q) => q.key !== level).map((q) => (
                  <SourceItem key={`i${q.key}`} label={q.label ?? q.key} kind="sub-query" payload={{ source: 'inline', name: q.key }} onAdd={() => addTable('inline', q.key, null)} />
                ))}
                {shownQueries.length > 0 && <p className="px-2.5 pt-2 pb-1 text-xs font-semibold text-tertiary uppercase">{t('Stored queries')}</p>}
                {shownQueries.map((q) => (
                  <SourceItem key={`q${q.id}`} label={q.name} kind={q.type === 'query' || !q.type ? 'query' : q.type} payload={{ source: 'query', meta_id: q.id }} onAdd={() => addTable('query', null, q.id)} />
                ))}
                <p className="px-2.5 pt-2 pb-1 text-xs font-semibold text-tertiary uppercase">{t('Tables and views')}</p>
                {shownTables.map((entry) => (
                  <SourceItem key={entry.name} label={entry.name} kind={entry.type} payload={{ source: 'table', name: entry.name }} onAdd={() => addTable('table', entry.name, null)} />
                ))}
                {shownTables.length === 0 && <p className="px-2.5 py-2 text-sm text-tertiary">{t('No table matches.')}</p>}
              </div>
            </aside>

            <Canvas
              key={sub?.key ?? ''}
              tall={tall}
              design={cur}
              columnsOf={columnsOf}
              onDrop={(payload, at) => addTable(payload.source, payload.name ?? null, payload.meta_id ?? null, at)}
              onMove={(key, at) => update((d) => ({ ...d, tables: d.tables.map((entry) => (entry.key === key ? { ...entry, x: at.x, y: at.y } : entry)) }))}
              onRemove={removeTable}
              onRename={renameTable}
              onJoinType={(key, type) => update((d) => ({ ...d, tables: d.tables.map((entry) => (entry.key === key ? { ...entry, join: { type, on: type === 'cross' ? [] : (entry.join?.on ?? []) } } : entry)) }))}
              onJoinChange={(key, index, change) =>
                update((d) => ({
                  ...d,
                  tables: d.tables.map((entry) =>
                    entry.key === key && entry.join ? { ...entry, join: { ...entry.join, on: change ? entry.join.on.map((c, i) => (i === index ? { ...c, ...change } : c)) : entry.join.on.filter((_, i) => i !== index) } } : entry,
                  ),
                }))
              }
              onConnect={connect}
              onToggle={toggleColumn}
              onBind={(key, bind) => update((d) => ({ ...d, tables: d.tables.map((entry) => (entry.key === key ? { ...entry, bind } : entry)) }))}
            />
          </div>
        )}

        {!loading && (
          <div className="rounded-lg ring-1 ring-secondary">
            <div role="tablist" className="flex flex-wrap gap-1 border-b border-secondary px-2 pt-2">
              {(
                [
                  ['columns', `Columns (${cur.columns.length})`],
                  ['where', `Filters${countConditions(cur.where) ? ` (${countConditions(cur.where)})` : ''}`],
                  ['having', `Filters on totals${countConditions(cur.having) ? ` (${countConditions(cur.having)})` : ''}`],
                  ['options', 'Options'],
                  ['sql', 'SQL'],
                  ['results', 'Results'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(id);
                    if ((id === 'sql' || id === 'results') && design.tables.length && !run) void doRun();
                  }}
                  className={cx('-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-semibold', tab === id ? 'border-brand text-brand-secondary' : 'border-transparent text-quaternary hover:text-secondary')}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="p-3">
              {tab === 'columns' && <ColumnsEditor columns={cur.columns} operands={operands} onChange={(columns) => update((d) => ({ ...d, columns }))} />}
              {tab === 'where' && (
                <GroupEditor
                  group={cur.where}
                  operands={operands}
                  having={false}
                  depth={1}
                  onChange={(where) => update((d) => ({ ...d, where }))}
                  empty={t('No filters: every row is read. Add a condition; a :parameter value becomes a filter of the grids that read this query, skipped while it is empty.')}
                />
              )}
              {tab === 'having' && (
                <GroupEditor
                  group={cur.having}
                  operands={operands}
                  having
                  depth={1}
                  onChange={(having) => update((d) => ({ ...d, having }))}
                  empty={t('No filters on totals. These apply after grouping, e.g. only suppliers whose order count is 3 or more.')}
                />
              )}
              {tab === 'options' && <OptionsEditor design={cur} queries={queries} onChange={(change) => update((d) => ({ ...d, ...change }))} />}
              {tab === 'sql' && (
                <div className="space-y-2">
                  <pre className="max-h-80 overflow-auto rounded-lg bg-secondary p-4 font-mono text-sm whitespace-pre-wrap text-primary ring-1 ring-secondary ring-inset">
                    {run?.sql ?? (savedSql || t('No SQL yet.'))}
                  </pre>
                  <p className="text-xs text-tertiary">{dirty ? t('The SQL of the design as drawn; it is kept when you save.') : t('Saved as this query meta’s query_string.')}</p>
                </div>
              )}
              {tab === 'results' && (
                <div className="space-y-3">
                  {params.length > 0 && (
                    <div className="flex flex-wrap items-end gap-3">
                      {params.map((p) => (
                        <label key={p} className="text-sm">
                          <span className="mb-1 block font-medium text-secondary">:{p}</span>
                          <input className={field} value={paramValues[p] ?? ''} onChange={(e) => setParamValues((v) => ({ ...v, [p]: e.target.value }))} placeholder={t('empty: skipped')} />
                        </label>
                      ))}
                      <Button size="sm" color="secondary" onPress={doRun} isLoading={busy === 'run'}>
                        {t('Run again')}
                      </Button>
                    </div>
                  )}
                  <ResultTable run={run} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
    </Inlines.Provider>
    </StoredQueries.Provider>
  );
}

function countConditions(group: ConditionGroup): number {
  return group.items.reduce((n, item) => n + (item.type === 'group' ? countConditions(item) : 1), 0);
}

type Payload = { source: 'table' | 'query' | 'inline'; name?: string; meta_id?: number };

/**
 * Which SELECT the canvas shows: the query itself or one of its sub-queries, kept inside it
 * (no meta of their own). A sub-query is used from the sidebar as a table, or as a column,
 * a list or EXISTS through "Sub-query…".
 */
function LevelBar({ subqueries, current, onPick, onAdd, onRename, onRemove }: {
  subqueries: InlineSubquery[];
  current: InlineSubquery | null;
  onPick: (key: string | null) => void;
  onAdd: () => void;
  onRename: (from: string, to: string, label: string | null) => void;
  onRemove: (key: string) => void;
}) {
  const [name, setName] = useState(current?.key ?? '');
  const [label, setLabel] = useState(current?.label ?? '');
  useEffect(() => {
    setName(current?.key ?? '');
    setLabel(current?.label ?? '');
  }, [current?.key, current?.label]);
  const commit = () => current && onRename(current.key, name.trim(), label.trim() || null);
  const chip = (active: boolean) =>
    cx('rounded-md px-2.5 py-1 text-sm font-semibold ring-1 ring-inset', active ? 'bg-brand-primary_alt text-brand-secondary ring-brand' : 'bg-primary text-secondary ring-secondary hover:bg-primary_hover');
  return (
    <div className="space-y-2">
      <div role="tablist" aria-label={t('Query and its sub-queries')} className="flex flex-wrap items-center gap-1.5">
        <button type="button" role="tab" aria-selected={!current} className={chip(!current)} onClick={() => onPick(null)}>
          {t('Main query')}
        </button>
        {subqueries.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={current?.key === s.key} className={chip(current?.key === s.key)} onClick={() => onPick(s.key)}>
            <span className="font-mono text-xs text-tertiary">{s.key}</span>
            {s.label && <span className="ml-1.5">{s.label}</span>}
          </button>
        ))}
        <button type="button" onClick={onAdd} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-brand-secondary hover:bg-brand-primary_alt">
          <Plus className="size-4" aria-hidden="true" /> {t('Sub-query')}
        </button>
      </div>
      {current && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-primary_alt px-3 py-2 text-sm ring-1 ring-brand ring-inset">
          <label className="flex items-center gap-1.5 font-medium text-secondary">
            {t('Name')}
            <input aria-label={t('Sub-query name')} className={cx(field, 'w-32 font-mono')} value={name} onChange={(e) => setName(e.target.value.replace(/\W/g, '_'))} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
          </label>
          <label className="flex items-center gap-1.5 font-medium text-secondary">
            {t('Label')}
            <input aria-label={t('Sub-query label')} className={cx(field, 'w-48')} value={label} placeholder="optional" onChange={(e) => setLabel(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
          </label>
          <p className="min-w-48 flex-1 text-xs text-tertiary">
            {t("Kept inside this query. Its filters can use the main query's columns, so it runs once per row; used as a table it can't.")}
          </p>
          <IconAction icon={Trash01} label={t('Delete this sub-query')} danger onPress={() => onRemove(current.key)} />
        </div>
      )}
    </div>
  );
}

function SourceItem({ label, kind, payload, onAdd }: { label: string; kind: string; payload: Payload; onAdd: () => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-query-source', JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="group flex cursor-grab items-center gap-2 px-2.5 py-1 text-sm text-secondary hover:bg-primary_hover active:cursor-grabbing"
      title={t('Drag {name} onto the canvas', { name: label })}
    >
      <Database01 className={cx('size-3.5 shrink-0', kind === 'view' ? 'text-fg-success-secondary' : kind === 'query' ? 'text-fg-brand-secondary' : 'text-fg-quaternary')} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {kind !== 'table' && <span className="text-xs text-quaternary">{kind}</span>}
      <button type="button" onClick={onAdd} aria-label={t('Add {name}', { name: label })} className="rounded p-0.5 text-fg-quaternary opacity-0 group-hover:opacity-100 hover:bg-secondary hover:text-fg-secondary focus:opacity-100">
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** The canvas: table boxes to drag, join lines between their columns. */
function Canvas({
  tall,
  design,
  columnsOf,
  onDrop,
  onMove,
  onRemove,
  onRename,
  onJoinType,
  onJoinChange,
  onConnect,
  onToggle,
  onBind,
}: {
  tall: boolean;
  design: QueryLevel;
  columnsOf: (entry: QueryTable) => SchemaColumn[];
  onDrop: (payload: Payload, at: Point) => void;
  onMove: (key: string, at: Point) => void;
  onRemove: (key: string) => void;
  onRename: (key: string) => void;
  onJoinType: (key: string, type: JoinType) => void;
  onJoinChange: (key: string, index: number, change: Partial<JoinCondition> | null) => void;
  onConnect: (a: Ref, b: Ref) => void;
  onToggle: (entry: QueryTable, c: SchemaColumn) => void;
  onBind: (key: string, bind: NonNullable<QueryTable['bind']>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key: string; dx: number; dy: number } | null>(null);
  const [drawing, setDrawing] = useState<{ from: Ref; at: Point } | null>(null);
  const [picked, setPicked] = useState<{ key: string; index: number } | null>(null);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left + ref.current!.scrollLeft, y: e.clientY - r.top + ref.current!.scrollTop };
  };

  const boxes = useMemo(() => new Map(design.tables.map((entry) => [entry.key, { t: entry, h: HEAD_H + PAD * 2 + Math.max(1, columnsOf(entry).length) * ROW_H }])), [design.tables, columnsOf]);
  const width = Math.max(...design.tables.map((entry) => entry.x + BOX_W + 40), 0);
  const height = Math.max(440, ...design.tables.map((entry) => entry.y + (boxes.get(entry.key)?.h ?? 0) + 40));

  /** Where a column's row meets the box edge facing the other box. */
  const anchor = (r: Ref, towardsX: number): Point | null => {
    const box = boxes.get(r.table);
    if (!box) return null;
    const i = columnsOf(box.t).findIndex((c) => c.name === r.column);
    if (i < 0) return null;
    const right = towardsX > box.t.x + BOX_W / 2;
    return { x: box.t.x + (right ? BOX_W : 0), y: box.t.y + HEAD_H + PAD + i * ROW_H + ROW_H / 2 };
  };

  const lines = design.tables.flatMap((entry) =>
    (entry.join?.on ?? []).map((c, index) => {
      const lb = boxes.get(c.left.table)?.t;
      const rb = boxes.get(c.right.table)?.t;
      if (!lb || !rb) return null;
      const a = anchor(c.left, rb.x + BOX_W / 2);
      const b = anchor(c.right, lb.x + BOX_W / 2);
      if (!a || !b) return null;
      return { key: entry.key, index, a, b, c, type: entry.join!.type };
    }),
  ).filter((l) => l !== null);

  const curve = (a: Point, b: Point) => {
    const bend = Math.max(40, Math.abs(b.x - a.x) / 2);
    const da = a.x <= b.x ? bend : -bend;
    return `M${a.x} ${a.y} C${a.x + da} ${a.y} ${b.x - da} ${b.y} ${b.x} ${b.y}`;
  };

  function startMove(e: ReactPointerEvent, entry: QueryTable) {
    if ((e.target as HTMLElement).closest('button,select')) return;
    const p = local(e);
    drag.current = { key: entry.key, dx: p.x - entry.x, dy: p.y - entry.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function startDrawing(e: ReactPointerEvent, from: Ref) {
    e.stopPropagation();
    e.preventDefault();
    setDrawing({ from, at: local(e) });
    const move = (ev: PointerEvent) => setDrawing((d) => d && { ...d, at: local(ev) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrawing(null);
      const row = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-column]');
      if (row?.dataset.table && row.dataset.column) onConnect(from, { table: row.dataset.table, column: row.dataset.column });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const pickedLine = picked ? lines.find((l) => l.key === picked.key && l.index === picked.index) : undefined;

  return (
    <div
      ref={ref}
      className={cx(
        'relative min-w-0 flex-1 overflow-auto rounded-lg bg-secondary_subtle bg-[radial-gradient(var(--color-border-secondary)_1px,transparent_1px)] [background-size:16px_16px] ring-1 ring-secondary',
        tall ? 'h-[calc(100vh-20rem)] min-h-[480px]' : 'h-[480px]',
      )}
      onDragOver={(e: DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-query-source')) e.preventDefault();
      }}
      onDrop={(e: DragEvent) => {
        const raw = e.dataTransfer.getData('application/x-query-source');
        if (!raw) return;
        e.preventDefault();
        const p = local(e);
        onDrop(JSON.parse(raw) as Payload, { x: p.x - BOX_W / 2, y: p.y - HEAD_H / 2 });
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const p = local(e);
        onMove(drag.current.key, { x: Math.max(0, Math.round(p.x - drag.current.dx)), y: Math.max(0, Math.round(p.y - drag.current.dy)) });
      }}
      onPointerUp={() => (drag.current = null)}
      onClick={(e) => {
        if (e.target === e.currentTarget) setPicked(null);
      }}
    >
      <div className="relative" style={{ width, height }}>
        {design.tables.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-tertiary">
            {t('Drag a table, view or query here from the list, or press + beside it.')}
          </p>
        )}

        <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">
          {lines.map((l) => (
            <path key={`${l.key}-${l.index}`} d={curve(l.a, l.b)} fill="none" strokeWidth={picked?.key === l.key && picked.index === l.index ? 3 : 2} className={picked?.key === l.key && picked.index === l.index ? 'stroke-fg-brand-primary' : 'stroke-fg-quaternary'} />
          ))}
          {drawing && (() => {
            const box = boxes.get(drawing.from.table);
            const a = box && anchor(drawing.from, drawing.at.x);
            return a ? <path d={curve(a, drawing.at)} fill="none" strokeWidth={2} strokeDasharray="5 4" className="stroke-fg-brand-primary" /> : null;
          })()}
        </svg>

        {lines.map((l) => (
          <button
            key={`sign-${l.key}-${l.index}`}
            type="button"
            onClick={() => setPicked({ key: l.key, index: l.index })}
            className="absolute z-[2] flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-sm text-secondary shadow-xs ring-1 ring-secondary hover:ring-brand"
            style={{ left: (l.a.x + l.b.x) / 2, top: (l.a.y + l.b.y) / 2 }}
            aria-label={t('Join {join}', { join: `${l.c.left.table}.${l.c.left.column} ${l.c.op} ${l.c.right.table}.${l.c.right.column}` })}
            title={`${l.c.left.table}.${l.c.left.column} ${l.c.op} ${l.c.right.table}.${l.c.right.column}`}
          >
            {JOIN_SIGN[l.type]}
          </button>
        ))}

        {design.tables.map((entry, i) => {
          const columns = columnsOf(entry);
          const unconnected = i > 0 && entry.join?.type !== 'cross' && !(entry.join?.on.length);
          return (
            <div
              key={entry.key}
              className={cx('absolute z-[1] rounded-lg bg-primary shadow-sm ring-1', unconnected ? 'ring-2 ring-warning' : 'ring-secondary')}
              style={{ left: entry.x, top: entry.y, width: BOX_W }}
            >
              <div className="flex cursor-move touch-none items-center gap-1.5 rounded-t-lg select-none border-b border-secondary bg-secondary px-2" style={{ height: HEAD_H }} onPointerDown={(e) => startMove(e, entry)} onDoubleClick={() => onRename(entry.key)}>
                <span className="rounded bg-primary px-1 font-mono text-xs text-brand-secondary ring-1 ring-secondary" title={t('Alias; double-click to rename')}>{entry.key}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary" title={entry.name ?? entry.label ?? ''}>{entry.source === 'query' ? (entry.label ?? t('Query')) : entry.source === 'inline' ? (entry.label ?? entry.name) : entry.name}</span>
                {i > 0 && (
                  <select
                    aria-label={t('How {name} joins', { name: entry.key })}
                    value={entry.join?.type ?? 'inner'}
                    onChange={(e) => onJoinType(entry.key, e.target.value as JoinType)}
                    className="rounded bg-primary px-0.5 text-xs text-secondary ring-1 ring-secondary outline-none"
                    title={t(JOINS.find((j) => j.value === (entry.join?.type ?? 'inner'))?.label ?? '')}
                  >
                    {JOINS.map((j) => (
                      <option key={j.value} value={j.value}>{JOIN_SIGN[j.value]} {j.value}</option>
                    ))}
                  </select>
                )}
                <button type="button" onClick={() => onRemove(entry.key)} aria-label={t('Remove {name}', { name: entry.key })} className="rounded p-0.5 text-fg-quaternary hover:bg-primary hover:text-fg-error-primary">
                  <XClose className="size-4" aria-hidden="true" />
                </button>
              </div>
              <ul className="py-1">
                {columns.length === 0 && <li className="px-2 text-xs text-tertiary" style={{ height: ROW_H }}>{t('No columns')}</li>}
                {columns.map((c) => (
                  <ColumnRow key={c.name} table={entry} column={c} selected={design.columns.some((x) => isColumn(x.expr) && x.expr.table === entry.key && x.expr.column === c.name)} onToggle={() => onToggle(entry, c)} onDraw={(e) => startDrawing(e, { table: entry.key, column: c.name })} />
                ))}
              </ul>
              {entry.source === 'query' && <TableBind table={entry} onChange={(bind) => onBind(entry.key, bind)} />}
              {unconnected && <p className="absolute -bottom-6 left-0 text-xs whitespace-nowrap text-warning-primary">{t('Drag a column onto another table to join')}</p>}
            </div>
          );
        })}

        {pickedLine && (
          <div className="absolute z-[4] w-64 -translate-x-1/2 rounded-lg bg-primary p-3 shadow-lg ring-1 ring-secondary" style={{ left: (pickedLine.a.x + pickedLine.b.x) / 2, top: (pickedLine.a.y + pickedLine.b.y) / 2 + 18 }}>
            <p className="mb-2 font-mono text-xs break-all text-secondary">
              {pickedLine.c.left.table}.{pickedLine.c.left.column} {pickedLine.c.op} {pickedLine.c.right.table}.{pickedLine.c.right.column}
            </p>
            <div className="flex items-center gap-2">
              <select aria-label={t('Join type')} className={field} value={pickedLine.type} onChange={(e) => onJoinType(pickedLine.key, e.target.value as JoinType)}>
                {JOINS.filter((j) => j.value !== 'cross').map((j) => (
                  <option key={j.value} value={j.value}>{t(j.label)}</option>
                ))}
              </select>
              <select aria-label={t('Compare')} className={field} value={pickedLine.c.op} onChange={(e) => onJoinChange(pickedLine.key, pickedLine.index, { op: e.target.value as JoinCondition['op'] })}>
                {['=', '<>', '<', '<=', '>', '>='].map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              <IconAction icon={Trash01} label={t('Remove this join')} danger onPress={() => { onJoinChange(pickedLine.key, pickedLine.index, null); setPicked(null); }} />
              <IconAction icon={XClose} label={t('Close')} onPress={() => setPicked(null)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ColumnRow({ table, column, selected, onToggle, onDraw }: { table: QueryTable; column: SchemaColumn; selected: boolean; onToggle: () => void; onDraw: (e: ReactPointerEvent) => void }) {
  return (
    <li data-table={table.key} data-column={column.name} className="group relative flex items-center gap-2 px-2 hover:bg-primary_hover" style={{ height: ROW_H }}>
      <input type="checkbox" checked={selected} onChange={onToggle} aria-label={t('Select {name}', { name: `${table.key}.${column.name}` })} className="size-3.5 accent-[var(--color-brand-600)]" />
      <span className="min-w-0 flex-1 truncate text-sm text-secondary" title={`${column.name} (${column.type})`}>{column.name}</span>
      <span className="text-[10px] text-quaternary">{column.data_type}</span>
      <span
        role="button"
        tabIndex={-1}
        aria-label={t('Join from {name}', { name: `${table.key}.${column.name}` })}
        title={t("Drag onto another table's column to join")}
        onPointerDown={onDraw}
        className="absolute -right-1.5 size-3 cursor-crosshair rounded-full bg-primary ring-2 ring-fg-quaternary opacity-0 group-hover:opacity-100 hover:ring-fg-brand-primary"
      />
    </li>
  );
}

type OperandOption = { table: string; column: string; data_type: string };

/** Picks a column on the canvas, or switches to an SQL expression typed by hand or (with subqueries) another meta's stored query. */
function OperandField({ value, operands, onChange, label, subqueries = true }: { value: Operand | null | undefined; operands: OperandOption[]; onChange: (o: Operand) => void; label: string; subqueries?: boolean }) {
  const stored = useContext(StoredQueries);
  const inlines = useContext(Inlines);
  const first = firstQueryRef(stored, inlines);
  const sub = isQueryRef(value);
  const custom = !!value && !isColumn(value) && !sub;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <select
        aria-label={label}
        className={cx(field, 'max-w-48')}
        value={sub ? '__subquery' : custom ? '__custom' : value && isColumn(value) ? `${value.table}.${value.column}` : ''}
        onChange={(e) => {
          if (e.target.value === '__custom') onChange({ custom: value && !sub ? operandText(value) : '' });
          else if (e.target.value === '__subquery') {
            if (first) onChange(first);
          } else {
            const [table, ...rest] = e.target.value.split('.');
            onChange({ table, column: rest.join('.') });
          }
        }}
      >
        {!value && <option value="">{t('Pick a column')}</option>}
        {operands.map((o) => (
          <option key={`${o.table}.${o.column}`} value={`${o.table}.${o.column}`}>{o.table}.{o.column}</option>
        ))}
        <option value="__custom">{t('Expression…')}</option>
        {subqueries && first && <option value="__subquery">{t('Sub-query…')}</option>}
      </select>
      {custom && (
        <input aria-label={t('{name} expression', { name: label })} className={cx(field, 'min-w-40 flex-1 font-mono')} value={(value as { custom: string }).custom} placeholder={t('e.g. o.qty * o.price')} onChange={(e) => onChange({ custom: e.target.value })} />
      )}
      {sub && <SubqueryField value={value} operands={operands} onChange={onChange} label={label} />}
    </div>
  );
}

/**
 * Another meta's stored SELECT as a value or a list: which one, which of its columns (or
 * its only one), and what fills each of its :parameters. A column of this query makes it
 * run once per row (correlated), e.g. each supplier's order count.
 */
function SubqueryField({ value, operands, onChange, label, pickColumn = true }: { value: SubqueryOperand | InlineOperand; operands: OperandOption[]; onChange: (o: SubqueryOperand | InlineOperand) => void; label: string; pickColumn?: boolean }) {
  const stored = useContext(StoredQueries);
  const inlines = useContext(Inlines);
  const { need } = stored;
  const storedId = isSubquery(value) ? value.subquery : null;
  useEffect(() => {
    if (storedId !== null) need(storedId);
  }, [need, storedId]);
  const own = inlines.list.filter((q) => q.key !== inlines.current);
  const columns = isSubquery(value) ? stored.info[value.subquery]?.columns : own.find((q) => q.key === value.inline)?.columns;
  const params = isSubquery(value) ? (stored.info[value.subquery]?.params ?? stored.list.find((q) => q.id === value.subquery)?.params ?? []) : [];
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md bg-brand-primary_alt px-1.5 py-1 ring-1 ring-brand ring-inset">
      <select
        aria-label={t('{name}: sub-query', { name: label })}
        className={cx(field, 'max-w-56')}
        value={isSubquery(value) ? `stored:${value.subquery}` : `inline:${value.inline}`}
        onChange={(e) => {
          const [kind, id] = e.target.value.split(':');
          onChange(kind === 'inline' ? { inline: id, column: null } : { subquery: Number(id), column: null, bind: {} });
        }}
      >
        {own.length > 0 && (
          <optgroup label={t('In this query')}>
            {own.map((q) => (
              <option key={q.key} value={`inline:${q.key}`}>{q.label ?? q.key}</option>
            ))}
          </optgroup>
        )}
        {stored.list.length > 0 && (
          <optgroup label={t('Stored queries')}>
            {stored.list.map((q) => (
              <option key={q.id} value={`stored:${q.id}`}>{q.name}{q.type && q.type !== 'query' ? ` (${q.type})` : ''}</option>
            ))}
          </optgroup>
        )}
      </select>
      {pickColumn && (
        <select aria-label={t('{name}: its column', { name: label })} className={cx(field, 'max-w-40')} value={value.column ?? ''} onChange={(e) => onChange({ ...value, column: e.target.value || null })}>
          <option value="">{t('its value')}</option>
          {columns?.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      )}
      {isSubquery(value) && params.map((p) => (
        <BindField key={p} name={p} value={value.bind?.[p]} operands={operands} columns onChange={(b) => onChange({ ...value, bind: withBind(value.bind, p, b) })} />
      ))}
    </div>
  );
}

/** The sub-query a new "Sub-query…" starts with: one of this query's own, else the first stored one. */
function firstQueryRef(stored: Stored, inlines: { list: Inline[]; current: string | null }): SubqueryOperand | InlineOperand | null {
  const own = inlines.list.find((q) => q.key !== inlines.current);
  if (own) return { inline: own.key, column: null };
  return stored.list[0] ? { subquery: stored.list[0].id, column: null, bind: {} } : null;
}

function withBind<B>(bind: Record<string, B> | undefined, name: string, value: B | null): Record<string, B> {
  const next = { ...(bind ?? {}) };
  if (value === null) delete next[name];
  else next[name] = value;
  return next;
}

/** What fills one :parameter of a stored query; left as is, it stays a parameter of this query by the same name. */
function BindField({ name, value, operands, columns, onChange }: { name: string; value: Bind | undefined; operands: OperandOption[]; columns: boolean; onChange: (b: Bind | null) => void }) {
  const kind = !value ? 'keep' : 'value' in value ? 'value' : 'param' in value ? 'param' : 'column';
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs text-secondary">
      <code className="font-mono">:{name}</code>
      <span>=</span>
      <select
        aria-label={t('What fills :{name}', { name })}
        className={cx(field, 'text-xs')}
        value={kind}
        onChange={(e) => {
          const k = e.target.value;
          onChange(k === 'keep' ? null : k === 'value' ? { value: '' } : k === 'param' ? { param: name } : operands[0] ? { table: operands[0].table, column: operands[0].column } : { custom: '' });
        }}
      >
        <option value="keep">{t(':{name} of this query', { name })}</option>
        <option value="value">{t('a value')}</option>
        <option value="param">{t('a parameter')}</option>
        {columns && <option value="column">{t('a column (each row)')}</option>}
      </select>
      {value && 'value' in value && <input aria-label={t('Value of :{name}', { name })} className={cx(field, 'w-28 text-xs')} value={value.value} onChange={(e) => onChange({ value: e.target.value })} />}
      {value && 'param' in value && (
        <span className="flex items-center font-mono">
          :<input aria-label={t('Parameter for :{name}', { name })} className={cx(field, 'w-28 font-mono text-xs')} value={value.param} onChange={(e) => onChange({ param: e.target.value.replace(/\W/g, '_') })} />
        </span>
      )}
      {kind === 'column' && <OperandField label={t('Column for :{name}', { name })} value={value as Operand} operands={operands} subqueries={false} onChange={(o) => onChange(o as Bind)} />}
    </span>
  );
}

/** A stored query on the canvas: its :parameters, filled with values or this query's parameters (FROM can't see the other tables' rows). */
function TableBind({ table, onChange }: { table: QueryTable; onChange: (bind: NonNullable<QueryTable['bind']>) => void }) {
  const stored = useContext(StoredQueries);
  const params = stored.info[table.meta_id!]?.params ?? [];
  if (!params.length) return null;
  return (
    <div className="space-y-1 border-t border-secondary px-2 py-1.5">
      {params.map((p) => (
        <BindField key={p} name={p} value={table.bind?.[p]} operands={[]} columns={false} onChange={(b) => onChange(withBind(table.bind, p, b as { value: string } | { param: string } | null))} />
      ))}
    </div>
  );
}

function ColumnsEditor({ columns, operands, onChange }: { columns: QueryColumn[]; operands: OperandOption[]; onChange: (columns: QueryColumn[]) => void }) {
  const set = (i: number, change: Partial<QueryColumn>) => onChange(columns.map((c, j) => (j === i ? { ...c, ...change } : c)));
  const move = (i: number, by: number) => {
    const next = [...columns];
    const [c] = next.splice(i, 1);
    next.splice(i + by, 0, c);
    onChange(next);
  };
  const grouped = columns.some((c) => c.aggregate);
  return (
    <div className="space-y-3">
      {columns.length === 0 ? (
        <p className="text-sm text-tertiary">{t('No columns yet. Tick columns on the canvas, or add an expression.')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-tertiary">
              <tr>
                <th className="px-1.5 py-1 font-medium">{t('Column or expression')}</th>
                <th className="px-1.5 py-1 font-medium">{t('Name')}</th>
                <th className="px-1.5 py-1 font-medium">{t('Label')}</th>
                <th className="px-1.5 py-1 font-medium">{t('Show')}</th>
                <th className="px-1.5 py-1 font-medium">{t('Total')}</th>
                <th className="px-1.5 py-1 font-medium">{t('Sort')}</th>
                <th className="px-1.5 py-1 font-medium">{t('Sort #')}</th>
                <th className="px-1.5 py-1 font-medium">{t('Type')}</th>
                <th className="px-1.5 py-1" />
              </tr>
            </thead>
            <tbody>
              {columns.map((c, i) => (
                <tr key={i} className="border-t border-secondary align-middle">
                  <td className="px-1.5 py-1.5">
                    <OperandField label={t('Column {n}', { n: i + 1 })} value={c.expr} operands={operands} onChange={(expr) => set(i, { expr, ...(isColumn(expr) ? { data_type: operands.find((o) => o.table === expr.table && o.column === expr.column)?.data_type ?? c.data_type } : {}) })} />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <input aria-label={t('Name of column {n}', { n: i + 1 })} className={cx(field, 'w-36 font-mono')} value={c.alias} onChange={(e) => set(i, { alias: e.target.value.replace(/\W/g, '_') })} />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <input aria-label={t('Label of column {n}', { n: i + 1 })} className={cx(field, 'w-36')} value={c.label ?? ''} placeholder={t('As named')} onChange={(e) => set(i, { label: e.target.value || null })} />
                  </td>
                  <td className="px-1.5 py-1.5 text-center">
                    <input type="checkbox" aria-label={t('Show column {n}', { n: i + 1 })} checked={c.show} onChange={(e) => set(i, { show: e.target.checked })} className="size-4 accent-[var(--color-brand-600)]" />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <select aria-label={t('Total of column {n}', { n: i + 1 })} className={field} value={c.aggregate ?? ''} onChange={(e) => set(i, { aggregate: (e.target.value || null) as Aggregate | null, ...(['count', 'count_distinct'].includes(e.target.value) ? { data_type: 'integer' } : e.target.value === 'avg' ? { data_type: 'decimal' } : {}) })}>
                      <option value="">{grouped ? t('Group by (auto)') : '—'}</option>
                      {AGGREGATES.map((a) => (
                        <option key={a.value} value={a.value}>{t(a.label)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <select aria-label={t('Sort column {n}', { n: i + 1 })} className={field} value={c.sort ?? ''} onChange={(e) => set(i, { sort: (e.target.value || null) as QueryColumn['sort'] })}>
                      <option value="">—</option>
                      <option value="asc">{t('Ascending')}</option>
                      <option value="desc">{t('Descending')}</option>
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <input aria-label={t('Sort order of column {n}', { n: i + 1 })} type="number" min={1} className={cx(field, 'w-16')} value={c.sort_order ?? ''} disabled={!c.sort} onChange={(e) => set(i, { sort_order: e.target.value ? Number(e.target.value) : null })} />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <select aria-label={t('Type of column {n}', { n: i + 1 })} className={field} value={c.data_type} onChange={(e) => set(i, { data_type: e.target.value })}>
                      {DATA_TYPES.map((entry) => (
                        <option key={entry} value={entry}>{entry}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <div className="flex">
                      <IconAction icon={ArrowUp} label={t('Move up')} onPress={() => i > 0 && move(i, -1)} />
                      <IconAction icon={ArrowDown} label={t('Move down')} onPress={() => i < columns.length - 1 && move(i, 1)} />
                      <IconAction icon={Trash01} label={t('Remove column')} danger onPress={() => onChange(columns.filter((_, j) => j !== i))} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          color="secondary"
          iconLeading={Plus}
          onPress={() => {
            let alias = 'expr';
            for (let n = 2; columns.some((c) => c.alias === alias); n++) alias = `expr${n}`;
            onChange([...columns, { expr: { custom: operands[0] ? `${operands[0].table}.${operands[0].column}` : '1' }, alias, label: null, data_type: 'string', show: true, aggregate: null, sort: null, sort_order: null }]);
          }}
        >
          {t('Add expression')}
        </Button>
        <p className="text-xs text-tertiary">
          {t('With a total on any column, the other shown columns are grouped by. Hidden columns can still sort or group. Count every row with the expression')} <code className="font-mono">*</code> {t('and the total Count.')}
        </p>
      </div>
    </div>
  );
}

function GroupEditor({ group, operands, having, depth, onChange, onRemove, empty }: { group: ConditionGroup; operands: OperandOption[]; having: boolean; depth: number; onChange: (g: ConditionGroup) => void; onRemove?: () => void; empty?: string }) {
  const setItem = (i: number, item: ConditionGroup['items'][number]) => onChange({ ...group, items: group.items.map((x, j) => (j === i ? item : x)) });
  const removeItem = (i: number) => onChange({ ...group, items: group.items.filter((_, j) => j !== i) });
  const first = operands[0];
  const newCondition = (): Condition => ({ type: 'condition', left: first ? { table: first.table, column: first.column } : { custom: '' }, aggregate: having ? 'count' : null, op: '=', value_type: 'value', value: '', value2: null, right: null });

  return (
    <div className={cx('space-y-2', depth > 1 && 'rounded-lg border-l-2 border-brand bg-secondary_subtle p-2 pl-3')}>
      {group.items.length > 1 || depth > 1 ? (
        <div className="flex items-center gap-2 text-sm text-secondary">
          <span>{t('Match')}</span>
          <select aria-label={t('Match all or any')} className={field} value={group.logic} onChange={(e) => onChange({ ...group, logic: e.target.value as 'and' | 'or' })}>
            <option value="and">{t('all (AND)')}</option>
            <option value="or">{t('any (OR)')}</option>
          </select>
          <span>{t('of these')}</span>
          {onRemove && <IconAction icon={Trash01} label={t('Remove group')} danger onPress={onRemove} className="ml-auto" />}
        </div>
      ) : null}
      {group.items.length === 0 && empty && <p className="text-sm text-tertiary">{empty}</p>}
      {group.items.map((item, i) =>
        item.type === 'group' ? (
          <GroupEditor key={i} group={item} operands={operands} having={having} depth={depth + 1} onChange={(g) => setItem(i, { ...g, type: 'group' })} onRemove={() => removeItem(i)} />
        ) : (
          <ConditionRow key={i} condition={item} operands={operands} having={having} onChange={(c) => setItem(i, c)} onRemove={() => removeItem(i)} />
        ),
      )}
      <div className="flex gap-2">
        <Button size="sm" color="secondary" iconLeading={Plus} onPress={() => onChange({ ...group, items: [...group.items, newCondition()] })}>
          {t('Condition')}
        </Button>
        {depth < 4 && (
          <Button size="sm" color="tertiary" iconLeading={Plus} onPress={() => onChange({ ...group, items: [...group.items, { type: 'group', logic: group.logic === 'and' ? 'or' : 'and', items: [newCondition()] }] })}>
            {t('Group ({logic})', { logic: group.logic === 'and' ? t('OR') : t('AND') })}
          </Button>
        )}
      </div>
    </div>
  );
}

function ConditionRow({ condition: c, operands, having, onChange, onRemove }: { condition: Condition; operands: OperandOption[]; having: boolean; onChange: (c: Condition) => void; onRemove: () => void }) {
  const stored = useContext(StoredQueries);
  const inlines = useContext(Inlines);
  const set = (change: Partial<Condition>) => onChange({ ...c, ...change });
  const firstSub = () => firstQueryRef(stored, inlines);
  const exists = c.op === 'exists' || c.op === 'not_exists';
  const noValue = c.op === 'null' || c.op === 'not_null';
  const range = c.op === 'between' || c.op === 'not_between';
  const list = c.op === 'in' || c.op === 'not_in';
  let input: ReactNode = null;
  if (exists) {
    input = isQueryRef(c.right) ? <SubqueryField label={t('Rows of')} value={c.right} operands={operands} pickColumn={false} onChange={(right) => set({ right })} /> : null;
  } else if (!noValue) {
    if (c.value_type === 'param') {
      input = (
        <span className="flex items-center gap-0.5 font-mono text-sm text-secondary">
          :<input aria-label={t('Parameter name')} className={cx(field, 'w-36 font-mono')} value={String(c.value ?? '')} placeholder="from_date" onChange={(e) => set({ value: e.target.value.replace(/\W/g, '_') })} />
        </span>
      );
    } else if (c.value_type === 'subquery') {
      input = isQueryRef(c.right) ? <SubqueryField label={t('Compared with')} value={c.right} operands={operands} onChange={(right) => set({ right })} /> : null;
    } else if (c.value_type === 'column' || c.value_type === 'custom') {
      input = (
        <OperandField
          label={t('Compared with')}
          value={c.right ?? (c.value_type === 'custom' ? { custom: '' } : null)}
          operands={operands}
          onChange={(right) => set({ right, value_type: isColumn(right) ? 'column' : isQueryRef(right) ? 'subquery' : 'custom' })}
        />
      );
    } else {
      input = (
        <span className="flex items-center gap-1.5">
          <input aria-label={t('Value')} className={cx(field, list ? 'w-56' : 'w-36')} value={Array.isArray(c.value) ? c.value.join(', ') : (c.value ?? '')} placeholder={list ? t('a, b, c') : 'value'} onChange={(e) => set({ value: e.target.value })} />
          {range && (
            <>
              <span className="text-sm text-tertiary">{t('and')}</span>
              <input aria-label={t('Second value')} className={cx(field, 'w-36')} value={c.value2 ?? ''} onChange={(e) => set({ value2: e.target.value })} />
            </>
          )}
        </span>
      );
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-primary p-1.5 ring-1 ring-secondary">
      {having && !exists && (
        <select aria-label={t('Total')} className={field} value={c.aggregate ?? ''} onChange={(e) => set({ aggregate: (e.target.value || null) as Condition['aggregate'] })}>
          <option value="">{t('value of')}</option>
          {AGGREGATES.filter((a) => a.value !== 'group').map((a) => (
            <option key={a.value} value={a.value}>{t('{total} of', { total: t(a.label) })}</option>
          ))}
        </select>
      )}
      {!exists && <OperandField label={t('Left side')} value={c.left} operands={operands} onChange={(left) => set({ left })} />}
      <select
        aria-label={t('Comparison')}
        className={field}
        value={c.op}
        onChange={(e) => {
          const op = e.target.value as Operator;
          if (op === 'exists' || op === 'not_exists') set({ op, value_type: 'subquery', value: null, right: isQueryRef(c.right) ? c.right : firstSub() });
          else if (exists) set({ op, value_type: 'value', value: '', right: null, left: c.left ?? (operands[0] ? { table: operands[0].table, column: operands[0].column } : { custom: '' }) });
          else set({ op });
        }}
      >
        {OPERATORS.filter((o) => firstSub() || (o.value !== 'exists' && o.value !== 'not_exists')).map((o) => (
          <option key={o.value} value={o.value}>{t(o.label)}</option>
        ))}
      </select>
      {!noValue && !exists && (
        <select
          aria-label={t('Compared with what')}
          className={field}
          value={c.value_type === 'custom' ? 'column' : c.value_type}
          onChange={(e) => {
            const valueType = e.target.value as Condition['value_type'];
            set({ value_type: valueType, value: valueType === 'value' || valueType === 'param' ? '' : null, right: valueType === 'subquery' ? firstSub() : null });
          }}
        >
          <option value="value">{t('value')}</option>
          <option value="param">{t('parameter')}</option>
          <option value="column">{t('column / expression')}</option>
          {firstSub() && <option value="subquery">{t('sub-query')}</option>}
        </select>
      )}
      {input}
      <IconAction icon={Trash01} label={t('Remove condition')} danger onPress={onRemove} className="ml-auto" />
    </div>
  );
}

function OptionsEditor({ design, queries, onChange }: { design: QueryLevel; queries: StoredQuery[]; onChange: (change: Partial<QueryLevel>) => void }) {
  const inlines = useContext(Inlines);
  const own = inlines.list.filter((q) => q.key !== inlines.current);
  const first = own[0] ? { meta_id: null, inline: own[0].key } : queries[0] ? { meta_id: queries[0].id, inline: null } : null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Toggle label={t('Distinct rows')} hint={t('Leave out rows that repeat another exactly (SELECT DISTINCT).')} isSelected={design.distinct} onChange={(distinct) => onChange({ distinct })} />
        <div className="flex flex-wrap gap-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-secondary">{t('At most (rows)')}</span>
            <input type="number" min={1} className={cx(field, 'w-32')} value={design.limit ?? ''} placeholder="all" onChange={(e) => onChange({ limit: e.target.value ? Number(e.target.value) : null })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-secondary">{t('Skip (rows)')}</span>
            <input type="number" min={0} className={cx(field, 'w-32')} value={design.offset ?? ''} placeholder="0" onChange={(e) => onChange({ offset: e.target.value ? Number(e.target.value) : null })} />
          </label>
        </div>
        <p className="text-xs text-tertiary">{t("Grids page through rows themselves; a limit is for \"top 10\" queries.")}</p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-secondary">{t('Add the rows of other queries (UNION)')}</p>
        <p className="text-xs text-tertiary">{t('They must select as many columns, in the same order and of matching types.')}</p>
        {design.unions.map((u, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              aria-label={t('Union {n}', { n: i + 1 })}
              className={cx(field, 'min-w-0 flex-1')}
              value={u.inline ? `inline:${u.inline}` : `stored:${u.meta_id}`}
              onChange={(e) => {
                const [kind, id] = e.target.value.split(':');
                onChange({ unions: design.unions.map((x, j) => (j === i ? { ...x, meta_id: kind === 'stored' ? Number(id) : null, inline: kind === 'inline' ? id : null } : x)) });
              }}
            >
              {own.length > 0 && (
                <optgroup label={t('In this query')}>
                  {own.map((q) => (
                    <option key={q.key} value={`inline:${q.key}`}>{q.label ?? q.key}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label={t('Stored queries')}>
                {queries.map((q) => (
                  <option key={q.id} value={`stored:${q.id}`}>{q.name}</option>
                ))}
              </optgroup>
            </select>
            <label className="flex items-center gap-1.5 text-sm text-secondary">
              <input type="checkbox" checked={u.all} onChange={(e) => onChange({ unions: design.unions.map((x, j) => (j === i ? { ...x, all: e.target.checked } : x)) })} className="size-4 accent-[var(--color-brand-600)]" />
              {t('Keep repeats (ALL)')}
            </label>
            <IconAction icon={Trash01} label={t('Remove union')} danger onPress={() => onChange({ unions: design.unions.filter((_, j) => j !== i) })} />
          </div>
        ))}
        {first ? (
          <Button size="sm" color="secondary" iconLeading={Plus} onPress={() => onChange({ unions: [...design.unions, { ...first, all: true }] })}>
            {t('Union')}
          </Button>
        ) : (
          <p className="text-sm text-tertiary">{t('Add a sub-query or make another query meta first.')}</p>
        )}
      </div>
    </div>
  );
}

import { api } from './api';
import type { Meta } from './metaApi';

/** What fills a stored query's :parameter: a typed value, a parameter of this query, or (not in FROM) a column or expression of this row. */
export type Bind = { value: string } | { param: string } | { table: string; column: string } | { custom: string };

/** Another meta's stored SELECT used as a value or a list: one of its columns (or its only one), its parameters filled by bind. */
export interface SubqueryOperand {
  subquery: number;
  column?: string | null;
  bind: Record<string, Bind>;
}

/** One of this query's own sub-queries (kept inside it, no meta of its own): one of its columns, or its only one. It sees this query's tables as they are. */
export interface InlineOperand {
  inline: string;
  column?: string | null;
}

/** A column of a table on the canvas, an SQL expression written by hand, a stored query or one of this query's sub-queries. */
export type Operand = { table: string; column: string } | { custom: string } | SubqueryOperand | InlineOperand;

export type JoinType = 'inner' | 'left' | 'right' | 'cross';
export type Aggregate = 'group' | 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct';
export type Operator =
  | '=' | '<>' | '<' | '<=' | '>' | '>='
  | 'like' | 'not_like' | 'contains' | 'starts' | 'ends'
  | 'in' | 'not_in' | 'between' | 'not_between' | 'null' | 'not_null' | 'exists' | 'not_exists';

export interface JoinCondition {
  left: { table: string; column: string };
  op: '=' | '<>' | '<' | '<=' | '>' | '>=';
  right: { table: string; column: string };
}

/** A table, view, another query meta or (inline, by its key in name) one of this query's sub-queries on the canvas; key is its alias, unique across the query and its sub-queries. Every table after the first joins the ones before. */
export interface QueryTable {
  key: string;
  source: 'table' | 'query' | 'inline';
  name: string | null;
  meta_id: number | null;
  label?: string | null;
  x: number;
  y: number;
  join: { type: JoinType; on: JoinCondition[] } | null;
  /** A stored query's :parameters, filled with a value or this query's parameter; one left out stays a parameter. */
  bind?: Record<string, { value: string } | { param: string }>;
}

export interface QueryColumn {
  expr: Operand;
  alias: string;
  label: string | null;
  data_type: string;
  show: boolean;
  aggregate: Aggregate | null;
  sort: 'asc' | 'desc' | null;
  sort_order: number | null;
}

export interface Condition {
  type: 'condition';
  /** Empty for exists / not_exists. */
  left: Operand | null;
  /** HAVING only: the total the left side is compared as. */
  aggregate?: Exclude<Aggregate, 'group'> | null;
  op: Operator;
  /** value: typed in; param: a :name the screen fills (left empty, the condition is skipped); column / custom / subquery: compared with another operand (exists needs a subquery and no left side). */
  value_type: 'value' | 'param' | 'column' | 'custom' | 'subquery';
  value: string | string[] | null;
  value2?: string | null;
  right?: Operand | null;
}

export interface ConditionGroup {
  type?: 'group';
  logic: 'and' | 'or';
  items: (Condition | (ConditionGroup & { type: 'group' }))[];
}

/** One SELECT: the query itself, or one of its sub-queries. */
export interface QueryLevel {
  tables: QueryTable[];
  columns: QueryColumn[];
  where: ConditionGroup;
  having: ConditionGroup;
  /** A stored query's rows (meta_id) or one of this query's sub-queries' (inline). */
  unions: { meta_id: number | null; inline?: string | null; all: boolean }[];
  distinct: boolean;
  limit: number | null;
  offset: number | null;
}

/** A sub-query kept inside its query (params under a subquery param), used by key. */
export interface InlineSubquery {
  key: string;
  label: string | null;
  design: QueryLevel;
}

export interface QueryDesignDef extends QueryLevel {
  subqueries: InlineSubquery[];
}

export interface SchemaTable {
  name: string;
  type: 'table' | 'view';
}

export interface SchemaColumn {
  name: string;
  type: string;
  data_type: string;
  nullable: boolean;
}

export interface TableInfo {
  name: string;
  columns: SchemaColumn[];
  foreign_keys: { columns: string[]; foreign_table: string; foreign_columns: string[] }[];
}

/** A meta whose stored SELECT can be a sub-query, and the :parameters it takes. */
export interface StoredQuery {
  id: number;
  code: string;
  name: string;
  type: string | null;
  params: string[];
}

export interface QueryRun {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  /** The :named parameters the SQL takes. */
  params: string[];
}

/** The query builder (backend: QueryDesignController). */
export const queryApi = {
  tables: () => api<SchemaTable[]>('/query-builder/tables'),
  table: (name: string) => api<TableInfo>(`/query-builder/tables/${encodeURIComponent(name)}`),
  sources: () => api<StoredQuery[]>('/query-builder/sources'),
  source: (metaId: number) => api<{ id: number; name: string; columns: SchemaColumn[]; params: string[] }>(`/query-builder/sources/${metaId}`),
  get: (metaId: number) => api<{ design: QueryDesignDef; sql: string; params: string[] }>(`/metas/${metaId}/query-design`),
  save: (metaId: number, design: QueryDesignDef) =>
    api<{ design: QueryDesignDef; sql: string; params: string[] }>(`/metas/${metaId}/query-design`, { method: 'PUT', body: JSON.stringify({ design }) }),
  preview: (metaId: number, design: QueryDesignDef, params: Record<string, string>) =>
    api<QueryRun>(`/metas/${metaId}/query-design/preview`, { method: 'POST', body: JSON.stringify({ design, params }) }),
  rows: (metaId: number, params: Record<string, string>) =>
    api<QueryRun>(`/metas/${metaId}/query-design/rows?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '').map(([k, v]) => [`params[${k}]`, v]))}`),
  makeGrid: (metaId: number) => api<Meta>(`/metas/${metaId}/query-design/grid`, { method: 'POST' }),
};

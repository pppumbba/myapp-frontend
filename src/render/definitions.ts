import { useEffect, useState } from 'react';
import { fillTokens } from '../lib/sessionApi';
import { ApiError } from '../lib/api';
import { dataApi, onDataWrite, type DataRow } from '../lib/dataApi';
import { metaApi, type Meta, type MetaAction, type MetaParam } from '../lib/metaApi';
import { workflowApi, type WorkflowDef } from '../lib/workflowApi';
import { t } from '@/i18n';

export interface MetaDef {
  meta: Meta;
  /** Params as a tree, ordered. */
  params: MetaParam[];
}

/*
 * A running app opens the same metas many times (menu, tabs, lookups), so definitions and
 * lookup lists are cached for the session. clearRenderCache() is called when a run starts,
 * so edits made in the builder show up.
 */
const defs = new Map<number, Promise<MetaDef>>();
const lookups = new Map<number, Promise<DataRow[]>>();
const actionLists = new Map<number, Promise<MetaAction[]>>();
const workflows = new Map<number, Promise<WorkflowDef>>();
onDataWrite(() => lookups.clear());

export function clearRenderCache() {
  defs.clear();
  actionLists.clear();
  workflows.clear();
  lookups.clear();
}

function loadDef(id: number): Promise<MetaDef> {
  let p = defs.get(id);
  if (!p) {
    // Screens show names and labels in the user's language (see languageApi).
    p = Promise.all([metaApi.get(id, true), metaApi.params(id, true, true)]).then(([meta, params]) => ({ meta, params }));
    p.catch(() => defs.delete(id));
    defs.set(id, p);
  }
  return p;
}

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/** Loads one meta and its params. */
export function useMetaDef(id: number | null | undefined) {
  const [state, setState] = useState<{ def: MetaDef | null; error: string | null }>({ def: null, error: null });

  useEffect(() => {
    if (!id) return;
    let live = true;
    setState({ def: null, error: null });
    loadDef(id).then(
      (def) => live && setState({ def, error: null }),
      (err) => live && setState({ def: null, error: errorText(err, t('This screen could not be loaded.')) }),
    );
    return () => {
      live = false;
    };
  }, [id]);

  return state;
}

/** Loads several metas at once, e.g. the line forms of a form's details. */
export function useMetaDefs(ids: number[]) {
  const key = ids.join(',');
  const [state, setState] = useState<{ defs: MetaDef[] | null; error: string | null }>({ defs: null, error: null });

  useEffect(() => {
    let live = true;
    setState({ defs: null, error: null });
    Promise.all(key ? key.split(',').map((id) => loadDef(Number(id))) : []).then(
      (defs) => live && setState({ defs, error: null }),
      (err) => live && setState({ defs: null, error: errorText(err, t('Part of this screen could not be loaded.')) }),
    );
    return () => {
      live = false;
    };
  }, [key]);

  return state;
}

/**
 * Values a tab or menu item hands the screen it shows (its param's json_config):
 * filters, what a grid's filters start at (they can be changed); fixed, exact values that
 * always hold and new records get (e.g. "My requests"); defaults, what a form starts with.
 */
export interface Preset {
  filters?: Record<string, string>;
  fixed?: Record<string, string>;
  defaults?: Record<string, string>;
}

/** Fills {today}, {user_id}, {user_name}, {user_email} and session values (e.g. {sessionemployeeid}) in a preset value. */
function presetValue(raw: unknown, user: { id: number; name: string; email: string } | null): string {
  return fillTokens(raw, user);
}

/** A tab's or menu item's preset (json_config filters, fixed, defaults), its placeholders filled; undefined when it has none. */
export function presetOf(param: MetaParam, user: { id: number; name: string; email: string } | null): Preset | undefined {
  const config = param.json_config ?? {};
  const part = (key: 'filters' | 'fixed' | 'defaults') => {
    const values = config[key];
    if (!values || typeof values !== 'object' || Array.isArray(values)) return undefined;
    const entries = Object.entries(values as Record<string, unknown>).map(([k, v]) => [k, presetValue(v, user)] as const);
    return entries.length ? Object.fromEntries(entries) : undefined;
  };
  const preset = { filters: part('filters'), fixed: part('fixed'), defaults: part('defaults') };
  return preset.filters || preset.fixed || preset.defaults ? preset : undefined;
}

/** How many levels of lines a form may have (backend: MetaDataController::DETAIL_DEPTH). */
const DETAIL_DEPTH = 3;

/** A detail with its line form, and the details of that form's own lines. */
export interface DetailNode {
  detail: MetaParam & { ref_meta_id: number };
  def: MetaDef;
  children: DetailNode[];
}

/** A form's details, each with the details of its lines, down to DETAIL_DEPTH; a form above is never repeated. */
async function loadDetailTree(def: MetaDef, parents: number[] = [def.meta.id]): Promise<DetailNode[]> {
  if (parents.length > DETAIL_DEPTH) return [];
  const details = detailParams(def.params).filter((d) => !parents.includes(d.ref_meta_id));
  return Promise.all(
    details.map(async (detail) => {
      const child = await loadDef(detail.ref_meta_id);
      return { detail, def: child, children: await loadDetailTree(child, [...parents, child.meta.id]) };
    }),
  );
}

/** Loads a form's details as a tree: their line forms, and their lines' details. */
export function useDetailTree(def: MetaDef | null) {
  const [state, setState] = useState<{ tree: DetailNode[] | null; error: string | null }>({ tree: null, error: null });

  useEffect(() => {
    if (!def) return;
    let live = true;
    setState({ tree: null, error: null });
    loadDetailTree(def).then(
      (tree) => live && setState({ tree, error: null }),
      (err) => live && setState({ tree: null, error: errorText(err, t('Part of this screen could not be loaded.')) }),
    );
    return () => {
      live = false;
    };
  }, [def]);

  return state;
}

/** The text shown for a looked-up record: its labelField, else its first text value. */
export function rowLabel(row: DataRow, labelField?: unknown): string {
  if (typeof labelField === 'string' && row[labelField] != null) return String(row[labelField]);
  const text = Object.entries(row).find(([k, v]) => k !== 'id' && typeof v === 'string');
  return text ? String(text[1]) : `#${row.id}`;
}

export interface LookupOption {
  value: string;
  label: string;
  /** The looked-up record, for copying its values (json_config.fill). */
  row: DataRow;
}

/** The looked-up record's fields a lookup shows and stores (display_field / value_field). */
export function lookupFields(param: MetaParam): { label: string | undefined; value: string } {
  return { label: param.display_as || param.display_field || undefined, value: param.value_field || 'id' };
}

/** A looked-up record as a choice: its stored value and the text shown for it. */
export function lookupOption(row: DataRow, param: MetaParam): LookupOption {
  const { label, value } = lookupFields(param);
  return { value: String(row[value] ?? ''), label: rowLabel(row, label), row };
}

/** Up to 100 records of a lookup's meta, cached for the session. */
function lookupRows(refId: number): Promise<DataRow[]> {
  let p = lookups.get(refId);
  if (!p) {
    p = dataApi.list(refId, { per_page: 100 }).then((page) => page.data);
    p.catch(() => lookups.delete(refId));
    lookups.set(refId, p);
  }
  return p;
}

/** For each lookup among these params: field_path -> (stored value -> label). Plain params are left out. */
export function useLookupLabels(params: MetaParam[]): Map<string, Map<string, string>> {
  const lookupParams = params.filter((p) => p.is_select && p.ref_meta_id);
  const key = lookupParams.map((p) => `${p.field_path}:${p.ref_meta_id}:${JSON.stringify(lookupFields(p))}`).join('|');
  const [labels, setLabels] = useState<Map<string, Map<string, string>>>(new Map());

  useEffect(() => {
    let live = true;
    Promise.all(
      lookupParams.map((p) =>
        lookupRows(p.ref_meta_id!).then(
          (rows) => [p.field_path, new Map(rows.map((r) => { const o = lookupOption(r, p); return [o.value, o.label]; }))] as const,
          () => [p.field_path, new Map<string, string>()] as const,
        ),
      ),
    ).then((entries) => live && setLabels(new Map(entries)));
    return () => {
      live = false;
    };
    // The params are compared by what makes their labels.
  }, [key]);

  return labels;
}

/** Choices for a lookup param: up to 100 records from the meta it refers to. */
export function useLookup(param: MetaParam | undefined) {
  const refId = param?.is_select ? param.ref_meta_id : null;
  const fieldsKey = param ? JSON.stringify(lookupFields(param)) : '';
  const [options, setOptions] = useState<LookupOption[] | null>(null);

  useEffect(() => {
    if (!refId) return;
    let live = true;
    lookupRows(refId).then(
      (rows) => live && setOptions(rows.map((r) => lookupOption(r, param!))),
      () => live && setOptions([]),
    );
    return () => {
      live = false;
    };
  }, [refId, fieldsKey]);

  return options;
}

/** A param's fixed list of values (json_config.options) as choices, or null when it has none. */
export function optionsOf(param: MetaParam): { id: string; label: string }[] | null {
  const options = param.json_config?.options;
  if (!Array.isArray(options)) return null;
  return options.map(String).map((o) => ({ id: o, label: o.charAt(0).toUpperCase() + o.slice(1) }));
}

/** How a field numbers itself (backend: App\Support\Autonumber). */
export interface AutonumberConfig {
  format: string;
  rules?: { field: string; value: string | number | (string | number)[]; format: string }[];
  editable?: boolean;
}

/** A param's json_config.autonumber, when it has one. */
export function autonumberOf(param: MetaParam): AutonumberConfig | null {
  const config = param.json_config?.autonumber as AutonumberConfig | undefined;
  return config && typeof config.format === 'string' ? config : null;
}

/** The other fields an autonumber's number depends on: its rules' fields and {field} tokens. */
export function autonumberFields(config: AutonumberConfig): string[] {
  const formats = [config.format, ...(config.rules ?? []).map((r) => r.format)];
  const tokens = formats.flatMap((f) => [...f.matchAll(/\{(\w+)(?::\d+)?\}/g)].map((m) => m[1])).filter((item) => !['seq', 'yyyy', 'yy', 'MM', 'dd'].includes(item));
  return [...new Set([...(config.rules ?? []).map((r) => r.field), ...tokens])];
}

/** The values json_config.fill copies from a picked lookup record ({ field: record's field }). */
export function filledFrom(param: MetaParam, row: DataRow | undefined): Record<string, string> {
  const fill = (param.json_config?.fill ?? {}) as Record<string, string>;
  return Object.fromEntries(Object.entries(fill).flatMap(([to, from]) => (row?.[from] != null ? [[to, String(row[from])]] : [])));
}

/** Params that render as fields or columns: visible, not the primary key, not a detail or subgrid, top level only. */
export function visibleParams(params: MetaParam[]): MetaParam[] {
  return params.filter((p) => p.is_show && !p.is_primary && p.data_type !== 'detail' && p.data_type !== 'subgrid');
}

/** A form's detail params: line items edited under the form, each described by the form in ref_meta_id. */
export function detailParams(params: MetaParam[]): (MetaParam & { ref_meta_id: number })[] {
  return params.filter((p): p is MetaParam & { ref_meta_id: number } => p.is_show && p.data_type === 'detail' && !!p.ref_meta_id);
}

export function primaryKey(params: MetaParam[]): string {
  return params.find((p) => p.is_primary)?.field_path ?? 'id';
}

export function title(meta: Meta): string {
  return meta.label_name || meta.name;
}

/** A grid's subgrids: grids shown under it for the picked row (json_config.params: their parameter <- this grid's field). */
export function subgridParams(params: MetaParam[]): (MetaParam & { ref_meta_id: number })[] {
  return params.filter((p): p is MetaParam & { ref_meta_id: number } => p.is_show && p.data_type === 'subgrid' && !!p.ref_meta_id);
}

/** A detail with json_config.one is one-to-one: at most one record points back, edited as a section of the form, not as lines. */
export const isOneToOne = (p: MetaParam) => p.json_config?.one === true;

/** A subgrid with json_config.display "nested" opens inside its row (an expand arrow per row) instead of under the grid. */
export const isNestedSubgrid = (p: MetaParam) => p.json_config?.display === 'nested';

/** A grid's toolbar buttons, in order (cached like definitions). */
export function useActions(gridId: number) {
  const [actions, setActions] = useState<MetaAction[] | null>(null);

  useEffect(() => {
    let live = true;
    let p = actionLists.get(gridId);
    if (!p) {
      p = metaApi.actions(gridId, true, true);
      p.catch(() => actionLists.delete(gridId));
      actionLists.set(gridId, p);
    }
    p.then(
      (list) => live && setActions(list),
      () => live && setActions([]),
    );
    return () => {
      live = false;
    };
  }, [gridId]);

  return actions;
}

/**
 * The workflow running a grid's records: its ref_meta_id, when that meta is a workflow.
 * null while loading or when there is none.
 */
export function useGridWorkflow(meta: Meta) {
  // A grid that reuses another (its ref_meta_id is a datagrid) runs on its origin's workflow.
  const [workflowId, setWorkflowId] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      let refId = meta.ref_meta_id;
      for (let depth = 0; refId && depth <= 5; depth++) {
        const ref = await loadDef(refId);
        if (ref.meta.type?.code === 'workflow') return ref.meta.id;
        if (ref.meta.type?.code !== 'datagrid') return null;
        refId = ref.meta.ref_meta_id;
      }
      return null;
    })().then(
      (id) => live && setWorkflowId(id),
      () => live && setWorkflowId(null),
    );
    return () => {
      live = false;
    };
  }, [meta.ref_meta_id]);
  const [workflow, setWorkflow] = useState<WorkflowDef | null>(null);

  useEffect(() => {
    if (!workflowId) {
      setWorkflow(null);
      return;
    }
    let live = true;
    let p = workflows.get(workflowId);
    if (!p) {
      p = workflowApi.get(workflowId, true);
      p.catch(() => workflows.delete(workflowId));
      workflows.set(workflowId, p);
    }
    p.then(
      (w) => live && setWorkflow(w),
      () => live && setWorkflow(null),
    );
    return () => {
      live = false;
    };
  }, [workflowId]);

  return workflowId && workflow ? { id: workflowId, ...workflow } : null;
}

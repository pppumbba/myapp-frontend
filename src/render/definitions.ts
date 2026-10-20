import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { dataApi, onDataWrite, type DataRow } from '../lib/dataApi';
import { metaApi, type Meta, type MetaAction, type MetaParam } from '../lib/metaApi';
import { workflowApi, type WorkflowDef } from '../lib/workflowApi';

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
    p = Promise.all([metaApi.get(id), metaApi.params(id)]).then(([meta, params]) => ({ meta, params }));
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
      (err) => live && setState({ def: null, error: errorText(err, 'This screen could not be loaded.') }),
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
      (err) => live && setState({ defs: null, error: errorText(err, 'Part of this screen could not be loaded.') }),
    );
    return () => {
      live = false;
    };
  }, [key]);

  return state;
}

/** The text shown for a looked-up record: json_config.label_field, else its first text value. */
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

/** Choices for a lookup param: up to 100 records from the meta it refers to. */
export function useLookup(param: MetaParam | undefined) {
  const refId = param?.is_select ? param.ref_meta_id : null;
  const labelField = param?.json_config?.label_field;
  const [options, setOptions] = useState<LookupOption[] | null>(null);

  useEffect(() => {
    if (!refId) return;
    let live = true;
    let p = lookups.get(refId);
    if (!p) {
      p = dataApi.list(refId, { per_page: 100 }).then((page) => page.data);
      p.catch(() => lookups.delete(refId));
      lookups.set(refId, p);
    }
    p.then(
      (rows) => live && setOptions(rows.map((r) => ({ value: String(r.id), label: rowLabel(r, labelField), row: r }))),
      () => live && setOptions([]),
    );
    return () => {
      live = false;
    };
  }, [refId, labelField]);

  return options;
}

/** A param's fixed list of values (json_config.options) as choices, or null when it has none. */
export function optionsOf(param: MetaParam): { id: string; label: string }[] | null {
  const options = param.json_config?.options;
  if (!Array.isArray(options)) return null;
  return options.map(String).map((o) => ({ id: o, label: o.charAt(0).toUpperCase() + o.slice(1) }));
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

/** A grid's toolbar buttons, in order (cached like definitions). */
export function useActions(gridId: number) {
  const [actions, setActions] = useState<MetaAction[] | null>(null);

  useEffect(() => {
    let live = true;
    let p = actionLists.get(gridId);
    if (!p) {
      p = metaApi.actions(gridId);
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
  const { def: ref } = useMetaDef(meta.ref_meta_id);
  const workflowId = ref?.meta.type?.code === 'workflow' ? ref.meta.id : null;
  const [workflow, setWorkflow] = useState<WorkflowDef | null>(null);

  useEffect(() => {
    if (!workflowId) {
      setWorkflow(null);
      return;
    }
    let live = true;
    let p = workflows.get(workflowId);
    if (!p) {
      p = workflowApi.get(workflowId);
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

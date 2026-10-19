import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { dataApi, onDataWrite, type DataRow } from '../lib/dataApi';
import { metaApi, type Meta, type MetaParam } from '../lib/metaApi';

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
onDataWrite(() => lookups.clear());

export function clearRenderCache() {
  defs.clear();
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

/** The text shown for a looked-up record: json_config.label_field, else its first text value. */
export function rowLabel(row: DataRow, labelField?: unknown): string {
  if (typeof labelField === 'string' && row[labelField] != null) return String(row[labelField]);
  const text = Object.entries(row).find(([k, v]) => k !== 'id' && typeof v === 'string');
  return text ? String(text[1]) : `#${row.id}`;
}

export interface LookupOption {
  value: string;
  label: string;
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
      (rows) => live && setOptions(rows.map((r) => ({ value: String(r.id), label: rowLabel(r, labelField) }))),
      () => live && setOptions([]),
    );
    return () => {
      live = false;
    };
  }, [refId, labelField]);

  return options;
}

/** Params that render as fields or columns: visible, not the primary key, top level only. */
export function visibleParams(params: MetaParam[]): MetaParam[] {
  return params.filter((p) => p.is_show && !p.is_primary);
}

export function primaryKey(params: MetaParam[]): string {
  return params.find((p) => p.is_primary)?.field_path ?? 'id';
}

export function title(meta: Meta): string {
  return meta.label_name || meta.name;
}

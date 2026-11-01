import { api, downloadFile } from './api';
import type { Widget } from './pageApi';

export interface MetaType {
  id: number;
  code: string;
  name: string;
  description?: string | null;
}

/** What metas are for (backend: Tag, meta_tag_map). color is a badge color. */
export interface Tag {
  id: number;
  name: string;
  color: TagColor | null;
  metas_count?: number;
}

/** How a grid can show its records as widgets (json_config.view), and where a column sits on one. */
export const RECORD_LOOKS = ['cards', 'inline', 'tiles'] as const;
export type RecordLook = (typeof RECORD_LOOKS)[number];
export const RECORD_SLOTS = ['image', 'title', 'subtitle', 'badge', 'body', 'footer'] as const;
export type RecordSlot = (typeof RECORD_SLOTS)[number];

export const TAG_COLORS =['gray', 'brand', 'blue', 'indigo', 'purple', 'pink', 'orange', 'warning', 'success', 'error'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface MetaRef {
  id: number;
  code: string;
  name: string;
}

export interface Meta {
  id: number;
  code: string;
  name: string;
  label_name: string | null;
  is_active: boolean;
  /** Saves through it are kept in the record log (forms, Excel imports, matrices). */
  is_log?: boolean;
  /** Anyone may open it and add records through it, signed in or not (a portal: /portal/:id). */
  is_public?: boolean;
  /** Every signed-in user may view it, without a role (e.g. the market app and its screens). */
  is_open?: boolean;
  description: string | null;
  table_name: string | null;
  query_string: string | null;
  json_config: Record<string, unknown> | null;
  type_id: number | null;
  ref_meta_id: number | null;
  /** A form's scripts (see render/formScript.ts): on load, on change, before and after save, shared code. */
  load_expression_string?: string | null;
  event_expression_string?: string | null;
  before_save_expression_string?: string | null;
  after_save_expression_string?: string | null;
  var_fnc_expression_string?: string | null;
  /** An external REST service read and written instead of a table (backend: ExternalService). Headers reach admins only. */
  service_url?: string | null;
  service_headers?: string | null;
  service_query?: string | null;
  service_list_path?: string | null;
  service_total_path?: string | null;
  service_record_path?: string | null;
  service_update_method?: string | null;
  /** Set for a service listed by one POST with this JSON body (read-only). Admins only, like the headers. */
  service_list_body?: string | null;
  /** A widget meta's entry in the widget library. */
  widget_id?: number | null;
  type?: MetaType | null;
  widget?: Pick<Widget, 'id' | 'code' | 'name' | 'renderer' | 'icon'> & Partial<Widget>;
  ref_meta?: MetaRef | null;
  params_count?: number;
  tags?: Tag[];
}

export interface MetaOption {
  id: number;
  code: string;
  name: string;
  type: string | null;
}

export interface MetaParam {
  id: number;
  main_meta_id: number;
  parent_id: number | null;
  ref_meta_id: number | null;
  order_number: number;
  field_path: string;
  param_name: string;
  column_path: string | null;
  label_name: string | null;
  data_type: string;
  data_mask: string | null;
  render_type: string | null;
  icon_cls: string | null;
  is_primary: boolean;
  is_show: boolean;
  is_required: boolean;
  is_criteria: boolean;
  is_unique: boolean;
  is_merge: boolean;
  is_select: boolean;
  is_mandatory_criteria: boolean;
  /** Marks the field that names this meta's records (shown for them in lookups and pickers). */
  is_label: boolean;
  /** Holds the id of the record's parent in the same table: a grid shows its records as a tree. */
  is_parent?: boolean;
  /** Where this field sits when the grid shows its records as widgets. */
  widget_position?: RecordSlot | null;
  /** A lookup: the looked-up record's field it shows (empty: that meta's is_label field, else name). */
  display_field: string | null;
  /** A lookup: the looked-up record's field it stores (empty: id). */
  value_field: string | null;
  /** A lookup: the field it shows, worked out by the server. Read only. */
  display_as?: string | null;
  /**
   * A filter that is neither a lookup nor a list itself: the lookup or list of the same field
   * on the grid's form, which it picks with. Read only.
   */
  filter_as?: Partial<Pick<MetaParam, 'is_select' | 'ref_meta_id' | 'display_field' | 'display_as' | 'value_field'>> & { options?: string[] };
  default_value: string | null;
  min_value: string | null;
  max_value: string | null;
  column_width: string | null;
  expression_string: string | null;
  json_config: Record<string, unknown> | null;
  children?: MetaParam[];
}

export type MetaInput = Partial<Omit<Meta, 'id' | 'type' | 'ref_meta' | 'params_count' | 'widget' | 'tags'>> & {
  /** The tags to set; left out keeps them. */
  tag_ids?: number[];
};
export type MetaParamInput = Partial<Omit<MetaParam, 'id' | 'children' | 'main_meta_id' | 'display_as' | 'filter_as'>>;

export type ImportExisting = 'replace' | 'skip' | 'copy';
export interface ImportResult {
  metas: { code: string; name: string; type: string | null; action: 'create' | ImportExisting | 'left out'; id: number | null }[];
  warnings: string[];
}

/** A meta as the where-used list names it. */
export interface UsageMeta {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  type: { code: string | null; name: string | null };
}

/** One place using a meta: the meta doing it (null for a schedule, the widget library or users) and how. */
export interface MetaUse {
  meta: UsageMeta | null;
  where: string;
}

export const metaApi = {
  types: () => api<MetaType[]>('/meta-types'),
  /** Every meta (page widgets show as their page) with the places that use it; admins. */
  usage: () => api<(UsageMeta & { used_by: MetaUse[] })[]>('/meta-usage'),
  /** The places that use one meta; admins. */
  usageOf: (id: number) => api<MetaUse[]>(`/metas/${id}/usage`),
  options: () => api<MetaOption[]>('/metas/options'),
  list: () => api<Meta[]>('/metas'),
  /** translated: names in the user's language, for screens; without it, the originals the builder edits. */
  get: (id: number, translated = false) => api<Meta>(`/metas/${id}${translated ? '?translated=1' : ''}`),
  create: (input: MetaInput) => api<Meta>('/metas', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: MetaInput) =>
    api<Meta>(`/metas/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id: number) => api<null>(`/metas/${id}`, { method: 'DELETE' }),
  /** A new meta with everything this one has (params, buttons, workflow, links, tags…), code given or code_copy. */
  copy: (id: number, input: { code?: string; name?: string } = {}) => api<Meta>(`/metas/${id}/copy`, { method: 'POST', body: JSON.stringify(input) }),
  /** Makes the meta the same as another, keeping its id, code and name; its state is kept as a version first. */
  replace: (id: number, sourceMetaId: number) =>
    api<{ meta: Meta; warnings: string[] }>(`/metas/${id}/replace`, { method: 'POST', body: JSON.stringify({ source_meta_id: sourceMetaId }) }),
  /** The types a meta can be made into (a form from a grid, a matrix of a grid's rows…). */
  deriveTargets: (id: number) => api<{ code: string; name: string }[]>(`/metas/${id}/derive`),
  derive: (id: number, type: string, input: { code?: string; name?: string } = {}) =>
    api<Meta>(`/metas/${id}/derive`, { method: 'POST', body: JSON.stringify({ type, ...input }) }),
  /** Downloads metas with all their parts as a .metas.json file; withUsed adds the metas they use, and theirs. */
  exportFile: (ids: number[], withUsed: boolean) =>
    downloadFile(`/meta-transfer/export?${new URLSearchParams([...ids.map((id) => ['ids[]', String(id)]), ['with_used', withUsed ? '1' : '0']])}`, 'metas.metas.json'),
  /** Puts a file's metas into this app; a code already here is replaced, skipped or copied. dryRun only says what would happen. */
  importFile: (pkg: unknown, existing: ImportExisting, dryRun: boolean) =>
    api<ImportResult>('/meta-transfer/import', { method: 'POST', body: JSON.stringify({ package: pkg, existing, dry_run: dryRun }), notify: !dryRun }),

  tags: () => api<Tag[]>('/tags'),
  /** A name already taken gives back that tag. */
  createTag: (name: string, color?: TagColor | null) => api<Tag>('/tags', { method: 'POST', body: JSON.stringify({ name, color: color ?? null }) }),
  updateTag: (id: number, input: Partial<Pick<Tag, 'name' | 'color'>>) => api<Tag>(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  removeTag: (id: number) => api<null>(`/tags/${id}`, { method: 'DELETE' }),

  /** effective: what a screen shows with (a grid that reuses another gets the merged params); without it, the meta's own, as the builder edits them. */
  params: (metaId: number, effective = false, translated = false) =>
    api<MetaParam[]>(`/metas/${metaId}/params${effective || translated ? `?${[effective && 'effective=1', translated && 'translated=1'].filter(Boolean).join('&')}` : ''}`),
  createParam: (metaId: number, input: MetaParamInput) =>
    api<MetaParam>(`/metas/${metaId}/params`, { method: 'POST', body: JSON.stringify(input) }),
  updateParam: (paramId: number, input: MetaParamInput) =>
    api<MetaParam>(`/params/${paramId}`, { method: 'PUT', body: JSON.stringify(input) }),
  removeParam: (paramId: number) => api<null>(`/params/${paramId}`, { method: 'DELETE' }),

  /** effective: the buttons a screen uses (a reusing grid without its own gets its base's). */
  actions: (gridId: number, effective = false, translated = false) =>
    api<MetaAction[]>(`/metas/${gridId}/actions${effective || translated ? `?${[effective && 'effective=1', translated && 'translated=1'].filter(Boolean).join('&')}` : ''}`),
  createAction: (gridId: number, input: MetaActionInput) =>
    api<MetaAction>(`/metas/${gridId}/actions`, { method: 'POST', body: JSON.stringify(input) }),
  updateAction: (actionId: number, input: MetaActionInput) =>
    api<MetaAction>(`/actions/${actionId}`, { method: 'PUT', body: JSON.stringify(input) }),
  removeAction: (actionId: number) => api<null>(`/actions/${actionId}`, { method: 'DELETE' }),
};

export type ActionKind = 'add' | 'edit' | 'delete' | 'custom' | 'import' | 'stage_query';

/**
 * One toolbar button of a datagrid (backend: meta_actions). form_meta_id is the form it
 * opens (for delete, the form whose table loses the row; for import, the excel_import meta
 * that loads the file); get_meta_id decides the values
 * that form opens with. json_config.params maps the get's named parameters to fields of
 * the selected row.
 */
export interface MetaAction {
  id: number;
  grid_meta_id: number;
  action: ActionKind;
  label: string;
  icon_cls: string | null;
  form_meta_id: number | null;
  get_meta_id: number | null;
  needs_row: boolean;
  show_in_toolbar: boolean;
  show_in_row: boolean;
  order_number: number;
  json_config: { params?: Record<string, string> } | null;
  form?: MetaRef | null;
  get?: MetaRef | null;
}

export type MetaActionInput = Partial<Omit<MetaAction, 'id' | 'grid_meta_id' | 'form' | 'get'>>;

import { api } from './api';

export interface MetaType {
  id: number;
  code: string;
  name: string;
  description?: string | null;
}

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
  description: string | null;
  table_name: string | null;
  query_string: string | null;
  json_config: Record<string, unknown> | null;
  type_id: number | null;
  ref_meta_id: number | null;
  type?: MetaType | null;
  ref_meta?: MetaRef | null;
  params_count?: number;
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
  default_value: string | null;
  min_value: string | null;
  max_value: string | null;
  column_width: string | null;
  expression_string: string | null;
  json_config: Record<string, unknown> | null;
  children?: MetaParam[];
}

export type MetaInput = Partial<Omit<Meta, 'id' | 'type' | 'ref_meta' | 'params_count'>>;
export type MetaParamInput = Partial<Omit<MetaParam, 'id' | 'children' | 'main_meta_id'>>;

export const metaApi = {
  types: () => api<MetaType[]>('/meta-types'),
  options: () => api<MetaOption[]>('/metas/options'),
  list: () => api<Meta[]>('/metas'),
  get: (id: number) => api<Meta>(`/metas/${id}`),
  create: (input: MetaInput) => api<Meta>('/metas', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: MetaInput) =>
    api<Meta>(`/metas/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id: number) => api<null>(`/metas/${id}`, { method: 'DELETE' }),

  params: (metaId: number) => api<MetaParam[]>(`/metas/${metaId}/params`),
  createParam: (metaId: number, input: MetaParamInput) =>
    api<MetaParam>(`/metas/${metaId}/params`, { method: 'POST', body: JSON.stringify(input) }),
  updateParam: (paramId: number, input: MetaParamInput) =>
    api<MetaParam>(`/params/${paramId}`, { method: 'PUT', body: JSON.stringify(input) }),
  removeParam: (paramId: number) => api<null>(`/params/${paramId}`, { method: 'DELETE' }),
};

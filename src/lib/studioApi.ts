import { api } from './api';
import type { Meta, MetaAction, MetaActionInput, MetaParam, MetaParamInput } from './metaApi';
import type { PageItem, PageItemInput } from './pageApi';

/** One param as the studio saves it: id keeps an existing one, children nest under it. ref_key opens a screen made in the same save. */
export type StructureItem = MetaParamInput & { id?: number; ref_key?: string; children?: StructureItem[] };

/** A datagrid's button as the studio saves it; form_key opens a form made in the same save. */
export type StructureAction = Omit<MetaActionInput, 'order_number'> & { id?: number; form_key?: string };

/** A datagrid, form, tab set, page or dashboard built inside an app: made when it has no id. A page's items are its widgets. */
export interface StructureScreen {
  key: string;
  id?: number;
  type: 'datagrid' | 'form' | 'tabs' | 'page' | 'dashboard';
  name: string;
  code?: string | null;
  label_name?: string | null;
  table_name?: string | null;
  description?: string | null;
  is_active?: boolean;
  items: StructureItem[] | PageItemInput[];
  actions?: StructureAction[];
}

export interface AppSaved {
  meta: Meta;
  items: MetaParam[];
  /** A page's items are its widgets, as GET /metas/{id}/page has them. */
  metas: { key: string; meta: Meta; items: MetaParam[] | PageItem[]; actions: MetaAction[] }[];
}

/** The builder studio (backend: StructureController). */
export const studioApi = {
  /** Saves an app's menu, a datagrid's columns, a form's fields or a tab set's tabs at once; left-out params go. */
  saveStructure: (metaId: number, items: StructureItem[]) =>
    api<MetaParam[]>(`/metas/${metaId}/structure`, { method: 'PUT', body: JSON.stringify({ items }) }),
  /** Saves an app with the screens built in it: new ones are made, their fields and buttons saved, in one go. */
  saveApp: (appId: number, input: { meta?: Partial<Meta>; items: StructureItem[]; metas: StructureScreen[] }) =>
    api<AppSaved>(`/metas/${appId}/app`, { method: 'PUT', body: JSON.stringify(input) }),
};

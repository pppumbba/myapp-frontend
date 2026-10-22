import { api } from './api';
import type { Meta } from './metaApi';

export type WidgetPropType = 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'url' | 'image' | 'meta' | 'list';

/** One setting a widget takes. The builder draws its settings form from these. */
export interface WidgetProp {
  key: string;
  label: string;
  type: WidgetPropType;
  default?: unknown;
  hint?: string | null;
  /** select: the choices. */
  options?: string[];
  /** meta: only metas of these types may be picked. */
  meta_types?: string[];
  /** list: the settings of each row. */
  fields?: WidgetProp[];
}

/** One entry of the widget library (backend: widgets). renderer picks the component that draws it. */
export interface Widget {
  id: number;
  code: string;
  name: string;
  category: string;
  renderer: string;
  /** A composite's parts: a widget_template meta laid out like a page. */
  template_meta_id: number | null;
  icon: string | null;
  description: string | null;
  props: WidgetProp[] | null;
  is_active: boolean;
  order_number: number;
  /** Admins only: how many widget metas use this entry. */
  metas_count?: number;
}

export type WidgetInput = Partial<Omit<Widget, 'id' | 'metas_count'>>;

/** A widget meta as a page shows it: its json_config holds the prop values. */
export type WidgetMeta = Pick<Meta, 'id' | 'code' | 'name' | 'ref_meta_id' | 'json_config'> & { widget_id: number | null };

/** One widget placed on a page (a param of the page meta), with the widgets inside it. */
export interface PageItem {
  param_id: number;
  label: string | null;
  /** Width on the 12-column grid. */
  w: number;
  meta: WidgetMeta;
  widget: Widget;
  children: PageItem[];
}

export interface Page {
  meta: Meta;
  items: PageItem[];
}

/** What the builder saves for each placed widget; no meta_id makes a new widget meta for the page. */
export interface PageItemInput {
  param_id?: number;
  meta_id?: number;
  widget_id: number;
  config: Record<string, unknown>;
  w: number;
  label?: string | null;
  children?: PageItemInput[];
}

/** The page builder (backend: WidgetController, PageController). */
export const pageApi = {
  widgets: () => api<Widget[]>('/widgets'),
  createWidget: (input: WidgetInput) => api<Widget>('/widgets', { method: 'POST', body: JSON.stringify(input) }),
  updateWidget: (id: number, input: WidgetInput) => api<Widget>(`/widgets/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  removeWidget: (id: number) => api<null>(`/widgets/${id}`, { method: 'DELETE' }),

  get: (pageId: number) => api<Page>(`/metas/${pageId}/page`),
  save: (pageId: number, items: PageItemInput[]) => api<Page>(`/metas/${pageId}/page`, { method: 'PUT', body: JSON.stringify({ items }) }),
};

/** A widget's prop values: each prop's default, then the values saved on the widget meta. */
export function propValues(widget: Widget, config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const defaults = Object.fromEntries((widget.props ?? []).filter((p) => p.default !== undefined).map((p) => [p.key, p.default]));
  return { ...defaults, ...(config ?? {}) };
}

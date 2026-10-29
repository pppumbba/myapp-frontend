import type { FC } from 'react';
import {
  AlignLeft,
  BarChart01,
  Calendar,
  CheckSquare,
  Columns03,
  Edit01,
  Edit05,
  File06,
  Folder,
  Hash01,
  Hash02,
  LayoutAlt01,
  LayersThree01,
  Link01,
  List,
  Paperclip,
  PenTool01,
  Plus,
  Rows01,
  SearchLg,
  Trash01,
  Type01,
  Zap,
} from '@untitledui/icons';
import type { ActionKind, Meta, MetaAction, MetaOption, MetaParam } from '../../lib/metaApi';
import type { StructureAction, StructureItem, StructureScreen } from '../../lib/studioApi';
import { toInput, type PageDraft } from '../metas/PageDesigner';
import { t } from '@/i18n';

/** What the canvas shows: the app's menu, or one of the screens built inside it. */
export type StudioMode = 'app' | ScreenType;
export type ScreenType = 'datagrid' | 'form' | 'tabs' | 'page' | 'dashboard';

export const SCREEN_TYPES: { code: ScreenType; label: string; icon: FC<{ className?: string }> }[] = [
  { code: 'datagrid', label: 'Datagrid', icon: Rows01 },
  { code: 'form', label: 'Form', icon: Edit05 },
  { code: 'tabs', label: 'Tabs', icon: Columns03 },
  { code: 'page', label: 'Page', icon: LayoutAlt01 },
  { code: 'dashboard', label: 'Dashboard', icon: BarChart01 },
];

export const isScreenType = (code: string | null | undefined): code is ScreenType => SCREEN_TYPES.some((s) => s.code === code);

/** The param columns the studio edits (backend: StructureController::FIELDS). */
export const PARAM_FIELDS = [
  'field_path', 'param_name', 'column_path', 'label_name', 'data_type', 'data_mask', 'render_type', 'icon_cls',
  'ref_meta_id', 'is_primary', 'is_show', 'is_required', 'is_criteria', 'is_unique', 'is_select', 'is_label',
  'default_value', 'min_value', 'max_value', 'column_width', 'json_config', 'display_field', 'value_field',
] as const;

export type ParamValues = Partial<Pick<MetaParam, (typeof PARAM_FIELDS)[number]>>;

/** A menu item, column, field or tab: one param. id once saved; refKey opens a screen not saved yet. */
export interface ParamNode {
  key: string;
  kind: 'param';
  id?: number;
  values: ParamValues;
  refKey?: string;
  children: StudioNode[];
}

export type ActionValues = Pick<MetaAction, 'action' | 'label' | 'icon_cls' | 'form_meta_id' | 'get_meta_id' | 'needs_row' | 'show_in_toolbar' | 'show_in_row' | 'json_config'>;

/** A datagrid's button. formKey: the form it opens is one made in this studio, not saved yet. */
export interface ActionNode {
  key: string;
  kind: 'action';
  id?: number;
  values: ActionValues;
  formKey?: string;
  children: StudioNode[];
}

export type StudioNode = ParamNode | ActionNode;

/** The meta columns of a screen the studio edits. */
export type ScreenMeta = Pick<Meta, 'name' | 'code' | 'label_name' | 'table_name' | 'description' | 'is_active'>;

/** A datagrid, form or tab set built inside the app: new (no id) or loaded from the server. */
export interface Screen {
  key: string;
  id?: number;
  type: ScreenType;
  meta: ScreenMeta;
  /** Params, and for a datagrid its buttons too. A page has none: */
  nodes: StudioNode[];
  /** a page's widgets, as the page builder keeps them. */
  page?: PageDraft[];
}

let nextKey = 1;
export const newKey = () => `n${nextKey++}`;
export const screenKey = (id: number) => `m${id}`;

// ---- Tree helpers: every node has a key and children. ----

export function findNode(nodes: StudioNode[], key: string): StudioNode | null {
  for (const n of nodes) {
    if (n.key === key) return n;
    const below = findNode(n.children, key);
    if (below) return below;
  }
  return null;
}

/** Where a node sits: its parent's key (null at the top) and its index there. */
export function locateNode(nodes: StudioNode[], key: string, parent: string | null = null): { parent: string | null; index: number } | null {
  for (const [i, n] of nodes.entries()) {
    if (n.key === key) return { parent, index: i };
    const below = locateNode(n.children, key, n.key);
    if (below) return below;
  }
  return null;
}

export function updateNode(nodes: StudioNode[], key: string, fn: (n: StudioNode) => StudioNode): StudioNode[] {
  return nodes.map((n) => (n.key === key ? fn(n) : { ...n, children: updateNode(n.children, key, fn) }));
}

export function removeNode(nodes: StudioNode[], key: string): StudioNode[] {
  return nodes.filter((n) => n.key !== key).map((n) => ({ ...n, children: removeNode(n.children, key) }));
}

export function insertNode(nodes: StudioNode[], parent: string | null, index: number, item: StudioNode): StudioNode[] {
  if (parent === null) return [...nodes.slice(0, index), item, ...nodes.slice(index)];
  return nodes.map((n) =>
    n.key === parent ? { ...n, children: insertNode(n.children, null, index, item) } : { ...n, children: insertNode(n.children, parent, index, item) },
  );
}

export const siblingsOf = (nodes: StudioNode[], parent: string | null) => (parent === null ? nodes : (findNode(nodes, parent)?.children ?? []));

export const depthOf = (nodes: StudioNode[], key: string): number => {
  const at = locateNode(nodes, key);
  return at?.parent ? 1 + depthOf(nodes, at.parent) : 0;
};

/** A copy that saves as new; it opens the same screen as the original. */
export function duplicateNode(n: StudioNode, taken: Set<string>): StudioNode {
  if (n.kind === 'action') return { ...n, key: newKey(), id: undefined, values: { ...n.values, label: `${n.values.label} 2` } };
  const field = uniqueField(String(n.values.field_path || 'copy'), taken);
  return { ...n, key: newKey(), id: undefined, values: { ...n.values, field_path: field, param_name: field }, children: n.children.map((c) => duplicateNode(c, taken)) };
}

/** Every field name in the tree, so new ones don't clash. */
export function fieldNames(nodes: StudioNode[], into = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.kind === 'param' && n.values.field_path) into.add(String(n.values.field_path));
    fieldNames(n.children, into);
  }
  return into;
}

export function uniqueField(base: string, taken: Set<string>): string {
  const clean = base.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
  let name = clean;
  for (let i = 2; taken.has(name); i++) name = `${clean}_${i}`;
  taken.add(name);
  return name;
}

/** May this node hold others? Menu groups (items that open nothing) do. */
export const isContainer = (mode: StudioMode, n: StudioNode) => mode === 'app' && n.kind === 'param' && !n.values.ref_meta_id && !n.refKey;

export const MAX_DEPTH: Record<StudioMode, number> = { app: 3, datagrid: 0, form: 0, tabs: 0, page: 0, dashboard: 0 };

export const paramsOf = (nodes: StudioNode[]) => nodes.filter((n): n is ParamNode => n.kind === 'param');
export const actionsOf = (nodes: StudioNode[]) => nodes.filter((n): n is ActionNode => n.kind === 'action');

// ---- From and to what the server sends. ----

export function fromParams(params: MetaParam[]): ParamNode[] {
  return params.map((p) => ({
    key: `p${p.id}`,
    kind: 'param',
    id: p.id,
    values: Object.fromEntries(PARAM_FIELDS.map((f) => [f, p[f]])) as ParamValues,
    children: fromParams(p.children ?? []),
  }));
}

export function fromActions(actions: MetaAction[]): ActionNode[] {
  return actions.map((a) => ({
    key: `a${a.id}`,
    kind: 'action',
    id: a.id,
    values: {
      action: a.action,
      label: a.label,
      icon_cls: a.icon_cls,
      form_meta_id: a.form_meta_id,
      get_meta_id: a.get_meta_id,
      needs_row: a.needs_row,
      show_in_toolbar: a.show_in_toolbar,
      show_in_row: a.show_in_row,
      json_config: a.json_config,
    },
    children: [],
  }));
}

export function toStructure(nodes: StudioNode[]): StructureItem[] {
  return paramsOf(nodes).map((n) => ({
    id: n.id,
    ...n.values,
    ...(n.refKey ? { ref_meta_id: null, ref_key: n.refKey } : {}),
    children: toStructure(n.children),
  }));
}

export const toActions = (nodes: StudioNode[]): StructureAction[] =>
  actionsOf(nodes).map((n) => ({ id: n.id, ...n.values, ...(n.formKey ? { form_meta_id: null, form_key: n.formKey } : {}) }));

export function toScreen(s: Screen): StructureScreen {
  const { code, ...fields } = s.meta;
  return {
    key: s.key,
    id: s.id,
    type: s.type,
    ...fields,
    // A saved screen keeps its code; a new one gets the one typed, or one made from its name.
    ...(s.id ? {} : { code: code || null }),
    items: s.type === 'page' ? toInput(s.page ?? []) : toStructure(s.nodes),
    ...(s.type === 'datagrid' ? { actions: toActions(s.nodes) } : {}),
  };
}

export const appFields = (m: Meta) => ({ name: m.name, label_name: m.label_name, description: m.description, is_active: m.is_active });

/** What a screen saves, as text, to tell whether it changed. */
export const screenSnapshot = (s: Screen) => JSON.stringify(toScreen(s));
export const appSnapshot = (meta: Meta, nodes: StudioNode[]) => JSON.stringify([appFields(meta), toStructure(nodes)]);

/** The new screens something points at: menu items, tabs, lookups, line forms, buttons. */
export function refKeys(nodes: StudioNode[], into = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.kind === 'param' && n.refKey) into.add(n.refKey);
    if (n.kind === 'action' && n.formKey) into.add(n.formKey);
    refKeys(n.children, into);
  }
  return into;
}

/** Screens reachable from the menu (new ones nobody points at any more are dropped at save). */
export function reachable(menu: StudioNode[], screens: Record<string, Screen>): Set<string> {
  const seen = new Set<string>();
  const queue = [...refKeys(menu)];
  while (queue.length) {
    const key = queue.pop()!;
    if (seen.has(key) || !screens[key]) continue;
    seen.add(key);
    queue.push(...refKeys(screens[key].nodes));
  }
  return seen;
}

// ---- The palette. ----

/** What dropping a palette item makes: the node, and maybe a new screen it opens. */
export interface Made {
  node: StudioNode;
  screen?: Screen;
}

export interface MakeCtx {
  taken: Set<string>;
  /** The screen being designed, when it is one (a new form copies a grid's columns). */
  screen: Screen | null;
}

export interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  /** It makes a datagrid button, not a param. */
  action?: boolean;
  icon: FC<{ className?: string }>;
  make: (ctx: MakeCtx) => Made;
}

const param = (taken: Set<string>, base: string, values: ParamValues): ParamNode => {
  const field = uniqueField(base, taken);
  return { key: newKey(), kind: 'param', values: { field_path: field, param_name: field, is_show: true, data_type: 'string', ...values }, children: [] };
};

/** A screen not saved yet. */
function blankScreen(type: ScreenType, name: string, table: string | null, nodes: StudioNode[] = []): Screen {
  return {
    key: newKey(),
    type,
    meta: { name, code: '', label_name: null, table_name: type === 'page' ? null : table, description: null, is_active: true },
    nodes,
    ...(type === 'page' ? { page: [] } : {}),
  };
}

/** A screen not saved yet, and the param (menu item or tab) that opens it. */
function newScreen(type: ScreenType, taken: Set<string>, from: Screen | null, kind: 'menu' | 'tab'): Made {
  const label = t(SCREEN_TYPES.find((s) => s.code === type)!.label);
  const screen = blankScreen(type, t('New {type}', { type: label.toLowerCase() }), from?.meta.table_name ?? null);
  const node = param(taken, type, { label_name: screen.meta.name, icon_cls: kind === 'menu' ? 'file' : null });
  return { node: { ...node, refKey: screen.key }, screen };
}

/** The kind of meta a field points at: a line form, the grid a subgrid shows, or the grid a lookup picks from. */
export function linkedType(v: ParamValues): ScreenType | null {
  if (v.data_type === 'detail') return 'form';
  if (v.data_type === 'subgrid' || v.is_select) return 'datagrid';
  return null;
}

/** A new screen for a field that points at nothing yet, named after the field. A lookup grid gets a name column. */
export function linkedScreen(field: ParamValues, from: Screen | null): Screen | null {
  const type = linkedType(field);
  if (!type) return null;
  const label = String(field.label_name || field.field_path || t('Field'));
  const name = field.data_type === 'detail' ? t('{name} lines', { name: label }) : label;
  const nodes = field.data_type === 'detail' || field.data_type === 'subgrid'
    ? []
    : [param(new Set(), 'name', { label_name: t('Name'), is_label: true, is_criteria: true })];
  return blankScreen(type, from ? `${from.meta.name} – ${name}` : name, null, nodes);
}

/** Field kinds for grids and forms: label, data type and how it is drawn. */
const FIELD_KINDS: { id: string; label: string; icon: FC<{ className?: string }>; values: ParamValues; forms?: boolean }[] = [
  { id: 'text', label: 'Text', icon: Type01, values: { data_type: 'string' } },
  { id: 'long_text', label: 'Long text', icon: AlignLeft, values: { data_type: 'text' }, forms: true },
  { id: 'integer', label: 'Whole number', icon: Hash01, values: { data_type: 'integer' } },
  { id: 'decimal', label: 'Decimal', icon: Hash02, values: { data_type: 'decimal' } },
  { id: 'date', label: 'Date', icon: Calendar, values: { data_type: 'date' } },
  { id: 'datetime', label: 'Date & time', icon: Calendar, values: { data_type: 'datetime' } },
  { id: 'yes_no', label: 'Yes / No', icon: CheckSquare, values: { data_type: 'boolean' } },
  { id: 'options', label: 'Options list', icon: List, values: { data_type: 'string', json_config: { options: ['First', 'Second'] } } },
  { id: 'lookup', label: 'Lookup', icon: SearchLg, values: { data_type: 'integer', is_select: true } },
  { id: 'file', label: 'File', icon: Paperclip, values: { data_type: 'singlefile' }, forms: true },
  { id: 'files', label: 'Files', icon: Paperclip, values: { data_type: 'multifile' }, forms: true },
  { id: 'signature', label: 'Signature', icon: PenTool01, values: { data_type: 'signature' }, forms: true },
  { id: 'detail', label: 'Detail lines', icon: Rows01, values: { data_type: 'detail' }, forms: true },
  { id: 'subgrid', label: 'Subgrid', icon: Columns03, values: { data_type: 'subgrid' } },
];

/** Button kinds: the usual label, icon and row settings (as MetaActionsPanel fills them). */
const BUTTON_KINDS: { action: ActionKind; label: string; icon: FC<{ className?: string }> }[] = [
  { action: 'add', label: 'Add', icon: Plus },
  { action: 'edit', label: 'Edit', icon: Edit01 },
  { action: 'delete', label: 'Delete', icon: Trash01 },
  { action: 'custom', label: 'Custom', icon: Zap },
];

export function buttonValues(action: ActionKind, label: string, formId: number | null = null): ActionValues {
  const needsRow = action !== 'add' && action !== 'import';
  return {
    action,
    label,
    icon_cls: null,
    form_meta_id: formId,
    get_meta_id: null,
    needs_row: needsRow,
    // Edit and Delete sit on each row, so they stay out of the toolbar.
    show_in_toolbar: action !== 'edit' && action !== 'delete',
    show_in_row: action === 'edit' || action === 'delete',
    json_config: needsRow ? { params: { id: 'id' } } : null,
  };
}

/** The form a grid's buttons already open, so a new button opens it too. */
function gridForm(screen: Screen | null): Pick<ActionNode, 'formKey'> & { id: number | null } {
  const used = screen ? actionsOf(screen.nodes).find((a) => a.formKey || a.values.form_meta_id) : undefined;
  return { id: used?.values.form_meta_id ?? null, formKey: used?.formKey };
}

/** Metas a menu item or tab can open. */
const OPENABLE = ['datagrid', 'form', 'tabs', 'page', 'dashboard', 'chart', 'calendar', 'gantt', 'statement', 'report', 'workspace', 'matrix', 'query', 'excel_import', 'stage_query'];

/** An existing meta to place, found by typing its name instead of listed in the palette. */
export interface PaletteLookup {
  id: string;
  group: string;
  placeholder: string;
  /** The meta types it offers. */
  types: string[];
  icon: FC<{ className?: string }>;
  make: (o: MetaOption, ctx: MakeCtx) => Made;
}

/** The lookups beside the palette: existing screens for a menu or tabs, forms for a grid's buttons, charts for a dashboard. */
export function lookupsFor(mode: StudioMode): PaletteLookup[] {
  const screens = (kind: 'menu' | 'tab'): PaletteLookup => ({
    id: 'screens',
    group: t('Existing screens'),
    placeholder: t('Find a screen to add…'),
    types: OPENABLE,
    icon: LayersThree01,
    make: (o, { taken }) => ({ node: param(taken, o.code, { label_name: o.name, ref_meta_id: o.id, icon_cls: kind === 'menu' ? 'file' : null }) }),
  });
  switch (mode) {
    case 'app':
      return [screens('menu')];
    case 'tabs':
      return [screens('tab')];
    case 'datagrid':
      return [
        {
          id: 'forms',
          group: t('Existing forms'),
          placeholder: t('Find a form for an Add button…'),
          types: ['form'],
          icon: Link01,
          make: (o) => ({ node: { key: newKey(), kind: 'action', values: buttonValues('add', t('Add'), o.id), children: [] } }),
        },
      ];
    case 'dashboard':
      return [
        {
          id: 'charts',
          group: t('Charts'),
          placeholder: t('Find a chart to place…'),
          types: ['chart'],
          icon: BarChart01,
          // Each placed chart is a param: ref_meta_id the chart, json_config.w / .h its size (as DashboardDesigner places them).
          make: (o, { taken }) => ({ node: param(taken, o.code, { label_name: null, data_type: 'chart', ref_meta_id: o.id, json_config: { w: 6, h: 2 } }) }),
        },
      ];
    default:
      return [];
  }
}

export function paletteFor(mode: StudioMode): PaletteItem[] {
  const fresh = (group: string, kind: 'menu' | 'tab') =>
    SCREEN_TYPES.map<PaletteItem>((s) => ({
      id: `new-${s.code}`,
      group,
      label: t('New {type}', { type: t(s.label).toLowerCase() }),
      hint: t('Made at Save'),
      icon: s.icon,
      make: ({ taken, screen }) => newScreen(s.code, taken, screen, kind),
    }));

  switch (mode) {
    case 'app':
      return [
        { id: 'group', group: t('Menu'), label: t('Menu group'), hint: t('Holds other items'), icon: Folder, make: ({ taken }) => ({ node: param(taken, 'group', { label_name: t('New group'), icon_cls: 'folder' }) }) },
        { id: 'item', group: t('Menu'), label: t('Menu item'), hint: t('Opens a screen'), icon: Link01, make: ({ taken }) => ({ node: param(taken, 'item', { label_name: t('New item'), icon_cls: 'file' }) }) },
        ...fresh(t('New screens'), 'menu'),
      ];
    case 'tabs':
      return [
        { id: 'tab', group: t('Tabs'), label: t('Tab'), hint: t('Shows a screen'), icon: Columns03, make: ({ taken }) => ({ node: param(taken, 'tab', { label_name: t('New tab') }) }) },
        ...fresh(t('New screens'), 'tab'),
      ];
    case 'page':
      // A page's palette is the widget library, on its own canvas.
      return [];
    case 'dashboard':
      // Charts are found with the lookup (lookupsFor).
      return [];
    case 'datagrid':
    case 'form': {
      const fields = FIELD_KINDS.filter((k) => mode === 'form' || !k.forms).map<PaletteItem>((k) => ({
        id: k.id,
        group: mode === 'form' ? t('Fields') : t('Columns'),
        label: t(k.label),
        icon: k.icon,
        make: ({ taken, screen }) => {
          const node = param(taken, k.id, { label_name: t(k.label), ...k.values });
          // Detail lines, a subgrid and a lookup come with a new meta to point at; picking an existing one leaves it unsaved.
          const made = linkedScreen(node.values, screen);
          return made ? { node: { ...node, refKey: made.key }, screen: made } : { node };
        },
      }));
      if (mode === 'form') return fields;
      return [
        ...fields,
        ...BUTTON_KINDS.map<PaletteItem>((b) => ({
          id: `button-${b.action}`,
          group: t('Buttons'),
          label: t('{name} button', { name: t(b.label) }),
          hint: t('Opens a form'),
          action: true,
          icon: b.icon,
          make: ({ screen }) => {
            const form = gridForm(screen);
            return { node: { key: newKey(), kind: 'action', values: buttonValues(b.action, t(b.label), form.id), formKey: form.formKey, children: [] } };
          },
        })),
        {
          id: 'new-form-button',
          group: t('Forms'),
          label: t('New form from these columns'),
          hint: t('With an Add button'),
          action: true,
          icon: File06,
          make: ({ screen }) => {
            const taken = new Set<string>();
            const form: Screen = {
              key: newKey(),
              type: 'form',
              meta: { name: screen ? `${screen.meta.name} ${t('form')}` : t('New form'), code: '', label_name: null, table_name: screen?.meta.table_name ?? null, description: null, is_active: true },
              nodes: paramsOf(screen?.nodes ?? [])
                .filter((c) => !['subgrid'].includes(String(c.values.data_type)))
                .map((c) => ({ ...param(taken, String(c.values.field_path ?? 'field'), { ...c.values, is_criteria: false, column_width: null }), refKey: c.refKey })),
            };
            return { node: { key: newKey(), kind: 'action', values: buttonValues('add', t('Add')), formKey: form.key, children: [] }, screen: form };
          },
        },
      ];
    }
  }
}

/** A node's name on the canvas and in the outline. */
export function nodeLabel(n: StudioNode): string {
  if (n.kind === 'action') return n.values.label || t('Button');
  return String(n.values.label_name || n.values.field_path || t('Untitled'));
}

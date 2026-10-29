import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button as AriaButton } from 'react-aria-components';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Asterisk01,
  ChevronRight,
  Copy01,
  Edit05,
  Eye,
  EyeOff,
  FilterLines,
  Folder,
  Grid01,
  Menu01,
  PlayCircle,
  Plus,
  ReverseLeft,
  ReverseRight,
  Save01,
  SearchLg,
  Settings01,
  Trash01,
} from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaType } from '../../lib/metaApi';
import { pageApi, type PageItem, type Widget } from '../../lib/pageApi';
import { studioApi } from '../../lib/studioApi';
import type { MetaParam } from '../../lib/metaApi';
import { PageCanvas, fromItems, type PageDraft } from '../metas/PageDesigner';
import { ComboField } from '../../components/ComboField';
import { Alert } from '../../components/ui';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { ContextMenu, pointOf, type MenuEntry, type MenuPoint } from '../../components/ContextMenu';
import { LogoMark } from '../../components/AppShell';
import { Button } from '@/components/base/buttons/button';
import { Dropdown } from '@/components/base/dropdown/dropdown';
import { Input } from '@/components/base/input/input';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { cx } from '@/utils/cx';
import { clearRenderCache } from '../../render/definitions';
import { DrilldownHost } from '../../render/DrilldownHost';
import { MetaView } from '../../render/MetaView';
import { StudioCanvas, type CanvasCtx, type DropHint, type DropWhere } from './StudioCanvas';
import { ActionInspector, MetaInspector, ParamInspector, targetValue, type Target } from './StudioInspector';
import {
  MAX_DEPTH,
  SCREEN_TYPES,
  actionsOf,
  appFields,
  appSnapshot,
  depthOf,
  duplicateNode,
  fieldNames,
  findNode,
  fromActions,
  fromParams,
  insertNode,
  isContainer,
  isScreenType,
  linkedScreen,
  locateNode,
  nodeLabel,
  lookupsFor,
  paletteFor,
  reachable,
  removeNode,
  screenKey,
  screenSnapshot,
  siblingsOf,
  toScreen,
  toStructure,
  updateNode,
  type ActionValues,
  type Made,
  type PaletteItem,
  type PaletteLookup,
  type ParamValues,
  type Screen,
  type ScreenMeta,
  type ScreenType,
  type StudioMode,
  type StudioNode,
} from './tree';
import { t } from '@/i18n';

/** What is being edited: the app (its fields and menu) and the screens opened or made in it. Undo steps through these. */
interface Doc {
  app: Meta;
  nodes: StudioNode[];
  screens: Record<string, Screen>;
}

type Drag = { kind: 'node'; key: string } | { kind: 'palette'; item: PaletteItem };

const MODE_ICONS: Record<StudioMode, FC<{ className?: string }>> = {
  app: Menu01,
  ...(Object.fromEntries(SCREEN_TYPES.map((s) => [s.code, s.icon])) as Record<ScreenType, FC<{ className?: string }>>),
};
const height = (n: StudioNode): number => (n.children.length ? 1 + Math.max(...n.children.map(height)) : 0);
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
const screenMeta = (m: Meta): ScreenMeta => ({ name: m.name, code: m.code, label_name: m.label_name, table_name: m.table_name, description: m.description, is_active: m.is_active });
const typeName = (type: StudioMode) => (type === 'app' ? t('App') : t(SCREEN_TYPES.find((s) => s.code === type)!.label));

/**
 * The builder studio: an app is opened and built in one place. Its menu is the first canvas;
 * dropping a new datagrid, form or tab set on it makes that screen (at Save) and opens it here,
 * to add its fields, buttons and the forms they open. A menu bar and toolbar on top, the
 * components on the left, the canvas in the middle, the picked thing's properties on the right.
 * Changes stay here (with undo) until Save, which writes them all in one request.
 */
export default function StudioPage() {
  const { id } = useParams();
  const appId = id ? Number(id) : null;
  const navigate = useNavigate();

  const [types, setTypes] = useState<MetaType[]>([]);
  const [options, setOptions] = useState<MetaOption[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null);
  // What was last saved, as snapshots: the app, and each loaded screen by key.
  const [saved, setSaved] = useState<{ app: string; screens: Record<string, string> }>({ app: '', screens: {} });
  // The screens opened, from the app down: the last one is on the canvas.
  const [path, setPath] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [leftTab, setLeftTab] = useState<'components' | 'explorer'>('components');
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<'new' | 'open' | 'shortcuts' | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);
  const [menu, setMenu] = useState<{ key: string | null; at: MenuPoint } | null>(null);

  // Undo and redo: earlier and later documents. last lets quick typing count as one step.
  const history = useRef<{ past: Doc[]; future: Doc[]; last?: { key: string; at: number } }>({ past: [], future: [] });
  const [, setHistoryTick] = useState(0);

  const loadOptions = useCallback(() => metaApi.options().then(setOptions), []);
  useEffect(() => {
    Promise.all([metaApi.types(), loadOptions()]).then(
      ([ts]) => setTypes(ts),
      (err) => setError(err instanceof ApiError ? err.message : t('The studio could not be loaded.')),
    );
  }, [loadOptions]);

  useEffect(() => {
    setDoc(null);
    setPath([]);
    setSelected(null);
    setPreview(false);
    setError(null);
    history.current = { past: [], future: [] };
    if (!appId) return;
    let live = true;
    (async () => {
      try {
        const app = await metaApi.get(appId);
        if (app.type?.code !== 'app') {
          throw new ApiError(422, t('The studio opens apps. "{name}" is a {type}: open the app it belongs to, and design it from there.', { name: app.name, type: app.type?.name ?? t('meta without a type') }));
        }
        const nodes = fromParams(await metaApi.params(appId));
        if (!live) return;
        setDoc({ app, nodes, screens: {} });
        setSaved({ app: appSnapshot(app, nodes), screens: {} });
      } catch (err) {
        if (live) setError(err instanceof ApiError ? err.message : t('This app could not be loaded.'));
      }
    })();
    return () => {
      live = false;
    };
  }, [appId]);

  // Undoing the drop that made a screen takes it away; don't stay inside it.
  const openKey = path.filter((k) => doc?.screens[k]).at(-1) ?? null;
  const screen = doc && openKey ? doc.screens[openKey] : null;
  const mode: StudioMode = screen ? screen.type : 'app';
  const nodes = doc ? (screen ? screen.nodes : doc.nodes) : [];

  const reach = useMemo(() => (doc ? reachable(doc.nodes, doc.screens) : new Set<string>()), [doc]);
  const changedScreens = doc ? Object.values(doc.screens).filter((s) => (s.id ? screenSnapshot(s) !== saved.screens[s.key] : reach.has(s.key))) : [];
  const appChanged = !!doc && appSnapshot(doc.app, doc.nodes) !== saved.app;
  const dirty = appChanged || changedScreens.length > 0;
  const isDirty = (s: Screen) => changedScreens.includes(s);
  const current = selected ? findNode(nodes, selected) : null;

  // The widget library, loaded the first time a page is on the canvas.
  const [library, setLibrary] = useState<Widget[] | null>(null);
  useEffect(() => {
    if (mode !== 'page' || library) return;
    pageApi.widgets().then(
      (ws) => setLibrary(ws.filter((w) => w.is_active)),
      (err) => setError(err instanceof ApiError ? err.message : t('The widget library could not be loaded.')),
    );
  }, [mode, library]);

  const palette = useMemo(() => (doc ? paletteFor(mode) : []), [mode, !!doc]);
  const lookups = useMemo(() => lookupsFor(mode), [mode]);
  // Bumped after each pick, so a lookup starts empty again.
  const [found, setFound] = useState(0);
  // What a lookup offers: never the app or the screen being designed.
  const selfIds = doc ? [doc.app.id, ...(screen?.id ? [screen.id] : [])] : [];

  /** Everything something can point at: saved metas (under their new names here) and new screens. */
  const targets = useMemo<Target[]>(() => {
    if (!doc) return [];
    const byId = new Map(Object.values(doc.screens).filter((s) => s.id).map((s) => [s.id!, s]));
    return [
      ...Object.values(doc.screens)
        .filter((s) => !s.id)
        .map((s) => ({ value: `k:${s.key}`, label: `${s.meta.name} (${t('new')})`, type: s.type })),
      ...options.map((o) => ({ value: String(o.id), label: byId.get(o.id)?.meta.name ?? o.name, type: o.type ?? '' })),
    ];
  }, [doc, options]);
  const targetOf = (n: StudioNode) => (n.kind === 'param' ? targetValue(n.values.ref_meta_id, n.refKey) : targetValue(n.values.form_meta_id, n.formKey));

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ---- Changing the document, with undo. ----

  function change(next: Doc, coalesce?: string) {
    if (!doc) return;
    const h = history.current;
    const now = Date.now();
    if (!(coalesce && h.last?.key === coalesce && now - h.last.at < 1500)) {
      h.past.push(doc);
      if (h.past.length > 100) h.past.shift();
    }
    h.last = coalesce ? { key: coalesce, at: now } : undefined;
    h.future = [];
    setDoc(next);
    setHistoryTick((x) => x + 1);
  }

  /** The document with the open canvas's nodes replaced (and maybe a new screen added). */
  function withNodes(next: StudioNode[], made?: Screen): Doc {
    const d = doc!;
    const screens = made ? { ...d.screens, [made.key]: made } : d.screens;
    return screen ? { ...d, screens: { ...screens, [screen.key]: { ...screen, nodes: next } } } : { ...d, nodes: next, screens };
  }
  const setNodes = (next: StudioNode[], coalesce?: string) => doc && change(withNodes(next), coalesce);

  function undo() {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev || !doc) return;
    h.future.push(doc);
    h.last = undefined;
    setDoc(prev);
    setHistoryTick((x) => x + 1);
  }
  function redo() {
    const h = history.current;
    const next = h.future.pop();
    if (!next || !doc) return;
    h.past.push(doc);
    h.last = undefined;
    setDoc(next);
    setHistoryTick((x) => x + 1);
  }

  // ---- Opening screens. ----

  /** Puts a screen loaded from the server into the document, and into every undo step, as not changed. */
  function addLoaded(s: Screen) {
    const inject = (d: Doc): Doc => (d.screens[s.key] ? d : { ...d, screens: { ...d.screens, [s.key]: s } });
    const h = history.current;
    h.past = h.past.map(inject);
    h.future = h.future.map(inject);
    setDoc((d) => d && inject(d));
    setSaved((sv) => ({ ...sv, screens: { ...sv.screens, [s.key]: screenSnapshot(s) } }));
  }

  /** Opens a screen to design it: one made here, or a saved one (loaded the first time). root: from the app, not from the open one. */
  async function openScreen(target: string, from: 'push' | 'root' = 'push') {
    if (!doc || !target) return;
    let key = target.startsWith('k:') ? target.slice(2) : screenKey(Number(target));
    if (!doc.screens[key]) {
      if (target.startsWith('k:')) return;
      setOpening(true);
      setError(null);
      try {
        const metaId = Number(target);
        const m = await metaApi.get(metaId);
        const type = m.type?.code;
        if (!isScreenType(type)) throw new ApiError(422, t('"{name}" is a {type}; the studio designs datagrids, forms, tab sets and pages.', { name: m.name, type: m.type?.name ?? '' }));
        key = screenKey(metaId);
        if (type === 'page') {
          const page = await pageApi.get(metaId);
          addLoaded({ key, id: metaId, type, meta: screenMeta(m), nodes: [], page: fromItems(page.items, metaId) });
        } else {
          const [params, actions] = await Promise.all([metaApi.params(metaId), type === 'datagrid' ? metaApi.actions(metaId) : Promise.resolve([])]);
          addLoaded({ key, id: metaId, type, meta: screenMeta(m), nodes: [...fromParams(params), ...fromActions(actions)] });
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('That screen could not be loaded.'));
        return;
      } finally {
        setOpening(false);
      }
    }
    setPath((p) => (from === 'root' ? [key] : [...p.filter((k) => k !== key), key]));
    setSelected(null);
    setPreview(false);
  }

  const canOpen = (n: StudioNode) => {
    const target = targetOf(n);
    if (!target) return false;
    const type = targets.find((x) => x.value === target)?.type;
    return n.kind === 'action' ? type === 'form' : isScreenType(type);
  };

  /** Back up to a crumb: 0 is the app menu. */
  function back(to = path.length - 1) {
    setPath((p) => p.slice(0, Math.max(0, to)));
    setSelected(null);
  }

  // ---- Adding, moving and removing. ----

  /** A palette item made into its node (and new screen), with the field names in use. */
  const make = (item: PaletteItem) => item.make({ taken: fieldNames(nodes), screen });

  /** Adds a palette item after the picked node, or into it when it holds others; else at the end. */
  const add = (item: PaletteItem) => addMade(make(item));

  /** Adds an existing meta picked in a lookup, as add() does a palette item. */
  function addFound(lookup: PaletteLookup, id: string) {
    const o = options.find((x) => String(x.id) === id);
    if (!o) return;
    addMade(lookup.make(o, { taken: fieldNames(nodes), screen }));
    setFound((n) => n + 1);
  }

  function addMade(made: Made) {
    if (!doc) return;
    const target = current;
    const at = selected ? locateNode(nodes, selected) : null;
    let next: StudioNode[];
    if (target && target.kind === made.node.kind && isContainer(mode, target) && depthOf(nodes, target.key) < MAX_DEPTH[mode]) next = insertNode(nodes, target.key, target.children.length, made.node);
    else if (at && target?.kind === made.node.kind) next = insertNode(nodes, at.parent, at.index + 1, made.node);
    else next = [...nodes, made.node];
    placed(next, made.node, made.screen);
  }

  /** After a drop or an add: a new screen opened from a menu item or tab opens to be designed (a field's new line form or grid waits for Design). */
  function placed(next: StudioNode[], node: StudioNode, made?: Screen) {
    change(withNodes(next, made));
    if (made && node.kind === 'param' && (mode === 'app' || mode === 'tabs')) {
      setPath((p) => [...p, made.key]);
      setSelected(null);
    } else {
      setSelected(node.key);
    }
  }

  function removeSelected() {
    if (!doc || !selected) return;
    setNodes(removeNode(nodes, selected));
    setSelected(null);
  }

  function duplicateSelected() {
    if (!doc || !current) return;
    const at = locateNode(nodes, current.key)!;
    const copy = duplicateNode(current, fieldNames(nodes));
    setNodes(insertNode(nodes, at.parent, at.index + 1, copy));
    setSelected(copy.key);
  }

  function moveSelected(by: -1 | 1) {
    if (!doc || !current) return;
    const at = locateNode(nodes, current.key)!;
    const index = at.index + by;
    if (index < 0 || index >= siblingsOf(nodes, at.parent).length) return;
    setNodes(insertNode(removeNode(nodes, current.key), at.parent, index, current));
  }

  // ---- Drag and drop. ----

  const end = () => {
    setDrag(null);
    setHint(null);
  };

  const draggedKind = (): StudioNode['kind'] | null => (drag?.kind === 'node' ? (findNode(nodes, drag.key)?.kind ?? null) : drag ? (drag.item.action ? 'action' : 'param') : null);

  function over(key: string | null, where: DropWhere) {
    if (key) {
      const target = findNode(nodes, key);
      // Buttons go among buttons, columns among columns; nothing on or into itself.
      const moving = drag?.kind === 'node' ? findNode(nodes, drag.key) : null;
      if (!target || target.kind !== draggedKind() || key === moving?.key || (moving && findNode(moving.children, key))) {
        if (hint) setHint(null);
        return;
      }
    }
    if (hint?.key !== key || hint?.where !== where) setHint({ key, where });
  }

  function drop() {
    const h = hint;
    const d = drag;
    end();
    if (!doc || !h || !d) return;

    let item: StudioNode;
    let made: Screen | undefined;
    let rest = nodes;
    if (d.kind === 'node') {
      const moving = findNode(nodes, d.key);
      if (!moving || (h.key && (h.key === d.key || findNode(moving.children, h.key)))) return;
      item = moving;
      rest = removeNode(nodes, d.key);
    } else {
      ({ node: item, screen: made } = make(d.item));
    }

    let parent: string | null = null;
    let index = rest.length;
    if (h.where === 'into' && h.key) {
      parent = h.key;
      index = findNode(rest, h.key)?.children.length ?? 0;
    } else if (h.key && h.where !== 'end') {
      const at = locateNode(rest, h.key);
      if (!at) return;
      parent = at.parent;
      index = at.index + (h.where === 'after' ? 1 : 0);
    }

    const depth = parent ? depthOf(rest, parent) + 1 : 0;
    if (depth + height(item) > MAX_DEPTH[mode]) {
      setError(t('That would nest it too deeply.'));
      return;
    }
    setError(null);
    if (d.kind === 'node') {
      setNodes(insertNode(rest, parent, index, item));
      setSelected(item.key);
    } else {
      placed(insertNode(rest, parent, index, item), item, made);
    }
  }

  const targetName = (n: StudioNode) => {
    const target = targetOf(n);
    return target ? (targets.find((x) => x.value === target)?.label ?? null) : null;
  };

  const ctx: CanvasCtx = {
    mode,
    selected,
    select: setSelected,
    active: !!drag,
    draggingKey: drag?.kind === 'node' ? drag.key : null,
    hint,
    startNode: (key) => setDrag({ kind: 'node', key }),
    end,
    over,
    drop,
    targetName,
    canOpen,
    open: (n) => openScreen(targetOf(n)),
    menu: openMenu,
  };

  // ---- The right-click menu. ----

  /** Right-clicking picks what was clicked (nothing, for the canvas), so the entries act on it. */
  function openMenu(key: string | null, at: MenuPoint) {
    setSelected(key);
    setMenu({ key, at });
  }

  /** Flips a yes/no setting of a column or field. */
  const toggle = (n: StudioNode, field: 'is_show' | 'is_criteria' | 'is_required', on: boolean) =>
    setNodes(updateNode(nodes, n.key, (x) => (x.kind === 'param' ? { ...x, values: { ...x.values, [field]: on } } : x)));

  function menuEntries(key: string | null): MenuEntry[] {
    const n = key ? findNode(nodes, key) : null;
    if (!n) {
      // The canvas: add the usual things, undo, and where to go.
      const quick = palette.slice(0, 8);
      return [
        ...quick.map((p) => ({ key: `add-${p.id}`, label: t('Add {name}', { name: p.label }), icon: p.icon, onSelect: () => add(p) })),
        { key: 'sep-1', separator: true },
        { key: 'undo', label: t('Undo'), icon: ReverseLeft, hint: 'Ctrl+Z', disabled: !canUndo, onSelect: undo },
        { key: 'redo', label: t('Redo'), icon: ReverseRight, hint: 'Ctrl+Y', disabled: !canRedo, onSelect: redo },
        { key: 'sep-2', separator: true },
        ...(screen ? [{ key: 'back', label: t('Back to the app menu'), icon: Menu01, hint: 'Esc', onSelect: () => back(0) }] : []),
        { key: 'preview', label: t('Preview'), icon: Eye, onSelect: () => setPreview(true) },
        { key: 'save', label: t('Save'), icon: Save01, hint: 'Ctrl+S', disabled: !dirty, onSelect: save },
      ];
    }
    const at = locateNode(nodes, n.key)!;
    const last = siblingsOf(nodes, at.parent).length - 1;
    const v = n.kind === 'param' ? n.values : null;
    const shown = v?.is_show !== false;
    return [
      ...(canOpen(n) ? [{ key: 'open', label: t('Open {name}', { name: targetName(n) ?? '' }), icon: ArrowRight, hint: 'Enter', onSelect: () => openScreen(targetOf(n)) }] : []),
      { key: 'props', label: t('Properties'), icon: Settings01, onSelect: () => setShowRight(true) },
      { key: 'sep-1', separator: true },
      { key: 'duplicate', label: t('Duplicate'), icon: Copy01, hint: 'Ctrl+D', onSelect: duplicateSelected },
      { key: 'up', label: t('Move earlier'), icon: ArrowUp, hint: 'Alt+↑', disabled: at.index === 0, onSelect: () => moveSelected(-1) },
      { key: 'down', label: t('Move later'), icon: ArrowDown, hint: 'Alt+↓', disabled: at.index === last, onSelect: () => moveSelected(1) },
      { key: 'sep-2', separator: true },
      ...(v ? [{ key: 'show', label: shown ? t('Hide') : t('Show'), icon: shown ? EyeOff : Eye, onSelect: () => toggle(n, 'is_show', !shown) }] : []),
      ...(v && mode === 'datagrid' ? [{ key: 'filter', label: v.is_criteria ? t('Stop filtering by it') : t('Filter by it'), icon: FilterLines, onSelect: () => toggle(n, 'is_criteria', !v.is_criteria) }] : []),
      ...(v && mode === 'form' ? [{ key: 'required', label: v.is_required ? t('Make optional') : t('Make required'), icon: Asterisk01, onSelect: () => toggle(n, 'is_required', !v.is_required) }] : []),
      { key: 'sep-3', separator: true },
      { key: 'delete', label: t('Delete'), icon: Trash01, hint: 'Del', danger: true, onSelect: removeSelected },
    ];
  }

  /** Points a param (menu item, tab, lookup, line form) or a button at a target value. */
  function setTarget(key: string, value: string) {
    const isKey = value.startsWith('k:');
    setNodes(
      updateNode(nodes, key, (n) =>
        n.kind === 'param'
          ? { ...n, refKey: isKey ? value.slice(2) : undefined, values: { ...n.values, ref_meta_id: !isKey && value ? Number(value) : null } }
          : { ...n, formKey: isKey ? value.slice(2) : undefined, values: { ...n.values, form_meta_id: !isKey && value ? Number(value) : null } },
      ),
    );
  }

  /** Makes a new line form or grid for a field that points at nothing, and opens it. */
  function createLinked(key: string) {
    const n = findNode(nodes, key);
    if (!doc || n?.kind !== 'param') return;
    const made = linkedScreen(n.values, screen);
    if (!made) return;
    change(withNodes(updateNode(nodes, key, (x) => (x.kind === 'param' ? { ...x, refKey: made.key, values: { ...x.values, ref_meta_id: null } } : x)), made));
    setPath((p) => [...p, made.key]);
    setSelected(null);
  }

  /** Changes the open screen's own fields (or the app's): name, title, code… */
  function setScreenMeta(patch: Partial<ScreenMeta>) {
    if (!doc) return;
    change(
      screen ? { ...doc, screens: { ...doc.screens, [screen.key]: { ...screen, meta: { ...screen.meta, ...patch } } } } : { ...doc, app: { ...doc.app, ...patch } },
      `meta-${openKey}-${Object.keys(patch).join()}`,
    );
  }

  // ---- Saving. ----

  async function save() {
    if (!doc || !dirty || busy) return;
    // A button must open something; say which, before the server does.
    for (const s of changedScreens) {
      const loose = actionsOf(s.nodes).find((a) => !a.formKey && !a.values.form_meta_id);
      if (loose) {
        setError(t('The button "{label}" on {name} needs a form.', { label: loose.values.label, name: s.meta.name }));
        await openScreen(s.id ? String(s.id) : `k:${s.key}`, 'root');
        setSelected(loose.key);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const res = await studioApi.saveApp(doc.app.id, { meta: appFields(doc.app), items: toStructure(doc.nodes), metas: changedScreens.map(toScreen) });

      // Sent screens come back saved, under keys from their ids; new ones nobody used are dropped.
      const renamed = new Map(res.metas.map((m) => [m.key, screenKey(m.meta.id)]));
      const screens: Record<string, Screen> = {};
      for (const s of Object.values(doc.screens)) {
        if (s.id && !renamed.has(s.key)) screens[s.key] = s;
      }
      for (const m of res.metas) {
        const key = screenKey(m.meta.id);
        const type = m.meta.type!.code as ScreenType;
        screens[key] =
          type === 'page'
            ? { key, id: m.meta.id, type, meta: screenMeta(m.meta), nodes: [], page: fromItems(m.items as PageItem[], m.meta.id) }
            : { key, id: m.meta.id, type, meta: screenMeta(m.meta), nodes: [...fromParams(m.items as MetaParam[]), ...fromActions(m.actions)] };
      }
      const appNodes = fromParams(res.items);

      // A saved node stays picked under its saved key.
      const picked = current?.id ? `${current.kind === 'param' ? 'p' : 'a'}${current.id}` : null;
      setDoc({ app: res.meta, nodes: appNodes, screens });
      setSaved({ app: appSnapshot(res.meta, appNodes), screens: Object.fromEntries(Object.values(screens).map((s) => [s.key, screenSnapshot(s)])) });
      setPath((p) => p.map((k) => renamed.get(k) ?? k).filter((k) => screens[k]));
      setSelected(picked);
      history.current = { past: [], future: [] };
      clearRenderCache();
      setPreviewKey((k) => k + 1);
      loadOptions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The changes could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  /** Goes to another app (or the start), asking first when there are unsaved changes. */
  const go = (to: string) => (dirty ? setLeaveTo(to) : navigate(to));

  // ---- Keyboard shortcuts. ----

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') {
      e.preventDefault();
      save();
      return;
    }
    if (isTyping(e.target) || !doc) return;
    if (mod && k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    } else if (mod && k === 'd') {
      e.preventDefault();
      duplicateSelected();
    } else if ((k === 'delete' || k === 'backspace') && selected) {
      e.preventDefault();
      removeSelected();
    } else if (k === 'escape') {
      // Esc picks nothing; with nothing picked it goes back up.
      if (selected) setSelected(null);
      else if (path.length) back();
    } else if (k === 'enter' && current && canOpen(current) && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      openScreen(targetOf(current));
    } else if (e.altKey && (k === 'arrowup' || k === 'arrowleft')) {
      e.preventDefault();
      moveSelected(-1);
    } else if (e.altKey && (k === 'arrowdown' || k === 'arrowright')) {
      e.preventDefault();
      moveSelected(1);
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // ---- The menu bar. ----

  const h = history.current;
  const canUndo = h.past.length > 0;
  const canRedo = h.future.length > 0;
  const runId = screen ? screen.id : doc?.app.id;
  const runUrl = runId ? `/run/${runId}` : null;

  function act(key: string) {
    if (key.startsWith('insert-')) {
      const item = palette.find((p) => p.id === key.slice(7));
      return item && add(item);
    }
    switch (key) {
      case 'new':
        return setDialog('new');
      case 'open':
        return setDialog('open');
      case 'save':
        return save();
      case 'classic':
        return doc && go(`/metas/${screen?.id ?? doc.app.id}`);
      case 'run':
        return runUrl && window.open(runUrl, '_blank');
      case 'close':
        return go('/studio');
      case 'undo':
        return undo();
      case 'redo':
        return redo();
      case 'duplicate':
        return duplicateSelected();
      case 'delete':
        return removeSelected();
      case 'up':
        return moveSelected(-1);
      case 'down':
        return moveSelected(1);
      case 'deselect':
        return setSelected(null);
      case 'menu':
        return back(0);
      case 'design':
        return setPreview(false);
      case 'preview':
        return setPreview(true);
      case 'left':
        return setShowLeft((s) => !s);
      case 'right':
        return setShowRight((s) => !s);
      case 'explorer':
        setShowLeft(true);
        return setLeftTab('explorer');
      case 'shortcuts':
        return setDialog('shortcuts');
    }
  }

  const menus: { label: string; items: ({ id: string; label: string; addon?: string; icon?: FC<{ className?: string }>; disabled?: boolean } | 'sep')[] }[] = [
    {
      label: t('File'),
      items: [
        { id: 'new', label: t('New app…'), icon: Plus },
        { id: 'open', label: t('Open app…'), icon: Folder },
        'sep',
        { id: 'save', label: t('Save'), addon: 'Ctrl+S', icon: Save01, disabled: !dirty },
        { id: 'run', label: t('Run in a new tab'), icon: PlayCircle, disabled: !runUrl },
        { id: 'classic', label: t('Open in meta builder'), icon: Settings01, disabled: !doc || (!!screen && !screen.id) },
        'sep',
        { id: 'close', label: t('Close'), disabled: !doc },
      ],
    },
    {
      label: t('Edit'),
      items: [
        { id: 'undo', label: t('Undo'), addon: 'Ctrl+Z', icon: ReverseLeft, disabled: !canUndo },
        { id: 'redo', label: t('Redo'), addon: 'Ctrl+Y', icon: ReverseRight, disabled: !canRedo },
        'sep',
        { id: 'duplicate', label: t('Duplicate'), addon: 'Ctrl+D', icon: Copy01, disabled: !current },
        { id: 'delete', label: t('Delete'), addon: 'Del', icon: Trash01, disabled: !current },
        { id: 'up', label: t('Move earlier'), addon: 'Alt+↑', icon: ArrowUp, disabled: !current },
        { id: 'down', label: t('Move later'), addon: 'Alt+↓', icon: ArrowDown, disabled: !current },
        'sep',
        { id: 'deselect', label: t('Select none'), addon: 'Esc', disabled: !current },
      ],
    },
    {
      label: t('View'),
      items: [
        { id: 'menu', label: t('Back to the app menu'), icon: Menu01, disabled: !screen },
        'sep',
        { id: 'design', label: t('Design'), icon: Edit05, disabled: !doc },
        { id: 'preview', label: t('Preview'), icon: Eye, disabled: !doc },
        'sep',
        { id: 'left', label: showLeft ? t('Hide components') : t('Show components') },
        { id: 'explorer', label: t('Explorer') },
        { id: 'right', label: showRight ? t('Hide properties') : t('Show properties') },
      ],
    },
    {
      label: t('Insert'),
      items: palette.length ? palette.slice(0, 18).map((p) => ({ id: `insert-${p.id}`, label: p.label, icon: p.icon })) : [{ id: 'none', label: t('Open an app first'), disabled: true }],
    },
    { label: t('Help'), items: [{ id: 'shortcuts', label: t('Keyboard shortcuts') }] },
  ];

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, PaletteItem[]>();
    for (const p of palette) {
      if (q && !`${p.label} ${p.hint ?? ''}`.toLowerCase().includes(q)) continue;
      map.set(p.group, [...(map.get(p.group) ?? []), p]);
    }
    return [...map.entries()];
  }, [palette, search]);

  const crumbs = doc
    ? [
        { key: null as string | null, name: doc.app.name, type: 'app' as StudioMode },
        ...path.filter((k) => doc.screens[k]).map((k) => ({ key: k as string | null, name: doc.screens[k].meta.name, type: doc.screens[k].type as StudioMode })),
      ]
    : [];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-primary text-primary">
      {/* Title and menu bar */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-secondary px-3">
        <Link to="/metas" aria-label={t('Back to metas')} className="flex items-center rounded-md outline-focus-ring focus-visible:outline-2">
          <LogoMark />
        </Link>
        <span className="text-sm font-semibold text-primary">{t('Studio')}</span>
        <nav className="flex items-center" aria-label={t('Menu bar')}>
          {menus.map((menu) => (
            <Dropdown.Root key={menu.label}>
              <AriaButton className="rounded-md px-2.5 py-1 text-sm text-secondary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 pressed:bg-primary_hover">{menu.label}</AriaButton>
              <Dropdown.Popover placement="bottom start" className="w-64">
                <Dropdown.Menu onAction={(key) => act(String(key))} disabledKeys={menu.items.flatMap((i) => (i !== 'sep' && i.disabled ? [i.id] : []))}>
                  {menu.items.map((i, n) => (i === 'sep' ? <Dropdown.Separator key={`sep-${n}`} /> : <Dropdown.Item key={i.id} id={i.id} label={i.label} addon={i.addon} icon={i.icon} />))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown.Root>
          ))}
        </nav>
        {doc && (
          <span className="ml-auto flex items-center gap-2 text-sm text-tertiary">
            <span className={cx('size-2 shrink-0 rounded-full', dirty ? 'bg-warning-solid' : 'bg-success-solid')} />
            {dirty ? t('{n} unsaved', { n: changedScreens.length + (appChanged ? 1 : 0) }) : t('Saved')}
          </span>
        )}
      </header>

      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-secondary bg-secondary_alt px-2" role="toolbar" aria-label={t('Toolbar')}>
        <Tool icon={Plus} label={t('New app…')} onPress={() => setDialog('new')} />
        <Tool icon={Folder} label={t('Open app…')} onPress={() => setDialog('open')} />
        <Tool icon={Save01} label={t('Save (Ctrl+S)')} onPress={save} disabled={!dirty || busy} />
        <Sep />
        <Tool icon={ReverseLeft} label={t('Undo (Ctrl+Z)')} onPress={undo} disabled={!canUndo} />
        <Tool icon={ReverseRight} label={t('Redo (Ctrl+Y)')} onPress={redo} disabled={!canRedo} />
        <Sep />
        <Tool icon={Copy01} label={t('Duplicate (Ctrl+D)')} onPress={duplicateSelected} disabled={!current} />
        <Tool icon={ArrowUp} label={t('Move earlier')} onPress={() => moveSelected(-1)} disabled={!current} />
        <Tool icon={ArrowDown} label={t('Move later')} onPress={() => moveSelected(1)} disabled={!current} />
        <Tool icon={Trash01} label={t('Delete (Del)')} onPress={removeSelected} disabled={!current} danger />
        <Sep />
        <div className="flex rounded-lg bg-primary p-0.5 ring-1 ring-secondary" role="group" aria-label={t('Mode')}>
          {[
            { on: !preview, label: t('Design'), icon: Edit05, press: () => setPreview(false) },
            { on: preview, label: t('Preview'), icon: Eye, press: () => setPreview(true) },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              disabled={!doc}
              aria-pressed={b.on}
              onClick={b.press}
              className={cx('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium outline-focus-ring focus-visible:outline-2 disabled:opacity-50', b.on ? 'bg-secondary text-primary' : 'text-tertiary hover:text-secondary')}
            >
              <b.icon className="size-4" />
              {b.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 pl-2">
          {runUrl && (
            <Button size="sm" color="secondary" iconLeading={PlayCircle} onPress={() => window.open(runUrl, '_blank')}>
              {t('Run')}
            </Button>
          )}
          <Button size="sm" iconLeading={Save01} isDisabled={!dirty} isLoading={busy} showTextWhileLoading onPress={save}>
            {dirty ? t('Save') : t('Saved')}
          </Button>
        </div>
      </div>

      {/* Where we are: the app, then the screens opened from it */}
      {doc && (
        <nav className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-secondary px-3 text-sm" aria-label={t('Where you are')}>
          {crumbs.map((c, i) => {
            const Icon = MODE_ICONS[c.type];
            const last = i === crumbs.length - 1;
            const s = c.key ? doc.screens[c.key] : null;
            return (
              <span key={c.key ?? 'app'} className="flex shrink-0 items-center gap-1">
                {i > 0 && <ChevronRight className="size-4 text-fg-quaternary" />}
                <button
                  type="button"
                  disabled={last}
                  onClick={() => back(i)}
                  aria-current={last ? 'page' : undefined}
                  className={cx('flex items-center gap-1.5 rounded-md px-2 py-1 outline-focus-ring focus-visible:outline-2', last ? 'font-semibold text-primary' : 'text-tertiary hover:bg-primary_hover hover:text-secondary')}
                >
                  <Icon className="size-4 text-fg-quaternary" />
                  {c.name}
                  {s && !s.id && <span className="rounded bg-brand-primary_alt px-1 text-xs font-medium text-brand-secondary">{t('new')}</span>}
                  {(s ? isDirty(s) : appChanged) && <span className="size-1.5 rounded-full bg-warning-solid" title={t('Unsaved changes')} />}
                </button>
              </span>
            );
          })}
          <span className="ml-2 shrink-0 text-xs text-quaternary">{typeName(mode)}</span>
          {opening && <span className="ml-auto shrink-0 text-xs text-tertiary">{t('Opening…')}</span>}
        </nav>
      )}

      {error && (
        <div className="shrink-0 px-3 pt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Body */}
      {!appId ? (
        <StartScreen options={options} onNew={() => setDialog('new')} onOpen={(mid) => navigate(`/studio/${mid}`)} />
      ) : !doc ? (
        !error && <div className="m-6 h-80 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
      ) : (
        <div className="flex min-h-0 flex-1">
          {showLeft && !preview && mode !== 'page' && (
            <aside className="flex w-64 shrink-0 flex-col border-r border-secondary" aria-label={t('Components')}>
              <div className="flex shrink-0 border-b border-secondary text-sm font-medium">
                {(['components', 'explorer'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={leftTab === tab}
                    onClick={() => setLeftTab(tab)}
                    className={cx('flex-1 border-b-2 py-2.5 outline-focus-ring focus-visible:outline-2', leftTab === tab ? 'border-fg-brand-primary_alt text-brand-secondary' : 'border-transparent text-tertiary')}
                  >
                    {tab === 'components' ? t('Components') : t('Explorer')}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {leftTab === 'components' ? (
                  <>
                    <Input size="sm" icon={SearchLg} placeholder={t('Search components')} value={search} onChange={setSearch} aria-label={t('Search components')} />
                    <p className="mt-2 mb-3 text-xs text-tertiary">{t('Drag onto the canvas, or click to add after the picked one.')}</p>
                    {groups.map(([group, items]) => (
                      <div key={group} className="mb-4">
                        <p className="mb-1.5 text-xs font-semibold tracking-wide text-quaternary uppercase">{group}</p>
                        <ul className="space-y-1">
                          {items.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = 'copyMove';
                                  e.dataTransfer.setData('text/plain', p.id);
                                  setDrag({ kind: 'palette', item: p });
                                }}
                                onDragEnd={end}
                                onClick={() => add(p)}
                                title={p.hint}
                                className="flex w-full cursor-grab items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-secondary ring-1 ring-secondary outline-focus-ring ring-inset hover:bg-primary_hover focus-visible:outline-2 active:cursor-grabbing"
                              >
                                <p.icon className="size-4 shrink-0 text-fg-quaternary" />
                                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                                {p.hint && <span className="max-w-[40%] truncate text-xs font-normal text-quaternary">{p.hint}</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {!groups.length && search.trim() !== '' && <p className="mb-4 text-sm text-tertiary">{t('Nothing matches.')}</p>}
                    {lookups.map((l) => (
                      <div key={l.id} className="mb-4">
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-quaternary uppercase">
                          <l.icon className="size-3.5" />
                          {l.group}
                        </p>
                        <ComboField
                          key={`${l.id}-${openKey ?? 'app'}-${found}`}
                          aria-label={l.group}
                          size="sm"
                          placeholder={l.placeholder}
                          items={options
                            .filter((o) => l.types.includes(o.type ?? '') && !selfIds.includes(o.id))
                            .map((o) => ({ id: String(o.id), label: l.types.length === 1 ? o.name : `${o.name} (${o.type})` }))}
                          value=""
                          onChange={(v) => v && addFound(l, v)}
                          hint={t('Added after the picked one, or at the end.')}
                        />
                      </div>
                    ))}
                  </>
                ) : (
                  <Explorer
                    doc={doc}
                    openKey={openKey}
                    reach={reach}
                    isDirty={isDirty}
                    appChanged={appChanged}
                    onApp={() => back(0)}
                    onScreen={(s) => openScreen(s.id ? String(s.id) : `k:${s.key}`, 'root')}
                    nodes={nodes}
                    selected={selected}
                    onSelect={setSelected}
                    onMenu={openMenu}
                  />
                )}
              </div>
            </aside>
          )}

          <main className="min-h-0 min-w-0 flex-1 overflow-auto bg-secondary_alt">
            {screen?.type === 'page' ? (
              library ? (
                // A page is designed on the page builder's own canvas; its changes join the studio's undo and Save.
                <PageCanvas
                  key={screen.key}
                  className="bg-primary lg:h-full"
                  pageId={screen.id ?? 0}
                  library={library}
                  options={options}
                  drafts={screen.page ?? []}
                  onChange={(next: PageDraft[], coalesce?: string) => change({ ...doc, screens: { ...doc.screens, [screen.key]: { ...screen, page: next } } }, coalesce)}
                  preview={preview}
                  idle={
                    <div className="-m-4">
                      <MetaInspector key={openKey} mode={mode} typeName={typeName(mode)} meta={screen.meta} isNew={!screen.id} onChange={setScreenMeta} />
                    </div>
                  }
                />
              ) : (
                <div className="m-6 h-80 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
              )
            ) : preview ? (
              <Preview screen={screen} dirty={screen ? isDirty(screen) : appChanged} previewKey={previewKey} runUrl={runUrl} />
            ) : (
              <StudioCanvas ctx={ctx} nodes={nodes} title={screen ? screen.meta.label_name || screen.meta.name : doc.app.label_name || doc.app.name} />
            )}
          </main>

          {showRight && !preview && mode !== 'page' && (
            <aside className="w-80 shrink-0 overflow-y-auto border-l border-secondary" aria-label={t('Properties')}>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-secondary bg-primary px-4 py-2.5">
                <p className="text-sm font-semibold text-primary">{t('Properties')}</p>
                {current && (
                  <button type="button" onClick={() => setSelected(null)} className="text-xs font-medium text-brand-secondary hover:underline">
                    {t('Show the {type}', { type: typeName(mode).toLowerCase() })}
                  </button>
                )}
              </div>
              {!current ? (
                <MetaInspector
                  key={openKey ?? 'app'}
                  mode={mode}
                  typeName={typeName(mode)}
                  meta={screen ? screen.meta : screenMeta(doc.app)}
                  isNew={!!screen && !screen.id}
                  onChange={setScreenMeta}
                />
              ) : current.kind === 'param' ? (
                <ParamInspector
                  key={current.key}
                  mode={mode}
                  node={current}
                  targets={targets}
                  self={screen ? targetValue(screen.id, screen.id ? undefined : screen.key) : String(doc.app.id)}
                  onChange={(patch: ParamValues) => setNodes(updateNode(nodes, current.key, (n) => (n.kind === 'param' ? { ...n, values: { ...n.values, ...patch } } : n)), `${current.key}-${Object.keys(patch).join()}`)}
                  onRef={(value) => setTarget(current.key, value)}
                  onCreate={screen ? () => createLinked(current.key) : undefined}
                  onOpen={canOpen(current) ? () => openScreen(targetOf(current)) : undefined}
                />
              ) : (
                <ActionInspector
                  key={current.key}
                  node={current}
                  targets={targets}
                  onChange={(patch: Partial<ActionValues>) => setNodes(updateNode(nodes, current.key, (n) => (n.kind === 'action' ? { ...n, values: { ...n.values, ...patch } } : n)), `${current.key}-${Object.keys(patch).join()}`)}
                  onForm={(value) => setTarget(current.key, value)}
                  onOpen={canOpen(current) ? () => openScreen(targetOf(current)) : undefined}
                />
              )}
            </aside>
          )}
        </div>
      )}

      {/* Status bar */}
      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-secondary px-3 text-xs text-tertiary">
        <span>{doc ? t('{n} items', { n: screen?.type === 'page' ? countDrafts(screen.page ?? []) : countNodes(nodes) }) : t('Nothing open')}</span>
        {current && <span>{t('Picked: {name}', { name: nodeLabel(current) })}</span>}
        {current && canOpen(current) && <span>{t('Enter or double-click opens it')}</span>}
        <span className="ml-auto">{dirty ? t('Unsaved changes') : doc ? t('All changes saved') : ''}</span>
      </footer>

      {menu && doc && (
        <ContextMenu
          at={menu.at}
          title={menu.key ? nodeLabel(findNode(nodes, menu.key) ?? nodes[0]) : (screen?.meta.name ?? doc.app.name)}
          entries={menuEntries(menu.key)}
          onClose={() => setMenu(null)}
        />
      )}

      {dialog === 'new' && (
        <NewAppDialog
          types={types}
          onClose={() => setDialog(null)}
          onCreated={(m) => {
            setDialog(null);
            loadOptions();
            go(`/studio/${m.id}`);
          }}
        />
      )}
      {dialog === 'open' && (
        <OpenDialog
          options={options}
          onClose={() => setDialog(null)}
          onOpen={(mid) => {
            setDialog(null);
            go(`/studio/${mid}`);
          }}
        />
      )}
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {leaveTo && (
        <ConfirmDialog
          title={t('Leave without saving?')}
          message={t('Your changes to {name} will be lost.', { name: doc?.app.name ?? '' })}
          confirmLabel={t('Discard changes')}
          onConfirm={() => {
            const to = leaveTo;
            setLeaveTo(null);
            setDoc(null);
            navigate(to);
          }}
          onCancel={() => setLeaveTo(null)}
        />
      )}
    </div>
  );
}

const countNodes = (nodes: StudioNode[]): number => nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
const countDrafts = (drafts: PageDraft[]): number => drafts.reduce((sum, d) => sum + 1 + countDrafts(d.children), 0);

function Tool({ icon: Icon, label, onPress, disabled, danger }: { icon: FC<{ className?: string }>; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <ButtonUtility
      size="sm"
      color="tertiary"
      icon={Icon}
      tooltip={label}
      tooltipPlacement="bottom"
      aria-label={label}
      isDisabled={disabled}
      onPress={onPress}
      className={cx('shrink-0', danger && 'hover:bg-error-primary hover:text-fg-error-primary')}
    />
  );
}

const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-border-secondary" aria-hidden="true" />;

/** The app and the screens open in the studio, and the parts of the one on the canvas. */
function Explorer({
  doc,
  openKey,
  reach,
  isDirty,
  appChanged,
  onApp,
  onScreen,
  nodes,
  selected,
  onSelect,
  onMenu,
}: {
  doc: Doc;
  openKey: string | null;
  reach: Set<string>;
  isDirty: (s: Screen) => boolean;
  appChanged: boolean;
  onApp: () => void;
  onScreen: (s: Screen) => void;
  nodes: StudioNode[];
  selected: string | null;
  onSelect: (key: string) => void;
  onMenu: (key: string, at: MenuPoint) => void;
}) {
  const row = (on: boolean) => cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-focus-ring focus-visible:outline-2', on ? 'bg-brand-primary_alt font-semibold text-brand-secondary' : 'text-secondary hover:bg-primary_hover');
  const screens = Object.values(doc.screens);
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-quaternary uppercase">{t('App')}</p>
        <button type="button" onClick={onApp} aria-pressed={!openKey} className={row(!openKey)}>
          <Menu01 className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{doc.app.name}</span>
          {appChanged && <span className="size-1.5 rounded-full bg-warning-solid" />}
        </button>
        <ul className="mt-1 ml-3 space-y-0.5 border-l border-secondary pl-2">
          {screens.map((s) => {
            const Icon = MODE_ICONS[s.type];
            const unused = !s.id && !reach.has(s.key);
            return (
              <li key={s.key}>
                <button type="button" onClick={() => onScreen(s)} aria-pressed={openKey === s.key} className={cx(row(openKey === s.key), unused && 'opacity-50')} title={unused ? t('Nothing opens it: it is dropped at Save.') : undefined}>
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{s.meta.name}</span>
                  {!s.id && <span className="text-xs font-normal text-brand-secondary">{t('new')}</span>}
                  {isDirty(s) && <span className="size-1.5 rounded-full bg-warning-solid" />}
                </button>
              </li>
            );
          })}
          {!screens.length && <li className="px-2 py-1 text-xs text-quaternary">{t('Screens you open or make show here.')}</li>}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-quaternary uppercase">{t('On the canvas')}</p>
        <Outline nodes={nodes} selected={selected} onSelect={onSelect} onMenu={onMenu} />
      </div>
    </div>
  );
}

/** The parts as a tree, for picking ones that are hard to click on the canvas. */
function Outline({ nodes, selected, onSelect, onMenu, depth = 0 }: { nodes: StudioNode[]; selected: string | null; onSelect: (key: string) => void; onMenu: (key: string, at: MenuPoint) => void; depth?: number }) {
  if (!nodes.length && depth === 0) return <p className="text-sm text-tertiary">{t('Nothing here yet.')}</p>;
  return (
    <ul className="space-y-0.5">
      {nodes.map((n) => (
        <li key={n.key}>
          <button
            type="button"
            onClick={() => onSelect(n.key)}
            onContextMenu={(e) => {
              e.preventDefault();
              onMenu(n.key, pointOf(e));
            }}
            aria-pressed={selected === n.key}
            style={{ paddingLeft: 8 + depth * 16 }}
            className={cx('flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm outline-focus-ring focus-visible:outline-2', selected === n.key ? 'bg-brand-primary_alt font-semibold text-brand-secondary' : 'text-secondary hover:bg-primary_hover')}
          >
            <span className="min-w-0 flex-1 truncate">{nodeLabel(n)}</span>
            <span className="shrink-0 text-xs text-quaternary">{n.kind === 'action' ? t('button') : n.values.data_type}</span>
          </button>
          {n.children.length > 0 && <Outline nodes={n.children} selected={selected} onSelect={onSelect} onMenu={onMenu} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

/** How it will look: a saved screen as last saved; the app runs on its own. */
function Preview({ screen, dirty, previewKey, runUrl }: { screen: Screen | null; dirty: boolean; previewKey: number; runUrl: string | null }) {
  if (!screen || !screen.id) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-md font-semibold text-primary">{screen ? t('{name} is made at Save.', { name: screen.meta.name }) : t('An app opens on its own, with its menu.')}</p>
        <p className="text-sm text-tertiary">{dirty || screen ? t('Save first, then run it to see your changes.') : t('Run it in a new tab to try the menu.')}</p>
        {runUrl && <Button iconLeading={PlayCircle} onPress={() => window.open(runUrl, '_blank')}>{t('Run the app')}</Button>}
      </div>
    );
  }
  return (
    <div className="p-6">
      {dirty && (
        <div className="mb-4 rounded-lg bg-warning-primary px-4 py-2.5 text-sm text-warning-primary ring-1 ring-warning_subtle">{t('This shows the last saved version. Save to see your changes.')}</div>
      )}
      <DrilldownHost>
        <MetaView key={previewKey} metaId={screen.id} />
      </DrilldownHost>
    </div>
  );
}

/** With nothing open: make a new app or open one. */
function StartScreen({ options, onNew, onOpen }: { options: MetaOption[]; onNew: () => void; onOpen: (id: number) => void }) {
  const apps = options.filter((o) => o.type === 'app');
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-secondary_alt">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-display-xs font-semibold text-primary">{t('Builder studio')}</h1>
        <p className="mt-1 text-md text-tertiary">{t('Open an app to build its menu, and the datagrids, forms and tabs it opens, by dragging components onto a canvas.')}</p>
        <button
          type="button"
          onClick={onNew}
          className="mt-8 flex w-full items-center gap-4 rounded-xl bg-primary px-5 py-5 text-left shadow-xs ring-1 ring-secondary outline-focus-ring hover:ring-brand focus-visible:outline-2"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-brand-primary_alt">
            <Plus className="size-5 text-fg-brand-primary" />
          </span>
          <span>
            <span className="block text-md font-semibold text-primary">{t('New app')}</span>
            <span className="block text-sm text-tertiary">{t('Start with an empty menu.')}</span>
          </span>
        </button>
        <h2 className="mt-10 mb-3 text-sm font-semibold text-secondary">{t('Open an app')}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {apps.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => onOpen(o.id)} className="flex w-full items-center gap-3 rounded-xl bg-primary px-4 py-3.5 text-left text-sm shadow-xs ring-1 ring-secondary outline-focus-ring hover:ring-brand focus-visible:outline-2">
                <Grid01 className="size-5 text-fg-quaternary" />
                <span className="min-w-0 flex-1 truncate font-medium text-primary">{o.name}</span>
                <span className="truncate text-xs text-quaternary">{o.code}</span>
              </button>
            </li>
          ))}
          {!apps.length && <li className="text-sm text-tertiary">{t('No apps yet.')}</li>}
        </ul>
      </div>
    </div>
  );
}

function NewAppDialog({ types, onClose, onCreated }: { types: MetaType[]; onClose: () => void; onCreated: (m: Meta) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const shownCode = codeTouched ? code : slug(name) ? `${slug(name)}_app` : '';

  async function create() {
    const typeId = types.find((x) => x.code === 'app')?.id;
    if (!typeId || !name.trim() || !shownCode) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await metaApi.create({ code: shownCode, name: name.trim(), type_id: typeId, is_active: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('It could not be made.'));
      setBusy(false);
    }
  }

  return (
    <Modal title={t('New app')} description={t('Its menu, screens, fields and buttons are built in the studio.')} onClose={onClose}>
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <Input label={t('Name')} value={name} onChange={setName} isRequired autoFocus />
        <Input
          label={t('Code')}
          value={shownCode}
          onChange={(v) => {
            setCodeTouched(true);
            setCode(v);
          }}
          hint={t('Unique; letters, digits and _.')}
        />
        <div className="modal-footer flex justify-end gap-3">
          <Button color="secondary" onPress={onClose}>{t('Cancel')}</Button>
          <Button isDisabled={!name.trim() || !shownCode} isLoading={busy} showTextWhileLoading onPress={create}>{t('Create and open')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function OpenDialog({ options, onClose, onOpen }: { options: MetaOption[]; onClose: () => void; onOpen: (id: number) => void }) {
  const [q, setQ] = useState('');
  const list = options.filter((o) => o.type === 'app' && `${o.name} ${o.code}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal title={t('Open app')} description={t('Its screens open from its menu.')} onClose={onClose}>
      <Input icon={SearchLg} placeholder={t('Search by name or code')} value={q} onChange={setQ} aria-label={t('Search')} autoFocus />
      <ul className="mt-3 max-h-96 divide-y divide-secondary overflow-y-auto rounded-lg ring-1 ring-secondary">
        {list.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => onOpen(o.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm outline-focus-ring hover:bg-primary_hover focus-visible:outline-2">
              <Grid01 className="size-4 text-fg-quaternary" />
              <span className="min-w-0 flex-1 truncate font-medium text-primary">{o.name}</span>
              <span className="truncate text-xs text-quaternary">{o.code}</span>
            </button>
          </li>
        ))}
        {!list.length && <li className="px-3 py-6 text-center text-sm text-tertiary">{t('Nothing matches.')}</li>}
      </ul>
    </Modal>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Ctrl+S', t('Save the app and every changed screen')],
    ['Ctrl+Z', t('Undo')],
    ['Ctrl+Y / Ctrl+Shift+Z', t('Redo')],
    ['Ctrl+D', t('Duplicate the picked one')],
    ['Del', t('Delete the picked one')],
    ['Alt+↑ / Alt+↓', t('Move it earlier or later')],
    ['Enter', t('Open the screen the picked one opens')],
    ['Esc', t('Pick nothing; again to go back up')],
  ];
  return (
    <Modal title={t('Keyboard shortcuts')} size="sm" onClose={onClose}>
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-secondary">{v}</dt>
            <dd><kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">{k}</kbd></dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

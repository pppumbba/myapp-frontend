import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Copy01, Eye, Plus, Trash01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption } from '../../lib/metaApi';
import { pageApi, propValues, type PageItem, type PageItemInput, type Widget, type WidgetProp } from '../../lib/pageApi';
import { ComboField } from '../../components/ComboField';
import { Alert, IconAction } from '../../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { cx } from '@/utils/cx';
import { clearRenderCache } from '../../render/definitions';
import { DrilldownHost } from '../../render/DrilldownHost';
import { PAGE_WIDTHS, PageGrid, PageItems, WidgetBlock, clearTemplate, fillSettings, widgetIcon, widthClass } from '../../render/WidgetView';

/** A composite's own setting, offered to its parts as {{key}}. */
type Binding = { key: string; label: string; type: string };

const widthNames: Record<number, string> = { 3: 'Quarter', 4: 'Third', 6: 'Half', 8: 'Two thirds', 9: 'Three quarters', 12: 'Full width' };

/** A placed widget while it is being edited; key is local, param_id/meta_id once saved. */
interface Draft {
  key: string;
  param_id?: number;
  meta_id?: number;
  /** The widget meta belongs to another page or stands alone: editing it changes it everywhere. */
  shared: boolean;
  name: string;
  widget: Widget;
  config: Record<string, unknown>;
  w: number;
  children: Draft[];
}

let nextKey = 1;
const newKey = () => `n${nextKey++}`;

function fromItems(items: PageItem[], pageId: number): Draft[] {
  return items.map((i) => ({
    key: `p${i.param_id}`,
    param_id: i.param_id,
    meta_id: i.meta.id,
    shared: i.meta.ref_meta_id !== pageId,
    name: i.meta.name,
    widget: i.widget,
    config: i.meta.json_config ?? {},
    w: i.w,
    children: fromItems(i.children, pageId),
  }));
}

function toInput(drafts: Draft[]): PageItemInput[] {
  return drafts.map((d) => ({
    param_id: d.param_id,
    meta_id: d.meta_id,
    widget_id: d.widget.id,
    config: d.config,
    w: d.w,
    name: d.name || undefined,
    children: d.children.length ? toInput(d.children) : undefined,
  }));
}

/** The drafts as a page would show them, for the preview. */
function toItems(drafts: Draft[]): PageItem[] {
  return drafts.map((d, i) => ({
    param_id: i + 1,
    label: null,
    w: d.w,
    meta: { id: d.meta_id ?? 0, code: '', name: d.name, ref_meta_id: null, json_config: d.config, widget_id: d.widget.id },
    widget: d.widget,
    children: toItems(d.children),
  }));
}

const isSection = (d: Draft) => d.widget.renderer === 'section';

/** A preview item with a composite's sample settings filled into it. */
const fillItem = (i: PageItem, values: Record<string, unknown>): PageItem => ({
  ...i,
  meta: { ...i.meta, json_config: fillSettings(i.meta.json_config, values) as Record<string, unknown> },
  children: i.children.map((c) => fillItem(c, values)),
});

function find(drafts: Draft[], key: string): Draft | null {
  for (const d of drafts) {
    if (d.key === key) return d;
    const below = find(d.children, key);
    if (below) return below;
  }
  return null;
}

/** Where a draft sits: its parent's key (null at the top) and its index there. */
function locate(drafts: Draft[], key: string, parent: string | null = null): { parent: string | null; index: number } | null {
  for (const [i, d] of drafts.entries()) {
    if (d.key === key) return { parent, index: i };
    const below = locate(d.children, key, d.key);
    if (below) return below;
  }
  return null;
}

function update(drafts: Draft[], key: string, fn: (d: Draft) => Draft): Draft[] {
  return drafts.map((d) => (d.key === key ? fn(d) : { ...d, children: update(d.children, key, fn) }));
}

function remove(drafts: Draft[], key: string): Draft[] {
  return drafts.filter((d) => d.key !== key).map((d) => ({ ...d, children: remove(d.children, key) }));
}

function insert(drafts: Draft[], parent: string | null, index: number, item: Draft): Draft[] {
  if (parent === null) return [...drafts.slice(0, index), item, ...drafts.slice(index)];
  return drafts.map((d) => (d.key === parent ? { ...d, children: insert(d.children, null, index, item) } : { ...d, children: insert(d.children, parent, index, item) }));
}

const siblings = (drafts: Draft[], parent: string | null) => (parent === null ? drafts : (find(drafts, parent)?.children ?? []));

/** A copy that saves as new widget metas (a shared widget stays the same one). */
function duplicate(d: Draft): Draft {
  return { ...d, key: newKey(), param_id: undefined, meta_id: d.shared ? d.meta_id : undefined, name: d.shared ? d.name : '', children: d.children.map(duplicate) };
}

/**
 * Builds a page meta from widgets. The palette is the widget library; each placed widget
 * becomes a widget meta (its settings in json_config) and a param of the page (its place,
 * section and width). Changes stay here until Save, which writes the whole layout.
 *
 * A composite widget's template is built the same way: its parts are widgets, and {{key}} in
 * their settings takes the composite's setting with that key. The preview fills them with
 * the composite's defaults.
 */
export function PageDesigner({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const [library, setLibrary] = useState<Widget[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [saved, setSaved] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [existing, setExisting] = useState('');

  useEffect(() => {
    Promise.all([pageApi.widgets(), pageApi.get(meta.id)]).then(
      ([widgets, page]) => {
        setLibrary(widgets.filter((w) => w.is_active));
        const d = fromItems(page.items, meta.id);
        setDrafts(d);
        setSaved(JSON.stringify(toInput(d)));
      },
      (err) => setError(err instanceof ApiError ? err.message : 'The page could not be loaded.'),
    );
  }, [meta.id]);

  const dirty = drafts !== null && JSON.stringify(toInput(drafts)) !== saved;
  const current = drafts && selected ? find(drafts, selected) : null;
  const categories = useMemo(() => {
    const groups = new Map<string, Widget[]>();
    for (const w of library ?? []) groups.set(w.category, [...(groups.get(w.category) ?? []), w]);
    return [...groups.entries()];
  }, [library]);
  const widgetMetas = options.filter((o) => o.type === 'widget').map((o) => ({ id: String(o.id), label: o.name }));
  // When this is a composite's template: that composite, whose settings the parts may use.
  const composite = library?.find((w) => w.template_meta_id === meta.id) ?? null;
  const bindings: Binding[] = (composite?.props ?? []).map((p) => ({ key: p.key, label: p.label, type: p.type }));
  const sample = composite ? propValues(composite, null) : null;
  // The palette leaves out the composite itself: it can't be one of its own parts.
  const palette = categories.map(([c, list]) => [c, list.filter((w) => w.id !== composite?.id)] as const).filter(([, list]) => list.length);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** Adds after the picked widget, or into it when it is a section; else at the end. */
  function place(item: Draft) {
    if (!drafts) return;
    const at = selected ? locate(drafts, selected) : null;
    const target = selected ? find(drafts, selected) : null;
    if (target && isSection(target)) setDrafts(insert(drafts, target.key, target.children.length, item));
    else if (at) setDrafts(insert(drafts, at.parent, at.index + 1, item));
    else setDrafts([...drafts, item]);
    setSelected(item.key);
  }

  const add = (widget: Widget) =>
    place({ key: newKey(), shared: false, name: '', widget, config: propValues(widget, null), w: ['stat', 'chart'].includes(widget.renderer) ? 6 : 12, children: [] });

  async function addExisting(id: string) {
    if (!id) return;
    try {
      const m = await metaApi.get(Number(id));
      const widget = library?.find((w) => w.id === m.widget_id);
      if (!widget) throw new Error();
      place({ key: newKey(), meta_id: m.id, shared: true, name: m.name, widget, config: m.json_config ?? {}, w: 12, children: [] });
      setExisting('');
    } catch {
      setError('That widget has no active library entry, so it cannot be placed.');
    }
  }

  function move(key: string, by: -1 | 1) {
    if (!drafts) return;
    const at = locate(drafts, key);
    const item = find(drafts, key);
    if (!at || !item) return;
    const index = at.index + by;
    if (index < 0 || index >= siblings(drafts, at.parent).length) return;
    setDrafts(insert(remove(drafts, key), at.parent, index, item));
  }

  /** Drops the dragged widget before the target, or (into) at the end of a section. */
  function drop(e: DragEvent, targetKey: string, into = false) {
    e.preventDefault();
    e.stopPropagation();
    const key = dragging;
    setDragging(null);
    if (!drafts || !key || key === targetKey) return;
    const item = find(drafts, key);
    // A section can't go inside itself.
    if (!item || find(item.children, targetKey)) return;
    const rest = remove(drafts, key);
    if (into) {
      const section = find(rest, targetKey);
      if (section) setDrafts(insert(rest, targetKey, section.children.length, item));
      return;
    }
    const at = locate(rest, targetKey);
    if (at) setDrafts(insert(rest, at.parent, at.index, item));
  }

  async function save() {
    if (!drafts) return;
    setBusy(true);
    setError(null);
    try {
      const page = await pageApi.save(meta.id, toInput(drafts));
      const d = fromItems(page.items, meta.id);
      setDrafts(d);
      setSaved(JSON.stringify(toInput(d)));
      // New widgets get saved keys, so only a widget that was already saved stays picked.
      setSelected((s) => (s && find(d, s) ? s : null));
      clearRenderCache();
      clearTemplate(meta.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The page could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const set = (fn: (d: Draft) => Draft) => current && drafts && setDrafts(update(drafts, current.key, fn));

  function frames(list: Draft[], depth = 0): ReactNode {
    return (
      <PageGrid>
        {list.map((d) => (
          <div
            key={d.key}
            className={cx(widthClass(d.w), 'group relative')}
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = 'move';
              setDragging(d.key);
            }}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => dragging && dragging !== d.key && e.preventDefault()}
            onDrop={(e) => drop(e, d.key)}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={`${d.widget.name}${d.name ? `: ${d.name}` : ''}`}
              aria-pressed={selected === d.key}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(d.key);
              }}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setSelected(d.key);
                }
              }}
              className={cx(
                'relative rounded-xl p-2 outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2',
                selected === d.key ? 'ring-2 ring-brand' : 'ring-1 ring-transparent hover:ring-secondary',
                dragging === d.key && 'opacity-40',
              )}
            >
              <span className={cx('absolute -top-2.5 left-3 z-10 rounded-md bg-primary px-1.5 text-xs font-medium ring-1 ring-secondary', selected === d.key ? 'text-brand-secondary' : 'text-tertiary opacity-0 group-hover:opacity-100')}>
                {d.widget.name}
                {d.shared ? ' · shared' : ''}
              </span>
              {selected === d.key && (
                <div className="absolute -top-3.5 right-3 z-10 flex rounded-lg bg-primary shadow-sm ring-1 ring-secondary">
                  <IconAction icon={ArrowUp} label="Move earlier" onPress={() => move(d.key, -1)} />
                  <IconAction icon={ArrowDown} label="Move later" onPress={() => move(d.key, 1)} />
                  <IconAction icon={Copy01} label="Duplicate" onPress={() => drafts && setDrafts(insert(drafts, locate(drafts, d.key)!.parent, locate(drafts, d.key)!.index + 1, duplicate(d)))} />
                  <IconAction
                    icon={Trash01}
                    danger
                    label="Remove"
                    onPress={() => {
                      if (drafts) setDrafts(remove(drafts, d.key));
                      setSelected(null);
                    }}
                  />
                </div>
              )}
              {isSection(d) ? (
                <WidgetBlock widget={d.widget} config={sample ? (fillSettings(d.config, sample) as Record<string, unknown>) : d.config} depth={depth}>
                  {d.children.length ? (
                    frames(d.children, depth + 1)
                  ) : (
                    <div
                      onDragOver={(e) => dragging && e.preventDefault()}
                      onDrop={(e) => drop(e, d.key, true)}
                      className="rounded-lg border border-dashed border-primary px-4 py-6 text-center text-sm text-tertiary"
                    >
                      Pick this section, then add widgets — or drag them here.
                    </div>
                  )}
                </WidgetBlock>
              ) : (
                // The widget is drawn as it will look, but doesn't react while it's being placed.
                <div className="pointer-events-none select-none" inert>
                  <WidgetBlock widget={d.widget} config={sample ? (fillSettings(d.config, sample) as Record<string, unknown>) : d.config} depth={depth} />
                </div>
              )}
            </div>
          </div>
        ))}
      </PageGrid>
    );
  }

  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-labelledby="page-designer-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 id="page-designer-title" className="text-lg font-semibold text-primary">
            Page builder
          </h2>
          <p className="mt-0.5 text-sm text-tertiary">Add widgets from the library, pick one to change its settings, drag to reorder. Sections hold other widgets.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" color="secondary" iconLeading={Eye} onPress={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? 'Back to editing' : 'Preview'}
          </Button>
          <Button size="sm" isDisabled={!dirty} isLoading={busy} showTextWhileLoading onPress={save}>
            {dirty ? 'Save page' : 'Saved'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-4 pt-4 sm:px-5">
          <Alert>{error}</Alert>
        </div>
      )}

      {!drafts || !library ? (
        <div className="m-5 h-80 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
      ) : preview ? (
        <div className="bg-secondary_alt px-4 py-6 sm:px-6">
          <DrilldownHost>{drafts.length ? <PageItems items={sample ? toItems(drafts).map((i) => fillItem(i, sample)) : toItems(drafts)} /> : <p className="py-10 text-center text-sm text-tertiary">Nothing on this page yet.</p>}</DrilldownHost>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)_20rem]">
          <aside className="border-b border-secondary p-4 lg:border-r lg:border-b-0" aria-label="Widget library">
            {palette.map(([category, widgets]) => (
              <div key={category} className="mb-5">
                <p className="mb-2 text-xs font-semibold tracking-wide text-quaternary uppercase">{category}</p>
                <ul className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
                  {widgets.map((w) => {
                    const Icon = widgetIcon(w.icon);
                    return (
                      <li key={w.id}>
                        <button
                          type="button"
                          onClick={() => add(w)}
                          title={w.description ?? undefined}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-secondary outline-focus-ring ring-1 ring-secondary ring-inset hover:bg-primary_hover focus-visible:outline-2"
                        >
                          <Icon className="size-4 shrink-0 text-fg-quaternary" />
                          <span className="min-w-0 flex-1 truncate">{w.name}</span>
                          <Plus className="size-4 shrink-0 text-fg-quaternary" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {widgetMetas.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-quaternary uppercase">Saved widgets</p>
                <ComboField aria-label="Place a saved widget" size="sm" placeholder="Place an existing one…" items={widgetMetas} value={existing} onChange={addExisting} />
              </div>
            )}
          </aside>

          <div className="min-w-0 bg-secondary_alt px-4 py-6 sm:px-6" onClick={() => setSelected(null)}>
            {composite && (
              <div className="mb-5 rounded-xl bg-brand-primary_alt px-4 py-3 text-sm ring-1 ring-secondary ring-inset" onClick={(e) => e.stopPropagation()}>
                <p className="font-semibold text-primary">The parts of the {composite.name} widget</p>
                <p className="mt-0.5 text-secondary">
                  {bindings.length ? (
                    <>
                      Write these in a part’s settings to use the widget’s own:{' '}
                      {bindings.map((b, i) => (
                        <span key={b.key}>
                          {i > 0 && ', '}
                          <code className="rounded bg-primary px-1 font-mono text-xs">{`{{${b.key}}}`}</code> ({b.label})
                        </span>
                      ))}
                      . The preview shows its defaults.
                    </>
                  ) : (
                    'Give the widget settings in the widget library, then use them here as {{key}}.'
                  )}
                </p>
              </div>
            )}
            {drafts.length ? (
              <DrilldownHost>{frames(drafts)}</DrilldownHost>
            ) : (
              <div className="rounded-xl border border-dashed border-primary bg-primary px-6 py-16 text-center">
                <p className="text-md font-semibold text-primary">An empty page</p>
                <p className="mt-1 text-sm text-tertiary">Pick a widget from the library to start. A Banner or Heading is a good first one.</p>
              </div>
            )}
          </div>

          <aside className="border-t border-secondary p-4 lg:border-t-0 lg:border-l" aria-label="Widget settings">
            {current ? (
              <Inspector key={current.key} draft={current} options={options} pageId={meta.id} bindings={bindings} onChange={set} />
            ) : (
              <p className="text-sm text-tertiary">Pick a widget on the page to change its settings.</p>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

/** The picked widget's settings, drawn from its library entry's props. */
function Inspector({ draft, options, pageId, bindings, onChange }: { draft: Draft; options: MetaOption[]; pageId: number; bindings: Binding[]; onChange: (fn: (d: Draft) => Draft) => void }) {
  const Icon = widgetIcon(draft.widget.icon);
  const values = propValues(draft.widget, draft.config);
  const setValue = (key: string, value: unknown) => onChange((d) => ({ ...d, config: { ...d.config, [key]: value } }));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <Icon className="size-5 text-fg-secondary" />
        </span>
        <div className="min-w-0">
          <p className="text-md font-semibold text-primary">{draft.widget.name}</p>
          {draft.widget.description && <p className="text-xs text-tertiary">{draft.widget.description}</p>}
        </div>
      </div>
      {draft.shared && (
        <Badge type="color" size="sm" color="warning">
          Shared: changes show everywhere it’s placed
        </Badge>
      )}

      <NativeSelect
        label="Width"
        value={String(draft.w)}
        onChange={(e) => onChange((d) => ({ ...d, w: Number(e.target.value) }))}
        options={PAGE_WIDTHS.map((w) => ({ value: String(w), label: `${widthNames[w]} (${w}/12)` }))}
      />

      {(draft.widget.props ?? []).map((prop) => (
        <PropField key={prop.key} prop={prop} value={values[prop.key]} options={options} pageId={pageId} bindings={bindings} onChange={(v) => setValue(prop.key, v)} />
      ))}

      <Input
        label="Widget name"
        size="sm"
        placeholder={draft.meta_id ? undefined : `${draft.widget.name} on this page`}
        value={draft.name}
        onChange={(name) => onChange((d) => ({ ...d, name }))}
        hint="How it’s listed among the metas."
      />
    </div>
  );
}

/** One setting, by its type. */
export function PropField({
  prop,
  value,
  options,
  pageId,
  bindings = [],
  onChange,
}: {
  prop: WidgetProp;
  value: unknown;
  options: MetaOption[];
  pageId: number;
  /** In a composite's parts: its settings, which a picker may take instead of a fixed value. */
  bindings?: Binding[];
  onChange: (v: unknown) => void;
}) {
  const text = value == null ? '' : String(value);
  const hint = prop.hint ?? undefined;
  const bound = (type: string) => bindings.filter((b) => b.type === type).map((b) => ({ id: `{{${b.key}}}`, label: `↳ The widget’s “${b.label}”` }));

  switch (prop.type) {
    case 'textarea':
      return <TextArea label={prop.label} rows={4} value={text} onChange={onChange} hint={hint} />;
    case 'number':
      return <Input label={prop.label} size="sm" type="number" value={text} onChange={(v) => onChange(v === '' ? null : Number(v))} hint={hint} />;
    case 'select':
      return (
        <NativeSelect
          label={prop.label}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          hint={hint}
          options={[...(prop.options ?? []).map((o) => ({ value: o, label: o.charAt(0).toUpperCase() + o.slice(1) })), ...bound('select').map((b) => ({ value: b.id, label: b.label }))]}
        />
      );
    case 'boolean':
      return <Toggle label={prop.label} hint={hint} isSelected={value === true} onChange={onChange} />;
    case 'meta': {
      const items = options
        .filter((o) => o.id !== pageId && o.type !== 'widget' && (!prop.meta_types?.length || prop.meta_types.includes(o.type ?? '')))
        .map((o) => ({ id: String(o.id), label: prop.meta_types?.length === 1 ? o.name : `${o.name} (${o.type ?? 'no type'})` }));
      return (
        <ComboField
          label={prop.label}
          size="sm"
          placeholder="Nothing"
          items={[...bound('meta'), ...items]}
          value={text}
          onChange={(v) => onChange(!v ? null : v.startsWith('{{') ? v : Number(v))}
          hint={hint}
        />
      );
    }
    case 'list':
      return <ListField prop={prop} value={value} options={options} pageId={pageId} bindings={bindings} onChange={onChange} />;
    default:
      return (
        <Input
          label={prop.label}
          size="sm"
          type={prop.type === 'url' || prop.type === 'image' ? 'url' : 'text'}
          placeholder={prop.type === 'url' ? 'https://…' : prop.type === 'image' ? 'https://…/picture.jpg' : undefined}
          value={text}
          onChange={onChange}
          hint={hint}
        />
      );
  }
}

/** Rows of a list prop (links, points…), each with the prop's fields. */
function ListField({ prop, value, options, pageId, bindings, onChange }: { prop: WidgetProp; value: unknown; options: MetaOption[]; pageId: number; bindings: Binding[]; onChange: (v: unknown) => void }) {
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const fields = prop.fields ?? [];
  const setRow = (i: number, patch: Record<string, unknown>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const moveRow = (i: number, by: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-secondary">{prop.label}</legend>
      {rows.map((row, i) => (
        <div key={i} className="space-y-3 rounded-lg p-3 ring-1 ring-secondary">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-tertiary">{`${i + 1}. ${String(row[fields[0]?.key] ?? '') || 'New row'}`}</span>
            <div className="flex">
              <IconAction icon={ArrowUp} label={`Move row ${i + 1} up`} onPress={() => i > 0 && moveRow(i, -1)} />
              <IconAction icon={ArrowDown} label={`Move row ${i + 1} down`} onPress={() => i < rows.length - 1 && moveRow(i, 1)} />
              <IconAction icon={Trash01} danger label={`Remove row ${i + 1}`} onPress={() => onChange(rows.filter((_, j) => j !== i))} />
            </div>
          </div>
          {fields.map((f) => (
            <PropField key={f.key} prop={f} value={row[f.key]} options={options} pageId={pageId} bindings={bindings} onChange={(v) => setRow(i, { [f.key]: v })} />
          ))}
        </div>
      ))}
      <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => onChange([...rows, Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default]))])}>
        Add a row
      </Button>
    </fieldset>
  );
}

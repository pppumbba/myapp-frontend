import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaParam, type MetaParamInput } from '../../lib/metaApi';
import { CornerDownRight, Edit01, Link01, Plus, Trash01 } from '@untitledui/icons';
import { Alert, IconAction } from '../../components/ui';
import { Section } from '../../components/form';
import { Badge, BadgeWithIcon } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { typeLook } from '../../components/TypePreview';

const DATA_TYPES = ['string', 'text', 'integer', 'decimal', 'boolean', 'date', 'datetime', 'json', 'detail', 'subgrid'];

/** What "Refers to" means depends on the type of the meta that owns the row. */
function refHint(ownerType?: string | null): string {
  switch (ownerType) {
    case 'app':
      return 'The screen this menu item opens.';
    case 'datagrid':
      return 'A lookup meta that supplies this column’s values. Optional.';
    case 'form':
      return 'A lookup or related meta for this field. Optional.';
    case 'tabs':
      return 'The screen shown inside this tab.';
    default:
      return 'Another meta this row links to. Optional.';
  }
}

/** An example config for the data type, shown as the placeholder. */
function configHint(dataType: string): string {
  if (dataType === 'subgrid') return '{ "params": { "supplier_id": "id" } }   // subgrid parameter <- field of the picked row';
  if (dataType === 'detail') return '{ "foreign_key": "order_id", "amount": ["quantity", "unit_price"], "total_field": "total" }';
  return '{ "options": ["draft", "sent"] }   or   { "label_field": "name" }';
}

function rowLabel(p: MetaParam): string {
  return p.label_name || p.param_name || p.field_path;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Flattens the tree for the parent dropdown, indented by depth. */
function flatten(nodes: MetaParam[], depth = 0, out: { id: number; label: string }[] = []) {
  for (const n of nodes) {
    out.push({ id: n.id, label: `${'   '.repeat(depth)}${rowLabel(n)}` });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}

function findNode(nodes: MetaParam[], id: number): MetaParam | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = n.children && findNode(n.children, id);
    if (found) return found;
  }
  return undefined;
}

function descendantIds(node: MetaParam, out = new Set<number>()): Set<number> {
  for (const c of node.children ?? []) {
    out.add(c.id);
    descendantIds(c, out);
  }
  return out;
}

interface ParamForm {
  label_name: string;
  param_name: string;
  field_path: string;
  data_type: string;
  parent_id: string;
  ref_meta_id: string;
  order_number: number;
  render_type: string;
  icon_cls: string;
  is_show: boolean;
  is_required: boolean;
  is_select: boolean;
  is_criteria: boolean;
  is_mandatory_criteria: boolean;
  is_primary: boolean;
  default_value: string;
  /** json_config as text; it must be valid JSON. */
  json_config: string;
}

function emptyParam(order: number, parentId: number | null): ParamForm {
  return {
    label_name: '',
    param_name: '',
    field_path: '',
    data_type: 'string',
    parent_id: parentId ? String(parentId) : '',
    ref_meta_id: '',
    order_number: order,
    render_type: '',
    icon_cls: '',
    is_show: true,
    is_required: false,
    is_select: false,
    is_criteria: false,
    is_mandatory_criteria: false,
    is_primary: false,
    default_value: '',
    json_config: '',
  };
}

function toParamForm(p: MetaParam): ParamForm {
  return {
    label_name: p.label_name ?? '',
    param_name: p.param_name,
    field_path: p.field_path,
    data_type: p.data_type,
    parent_id: p.parent_id ? String(p.parent_id) : '',
    ref_meta_id: p.ref_meta_id ? String(p.ref_meta_id) : '',
    order_number: p.order_number,
    render_type: p.render_type ?? '',
    icon_cls: p.icon_cls ?? '',
    is_show: p.is_show,
    is_required: p.is_required,
    is_select: p.is_select,
    is_criteria: p.is_criteria,
    is_mandatory_criteria: p.is_mandatory_criteria,
    is_primary: p.is_primary,
    default_value: p.default_value ?? '',
    json_config: p.json_config ? JSON.stringify(p.json_config, null, 2) : '',
  };
}

function toParamInput(f: ParamForm): MetaParamInput {
  return {
    label_name: f.label_name || null,
    param_name: f.param_name.trim(),
    field_path: f.field_path.trim(),
    data_type: f.data_type,
    parent_id: f.parent_id ? Number(f.parent_id) : null,
    ref_meta_id: f.ref_meta_id ? Number(f.ref_meta_id) : null,
    order_number: Number(f.order_number) || 0,
    render_type: f.render_type || null,
    icon_cls: f.icon_cls || null,
    is_show: f.is_show,
    is_required: f.is_required,
    is_select: f.is_select,
    is_criteria: f.is_criteria,
    is_mandatory_criteria: f.is_criteria && f.is_mandatory_criteria,
    is_primary: f.is_primary,
    default_value: f.default_value || null,
    json_config: f.json_config.trim() ? (JSON.parse(f.json_config) as Record<string, unknown>) : null,
  };
}

export function MetaParamsPanel({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const look = typeLook(meta.type?.code);
  const noun = look.rowNoun;

  const [tree, setTree] = useState<MetaParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // undefined: closed, 'new': creating, MetaParam: editing.
  const [editing, setEditing] = useState<MetaParam | 'new' | undefined>(undefined);
  const [form, setForm] = useState<ParamForm>(() => emptyParam(1, null));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MetaParam | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const optionName = useMemo(() => new Map(options.map((o) => [o.id, o.name])), [options]);

  async function load() {
    setError(null);
    try {
      setTree(await metaApi.params(meta.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `The ${noun}s could not be loaded.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id]);

  function openNew(parentId: number | null) {
    const siblings = parentId ? findNode(tree, parentId)?.children ?? [] : tree;
    setForm(emptyParam(siblings.length + 1, parentId));
    setFieldErrors({});
    setError(null);
    setEditing('new');
  }

  function openEdit(p: MetaParam) {
    setForm(toParamForm(p));
    setFieldErrors({});
    setError(null);
    setEditing(p);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      if (form.json_config.trim()) JSON.parse(form.json_config);
    } catch {
      setFieldErrors({ json_config: ['This is not valid JSON.'] });
      setSaving(false);
      return;
    }
    try {
      const input = toParamInput(form);
      if (editing === 'new') await metaApi.createParam(meta.id, input);
      else if (editing) await metaApi.updateParam(editing.id, input);
      setEditing(undefined);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {});
        if (!err.errors) setError(err.message);
      } else {
        setError(`The ${noun} could not be saved.`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await metaApi.removeParam(deleting.id);
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `The ${noun} could not be deleted.`);
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  const set = <K extends keyof ParamForm>(key: K, value: ParamForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const fe = (field: string) => fieldErrors[field]?.[0];

  // A row can't be moved under itself or anything nested inside it.
  const blocked = editing && editing !== 'new' ? descendantIds(editing).add(editing.id) : new Set<number>();
  const parentChoices = flatten(tree).filter((c) => !blocked.has(c.id));
  const dataTypes = DATA_TYPES.includes(form.data_type) ? DATA_TYPES : [form.data_type, ...DATA_TYPES];

  return (
    <section aria-labelledby="rows-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="rows-heading" className="text-lg font-semibold text-primary">
            {capitalize(noun)}s
          </h2>
          <p className="mt-1 text-sm text-tertiary">{refHint(meta.type?.code)}</p>
        </div>
        <Button size="md" iconLeading={Plus} onPress={() => openNew(null)}>
          Add {noun}
        </Button>
      </div>

      {error && !editing && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
          ))}
        </div>
      ) : tree.length === 0 ? (
        <div className="rounded-xl border border-dashed border-primary bg-primary px-6 py-12 text-center">
          <p className="text-md font-semibold text-primary">No {noun}s yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-tertiary">Add the first one. You can nest more inside it afterwards.</p>
          <Button iconLeading={Plus} color="secondary" className="mt-5" onPress={() => openNew(null)}>
            Add {noun}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {tree.map((p) => (
            <RowCard
              key={p.id}
              node={p}
              accent={look.ink}
              noun={noun}
              optionName={optionName}
              onAdd={openNew}
              onEdit={openEdit}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      {editing !== undefined && (
        <Modal
          title={editing === 'new' ? `Add ${noun}` : `Edit ${rowLabel(editing)}`}
          description={`In ${meta.name}`}
          onClose={() => setEditing(undefined)}
          size="lg"
        >
          <form onSubmit={onSave} className="space-y-8">
            {error && <Alert>{error}</Alert>}

            <Section title="Basics">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Label"
                  autoFocus
                  value={form.label_name}
                  onChange={(v) => set('label_name', v)}
                  isInvalid={!!fe('label_name')}
                  hint={fe('label_name') ?? 'What people see.'}
                />
                <Input
                  label="Param name"
                  isRequired
                  value={form.param_name}
                  onChange={(v) => set('param_name', v)}
                  isInvalid={!!fe('param_name')}
                  hint={fe('param_name')}
                />
                <Input
                  label="Field path"
                  isRequired
                  value={form.field_path}
                  onChange={(v) => set('field_path', v)}
                  isInvalid={!!fe('field_path')}
                  hint={fe('field_path') ?? 'Column or key in the data, e.g. customer.name'}
                />
                <NativeSelect
                  label="Data type"
                  value={form.data_type}
                  onChange={(e) => set('data_type', e.target.value)}
                  hint={fe('data_type')}
                  options={dataTypes.map((t) => ({ label: t, value: t }))}
                />
              </div>
            </Section>

            <Section title="Placement">
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <NativeSelect
                  label="Inside"
                  value={form.parent_id}
                  onChange={(e) => set('parent_id', e.target.value)}
                  hint={fe('parent_id')}
                  options={[{ label: 'Top level', value: '' }, ...parentChoices.map((c) => ({ label: c.label, value: String(c.id) }))]}
                />
                <Input
                  label="Order"
                  type="number"
                  value={String(form.order_number)}
                  onChange={(v) => set('order_number', Number(v))}
                  isInvalid={!!fe('order_number')}
                  hint={fe('order_number')}
                />
              </div>
            </Section>

            <Section title="Link and display">
              <div className="grid gap-4 sm:grid-cols-2">
                <NativeSelect
                  label="Refers to"
                  value={form.ref_meta_id}
                  onChange={(e) => set('ref_meta_id', e.target.value)}
                  hint={fe('ref_meta_id') ?? refHint(meta.type?.code)}
                  options={[
                    { label: 'Nothing', value: '' },
                    ...options
                      .filter((o) => o.id !== meta.id)
                      .map((o) => ({ label: `${o.name} (${o.type ?? 'no type'})`, value: String(o.id) })),
                  ]}
                />
                <Input
                  label="Render as"
                  value={form.render_type}
                  onChange={(v) => set('render_type', v)}
                  isInvalid={!!fe('render_type')}
                  hint={fe('render_type') ?? 'e.g. text, select, date, checkbox'}
                />
                <Input
                  label="Default value"
                  value={form.default_value}
                  onChange={(v) => set('default_value', v)}
                  isInvalid={!!fe('default_value')}
                  hint={fe('default_value')}
                />
                <Input
                  label="Icon"
                  value={form.icon_cls}
                  onChange={(v) => set('icon_cls', v)}
                  isInvalid={!!fe('icon_cls')}
                  hint={fe('icon_cls') ?? 'Icon class name, for menu items.'}
                />
              </div>
            </Section>

            <Section title="Behaviour">
              <div className="grid gap-4 sm:grid-cols-2">
                <Toggle label="Visible" hint="Shown on the screen." isSelected={form.is_show} onChange={(v) => set('is_show', v)} />
                <Toggle label="Required" hint="Must have a value." isSelected={form.is_required} onChange={(v) => set('is_required', v)} />
                <Toggle label="Lookup" hint="Picked from a list." isSelected={form.is_select} onChange={(v) => set('is_select', v)} />
                <Toggle label="Use as filter" hint="Offered as a search filter." isSelected={form.is_criteria} onChange={(v) => set('is_criteria', v)} />
                <Toggle label="Primary key" hint="Identifies each record." isSelected={form.is_primary} onChange={(v) => set('is_primary', v)} />
                {form.is_criteria && (
                  <Toggle
                    label="Required filter"
                    hint="No records show until it has a value."
                    isSelected={form.is_mandatory_criteria}
                    onChange={(v) => set('is_mandatory_criteria', v)}
                  />
                )}
              </div>
              <TextArea
                label="Config (JSON)"
                rows={4}
                value={form.json_config}
                onChange={(v) => set('json_config', v)}
                textAreaClassName="font-mono text-sm"
                placeholder={configHint(form.data_type)}
                isInvalid={!!fe('json_config')}
                hint={fe('json_config') ?? "Optional settings, e.g. options for a list, a lookup's label_field, or a subgrid's params."}
              />
            </Section>

            <div className="flex justify-end gap-3 border-t border-secondary pt-5">
              <Button size="lg" color="secondary" onPress={() => setEditing(undefined)}>
                Cancel
              </Button>
              <Button size="lg" type="submit" isLoading={saving} showTextWhileLoading>
                {saving ? 'Saving…' : editing === 'new' ? `Add ${noun}` : 'Save changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${rowLabel(deleting)}?`}
          message={
            descendantIds(deleting).size > 0
              ? `Everything nested inside it (${descendantIds(deleting).size}) is deleted too. This can't be undone.`
              : "This can't be undone."
          }
          confirmLabel={`Delete ${noun}`}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

interface RowProps {
  node: MetaParam;
  noun: string;
  optionName: Map<number, string>;
  onAdd: (parentId: number) => void;
  onEdit: (p: MetaParam) => void;
  onDelete: (p: MetaParam) => void;
}

/** Facts about a row worth seeing without opening it. */
function RowFacts({ node, optionName }: { node: MetaParam; optionName: Map<number, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge type="color" size="sm" color="gray">{node.data_type}</Badge>
      {node.ref_meta_id && (
        <BadgeWithIcon type="color" size="sm" color="brand" iconLeading={Link01}>
          {optionName.get(node.ref_meta_id) ?? `Meta ${node.ref_meta_id}`}
        </BadgeWithIcon>
      )}
      {node.is_required && <Badge type="color" size="sm" color="warning">Required</Badge>}
      {node.is_select && <Badge type="color" size="sm" color="success">Lookup</Badge>}
      {node.is_primary && <Badge type="color" size="sm" color="indigo">Primary key</Badge>}
      {!node.is_show && <Badge type="color" size="sm" color="gray">Hidden</Badge>}
    </div>
  );
}

/** A top-level row as a card. Its nested rows are listed inside. */
function RowCard({ node, accent, noun, optionName, onAdd, onEdit, onDelete }: RowProps & { accent: string }) {
  const children = node.children ?? [];
  return (
    <article className={`flex flex-col rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset ${node.is_show ? '' : 'opacity-75'}`}>
      <div className="flex items-start gap-3 p-5 pb-4">
        <span
          className="mt-1 size-2.5 shrink-0 rounded-full"
          style={{ background: accent }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-md font-semibold text-primary">{rowLabel(node)}</h3>
          <p className="truncate text-sm text-tertiary">{node.field_path}</p>
        </div>
        <div className="-mt-1 -mr-2 flex shrink-0 gap-0.5">
          <IconAction icon={Edit01} label={`Edit ${rowLabel(node)}`} onPress={() => onEdit(node)} />
          <IconAction icon={Trash01} danger label={`Delete ${rowLabel(node)}`} onPress={() => onDelete(node)} />
        </div>
      </div>

      <div className="px-5">
        <RowFacts node={node} optionName={optionName} />
      </div>

      {children.length > 0 && (
        <ul className="mt-4 space-y-0.5 border-t border-secondary px-3 pt-3">
          {children.map((c) => (
            <NestedRow
              key={c.id}
              node={c}
              depth={0}
              noun={noun}
              optionName={optionName}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      <div className="mt-auto px-3 pt-3 pb-3">
        <Button color="tertiary" size="sm" iconLeading={Plus} className="w-full" onPress={() => onAdd(node.id)}>
          Add inside
        </Button>
      </div>
    </article>
  );
}

function NestedRow({ node, depth, noun, optionName, onAdd, onEdit, onDelete }: RowProps & { depth: number }) {
  const children = node.children ?? [];
  return (
    <li>
      <div className="group flex items-center gap-2 rounded-md py-1 pr-1 hover:bg-primary_hover" style={{ paddingLeft: `${8 + depth * 16}px` }}>
        <CornerDownRight className="size-4 shrink-0 text-fg-quaternary" />
        <div className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${node.is_show ? 'text-secondary' : 'text-quaternary'}`}>{rowLabel(node)}</span>
        </div>
        <span className="hidden shrink-0 text-xs text-tertiary sm:inline">{node.data_type}</span>
        {node.ref_meta_id && (
          <span className="shrink-0 text-fg-brand-secondary" title={`Links to ${optionName.get(node.ref_meta_id) ?? 'another meta'}`}>
            <Link01 className="size-3.5" />
          </span>
        )}
        <div className="flex shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <IconAction icon={Plus} label={`Add ${noun} inside ${rowLabel(node)}`} onPress={() => onAdd(node.id)} />
          <IconAction icon={Edit01} label={`Edit ${rowLabel(node)}`} onPress={() => onEdit(node)} />
          <IconAction icon={Trash01} danger label={`Delete ${rowLabel(node)}`} onPress={() => onDelete(node)} />
        </div>
      </div>
      {children.length > 0 && (
        <ul className="space-y-0.5">
          {children.map((c) => (
            <NestedRow
              key={c.id}
              node={c}
              depth={depth + 1}
              noun={noun}
              optionName={optionName}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

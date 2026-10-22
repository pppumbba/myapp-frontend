import { useEffect, useState, type FormEvent } from 'react';
import { Edit01, Plus, Trash01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { metaApi, type ActionKind, type Meta, type MetaAction, type MetaActionInput, type MetaOption } from '../../lib/metaApi';
import { Alert, IconAction } from '../../components/ui';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { Section } from '../../components/form';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';

const KINDS: { value: ActionKind; label: string; hint: string }[] = [
  { value: 'add', label: 'Add', hint: 'Opens the form empty (or filled by the get) to add a record.' },
  { value: 'edit', label: 'Edit', hint: 'Opens the form with the picked row; saving updates it.' },
  { value: 'delete', label: 'Delete', hint: "Removes the picked row from the form's table, after a confirm." },
  { value: 'custom', label: 'Custom', hint: 'Opens the form to add a record, filled from the picked row by the get.' },
  { value: 'import', label: 'Import', hint: 'Loads an Excel file into a table through an Excel import meta.' },
  { value: 'stage_query', label: 'Stage query', hint: 'Runs a stage query; the get (or the picked row) fills its parameters first.' },
];

/** The kind of meta a button points at: a form, an Excel import or a stage query. */
const targetOf = (kind: ActionKind) => (kind === 'import' || kind === 'stage_query' ? kind : 'form');
const ICONS = ['', 'plus', 'edit', 'trash', 'copy', 'eye', 'check', 'file', 'upload'];

interface ActionForm {
  action: ActionKind;
  label: string;
  icon_cls: string;
  form_meta_id: string;
  get_meta_id: string;
  needs_row: boolean;
  show_in_row: boolean;
  order_number: string;
  /** json_config.params as text: { "get parameter": "row field" }. */
  params: string;
}

function toForm(a: MetaAction | null, next: number): ActionForm {
  return {
    action: a?.action ?? 'add',
    label: a?.label ?? 'Add',
    icon_cls: a?.icon_cls ?? '',
    form_meta_id: a?.form_meta_id ? String(a.form_meta_id) : '',
    get_meta_id: a?.get_meta_id ? String(a.get_meta_id) : '',
    needs_row: a?.needs_row ?? false,
    show_in_row: a?.show_in_row ?? false,
    order_number: String(a?.order_number ?? next),
    params: a?.json_config?.params ? JSON.stringify(a.json_config.params, null, 2) : '',
  };
}

/**
 * The toolbar of a datagrid: which buttons it has, the form each opens, and the get meta
 * that decides what the form opens with (backend: meta_actions).
 */
export function MetaActionsPanel({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const [actions, setActions] = useState<MetaAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // undefined: closed, null: adding, otherwise the action being edited.
  const [editing, setEditing] = useState<MetaAction | null | undefined>(undefined);
  const [form, setForm] = useState<ActionForm>(() => toForm(null, 1));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MetaAction | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const forms = options.filter((o) => o.type === 'form');
  const gets = options.filter((o) => o.type === 'get');
  const imports = options.filter((o) => o.type === 'excel_import');
  const stageQueries = options.filter((o) => o.type === 'stage_query');

  async function load() {
    try {
      setActions(await metaApi.actions(meta.id));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The toolbar could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Loads once per grid.
  }, [meta.id]);

  function open(a: MetaAction | null) {
    setForm(toForm(a, actions.length + 1));
    setFieldErrors({});
    setEditing(a);
  }

  const set = <K extends keyof ActionForm>(k: K, v: ActionForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fe = (k: string) => fieldErrors[k]?.[0];

  // Picking a kind fills in the usual label and row settings, unless they've been changed.
  function setKind(kind: ActionKind) {
    setForm((f) => {
      const usual = KINDS.find((k) => k.value === f.action)?.label;
      const needsRow = kind !== 'add' && kind !== 'import';
      return {
        ...f,
        action: kind,
        label: !f.label || f.label === usual ? KINDS.find((k) => k.value === kind)!.label : f.label,
        needs_row: needsRow,
        show_in_row: kind === 'edit' || kind === 'delete',
        params: needsRow && !f.params ? '{\n  "id": "id"\n}' : kind === 'import' ? '' : f.params,
        // A form, an import and a stage query are different kinds of meta.
        form_meta_id: targetOf(kind) === targetOf(f.action) ? f.form_meta_id : '',
        get_meta_id: kind === 'import' ? '' : f.get_meta_id,
      };
    });
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    let params: Record<string, string> | undefined;
    try {
      params = form.params.trim() ? JSON.parse(form.params) : undefined;
    } catch {
      setFieldErrors({ params: ['This is not valid JSON.'] });
      return;
    }
    const input: MetaActionInput = {
      action: form.action,
      label: form.label.trim(),
      icon_cls: form.icon_cls || null,
      form_meta_id: form.form_meta_id ? Number(form.form_meta_id) : null,
      get_meta_id: form.get_meta_id ? Number(form.get_meta_id) : null,
      needs_row: form.needs_row,
      show_in_row: form.show_in_row,
      order_number: Number(form.order_number) || 1,
      json_config: params ? { params } : null,
    };
    setSaving(true);
    setFieldErrors({});
    try {
      if (editing) await metaApi.updateAction(editing.id, input);
      else await metaApi.createAction(meta.id, input);
      setEditing(undefined);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      else setError(err instanceof ApiError ? err.message : 'The button could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await metaApi.removeAction(deleting.id);
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The button could not be removed.');
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section aria-labelledby="toolbar-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="toolbar-heading" className="text-lg font-semibold text-primary">
            Toolbar
          </h2>
          <p className="text-sm text-tertiary">Buttons on this grid. Each opens a form; a get decides the values the form opens with.</p>
        </div>
        <Button size="sm" iconLeading={Plus} onPress={() => open(null)}>
          Add button
        </Button>
      </div>

      {error && !editing && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : actions.length ? (
        <ul className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {actions.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-6 text-sm text-quaternary tabular-nums">{a.order_number}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-primary">{a.label}</p>
                <p className="truncate text-xs text-tertiary">
                  {a.form ? `${a.action === 'import' ? 'Import' : a.action === 'stage_query' ? 'Stage query' : 'Form'}: ${a.form.name}` : 'No form'}
                  {a.get ? ` · Get: ${a.get.name}` : ''}
                </p>
              </div>
              <div className="hidden flex-wrap gap-1 sm:flex">
                <Badge type="color" size="sm" color={a.action === 'delete' ? 'error' : a.action === 'add' ? 'brand' : 'gray'}>
                  {a.action}
                </Badge>
                {a.needs_row && (
                  <Badge type="color" size="sm" color="gray">
                    Needs a row
                  </Badge>
                )}
                {a.show_in_row && (
                  <Badge type="color" size="sm" color="gray">
                    On each row
                  </Badge>
                )}
              </div>
              <IconAction icon={Edit01} label={`Edit ${a.label}`} onPress={() => open(a)} />
              <IconAction icon={Trash01} danger label={`Remove ${a.label}`} onPress={() => setDeleting(a)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-primary px-4 py-5 text-sm text-tertiary ring-1 ring-secondary ring-inset">
          No buttons yet, so this grid is read-only. Add one to open a form from it.
        </p>
      )}

      {editing !== undefined && (
        <Modal title={editing ? `Edit ${editing.label}` : 'Add a toolbar button'} onClose={() => setEditing(undefined)} size="lg">
          <form onSubmit={onSave} className="space-y-5">
            {error && <Alert>{error}</Alert>}
            <Section title="Button">
              <div className="grid gap-4 sm:grid-cols-2">
                <NativeSelect
                  label="Does"
                  value={form.action}
                  onChange={(e) => setKind(e.target.value as ActionKind)}
                  hint={fe('action') ?? KINDS.find((k) => k.value === form.action)?.hint}
                  options={KINDS.map((k) => ({ label: k.label, value: k.value }))}
                />
                <Input label="Label" isRequired value={form.label} onChange={(v) => set('label', v)} isInvalid={!!fe('label')} hint={fe('label')} />
                <NativeSelect
                  label="Icon"
                  value={form.icon_cls}
                  onChange={(e) => set('icon_cls', e.target.value)}
                  options={ICONS.map((i) => ({ label: i || 'Usual for this kind', value: i }))}
                />
                <Input label="Order" type="number" value={form.order_number} onChange={(v) => set('order_number', v)} isInvalid={!!fe('order_number')} hint={fe('order_number')} />
              </div>
            </Section>

            <Section title="Connected to">
              <div className="grid gap-4 sm:grid-cols-2">
                {form.action === 'import' ? (
                  <NativeSelect
                    label="Excel import"
                    required
                    value={form.form_meta_id}
                    onChange={(e) => set('form_meta_id', e.target.value)}
                    hint={fe('form_meta_id') ?? (imports.length ? 'Says which columns the file has and where they go.' : 'No Excel import metas yet. Create one on the Metas page.')}
                    options={[{ label: 'Choose an import…', value: '' }, ...imports.map((o) => ({ label: o.name, value: String(o.id) }))]}
                  />
                ) : form.action === 'stage_query' ? (
                  <NativeSelect
                    label="Stage query"
                    required
                    value={form.form_meta_id}
                    onChange={(e) => set('form_meta_id', e.target.value)}
                    hint={fe('form_meta_id') ?? (stageQueries.length ? 'The query this button runs, after a dry-run check.' : 'No stage queries yet. Create one on the Metas page.')}
                    options={[{ label: 'Choose a stage query…', value: '' }, ...stageQueries.map((o) => ({ label: o.name, value: String(o.id) }))]}
                  />
                ) : (
                  <NativeSelect
                    label="Form"
                    required
                    value={form.form_meta_id}
                    onChange={(e) => set('form_meta_id', e.target.value)}
                    hint={fe('form_meta_id') ?? (form.action === 'delete' ? 'The row is removed from this form’s table.' : 'The form this button opens.')}
                    options={[{ label: 'Choose a form…', value: '' }, ...forms.map((o) => ({ label: o.name, value: String(o.id) }))]}
                  />
                )}
                {form.action !== 'delete' && form.action !== 'import' && (
                  <NativeSelect
                    label="Get (opens with)"
                    value={form.get_meta_id}
                    onChange={(e) => set('get_meta_id', e.target.value)}
                    hint={
                      fe('get_meta_id') ??
                      (!gets.length
                        ? 'No get metas yet. Create one on the Metas page.'
                        : form.action === 'stage_query'
                          ? 'Its first row fills the parameters with the same names.'
                          : 'Decides the values the form opens with.')
                    }
                    options={[
                      {
                        label: form.action === 'edit' ? 'The row from the form’s table' : form.action === 'stage_query' ? 'The picked row (by Parameters)' : 'Nothing (empty form)',
                        value: '',
                      },
                      ...gets.map((o) => ({ label: o.name, value: String(o.id) })),
                    ]}
                  />
                )}
              </div>
              {form.action !== 'import' && (
              <TextArea
                label="Parameters"
                rows={3}
                value={form.params}
                onChange={(v) => set('params', v)}
                textAreaClassName="font-mono text-sm"
                placeholder={'{ "id": "id" }'}
                isInvalid={!!fe('params') || !!fe('json_config.params')}
                hint={
                  fe('params') ??
                  fe('json_config.params') ??
                  (form.action === 'stage_query' && !form.get_meta_id
                    ? 'Which field of the picked row fills each :parameter of the stage query.'
                    : 'Which field of the picked row fills each :parameter of the get. For edit and delete, "id" is the record opened or removed.')
                }
              />
              )}
            </Section>

            <Section title="Placement">
              <div className="grid gap-4 sm:grid-cols-2">
                <Toggle label="Needs a picked row" hint="Disabled until a row is picked." isSelected={form.needs_row} onChange={(v) => set('needs_row', v)} />
                <Toggle label="Show on each row" hint="Also an icon at the end of every row." isSelected={form.show_in_row} onChange={(v) => set('show_in_row', v)} />
              </div>
            </Section>

            <div className="modal-footer flex justify-end gap-3 border-t border-secondary pt-5">
              <Button size="md" color="secondary" onPress={() => setEditing(undefined)}>
                Cancel
              </Button>
              <Button size="md" type="submit" isLoading={saving} showTextWhileLoading>
                {editing ? 'Save changes' : 'Add button'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Remove ${deleting.label}?`}
          message="The button disappears from the grid. The form and get it used are kept."
          confirmLabel="Remove button"
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

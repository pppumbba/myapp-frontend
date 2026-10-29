import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaInput, type MetaOption, type MetaType, type Tag } from '../../lib/metaApi';
import { Alert } from '../../components/ui';
import { Section } from '../../components/form';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { Modal } from '../../components/Modal';
import { TypePreview, typeLook } from '../../components/TypePreview';
import { CodeEditor } from '../../components/CodeEditor';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { SCRIPT_COLUMNS } from '../../render/formScript';
import { TagPicker } from './MetaTags';
import { t } from '@/i18n';

type ScriptColumn = (typeof SCRIPT_COLUMNS)[keyof typeof SCRIPT_COLUMNS];

const NL = '\n';

/** A form's scripts, in the order they are shown, with what each one is for. */
const SCRIPTS: { column: ScriptColumn; label: string; hint: string; placeholder: string }[] = [
  {
    column: 'event_expression_string',
    label: 'On change',
    hint: 'Runs after any field changes. field is the field that changed (empty when a line was added or removed); detail and index say which line, for a field of a line.',
    placeholder: ["if (detail === 'lines') {", "  set('total_amount', round(sum('lines', (l) => num(l.quantity) * num(l.unit_price)), 2));", '}'].join(NL),
  },
  {
    column: 'load_expression_string',
    label: 'On load',
    hint: 'Runs once the form has its values, before they are shown. mode is "new" or "edit".',
    placeholder: ["if (mode === 'new') set('order_date', today());", "readonly('total_amount');"].join(NL),
  },
  {
    column: 'before_save_expression_string',
    label: 'Before save',
    hint: "Runs before saving and may change values. error('…') or return false stops the save.",
    placeholder: "if (num(get('total_amount')) <= 0) error('Add at least one line.');",
  },
  {
    column: 'after_save_expression_string',
    label: 'After save',
    hint: 'Runs after saving; row is the record as saved.',
    placeholder: "message('Saved ' + row.po_number);",
  },
  {
    column: 'var_fnc_expression_string',
    label: 'Variables & functions',
    hint: 'Shared: every script above can use what is declared here.',
    placeholder: ['const VAT = 0.1;', '', 'function withVat(amount) {', '  return round(num(amount) * (1 + VAT), 2);', '}'].join(NL),
  },
];

/** The names a script gets, coloured in the editor. */
const SCRIPT_NAMES = ['values', 'get', 'set', 'lines', 'line', 'sum', 'setLine', 'header', 'num', 'round', 'today', 'hide', 'show', 'readonly', 'message', 'error', 'fill', 'session', 'field', 'value', 'detail', 'index', 'row', 'mode'];

interface FormState {
  code: string;
  name: string;
  label_name: string;
  type_id: string;
  ref_meta_id: string;
  description: string;
  table_name: string;
  query_string: string;
  is_active: boolean;
  is_log: boolean;
  is_public: boolean;
  tag_ids: number[];
  scripts: Record<ScriptColumn, string>;
  service: Record<ServiceColumn, string>;
}

/** An external service a grid or form reads and writes instead of a table (backend: ExternalService). */
const SERVICE_COLUMNS = [
  'service_url',
  'service_headers',
  'service_query',
  'service_list_path',
  'service_total_path',
  'service_record_path',
  'service_update_method',
  'service_list_body',
] as const;
const SERVICE_JSON_COLUMNS: ServiceColumn[] = ['service_headers', 'service_query', 'service_list_body'];
type ServiceColumn = (typeof SERVICE_COLUMNS)[number];

/** A JSON object box: empty, or valid JSON. */
const jsonError = (text: string) => {
  if (!text.trim()) return undefined;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? undefined : t("This must be a JSON object, like { \"name\": \"value\" }.");
  } catch {
    return t('This is not valid JSON.');
  }
};

function initialState(meta: Meta | null, presetTypeId?: number): FormState {
  return {
    code: meta?.code ?? '',
    name: meta?.name ?? '',
    label_name: meta?.label_name ?? '',
    type_id: meta?.type_id ? String(meta.type_id) : presetTypeId ? String(presetTypeId) : '',
    ref_meta_id: meta?.ref_meta_id ? String(meta.ref_meta_id) : '',
    description: meta?.description ?? '',
    table_name: meta?.table_name ?? '',
    query_string: meta?.query_string ?? '',
    is_active: meta?.is_active ?? true,
    is_log: meta?.is_log ?? false,
    is_public: meta?.is_public ?? false,
    tag_ids: meta?.tags?.map((item) => item.id) ?? [],
    scripts: Object.fromEntries(SCRIPTS.map((sc) => [sc.column, meta?.[sc.column] ?? ''])) as Record<ScriptColumn, string>,
    service: Object.fromEntries(SERVICE_COLUMNS.map((c) => [c, meta?.[c] ?? ''])) as Record<ServiceColumn, string>,
  };
}

function toInput(f: FormState): MetaInput {
  return {
    code: f.code.trim(),
    name: f.name.trim(),
    label_name: f.label_name || null,
    type_id: f.type_id ? Number(f.type_id) : null,
    ref_meta_id: f.ref_meta_id ? Number(f.ref_meta_id) : null,
    description: f.description || null,
    table_name: f.table_name || null,
    query_string: f.query_string.trim() || null,
    is_active: f.is_active,
    is_log: f.is_log,
    is_public: f.is_public,
    tag_ids: f.tag_ids,
    ...Object.fromEntries(SCRIPTS.map((sc) => [sc.column, f.scripts[sc.column].trim() ? f.scripts[sc.column] : null])),
    ...Object.fromEntries(SERVICE_COLUMNS.map((c) => [c, f.service[c].trim() || null])),
  };
}

/** "Customer list" -> "customer_list". Latin letters, digits and underscores only. */
function toCode(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function MetaFormModal({
  meta,
  types,
  options,
  presetTypeId,
  onClose,
  onSaved,
}: {
  /** null creates a new meta. */
  meta: Meta | null;
  types: MetaType[];
  options: MetaOption[];
  presetTypeId?: number;
  onClose: () => void;
  onSaved: (meta: Meta) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(meta, presetTypeId));
  // For a new meta, the code follows the name until the user edits the code themselves.
  const [codeTouched, setCodeTouched] = useState(meta !== null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [script, setScript] = useState<ScriptColumn>('event_expression_string');
  const [tags, setTags] = useState<Tag[]>([]);
  const typeCode = types.find((item) => String(item.id) === form.type_id)?.code;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const fe = (field: string) => fieldErrors[field]?.[0];
  const setService = (c: ServiceColumn, v: string) => setForm((f) => ({ ...f, service: { ...f.service, [c]: v } }));
  // A service field's error: the server's, else a JSON box that doesn't parse.
  const se = (c: ServiceColumn) => fe(c) ?? (SERVICE_JSON_COLUMNS.includes(c) ? jsonError(form.service[c]) : undefined);
  const listsByPost = form.service.service_list_body.trim() !== '';
  const usesService = form.service.service_url.trim() !== '';

  useEffect(() => {
    metaApi.tags().then(setTags).catch(() => setTags([]));
  }, []);

  function onName(name: string) {
    setForm((f) => ({ ...f, name, code: codeTouched ? f.code : toCode(name) }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (SERVICE_JSON_COLUMNS.some((c) => jsonError(form.service[c]))) {
      setError(t('Fix the JSON in the external service settings first.'));
      return;
    }
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const saved = meta ? await metaApi.update(meta.id, toInput(form)) : await metaApi.create(toInput(form));
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {});
        if (!err.errors) setError(err.message);
      } else {
        setError(t('The meta could not be saved. Check that the API is running, then try again.'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={meta ? t('Edit {name}', { name: meta.name }) : t('New meta')}
      description={meta ? undefined : t('Pick what kind of screen this is, then give it a name.')}
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-8">
        {error && <Alert>{error}</Alert>}

        <Section title={t('Type')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {types.map((item) => {
              const look = typeLook(item.code);
              const selected = form.type_id === String(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set('type_id', String(item.id))}
                  className={`rounded-xl bg-primary p-2 text-left ring-inset transition duration-100 ease-linear ${
                    selected ? 'ring-2' : 'ring-1 ring-secondary hover:ring-primary'
                  }`}
                  style={selected ? { boxShadow: `inset 0 0 0 2px ${look.ink}` } : undefined}
                >
                  <div className="rounded-lg p-2" style={{ background: look.tint }}>
                    <TypePreview code={item.code} className="h-12 w-full" />
                  </div>
                  <span className="mt-2 block px-1 text-sm font-semibold text-primary">{item.name}</span>
                </button>
              );
            })}
          </div>
          {types.length === 0 && (
            <p className="text-sm text-tertiary">{t('No meta types found. Add rows to the meta_types table first.')}</p>
          )}
          {fe('type_id') && <p className="text-sm text-error-primary">{fe('type_id')}</p>}
        </Section>

        <Section title={t('Name')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('Name')}
              isRequired
              autoFocus
              value={form.name}
              onChange={onName}
              placeholder={t('Customer list')}
              isInvalid={!!fe('name')}
              hint={fe('name')}
            />
            <Input
              label={t('Code')}
              isRequired
              value={form.code}
              onChange={(v) => {
                setCodeTouched(true);
                set('code', v);
              }}
              placeholder="customer_list"
              isInvalid={!!fe('code')}
              hint={fe('code') ?? t('Used in links and the API. Must be unique.')}
            />
            <Input
              label={t('Display label')}
              value={form.label_name}
              onChange={(v) => set('label_name', v)}
              isInvalid={!!fe('label_name')}
              hint={fe('label_name') ?? t('Shown to people using the app. Leave blank to use the name.')}
            />
            <Input
              label={t('Database table')}
              value={form.table_name}
              onChange={(v) => set('table_name', v)}
              placeholder="customers"
              isInvalid={!!fe('table_name')}
              hint={fe('table_name') ?? t('The table this screen reads and writes.')}
            />
          </div>
          <TextArea
            label={t('Description')}
            rows={3}
            value={form.description}
            onChange={(v) => set('description', v)}
            isInvalid={!!fe('description')}
            hint={fe('description')}
          />
          <TagPicker
            tags={tags}
            value={form.tag_ids}
            onChange={(ids) => set('tag_ids', ids)}
            onCreated={(tag) => setTags((all) => (all.some((item) => item.id === tag.id) ? all : [...all, tag].sort((a, b) => a.name.localeCompare(b.name))))}
            hint={fe('tag_ids')}
          />
        </Section>

        {types.find((item) => String(item.id) === form.type_id)?.code === 'stage_query' ? (
          <Section title={t('Query')}>
            <TextArea
              label={t('SQL that changes data')}
              rows={8}
              value={form.query_string}
              onChange={(v) => set('query_string', v)}
              placeholder={"UPDATE proc_purchase_requests\nSET status = 'rejected'\nWHERE status = 'draft' AND needed_by < :before;\n\nINSERT INTO audit_notes (note, created_by) VALUES ('Closed drafts', :user_id)"}
              textAreaClassName="font-mono text-sm"
              isInvalid={!!fe('query_string')}
              hint={
                fe('query_string') ??
                t('INSERT, UPDATE, DELETE or REPLACE; separate several with ;. They run together: if one fails, none is kept. :name parameters are its parameters (add one per name below the query), plus :user_id and :today.')
              }
            />
          </Section>
        ) : ['datagrid', 'get', 'calendar', 'gantt'].includes(types.find((item) => String(item.id) === form.type_id)?.code ?? '') && (
          <Section title={t('Query')}>
            <TextArea
              label={t('SQL query')}
              rows={6}
              value={form.query_string}
              onChange={(v) => set('query_string', v)}
              placeholder={"SELECT o.id, o.po_number, s.name AS supplier_name\nFROM orders o JOIN suppliers s ON s.id = o.supplier_id\nWHERE (:status IS NULL OR o.status = :status)"}
              textAreaClassName="font-mono text-sm"
              isInvalid={!!fe('query_string')}
              hint={
                fe('query_string') ??
                t('Optional. Reads records from this query instead of the table. :name parameters are filled from filters with the same field path (and :user_id, :today); an empty filter is null. Saving still goes through a form with a table.')
              }
            />
          </Section>
        )}

        {(typeCode === 'form' || typeCode === 'datagrid') && (
          <Section title={t('External service')}>
            <p className="text-sm text-tertiary">
              {t(typeCode === 'form'
                ? 'Optional. With an address, this form reads and writes records through a REST service instead of the database table: GET for the list and one record (address/id), POST to add, PUT or PATCH to change, DELETE to remove. Params read and write fields by their field path, which may be a dot path such as'
                : 'Optional. With an address, this grid reads and writes records through a REST service instead of the database table: GET for the list and one record (address/id), POST to add, PUT or PATCH to change, DELETE to remove. Params read and write fields by their field path, which may be a dot path such as')}{' '}
              <code className="text-xs">address.city</code>.
            </p>
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Input
                label={t('Address')}
                value={form.service.service_url}
                onChange={(v) => setService('service_url', v)}
                placeholder="https://api.example.com/v1/suppliers"
                inputClassName="font-mono text-sm"
                isInvalid={!!se('service_url')}
                hint={se('service_url') ?? t('The collection; one record is this address followed by /id.')}
              />
              <NativeSelect
                label={t('Changes with')}
                value={form.service.service_update_method || 'PUT'}
                onChange={(e) => setService('service_update_method', e.target.value === 'PUT' ? '' : e.target.value)}
                options={[
                  { label: 'PUT', value: 'PUT' },
                  { label: t('PATCH'), value: 'PATCH' },
                ]}
              />
            </div>
            {usesService && (
              <>
                <TextArea
                  label={t('Headers')}
                  rows={3}
                  value={form.service.service_headers}
                  onChange={(v) => setService('service_headers', v)}
                  placeholder={"{ \"Authorization\": \"Bearer {env:SERVICE_SUPPLIER_TOKEN}\" }"}
                  textAreaClassName="font-mono text-sm"
                  isInvalid={!!se('service_headers')}
                  hint={
                    se('service_headers') ??
                    t('A JSON object. Keep tokens in the server’s .env as SERVICE_… and write {env:SERVICE_…} here; only admins see these headers.')
                  }
                />
                <TextArea
                  label={t('List body')}
                  rows={listsByPost ? 8 : 2}
                  value={form.service.service_list_body}
                  onChange={(v) => setService('service_list_body', v)}
                  placeholder={"{ \"request\": { \"sessionId\": \"{env:SERVICE_ERP_SESSION}\", \"command\": \"…\", \"parameters\": { \"from\": \"{filter.from}\" } } }"}
                  textAreaClassName="font-mono text-sm"
                  isInvalid={!!se('service_list_body')}
                  hint={
                    se('service_list_body') ??
                    t('For an endpoint that lists with a POST (e.g. runJson with a command): the JSON body to send. Then this list is read-only and a record opens from the list. Same placeholders as the list query; without {page}/{per_page}/{offset} all records come at once and are paged, searched and sorted here. Only admins see it.')
                  }
                />
                {!listsByPost && (
                  <TextArea
                    label={t('List query')}
                    rows={3}
                    value={form.service.service_query}
                    onChange={(v) => setService('service_query', v)}
                    placeholder={"{ \"page\": \"{page}\", \"limit\": \"{per_page}\", \"q\": \"{search}\", \"status\": \"{filter.status}\" }"}
                    textAreaClassName="font-mono text-sm"
                    isInvalid={!!se('service_query')}
                    hint={
                      se('service_query') ??
                      t('A JSON object of the list’s query string. Empty sends page, per_page, search, sort, dir and each filter by its name. Can use {page} {per_page} {offset} {search} {sort} {dir} {filter.name}, session values and {user_id}.')
                    }
                  />
                )}
                <div className="grid gap-4 sm:grid-cols-3">
                  <Input
                    label={t('Records at')}
                    value={form.service.service_list_path}
                    onChange={(v) => setService('service_list_path', v)}
                    placeholder="data"
                    inputClassName="font-mono text-sm"
                    isInvalid={!!se('service_list_path')}
                    hint={se('service_list_path') ?? t('Where the list sits in its answer; empty: the answer is the list.')}
                  />
                  <Input
                    label={t('Total at')}
                    value={form.service.service_total_path}
                    onChange={(v) => setService('service_total_path', v)}
                    placeholder="meta.total"
                    inputClassName="font-mono text-sm"
                    isInvalid={!!se('service_total_path')}
                    hint={se('service_total_path') ?? t('Optional, for page counts.')}
                  />
                  <Input
                    label={t('Record at')}
                    value={form.service.service_record_path}
                    onChange={(v) => setService('service_record_path', v)}
                    placeholder="data"
                    inputClassName="font-mono text-sm"
                    isInvalid={!!se('service_record_path')}
                    hint={se('service_record_path') ?? t('Where one record sits in its answer.')}
                  />
                </div>
              </>
            )}
          </Section>
        )}

        {typeCode === 'form' && (
          <Section title={t('Scripts')}>
            <ButtonGroup
              size="sm"
              selectedKeys={[script]}
              onSelectionChange={(keys) => {
                const [k] = [...keys];
                if (k) setScript(k as ScriptColumn);
              }}
              disallowEmptySelection
              className="w-auto flex-wrap"
            >
              {SCRIPTS.map((sc) => (
                <ButtonGroupItem key={sc.column} id={sc.column}>
                  {t(sc.label)}
                  {form.scripts[sc.column].trim() && <span className="ml-1 size-1.5 rounded-full bg-brand-solid" aria-label={t('(has a script)')} />}
                </ButtonGroupItem>
              ))}
            </ButtonGroup>
            {SCRIPTS.filter((sc) => sc.column === script).map((sc) => (
              <CodeEditor
                key={sc.column}
                label={`${t(sc.label)} (JavaScript)`}
                value={form.scripts[sc.column]}
                onChange={(v) => setForm((f) => ({ ...f, scripts: { ...f.scripts, [sc.column]: v } }))}
                names={SCRIPT_NAMES}
                placeholder={sc.placeholder}
                isInvalid={!!fe(sc.column)}
                hint={
                  fe(sc.column) ?? (
                    <>
                      {t(sc.hint)} {t('Helpers:')} <code className="text-xs">{t('get(f) set(f, v) values sum(detail, fn|field) lines(detail) setLine(detail, i, f, v) header.get/set num(v) round(v, digits) today() hide(f) show(f) readonly(f) message(text) error(text) await fill(getId, params) session(path)')}</code>
                    </>
                  )
                }
              />
            ))}
          </Section>
        )}

        <Section title={t('Links')}>
          <NativeSelect
            label={t('Refers to')}
            value={form.ref_meta_id}
            onChange={(e) => set('ref_meta_id', e.target.value)}
            hint={fe('ref_meta_id') ?? t('Another meta this one is based on or opens. A grid can name its workflow, or another grid to reuse: its records, workflow, buttons and columns (leave table and query empty; its own fields change or hide columns by field path).')}
            options={[
              { label: t('Nothing'), value: '' },
              ...options
                .filter((o) => o.id !== meta?.id)
                .map((o) => ({ label: `${o.name} (${o.type ?? 'no type'})`, value: String(o.id) })),
            ]}
          />
          <Toggle label={t('Active')} hint={t('Inactive metas stay saved but are hidden from apps.')} isSelected={form.is_active} onChange={(v) => set('is_active', v)} />
          <Toggle
            label={t('Public')}
            hint={
              form.is_public && meta
                ? t('Anyone may open it at {url} and add records through it, without signing in. The screens, lines and lookups it shows must be public too. Nobody edits or deletes records this way, and a form never shows what others sent.', { url: `${window.location.origin}/portal/${meta.id}` })
                : t('Anyone may open it and add records through it, without signing in, e.g. the screens of a portal.')
            }
            isSelected={form.is_public}
            onChange={(v) => set('is_public', v)}
          />
          {(typeCode === 'form' || typeCode === 'excel_import' || typeCode === 'matrix') && (
            <Toggle
              label={t('Keep a log of changes')}
              hint={t('Every save through this {kind} is kept: who changed which fields from what to what, with its lines. Records show it under History.', { kind: t(typeCode === 'form' ? 'form' : typeCode === 'matrix' ? 'matrix' : 'import') })}
              isSelected={form.is_log}
              onChange={(v) => set('is_log', v)}
            />
          )}
        </Section>

        <div className="modal-footer flex justify-end gap-3 border-t border-secondary pt-5">
          <Button size="lg" color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button size="lg" type="submit" isLoading={saving} showTextWhileLoading>
            {saving ? t('Saving…') : meta ? t('Save changes') : t('Create meta')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

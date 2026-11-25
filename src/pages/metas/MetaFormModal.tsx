import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
import { typeLook } from '../../components/TypePreview';
import { TypeIcon } from '../../components/TypeIcon';
import { CodeEditor } from '../../components/CodeEditor';
import { HelpCircle } from '@untitledui/icons';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { SCRIPT_COLUMNS } from '../../render/formScript';
import { TagPicker } from './MetaTags';
import { SettingRow } from './SettingRow';
import { MetaLookupField, metaChoices } from './MetaLookupField';
import { useAuth } from '../../auth/AuthContext';
import { publicPath } from '../../lib/customerApi';
import { t } from '@/i18n';

type ScriptColumn = (typeof SCRIPT_COLUMNS)[keyof typeof SCRIPT_COLUMNS];

const NL = '\n';

/** A form's scripts, in the order they are shown, with what each one is for. */
/** What the picked script is for, and the helpers it can call. */
function scriptHelp(hint: string) {
  return (
    <>
      {t(hint)} {t('Helpers:')}{' '}
      <code className="text-xs">
        {t(
          'get(f) set(f, v) values sum(detail, fn|field) lines(detail) setLine(detail, i, f, v) header.get/set num(v) round(v, digits) today() hide(f) show(f) readonly(f) message(text) error(text) await fill(getId, params) session(path)',
        )}
      </code>
    </>
  );
}

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
const SCRIPT_NAMES = [
  'values',
  'get',
  'set',
  'lines',
  'line',
  'sum',
  'setLine',
  'header',
  'num',
  'round',
  'today',
  'hide',
  'show',
  'readonly',
  'message',
  'error',
  'fill',
  'session',
  'field',
  'value',
  'detail',
  'index',
  'row',
  'mode',
];

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
  is_open: boolean;
  tag_ids: number[];
  scripts: Record<ScriptColumn, string>;
  service: Record<ServiceColumn, string>;
}

/** An external service a grid or form reads and writes instead of a table (backend: ExternalService). */
const SERVICE_COLUMNS = ['service_url', 'service_headers', 'service_query', 'service_list_path', 'service_total_path', 'service_record_path', 'service_update_method', 'service_list_body'] as const;
const SERVICE_JSON_COLUMNS: ServiceColumn[] = ['service_headers', 'service_query', 'service_list_body'];
type ServiceColumn = (typeof SERVICE_COLUMNS)[number];

/** A JSON object box: empty, or valid JSON. */
const jsonError = (text: string) => {
  if (!text.trim()) return undefined;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? undefined : t('This must be a JSON object, like { "name": "value" }.');
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
    is_open: meta?.is_open ?? false,
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
    is_open: f.is_open,
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

/** The groups of the meta form, which the meta page shows as separate sections. */
export type MetaFormPart = 'type' | 'name' | 'table' | 'query' | 'service' | 'scripts' | 'links';

/** What "Refers to" means for the types that use it; other types have no use for it. */
const REFERS_TO_HINTS: Record<string, string> = {
  datagrid: 'Its workflow, or another grid to reuse.',
  calendar: 'The form that opens an event, to see or change it.',
  gantt: 'The form that opens a task, to see or change it.',
  workspace: 'The form of the record this workspace is about.',
  widget: 'The page this widget is placed on.',
};

/** Whether a meta of this type has a "Refers to"; one already set keeps showing so it can be cleared. */
export function usesRefersTo(typeCode: string | undefined, refMetaId?: number | string | null): boolean {
  return (!!typeCode && typeCode in REFERS_TO_HINTS) || !!refMetaId;
}

export function MetaFormModal({
  meta,
  types,
  options,
  presetTypeId,
  onClose,
  onSaved,
  inline = false,
  parts,
  title,
  description,
}: {
  /** null creates a new meta. */
  meta: Meta | null;
  types: MetaType[];
  options: MetaOption[];
  presetTypeId?: number;
  onClose: () => void;
  onSaved: (meta: Meta) => void;
  /** On the page (the meta's Options sections) instead of in a dialog: Discard changes in place of Cancel. */
  inline?: boolean;
  /** Only these groups of the form (each of the meta's Options sections shows some); all when left out. */
  parts?: MetaFormPart[];
  /** The card's heading and line under it, when inline. */
  title?: string;
  description?: string;
}) {
  // A new meta asks only what it is: type, name and code, description and tags. The rest is set on its page.
  const creating = meta === null;
  // Picked before the dialog opened (New meta menu, Apps page…): no type picker, the title names it.
  const presetType = creating && presetTypeId ? types.find((item) => item.id === presetTypeId) : undefined;
  const has = (part: MetaFormPart) => (creating ? (part === 'type' && !presetType) || part === 'name' : !parts || parts.includes(part));
  const [form, setForm] = useState<FormState>(() => initialState(meta, presetTypeId));
  // For a new meta, the code follows the name until the user edits the code themselves.
  const [codeTouched, setCodeTouched] = useState(meta !== null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [script, setScript] = useState<ScriptColumn>('event_expression_string');
  const [tags, setTags] = useState<Tag[]>([]);
  const typeCode = types.find((item) => String(item.id) === form.type_id)?.code;
  // A saved meta keeps its type (the API refuses a change): its parts and records are made for it.
  const typeLocked = !!meta?.type_id;
  // SQL, external services, scripts and opening a meta to everyone are for admins only (config/builders.php).
  const { isAdmin, customer } = useAuth();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const fe = (field: string) => fieldErrors[field]?.[0];
  const setService = (c: ServiceColumn, v: string) => setForm((f) => ({ ...f, service: { ...f.service, [c]: v } }));
  // A service field's error: the server's, else a JSON box that doesn't parse.
  const se = (c: ServiceColumn) => fe(c) ?? (SERVICE_JSON_COLUMNS.includes(c) ? jsonError(form.service[c]) : undefined);
  const listsByPost = form.service.service_list_body.trim() !== '';
  const usesService = form.service.service_url.trim() !== '';

  useEffect(() => {
    metaApi
      .tags()
      .then(setTags)
      .catch(() => setTags([]));
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

  // On the meta page each option is a row (its name and hint left, the control right); in the
  // dialog, a field with its label and hint above and below it, in groups.
  const row = (title: string, hint: ReactNode, control: ReactNode, wide = false) =>
    inline ? (
      <SettingRow title={title} hint={hint} wide={wide}>
        {control}
      </SettingRow>
    ) : (
      control
    );
  const group = (title: string, children: ReactNode, hideTitle = false) =>
    inline ? (
      children
    ) : (
      <Section title={title} hideTitle={hideTitle}>
        {children}
      </Section>
    );
  const pair = (children: ReactNode) => (inline ? children : <div className="grid gap-4 sm:grid-cols-2">{children}</div>);
  const named = (text: string) => (inline ? { 'aria-label': text } : { label: text });
  const hinted = <T,>(error: string | undefined, hint: T) => (inline ? error : (error ?? hint));
  const tipped = (error: string | undefined, hint: string) => (inline ? { hint: error, tooltip: hint } : { hint: error ?? hint });
  const toggleRow = (title: string, hint: ReactNode, isSelected: boolean, onChange: (on: boolean) => void) =>
    inline ? (
      <SettingRow title={title} hint={hint}>
        <Toggle aria-label={title} label={isSelected ? t('On') : t('Off')} isSelected={isSelected} onChange={onChange} />
      </SettingRow>
    ) : (
      <Toggle label={title} hint={hint} isSelected={isSelected} onChange={onChange} />
    );

  const serviceIntro = (
    <>
      {t(
        typeCode === 'form'
          ? 'Optional. With an address, this form reads and writes records through a REST service instead of the database table: GET for the list and one record (address/id), POST to add, PUT or PATCH to change, DELETE to remove. Params read and write fields by their field path, which may be a dot path such as'
          : 'Optional. With an address, this grid reads and writes records through a REST service instead of the database table: GET for the list and one record (address/id), POST to add, PUT or PATCH to change, DELETE to remove. Params read and write fields by their field path, which may be a dot path such as',
      )}{' '}
      <code className="text-xs">address.city</code>.
    </>
  );
  const tableHint = typeCode === 'structure' ? t('Its new table: small letters, digits and _.') : isAdmin ? t('The table this screen reads and writes.') : t('The table it reads and writes.');
  const tableField = row(
    t('Database table'),
    tableHint,
    <Input
      {...named(t('Database table'))}
      isOptional={!inline}
      value={form.table_name}
      onChange={(v) => set('table_name', v)}
      placeholder="customers"
      isInvalid={!!fe('table_name')}
      hint={hinted(fe('table_name'), tableHint)}
    />,
  );

  const body = (
    // In a dialog only .modal-scroll scrolls, so the scrollbar stops above the buttons (index.css).
    <form onSubmit={onSubmit} className={inline ? undefined : 'modal-split space-y-8'}>
      {/* On the meta page its heading and buttons sit on top, like the other sections. */}
      {inline && (
        <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-primary">{title ?? t('Options')}</h2>
            {description && <p className="mt-0.5 max-w-prose text-sm text-tertiary">{description}</p>}
          </div>
          <div className="flex shrink-0 gap-3">
            <Button
              size="sm"
              color="secondary"
              onPress={() => {
                setForm(initialState(meta, presetTypeId));
                setError(null);
                setFieldErrors({});
              }}
            >
              {t('Discard changes')}
            </Button>
            <Button size="sm" type="submit" isLoading={saving} showTextWhileLoading>
              {saving ? t('Saving…') : t('Save changes')}
            </Button>
          </div>
        </div>
      )}
      <div className={inline ? 'space-y-5 px-4 py-5 sm:px-5' : 'modal-scroll space-y-8'}>
        {error && <Alert>{error}</Alert>}
        <div className={inline ? 'divide-y divide-secondary' : 'space-y-8'}>
          {has('type') && (
            <Section title={t('Type')}>
              {typeLocked && <p className="text-sm text-tertiary">{t("A meta's type can't be changed once it is set.")}</p>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(typeLocked ? types.filter((item) => item.id === meta?.type_id) : types).map((item) => {
                  const look = typeLook(item.code);
                  const selected = form.type_id === String(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={typeLocked}
                      onClick={() => set('type_id', String(item.id))}
                      className={`flex items-center gap-2.5 rounded-xl bg-primary p-2 text-left ring-inset transition duration-100 ease-linear ${
                        selected ? 'ring-2' : 'ring-1 ring-secondary hover:ring-primary'
                      } ${typeLocked ? 'cursor-default' : ''}`}
                      style={selected ? { boxShadow: `inset 0 0 0 2px ${look.ink}` } : undefined}
                    >
                      <TypeIcon code={item.code} size="sm" />
                      <span className="min-w-0 truncate text-sm font-semibold text-primary">{item.name}</span>
                    </button>
                  );
                })}
              </div>
              {types.length === 0 && <p className="text-sm text-tertiary">{t('No meta types found. Add rows to the meta_types table first.')}</p>}
              {fe('type_id') && <p className="text-sm text-error-primary">{fe('type_id')}</p>}
            </Section>
          )}

          {has('name') &&
            // Details, not Name: the first field is already Name. Its heading goes when it is the only group.
            group(
              t('Details'),
              <>
                {pair(
                  <>
                    {row(
                      t('Name'),
                      t('What it is called in the builder.'),
                      <Input
                        {...named(t('Name'))}
                        isRequired
                        hideRequiredIndicator
                        autoFocus={!inline}
                        value={form.name}
                        onChange={onName}
                        placeholder={t('Customer list')}
                        isInvalid={!!fe('name')}
                        hint={fe('name')}
                      />,
                    )}
                    {row(
                      t('Code'),
                      t('Used in links and the API. Must be unique.'),
                      <Input
                        {...named(t('Code'))}
                        isRequired
                        hideRequiredIndicator
                        value={form.code}
                        onChange={(v) => {
                          setCodeTouched(true);
                          set('code', v);
                        }}
                        placeholder="customer_list"
                        isInvalid={!!fe('code')}
                        hint={hinted(fe('code'), t('Used in links and the API. Must be unique.'))}
                      />,
                    )}
                    {!creating &&
                      row(
                        t('Display label'),
                        t('Shown in the app. Empty: the name.'),
                        <Input
                          {...named(t('Display label'))}
                          isOptional={!inline}
                          value={form.label_name}
                          onChange={(v) => set('label_name', v)}
                          isInvalid={!!fe('label_name')}
                          hint={hinted(fe('label_name'), t('Shown in the app. Empty: the name.'))}
                        />,
                      )}
                    {/* Editing in the dialog, the table sits with the name; on the page, in Data source. */}
                    {!parts && !creating && tableField}
                  </>,
                )}
                {row(
                  t('Description'),
                  t('What it is for, shown under its name.'),
                  <TextArea
                    {...named(t('Description'))}
                    isOptional={!inline}
                    rows={3}
                    value={form.description}
                    onChange={(v) => set('description', v)}
                    isInvalid={!!fe('description')}
                    hint={fe('description')}
                  />,
                )}
                {row(
                  t('Tags'),
                  t('Enter adds a tag; a new name makes one.'),
                  <TagPicker
                    tags={tags}
                    value={form.tag_ids}
                    onChange={(ids) => set('tag_ids', ids)}
                    onCreated={(tag) => setTags((all) => (all.some((item) => item.id === tag.id) ? all : [...all, tag].sort((a, b) => a.name.localeCompare(b.name))))}
                    hint={fe('tag_ids')}
                    hideLabel={inline}
                  />,
                )}
              </>,
              creating && !has('type'),
            )}

          {parts?.includes('table') && group(t('Table'), inline ? tableField : <div className="grid gap-4 sm:grid-cols-2">{tableField}</div>)}

          {!isAdmin || !has('query')
            ? null
            : types.find((item) => String(item.id) === form.type_id)?.code === 'stage_query'
              ? group(
                  t('Query'),
                  row(
                    t('SQL that changes data'),
                    t('INSERT, UPDATE, DELETE or REPLACE, split by ;. All or nothing. :name = its parameters.'),
                    <TextArea
                      {...named(t('SQL that changes data'))}
                      rows={8}
                      value={form.query_string}
                      onChange={(v) => set('query_string', v)}
                      placeholder={
                        "UPDATE proc_purchase_requests\nSET status = 'rejected'\nWHERE status = 'draft' AND needed_by < :before;\n\nINSERT INTO audit_notes (note, created_by) VALUES ('Closed drafts', :user_id)"
                      }
                      textAreaClassName="font-mono text-sm"
                      isInvalid={!!fe('query_string')}
                      hint={hinted(fe('query_string'), t('INSERT, UPDATE, DELETE or REPLACE, split by ;. All or nothing. :name = its parameters.'))}
                    />,
                    true,
                  ),
                )
              : ['datagrid', 'get', 'calendar', 'gantt'].includes(types.find((item) => String(item.id) === form.type_id)?.code ?? '') &&
                group(
                  t('Query'),
                  row(
                    t('SQL query'),
                    t('Optional. Reads from this query instead of the table. :name comes from filters.'),
                    <TextArea
                      {...named(t('SQL query'))}
                      rows={6}
                      value={form.query_string}
                      onChange={(v) => set('query_string', v)}
                      placeholder={'SELECT o.id, o.po_number, s.name AS supplier_name\nFROM orders o JOIN suppliers s ON s.id = o.supplier_id\nWHERE (:status IS NULL OR o.status = :status)'}
                      textAreaClassName="font-mono text-sm"
                      isInvalid={!!fe('query_string')}
                      hint={hinted(fe('query_string'), t('Optional. Reads from this query instead of the table. :name comes from filters.'))}
                    />,
                    true,
                  ),
                )}

          {isAdmin &&
            has('service') &&
            (typeCode === 'form' || typeCode === 'datagrid') &&
            group(
              t('External service'),
              row(
                t('External service'),
                inline && serviceIntro,
                <div className="space-y-4">
                  {!inline && <p className="text-sm text-tertiary">{serviceIntro}</p>}
                  <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                    <Input
                      label={t('Address')}
                      value={form.service.service_url}
                      onChange={(v) => setService('service_url', v)}
                      placeholder="https://api.example.com/v1/suppliers"
                      inputClassName="font-mono text-sm"
                      isInvalid={!!se('service_url')}
                      {...tipped(se('service_url'), t('The list address; a record is address/id.'))}
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
                        placeholder={'{ "Authorization": "Bearer {env:SERVICE_SUPPLIER_TOKEN}" }'}
                        textAreaClassName="font-mono text-sm"
                        isInvalid={!!se('service_headers')}
                        {...tipped(se('service_headers'), t('JSON. Secrets as {env:SERVICE_…}. Admins only.'))}
                      />
                      <TextArea
                        label={t('List body')}
                        rows={listsByPost ? 8 : 2}
                        value={form.service.service_list_body}
                        onChange={(v) => setService('service_list_body', v)}
                        placeholder={'{ "request": { "sessionId": "{env:SERVICE_ERP_SESSION}", "command": "…", "parameters": { "from": "{filter.from}" } } }'}
                        textAreaClassName="font-mono text-sm"
                        isInvalid={!!se('service_list_body')}
                        {...tipped(se('service_list_body'), t('For lists read with a POST: the JSON body. Makes the list read-only.'))}
                      />
                      {!listsByPost && (
                        <TextArea
                          label={t('List query')}
                          rows={3}
                          value={form.service.service_query}
                          onChange={(v) => setService('service_query', v)}
                          placeholder={'{ "page": "{page}", "limit": "{per_page}", "q": "{search}", "status": "{filter.status}" }'}
                          textAreaClassName="font-mono text-sm"
                          isInvalid={!!se('service_query')}
                          {...tipped(se('service_query'), t('JSON query string. Can use {page} {search} {sort} {filter.name}…'))}
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
                          {...tipped(se('service_list_path'), t('Where the list is in the answer. Empty: the whole answer.'))}
                        />
                        <Input
                          label={t('Total at')}
                          value={form.service.service_total_path}
                          onChange={(v) => setService('service_total_path', v)}
                          placeholder="meta.total"
                          inputClassName="font-mono text-sm"
                          isInvalid={!!se('service_total_path')}
                          {...tipped(se('service_total_path'), t('Optional, for page counts.'))}
                        />
                        <Input
                          label={t('Record at')}
                          value={form.service.service_record_path}
                          onChange={(v) => setService('service_record_path', v)}
                          placeholder="data"
                          inputClassName="font-mono text-sm"
                          isInvalid={!!se('service_record_path')}
                          {...tipped(se('service_record_path'), t('Where one record sits in its answer.'))}
                        />
                      </div>
                    </>
                  )}
                </div>,
                true,
              ),
            )}

          {isAdmin &&
            has('scripts') &&
            typeCode === 'form' &&
            group(
              t('Scripts'),
              // No name on the left: the section is only this. Its help sits beside the pills.
              <div className="space-y-4">
                <div className="flex items-center gap-2">
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
                  {inline && (
                    <Tooltip
                      title={
                        <>
                          {t('Pick when it runs. A dot marks ones with a script.')} {scriptHelp(SCRIPTS.find((sc) => sc.column === script)?.hint ?? '')}
                        </>
                      }
                      placement="top"
                    >
                      <TooltipTrigger
                        aria-label={t('About {name}', { name: t('Scripts') })}
                        className="cursor-pointer text-fg-quaternary transition duration-200 hover:text-fg-quaternary_hover focus:text-fg-quaternary_hover"
                      >
                        <HelpCircle className="size-4" />
                      </TooltipTrigger>
                    </Tooltip>
                  )}
                </div>
                {SCRIPTS.filter((sc) => sc.column === script).map((sc) => (
                  <CodeEditor
                    key={sc.column}
                    label={`${t(sc.label)} (JavaScript)`}
                    hideLabel={inline}
                    value={form.scripts[sc.column]}
                    onChange={(v) => setForm((f) => ({ ...f, scripts: { ...f.scripts, [sc.column]: v } }))}
                    names={SCRIPT_NAMES}
                    placeholder={sc.placeholder}
                    isInvalid={!!fe(sc.column)}
                    hint={fe(sc.column) ?? (inline ? undefined : scriptHelp(sc.hint))}
                  />
                ))}
              </div>,
            )}

          {has('links') &&
            group(
              usesRefersTo(typeCode, form.ref_meta_id) ? t('Links') : t('Access'),
              <>
                {usesRefersTo(typeCode, form.ref_meta_id) &&
                  row(
                    t('Refers to'),
                    t(REFERS_TO_HINTS[typeCode ?? ''] ?? 'Another meta this one is based on or opens.'),
                    <MetaLookupField
                      {...named(t('Refers to'))}
                      isOptional={!inline}
                      value={form.ref_meta_id}
                      onChange={(v) => set('ref_meta_id', v)}
                      hint={hinted(fe('ref_meta_id'), t(REFERS_TO_HINTS[typeCode ?? ''] ?? 'Another meta this one is based on or opens.'))}
                      items={metaChoices(options.filter((o) => o.id !== meta?.id))}
                    />,
                  )}
                {toggleRow(t('Active'), t('Inactive metas are hidden from apps.'), form.is_active, (v) => set('is_active', v))}
                {isAdmin &&
                  toggleRow(
                    t('Public'),
                    form.is_public && meta
                      ? t('Anyone may open it at {url} and add records without signing in.', { url: `${window.location.origin}${publicPath(customer, `/portal/${meta.id}`)}` })
                      : t('Anyone may open it and add records without signing in.'),
                    form.is_public,
                    (v) => set('is_public', v),
                  )}
                {isAdmin && toggleRow(t('Open to everyone signed in'), t('Every signed-in user may view it, without a role.'), form.is_open, (v) => set('is_open', v))}
                {(typeCode === 'form' || typeCode === 'excel_import' || typeCode === 'matrix') &&
                  toggleRow(
                    t('Keep a log of changes'),
                    t('Each save’s changes show under History.', {
                      kind: t(typeCode === 'form' ? 'form' : typeCode === 'matrix' ? 'matrix' : 'import'),
                    }),
                    form.is_log,
                    (v) => set('is_log', v),
                  )}
              </>,
            )}
        </div>
      </div>

      {!inline && (
        <div className="modal-footer flex justify-end gap-3 border-t border-secondary pt-5">
          <Button size="lg" color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button size="lg" type="submit" isLoading={saving} showTextWhileLoading>
            {saving ? t('Saving…') : meta ? t('Save changes') : t('Create meta')}
          </Button>
        </div>
      )}
    </form>
  );

  if (inline) {
    return (
      <section aria-label={title ?? t('Options')} className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        {body}
      </section>
    );
  }

  return (
    <Modal
      title={meta ? t('Edit {name}', { name: meta.name }) : presetType ? t('New {type}', { type: presetType.name }) : t('New meta')}
      description={meta ? undefined : presetType ? t('Give it a name and code.') : t('Pick what kind of screen this is, then give it a name.')}
      // The type it is, when that is already known: its own type, or the one picked before opening.
      icon={meta?.type?.code || presetType ? <TypeIcon code={meta?.type?.code ?? presetType?.code} size="md" /> : undefined}
      onClose={onClose}
      size="lg"
    >
      {body}
    </Modal>
  );
}

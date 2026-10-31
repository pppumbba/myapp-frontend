import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle, ClockRewind, Plus, Printer } from '@untitledui/icons';
import { Modal } from '../components/Modal';
import { ReportView } from './ReportView';
import { RecordHistory } from './RecordHistory';
import { ApiError } from '../lib/api';
import { dataApi, type DataRow } from '../lib/dataApi';
import type { ProcessRun } from '../lib/processFlowApi';
import type { MetaParam } from '../lib/metaApi';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { ComboField } from '../components/ComboField';
import { DatePicker } from '../components/DatePicker';
import { Input } from '@/components/base/input/input';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { formatNumber } from './Cell';
import { blankLine, DetailSection, detailPayload, lineAmount, startLines, type Line } from './DetailLines';
import { autonumberFields, autonumberOf, detailParams, filledFrom, isOneToOne, optionsOf, primaryKey, title, useDetailTree, useMetaDef, visibleParams } from './definitions';
import { startValues, toPayload, type Values } from './formValues';
import { lineChanges, runScript, scriptsOf, type ScriptEvent, type ScriptKind, type ScriptState } from './formScript';
import { LookupField } from './LookupField';
import { FileField } from './FileField';
import { DocumentCard, DocumentEditor } from './DocumentEditor';
import type { MetaDef } from './definitions';
import { isFileParam } from '../lib/contentApi';
import { useAuth } from '../auth/AuthContext';
import { useAppMetaId } from './appContext';
import { criteriaPasses, type CriteriaVars } from './criteria';
import type { DetailNode } from './definitions';
import { t } from '@/i18n';

const wide = (f: MetaParam) => f.render_type === 'textarea' || f.data_type === 'text' || f.data_type === 'boolean' || f.data_type === 'document' || isFileParam(f);

const pulse = 'animate-pulse motion-reduce:animate-none';

/**
 * Shown while a form loads: its own fields' shape once the definition is in (generic before
 * that), so the modal doesn't jump when the form arrives.
 */
function FormSkeleton({ fields, details }: { fields: MetaParam[]; details: number }) {
  const slots: (MetaParam | null)[] = fields.length ? fields.slice(0, 12) : [null, null, null, null];
  return (
    <div className="space-y-5" aria-busy="true" aria-label={t('Loading')}>
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        {slots.map((f, i) => (
          <div key={f?.field_path ?? i} className={f && wide(f) ? 'sm:col-span-2' : undefined}>
            <div className={`${pulse} mb-2 h-3 rounded bg-tertiary`} style={{ width: `${30 + ((i * 17) % 35)}%` }} />
            <div className={`${pulse} ${f && (f.render_type === 'textarea' || f.data_type === 'text') ? 'h-20' : 'h-10'} rounded-lg bg-secondary`} />
          </div>
        ))}
      </div>
      {Array.from({ length: details }, (_, i) => (
        <div key={i} className={`${pulse} h-32 rounded-xl bg-secondary`} />
      ))}
    </div>
  );
}
/** Never changed on a document's page: what the server or the lines work out, and parts that are not values. */
const NOT_ON_PAGE = ['document', 'detail', 'subgrid', 'signature'];
/** A typed-in number, not a lookup's id or a choice from a list. */
const isNumber = (f: MetaParam) => (f.data_type === 'integer' || f.data_type === 'decimal') && !f.is_select && !optionsOf(f);

/**
 * A form meta as a working form. With recordId it edits that record, otherwise it adds one.
 * embedded: inside a modal opened from a grid. Otherwise it's a page of its own (e.g. a
 * "New request" menu item) and stays open for the next entry after saving.
 * defaults: starting values for a new record, e.g. the day picked on a calendar.
 * fill: a get meta and its named parameters; its first row decides the values the form
 * opens with (over the record's own values when editing).
 * fixed: values the record always has, e.g. a workspace's tender_id; their fields are not
 * shown, and they are sent with every save.
 * Besides Save: Save and add saves and starts a new record (json_config.save_and_add false
 * hides it); Save and print saves and prints the record with the report in
 * json_config.print_meta_id. onSaved's next is "new" when the form stays open for another.
 * A document param (data_type "document", ref_meta_id a report) opens its report's page to
 * fill in (DocumentEditor): only the fields this form lets you change can be changed there,
 * and its Save and print prints that report.
 * Detail params (data_type "detail") add editable line items, saved with the record. A
 * detail's json_config.amount and total_field make the header total follow the lines,
 * unless the form has an event script, which then works out its fields itself (the server
 * still totals on save).
 * Scripts (see formScript.ts): the form's load, event, before_save and after_save scripts,
 * and each line form's event script for its own lines.
 */
export function FormView({
  metaId,
  recordId,
  defaults,
  fill,
  fixed,
  embedded,
  onSaved,
  onCancel,
}: {
  metaId: number;
  recordId?: string | null;
  defaults?: DataRow;
  fixed?: Record<string, string>;
  fill?: { metaId: number; params: Record<string, string> };
  embedded?: boolean;
  onSaved?: (row: DataRow, next?: 'new') => void;
  onCancel?: () => void;
}) {
  const { def, error: defError } = useMetaDef(metaId);
  const config = def?.meta.json_config ?? {};
  const printId = typeof config.print_meta_id === 'number' ? config.print_meta_id : null;
  const { def: printDef } = useMetaDef(printId);
  // After Save and add on a record being edited, the form goes on with a new one.
  const [adding, setAdding] = useState(false);
  useEffect(() => setAdding(false), [recordId]);
  const currentId = adding ? null : (recordId ?? null);
  // Bumped to start a fresh new record.
  const [fresh, setFresh] = useState(0);
  // A record just saved with Save and print, shown with its report; closing goes on.
  const [printing, setPrinting] = useState<{ id: string; row: DataRow; def: MetaDef } | null>(null);
  // A document field open on its page, and its report (Save and print prints it).
  const [editing, setEditing] = useState<MetaParam | null>(null);
  const { def: editingDef } = useMetaDef(editing?.ref_meta_id ?? null);
  const [showHistory, setShowHistory] = useState(false);
  const fields = useMemo(() => (def ? visibleParams(def.params).filter((p) => !(fixed && p.field_path in fixed)) : []), [def, fixed]);
  // The details, each with its line form and the details of its lines.
  const { tree, error: lineDefError } = useDetailTree(def);
  const details = useMemo(() => (tree ?? []).map((n) => n.detail), [tree]);
  // What a detail's criteria can use besides the form's values, as the server gives it (Criteria::userVars).
  const { user, access, session } = useAuth();
  const appMetaId = useAppMetaId();
  const userVars = useMemo((): CriteriaVars => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return {
      ...session,
      sessionUserId: user?.id ?? null,
      sessionUserName: user?.name ?? null,
      sessionUserEmail: user?.email ?? null,
      roleId: (access?.roles ?? []).map((r) => r.id),
      today,
      now: `${today} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      appMetaId,
    };
  }, [session, user, access, appMetaId]);

  const [values, setValues] = useState<Values | null>(null);
  const [lines, setLines] = useState<Record<string, Line[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // The forms its process flow saved along with it.
  const [alsoSaved, setAlsoSaved] = useState<ProcessRun[]>([]);
  const [nextNumbers, setNextNumbers] = useState<Record<string, string>>({});

  // Scripts: the form's own, and each line form's (by detail field).
  const scripts = useMemo(() => scriptsOf(def?.meta), [def]);
  const lineScripts = useMemo(() => Object.fromEntries((tree ?? []).map((n) => [n.detail.field_path, scriptsOf(n.def.meta)])), [tree]);
  // Fields a script hid or made read-only, and what its message() calls said.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [locked, setLocked] = useState<Set<string>>(() => new Set());
  const [notes, setNotes] = useState<string[]>([]);
  // The latest state, for scripts started by an event (state set during it isn't rendered yet).
  const latest = useRef<ScriptState>({ values: {}, lines: {}, hidden, readonly: locked });
  latest.current = { values: values ?? {}, lines, hidden, readonly: locked };
  const mode: ScriptEvent['mode'] = currentId ? 'edit' : 'new';

  /** Takes over what a script left: values, lines, hidden and read-only fields. */
  function adopt(state: ScriptState) {
    latest.current = state;
    setValues(state.values);
    setLines(state.lines);
    setHidden(state.hidden);
    setLocked(state.readonly);
  }

  /**
   * Runs a script on the given state; a failing one shows its error and leaves the state as it
   * was. lineOf: a line form's script, on that line.
   */
  async function script(kind: ScriptKind, state: ScriptState, event: Omit<ScriptEvent, 'mode'>, lineOf?: { detail: string; index: number }) {
    try {
      const result = await runScript(lineOf ? (lineScripts[lineOf.detail] ?? {}) : scripts, kind, state, { ...event, mode }, lineOf);
      if (result.messages.length) setNotes(result.messages);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return { state, messages: [] };
    }
  }

  // A new record shows the numbers it will get; they follow the fields that pick their format.
  const autos = useMemo(() => fields.filter((f) => autonumberOf(f)), [fields]);
  const autoDeps = useMemo(() => [...new Set(autos.flatMap((f) => autonumberFields(autonumberOf(f)!)))], [autos]);
  const autoKey = values && !currentId ? JSON.stringify(autoDeps.map((d) => values[d] ?? '')) : '';

  useEffect(() => {
    if (!def || currentId || autos.length === 0 || !values) return;
    let live = true;
    const params = Object.fromEntries(autoDeps.filter((d) => values[d] !== undefined && values[d] !== '').map((d) => [d, String(values[d])]));
    const timer = setTimeout(() => {
      dataApi.autonumber(def.meta.id, params).then(
        (numbers) => live && setNextNumbers(numbers),
        () => live && setNextNumbers({}),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [def, currentId, autos, autoKey, saved]);

  // A new record starts with one empty line per detail.
  const freshLines = () => Object.fromEntries((tree ?? []).map((n) => [n.detail.field_path, [blankLine(n)]]));

  // The get meta's values win over the record's own and over defaults.
  const fillKey = fill ? `${fill.metaId}:${JSON.stringify(fill.params)}` : '';

  useEffect(() => {
    if (!def || !tree) return;
    let live = true;
    const filled: Promise<DataRow> = fill ? dataApi.fill(fill.metaId, fill.params) : Promise.resolve({});
    const fail = (err: unknown) => live && setLoadError(err instanceof ApiError ? err.message : t('This record could not be loaded.'));

    // The load script gets the starting values before they are shown.
    const start = async (values: Values, lines: Record<string, Line[]>) => {
      setNotes([]);
      const { state } = await script('load', { values, lines, hidden: new Set(), readonly: new Set() }, {});
      if (live) adopt(state);
    };

    if (!currentId) {
      filled.then((values) => {
        if (!live) return;
        return start(startValues(fields, null, { ...defaults, ...values }), freshLines());
      }, fail);
    } else {
      Promise.all([dataApi.get(def.meta.id, currentId), filled]).then(([row, values]) => {
        if (!live) return;
        return start(startValues(fields, { ...row, ...values }), Object.fromEntries(tree.map((n) => [n.detail.field_path, startLines(n, row[n.detail.field_path])])));
      }, fail);
    }
    return () => {
      live = false;
    };
  }, [def, fields, tree, currentId, fillKey, fresh]);

  if (defError || lineDefError || loadError) return <Alert>{defError ?? lineDefError ?? loadError}</Alert>;
  if (!def || !tree || !values) return <FormSkeleton fields={fields} details={def ? detailParams(def.params).length : 0} />;

  /** A field changed: take it (and what a lookup fills), then let the event script react. */
  const set = async (field: string, value: string | boolean, fill?: Record<string, string>) => {
    setSaved(false);
    const state = { ...latest.current, values: { ...latest.current.values, ...fill, [field]: value } };
    adopt(state);
    if (scripts.event) adopt((await script('event', state, { field, value })).state);
  };

  /**
   * A detail's lines changed: the line form's event script runs on each changed line, then
   * the form's own event script once per changed field (field is empty for an added or
   * removed line).
   */
  const setDetail = async (detail: string, next: Line[]) => {
    setSaved(false);
    const changes = lineChanges(latest.current.lines[detail] ?? [], next);
    let state: ScriptState = { ...latest.current, lines: { ...latest.current.lines, [detail]: next } };
    adopt(state);
    if (!lineScripts[detail]?.event && !scripts.event) return;
    for (const c of changes) {
      if (lineScripts[detail]?.event && c.field) {
        state = (await script('event', state, { field: c.field, value: c.value, detail, line: c.index }, { detail, index: c.index })).state;
      }
      if (scripts.event) state = (await script('event', state, { field: c.field, value: c.value, detail, line: c.index })).state;
    }
    adopt(state);
  };
  const fe = (field: string) => fieldErrors[field]?.[0];

  /**
   * The details a save takes with these values: those whose json_config.criteria holds, as the
   * server decides (record values over userVars). One whose criteria can't be read is left
   * out, with the reason.
   */
  function applicable(state: ScriptState): { nodes: DetailNode[]; problems: string[] } {
    const vars: CriteriaVars = { ...userVars, ...fixed, ...state.values };
    const problems: string[] = [];
    const nodes = tree!.filter((n) => {
      try {
        const criteria = n.detail.json_config?.criteria;
        return criteriaPasses(typeof criteria === 'string' ? criteria : null, vars);
      } catch (err) {
        problems.push(t('The criteria of "{name}": {error}', { name: n.detail.label_name || n.detail.field_path, error: err instanceof Error ? err.message : String(err) }));
        return false;
      }
    });
    return { nodes, problems };
  }
  const shown = applicable({ values, lines, hidden, readonly: locked });

  // Header fields a detail sums into: field_path -> the current total. A form with an event
  // script works out its own.
  const totals = new Map(
    scripts.event
      ? []
      : details.flatMap((d) => {
          const field = d.json_config?.total_field;
          if (typeof field !== 'string' || isOneToOne(d)) return [];
          return [[field, (lines[d.field_path] ?? []).reduce((sum, l) => sum + (lineAmount(d, l) ?? 0), 0)] as const];
        }),
  );

  function payload(state: ScriptState): DataRow {
    const out = { ...toPayload(fields, state.values), ...fixed };
    totals.forEach((sum, field) => (out[field] = Math.round(sum * 100) / 100));
    applicable(state).nodes.forEach((n) => (out[n.detail.field_path] = detailPayload(n, state.lines[n.detail.field_path] ?? [])));
    if (appMetaId) out._context = { app_meta_id: appMetaId };
    return out;
  }

  /** What follows a save: close or go on (save), start a new record (add), or print it first (print). */
  function afterSave(row: DataRow, next: 'save' | 'add') {
    const startNew = next === 'add' || (!embedded && !currentId);
    if (startNew) {
      setAdding(true);
      setFresh((n) => n + 1);
      setSaved(true);
      setAlsoSaved((row._processes as ProcessRun[] | undefined) ?? []);
    }
    onSaved?.(row, next === 'add' ? 'new' : undefined);
  }

  async function submit(next: 'save' | 'add' | 'print', printWith: MetaDef | null = printDef) {
    if (!def || !values) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    setNotes([]);
    try {
      // The before_save script may change values, or stop the save with error('…').
      const before = await script('before_save', latest.current, {});
      if (before.stopped) {
        adopt(before.state);
        setError(before.stopped);
        return;
      }
      if (before.state !== latest.current) adopt(before.state);
      const body = payload(before.state);
      const row = currentId ? await dataApi.update(def.meta.id, currentId, body) : await dataApi.create(def.meta.id, body);
      if (scripts.after_save) {
        const after = await script('after_save', before.state, { row });
        if (after.stopped) setError(after.stopped);
      }
      setEditing(null);
      if (next === 'print' && printWith) setPrinting({ id: String(row[primaryKey(def.params)]), row, def: printWith });
      else afterSave(row, next === 'print' ? 'save' : next);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {});
        if (!err.errors) setError(err.message);
      } else {
        setError(t('This could not be saved. Check that the API is running.'));
      }
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit('save');
  }
  const canAdd = config.save_and_add !== false && (embedded || !!currentId);

  const form = (
    // In a modal only .modal-scroll scrolls, so the scrollbar stops above the buttons (index.css).
    <form onSubmit={onSubmit} className="modal-split space-y-5 animate-in fade-in duration-200 motion-reduce:animate-none">
      <div className="modal-scroll space-y-5">
        {error && <Alert>{error}</Alert>}
        {notes.length > 0 && (
          <div role="status" className="space-y-1 rounded-xl bg-secondary p-4 text-sm text-secondary ring-1 ring-secondary ring-inset">
            {notes.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </div>
        )}
        {saved && user?.preferences?.form_saved_notice && (
          <div role="status" className="flex gap-3 rounded-xl bg-success-primary p-4 ring-1 ring-success-secondary ring-inset">
            <CheckCircle className="size-5 shrink-0 text-fg-success-primary" aria-hidden="true" />
            <div className="text-sm text-success-primary">
              <p className="font-medium">{t('Saved. You can add another one.')}</p>
              {alsoSaved.length > 0 && <p>{t('Also saved: {records}.', { records: alsoSaved.map((r) => (r.id ? `${r.process} #${r.id}` : r.process)).join(', ') })}</p>}
            </div>
          </div>
        )}

        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
          {fields
            .filter((f) => !hidden.has(f.field_path))
            .map((f) => {
              const auto = autonumberOf(f);
              const next = recordId ? undefined : nextNumbers[f.field_path];
              const readOnly = locked.has(f.field_path);
              return (
                <div key={f.field_path} className={wide(f) ? 'sm:col-span-2' : undefined}>
                  {f.data_type === 'document' ? (
                    <DocumentCard param={f} value={values[f.field_path]} onOpen={() => setEditing(f)} />
                  ) : auto && !auto.editable ? (
                    <Input
                      label={f.label_name || f.param_name}
                      value={recordId ? String(values[f.field_path] ?? '') : (next ?? '…')}
                      isReadOnly
                      isInvalid={!!fe(f.field_path)}
                      hint={fe(f.field_path) ?? (currentId ? t('Numbered when it was added.') : t('Given when saved: this is the next number.'))}
                      wrapperClassName="bg-secondary shadow-none"
                      inputClassName="tabular-nums"
                    />
                  ) : totals.has(f.field_path) ? (
                    <Input
                      label={f.label_name || f.param_name}
                      value={formatNumber(totals.get(f.field_path))}
                      isReadOnly
                      hint={t('Worked out from the lines below.')}
                      wrapperClassName="bg-secondary shadow-none"
                      inputClassName="font-semibold tabular-nums"
                    />
                  ) : readOnly && isNumber(f) ? (
                    // A number a script works out, shown like a total.
                    <Input
                      label={f.label_name || f.param_name}
                      value={values[f.field_path] === '' ? '' : formatNumber(Number(values[f.field_path]))}
                      isReadOnly
                      isInvalid={!!fe(f.field_path)}
                      hint={fe(f.field_path)}
                      wrapperClassName="bg-secondary shadow-none"
                      inputClassName="font-semibold tabular-nums"
                    />
                  ) : readOnly ? (
                    <fieldset disabled className="contents">
                      <Field param={f} value={values[f.field_path]} error={fe(f.field_path)} onChange={() => {}} />
                    </fieldset>
                  ) : (
                    <Field
                      param={f}
                      value={values[f.field_path]}
                      error={fe(f.field_path)}
                      hint={auto && next ? t('Leave blank for {next}.', { next }) : undefined}
                      optional={!!auto && !recordId}
                      onChange={(v, fill) => set(f.field_path, v, fill)}
                    />
                  )}
                </div>
              );
            })}
          {shown.problems.map((p) => (
            <div key={p} className="sm:col-span-2">
              <Alert>{p}</Alert>
            </div>
          ))}
          {shown.nodes.map((n) => (
            <DetailSection
              key={n.detail.field_path}
              node={n}
              lines={lines[n.detail.field_path] ?? []}
              errors={fieldErrors}
              onChange={(next) => setDetail(n.detail.field_path, next)}
            />
          ))}
        </div>
      </div>

      <div className="modal-footer flex justify-end gap-2 border-t border-secondary pt-4">
        {currentId && def?.meta.is_log && (
          <Button size="sm" color="tertiary" iconLeading={ClockRewind} className="mr-auto" onPress={() => setShowHistory(true)}>
            {t('History')}
          </Button>
        )}
        {onCancel && (
          <Button size="sm" color="secondary" onPress={onCancel}>
            {t('Cancel')}
          </Button>
        )}
        {canAdd && (
          <Button size="sm" color="secondary" iconLeading={Plus} isDisabled={saving} onPress={() => submit('add')}>
            {t('Save and add')}
          </Button>
        )}
        {printDef && (
          <Button size="sm" color="secondary" iconLeading={Printer} isDisabled={saving} onPress={() => submit('print')}>
            {t('Save and print')}
          </Button>
        )}
        <Button size="sm" type="submit" isLoading={saving} showTextWhileLoading>
          {saving ? t('Saving…') : currentId ? t('Save changes') : t('Save')}
        </Button>
      </div>
      {showHistory && currentId && def && <RecordHistory metaId={def.meta.id} recordId={currentId} params={def.params} tree={tree ?? []} onClose={() => setShowHistory(false)} />}
      {editing && (
        <DocumentEditor
          formMetaId={def.meta.id}
          param={editing}
          recordId={currentId}
          payload={payload({ values, lines, hidden, readonly: locked })}
          fields={fields}
          values={values}
          errors={fieldErrors}
          error={error}
          editable={(f) => {
            const auto = autonumberOf(f);
            return !NOT_ON_PAGE.includes(f.data_type) && !hidden.has(f.field_path) && !locked.has(f.field_path) && !totals.has(f.field_path) && !(auto && !auto.editable);
          }}
          onValue={(field, v) => set(field, v)}
          renderField={(f) => <Field param={f} value={values[f.field_path]} error={fe(f.field_path)} onChange={(v, fill) => set(f.field_path, v, fill)} />}
          renderLines={(detail) => {
            const n = shown.nodes.find((x) => x.detail.field_path === detail);
            return n ? <DetailSection node={n} lines={lines[detail] ?? []} errors={fieldErrors} onChange={(next) => setDetail(detail, next)} /> : null;
          }}
          saving={saving}
          onSaveAndPrint={() => submit('print', editingDef)}
          onClose={() => setEditing(null)}
        />
      )}
      {printing && (
        <Modal
          title={t('Saved. Printing {name}', { name: title(printing.def.meta).toLowerCase() })}
          onClose={() => {
            const { row } = printing;
            setPrinting(null);
            afterSave(row, 'save');
          }}
          size="xl"
        >
          <ReportView def={printing.def} recordId={printing.id} autoPrint />
        </Modal>
      )}
    </form>
  );

  if (embedded) return form;

  return (
    // Opened from an app's menu, the form sits in the middle of the page.
    <div className={`${details.some((d) => !isOneToOne(d)) ? 'max-w-6xl' : 'max-w-3xl'} ${appMetaId ? 'mx-auto' : ''} rounded-xl bg-primary shadow-xs ring-1 ring-secondary`}>
      <div className="border-b border-secondary px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold text-primary">{title(def.meta)}</h2>
        {def.meta.description && <p className="mt-1 text-sm text-tertiary">{def.meta.description}</p>}
      </div>
      <div className="px-4 py-5 sm:px-5">{form}</div>
    </div>
  );
}

/** Picks the Untitled UI control for one param. Picking a lookup record also returns the values json_config.fill copies from it. */
function Field({
  param: f,
  value,
  error,
  hint,
  optional,
  onChange,
}: {
  param: MetaParam;
  value: string | boolean;
  error?: string;
  /** Shown under the field when there is no error. */
  hint?: string;
  /** May be left blank even if the param is required, e.g. an autonumber. */
  optional?: boolean;
  onChange: (value: string | boolean, fill?: Record<string, string>) => void;
}) {
  const label = f.label_name || f.param_name;
  const options = optionsOf(f);
  const common = { label, isRequired: f.is_required && !optional, isInvalid: !!error, hint: error ?? hint };

  if (f.data_type === 'boolean') {
    return <Toggle label={label} hint={error} isSelected={value === true} onChange={onChange} />;
  }

  if (isFileParam(f)) {
    return <FileField param={f} value={String(value)} error={error} required={common.isRequired} onChange={onChange} />;
  }

  if (f.is_select && f.ref_meta_id) {
    return <LookupField {...common} param={f} value={String(value)} onChange={(v, row) => onChange(v, filledFrom(f, row))} />;
  }

  if (options) {
    return <ComboField {...common} items={options} value={String(value)} onChange={onChange} />;
  }

  if (f.data_type === 'date' || f.data_type === 'datetime') {
    return <DatePicker {...common} withTime={f.data_type === 'datetime'} value={String(value)} onChange={onChange} />;
  }

  if (f.render_type === 'textarea' || f.data_type === 'text') {
    return <TextArea {...common} rows={3} value={String(value)} onChange={onChange} />;
  }

  const type = f.data_type === 'integer' || f.data_type === 'decimal' ? 'number' : f.render_type === 'email' ? 'email' : 'text';

  return <Input {...common} type={type} value={String(value)} onChange={onChange} />;
}

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle, Plus, Printer } from '@untitledui/icons';
import { Modal } from '../components/Modal';
import { ReportView } from './ReportView';
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
import { blankLine, DetailLines, lineAmount, linesPayload, startLines, type Line } from './DetailLines';
import { autonumberFields, autonumberOf, filledFrom, optionsOf, primaryKey, title, useDetailTree, useMetaDef, visibleParams } from './definitions';
import { startValues, toPayload, type Values } from './formValues';
import { lineChanges, runScript, scriptsOf, type ScriptEvent, type ScriptKind, type ScriptState } from './formScript';
import { LookupField } from './LookupField';

const wide = (f: MetaParam) => f.render_type === 'textarea' || f.data_type === 'text' || f.data_type === 'boolean';
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
  const [printing, setPrinting] = useState<{ id: string; row: DataRow } | null>(null);
  const fields = useMemo(() => (def ? visibleParams(def.params).filter((p) => !(fixed && p.field_path in fixed)) : []), [def, fixed]);
  // The details, each with its line form and the details of its lines.
  const { tree, error: lineDefError } = useDetailTree(def);
  const details = useMemo(() => (tree ?? []).map((n) => n.detail), [tree]);

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
    const fail = (err: unknown) => live && setLoadError(err instanceof ApiError ? err.message : 'This record could not be loaded.');

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
        return start(
          startValues(fields, { ...row, ...values }),
          Object.fromEntries(tree.map((n) => [n.detail.field_path, startLines(n, row[n.detail.field_path])])),
        );
      }, fail);
    }
    return () => {
      live = false;
    };
  }, [def, fields, tree, currentId, fillKey, fresh]);

  if (defError || lineDefError || loadError) return <Alert>{defError ?? lineDefError ?? loadError}</Alert>;
  if (!def || !tree || !values) return <div className="h-48 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />;

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

  // Header fields a detail sums into: field_path -> the current total. A form with an event
  // script works out its own.
  const totals = new Map(
    scripts.event
      ? []
      : details.flatMap((d) => {
          const field = d.json_config?.total_field;
          if (typeof field !== 'string') return [];
          return [[field, (lines[d.field_path] ?? []).reduce((sum, l) => sum + (lineAmount(d, l) ?? 0), 0)] as const];
        }),
  );

  function payload(state: ScriptState): DataRow {
    const out = { ...toPayload(fields, state.values), ...fixed };
    totals.forEach((sum, field) => (out[field] = Math.round(sum * 100) / 100));
    tree!.forEach((n) => (out[n.detail.field_path] = linesPayload(n, state.lines[n.detail.field_path] ?? [])));
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

  async function submit(next: 'save' | 'add' | 'print') {
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
      if (next === 'print' && printDef) setPrinting({ id: String(row[primaryKey(def.params)]), row });
      else afterSave(row, next === 'print' ? 'save' : next);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {});
        if (!err.errors) setError(err.message);
      } else {
        setError('This could not be saved. Check that the API is running.');
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
    <form onSubmit={onSubmit} className="space-y-5">
      {error && <Alert>{error}</Alert>}
      {notes.length > 0 && (
        <div role="status" className="space-y-1 rounded-xl bg-secondary p-4 text-sm text-secondary ring-1 ring-secondary ring-inset">
          {notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}
      {saved && (
        <div role="status" className="flex gap-3 rounded-xl bg-success-primary p-4 ring-1 ring-success-secondary ring-inset">
          <CheckCircle className="size-5 shrink-0 text-fg-success-primary" aria-hidden="true" />
          <div className="text-sm text-success-primary">
            <p className="font-medium">Saved. You can add another one.</p>
            {alsoSaved.length > 0 && <p>Also saved: {alsoSaved.map((r) => (r.id ? `${r.process} #${r.id}` : r.process)).join(', ')}.</p>}
          </div>
        </div>
      )}

      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        {fields.filter((f) => !hidden.has(f.field_path)).map((f) => {
          const auto = autonumberOf(f);
          const next = recordId ? undefined : nextNumbers[f.field_path];
          const readOnly = locked.has(f.field_path);
          return (
          <div key={f.field_path} className={wide(f) ? 'sm:col-span-2' : undefined}>
            {auto && !auto.editable ? (
              <Input
                label={f.label_name || f.param_name}
                value={recordId ? String(values[f.field_path] ?? '') : (next ?? '…')}
                isReadOnly
                isInvalid={!!fe(f.field_path)}
                hint={fe(f.field_path) ?? (currentId ? 'Numbered when it was added.' : 'Given when saved: this is the next number.')}
                wrapperClassName="bg-secondary shadow-none"
                inputClassName="tabular-nums"
              />
            ) : totals.has(f.field_path) ? (
              <Input
                label={f.label_name || f.param_name}
                value={formatNumber(totals.get(f.field_path))}
                isReadOnly
                hint="Worked out from the lines below."
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
                hint={auto && next ? `Leave blank for ${next}.` : undefined}
                optional={!!auto && !recordId}
                onChange={(v, fill) => set(f.field_path, v, fill)}
              />
            )}
          </div>
          );
        })}
        {tree.map((n) => (
          <DetailLines
            key={n.detail.field_path}
            node={n}
            lines={lines[n.detail.field_path] ?? []}
            errors={fieldErrors}
            onChange={(next) => setDetail(n.detail.field_path, next)}
          />
        ))}
      </div>

      <div className="modal-footer flex justify-end gap-3 border-t border-secondary pt-5">
        {onCancel && (
          <Button size="lg" color="secondary" onPress={onCancel}>
            Cancel
          </Button>
        )}
        {canAdd && (
          <Button size="lg" color="secondary" iconLeading={Plus} isDisabled={saving} onPress={() => submit('add')}>
            Save and add
          </Button>
        )}
        {printDef && (
          <Button size="lg" color="secondary" iconLeading={Printer} isDisabled={saving} onPress={() => submit('print')}>
            Save and print
          </Button>
        )}
        <Button size="lg" type="submit" isLoading={saving} showTextWhileLoading>
          {saving ? 'Saving…' : currentId ? 'Save changes' : 'Save'}
        </Button>
      </div>
      {printing && printDef && (
        <Modal
          title={`Saved. Printing ${title(printDef.meta).toLowerCase()}`}
          onClose={() => {
            const { row } = printing;
            setPrinting(null);
            afterSave(row, 'save');
          }}
          size="xl"
        >
          <ReportView def={printDef} recordId={printing.id} autoPrint />
        </Modal>
      )}
    </form>
  );

  if (embedded) return form;

  return (
    <div className={`${details.length ? 'max-w-6xl' : 'max-w-3xl'} rounded-xl bg-primary shadow-xs ring-1 ring-secondary`}>
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

  const type =
    f.data_type === 'integer' || f.data_type === 'decimal'
          ? 'number'
          : f.render_type === 'email'
            ? 'email'
            : 'text';

  return <Input {...common} type={type} value={String(value)} onChange={onChange} />;
}

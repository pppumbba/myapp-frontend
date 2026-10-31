import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus, Trash01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaParam } from '../../lib/metaApi';
import { ComboField } from '../../components/ComboField';
import { Alert, IconAction } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { Toggle } from '@/components/base/toggle/toggle';
import { clearRenderCache, useMetaDef, visibleParams, type MetaDef } from '../../render/definitions';
import { drilldownOf, type Drilldown } from '../../render/drilldown';
import { ImportView } from '../../render/ImportView';
import { StatementView, aggregateOf } from '../../render/StatementView';
import { DocumentDesigner } from './DocumentDesigner';
import { DrilldownEditor } from './DrilldownEditor';
import { MatrixView } from '../../render/MatrixView';
import type { Matrix, MatrixConfig } from '../../lib/matrixApi';
import { MENU_STYLES, menuStyleOf, type MenuStyle } from '../../components/AppSidebar';
import { cx } from '@/utils/cx';
import { t, tLabels } from '@/i18n';

/*
 * Builder panels for the meta-level settings in json_config: a grid's drilldown, a
 * statement's grouping and totals, a report's heading, an Excel import's mode and match
 * columns. Saving merges into the meta's current json_config, so keys set elsewhere (e.g. a
 * calendar's fields) are kept.
 */

async function saveConfig(metaId: number, patch: Record<string, unknown>) {
  const fresh = await metaApi.get(metaId);
  await metaApi.update(metaId, { json_config: { ...(fresh.json_config ?? {}), ...patch } });
  clearRenderCache();
}

function useParams(metaId: number) {
  const [params, setParams] = useState<MetaParam[] | null>(null);
  useEffect(() => {
    if (!metaId) return setParams([]);
    metaApi.params(metaId, true).then(setParams, () => setParams([]));
  }, [metaId]);
  return params;
}

/** The fields of a row, as drilldown sources. */
const fieldSources = (params: MetaParam[]) => params.filter((p) => p.data_type !== 'detail' && p.data_type !== 'subgrid').map((p) => ({ id: p.field_path, label: t('{field} (this row)', { field: p.label_name || p.field_path }) }));

function Panel({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-primary">{title}</h2>
          <p className="mt-0.5 text-sm text-tertiary">{description}</p>
        </div>
        {actions}
      </div>
      <div className="px-4 py-5 sm:px-5">{children}</div>
    </section>
  );
}

/** The meta as saved, loaded afresh each time it is remounted (keyed on the save count). */
function SavedPreview({ metaId, render }: { metaId: number; render: (def: MetaDef) => ReactNode }) {
  const { def } = useMetaDef(metaId);
  return (
    <div className="mt-6">
      <p className="mb-2 text-sm font-medium text-secondary">{t("Preview (saved settings)")}</p>
      {def ? render(def) : <div className="h-48 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />}
    </div>
  );
}

function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-secondary">{title}</legend>
      {hint && <p className="-mt-1 text-xs text-tertiary">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** Save button state shared by the panels. */
function useSaving() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await task();
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("The settings could not be saved."));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, version, run };
}

/** A datagrid's row drilldown: each row gets a button that opens another meta. */
export function GridDrilldownPanel({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const params = useParams(meta.id);
  const [drill, setDrill] = useState<Drilldown | null>(() => drilldownOf(meta.json_config));
  const [saved, setSaved] = useState(() => JSON.stringify(drill));
  const { busy, error, run } = useSaving();
  const dirty = JSON.stringify(drill) !== saved;

  return (
    <Panel
      title={t("Drilldown")}
      description={t("A button on each row opens another meta, given values from that row. For one column only, set drilldown in that column's config.")}
      actions={
        <Button size="sm" isDisabled={!dirty} isLoading={busy} showTextWhileLoading onPress={() => run(async () => {
          await saveConfig(meta.id, { drilldown: drill });
          setSaved(JSON.stringify(drill));
        })}>
          {dirty ? t("Save drilldown") : t("Saved")}
        </Button>
      }
    >
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <div className="max-w-2xl">
        <DrilldownEditor value={drill} onChange={setDrill} options={options} sources={fieldSources(params ?? [])} selfId={meta.id} withLabel />
      </div>
    </Panel>
  );
}

const AGGREGATE_CHOICES = [
  { value: '', label: 'No total' },
  { value: 'sum', label: 'Sum' },
  { value: 'count', label: 'Count' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Lowest' },
  { value: 'max', label: 'Highest' },
];

/**
 * A statement's settings: the columns it groups by (outer first), its order, which columns
 * total up (each param's json_config.aggregate), whether records show under their groups,
 * and a row drilldown. The statement below shows the saved result.
 */
export function StatementDesigner({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const params = useParams(meta.id);
  const config = meta.json_config ?? {};
  const [groups, setGroups] = useState<string[]>(() => (Array.isArray(config.group_by) ? (config.group_by as string[]) : []));
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' }[]>(() => (Array.isArray(config.sort) ? (config.sort as { field: string; dir: 'asc' | 'desc' }[]) : []));
  const [details, setDetails] = useState(config.show_details !== false);
  const [drill, setDrill] = useState<Drilldown | null>(() => drilldownOf(config));
  const [totals, setTotals] = useState<Record<string, string>>({});
  const { busy, error, version, run } = useSaving();

  const columns = useMemo(() => (params ? visibleParams(params) : []), [params]);
  useEffect(() => setTotals(Object.fromEntries(columns.map((p) => [p.field_path, aggregateOf(p) ?? '']))), [columns]);
  const fields = columns.map((p) => ({ id: p.field_path, label: p.label_name || p.field_path }));

  const save = () =>
    run(async () => {
      await saveConfig(meta.id, { group_by: groups.filter(Boolean), sort: sort.filter((s) => s.field), show_details: details, drilldown: drill });
      await Promise.all(
        columns
          .filter((p) => (aggregateOf(p) ?? '') !== totals[p.field_path])
          .map((p) => {
            const { aggregate: _, ...rest } = p.json_config ?? {};
            return metaApi.updateParam(p.id, { json_config: totals[p.field_path] ? { ...rest, aggregate: totals[p.field_path] } : Object.keys(rest).length ? rest : null });
          }),
      );
      clearRenderCache();
    });

  return (
    <>
      <Panel
        title={t("Statement")}
        description={t("Group the records, total the columns that add up, and pick what a row opens. Add columns and filters in the rows below.")}
        actions={
          <Button size="sm" isDisabled={!params} isLoading={busy} showTextWhileLoading onPress={save}>
            {t("Save settings")}
          </Button>
        }
      >
        {error && <div className="mb-4"><Alert>{error}</Alert></div>}
        {!params ? (
          <div className="h-40 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <Field title={t("Group by")} hint={t("Outer group first; each group gets a subtotal.")}>
                {groups.map((g, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs text-tertiary">{t('Level {n}', { n: i + 1 })}</span>
                    <div className="min-w-0 flex-1">
                      <ComboField aria-label={t('Group level {n}', { n: i + 1 })} size="sm" items={fields} value={g} onChange={(v) => setGroups(groups.map((x, j) => (j === i ? v : x)))} />
                    </div>
                    <IconAction icon={Trash01} danger label={t('Remove group level {n}', { n: i + 1 })} onPress={() => setGroups(groups.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => setGroups([...groups, ''])}>
                  {t("Add a group level")}
                </Button>
              </Field>

              <Field title={t("Order within groups")}>
                {sort.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <ComboField aria-label={t('Order by {n}', { n: i + 1 })} size="sm" items={fields} value={s.field} onChange={(field) => setSort(sort.map((x, j) => (j === i ? { ...x, field } : x)))} />
                    </div>
                    <NativeSelect
                      aria-label={t('Direction {n}', { n: i + 1 })}
                      size="sm"
                      value={s.dir}
                      onChange={(e) => setSort(sort.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)))}
                      options={[
                        { value: 'asc', label: t("Ascending") },
                        { value: 'desc', label: t("Descending") },
                      ]}
                    />
                    <IconAction icon={Trash01} danger label={t('Remove order {n}', { n: i + 1 })} onPress={() => setSort(sort.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => setSort([...sort, { field: '', dir: 'asc' }])}>
                  {t("Add an order")}
                </Button>
              </Field>

              <Toggle label={t("List the records under each group")} hint={t("Off: one line per group, with its totals.")} isSelected={details} onChange={setDetails} />
            </div>

            <div className="space-y-6">
              <Field title={t("Totals")} hint={t("Shown for each group and for the whole statement.")}>
                <div className="divide-y divide-secondary rounded-lg ring-1 ring-secondary">
                  {columns.map((p) => (
                    <div key={p.field_path} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="min-w-0 truncate text-sm text-secondary">{p.label_name || p.field_path}</span>
                      <NativeSelect
                        aria-label={t('Total of {field}', { field: p.label_name || p.field_path })}
                        size="sm"
                        value={totals[p.field_path] ?? ''}
                        onChange={(e) => setTotals({ ...totals, [p.field_path]: e.target.value })}
                        options={tLabels(AGGREGATE_CHOICES)}
                      />
                    </div>
                  ))}
                  {!columns.length && <p className="px-3 py-3 text-sm text-tertiary">{t("Add columns below first.")}</p>}
                </div>
              </Field>

              <Field title={t("A record opens")} hint={t("Its first column becomes a link.")}>
                <DrilldownEditor value={drill} onChange={setDrill} options={options} sources={fieldSources(params)} selfId={meta.id} />
              </Field>
            </div>
          </div>
        )}
      </Panel>

      <SavedPreview key={version} metaId={meta.id} render={(def) => <StatementView def={def} />} />
    </>
  );
}

/** A report's document: laid out in the designer, printed by the server as PDF. */
export function ReportDesigner({ meta }: { meta: Meta }) {
  return <DocumentDesigner meta={meta} />;
}

const IMPORT_MODES = [
  { value: 'insert', label: 'Add every row as a new record' },
  { value: 'upsert', label: 'Update matching records, add the rest' },
  { value: 'update', label: 'Only update matching records' },
];

/**
 * An Excel import's settings: whether rows add or update records, the columns that find the
 * record to update (json_config.key), and where the table sits in the file. The rows below
 * map the file's columns: each row's label is the heading it reads, its field path the table
 * column it fills. The import itself shows below, to try a file.
 */
export function ExcelImportDesigner({ meta }: { meta: Meta }) {
  const params = useParams(meta.id);
  const config = meta.json_config ?? {};
  const [mode, setMode] = useState(typeof config.mode === 'string' ? config.mode : 'insert');
  const [keys, setKeys] = useState<string[]>(() => (Array.isArray(config.key) ? (config.key as string[]) : []));
  const [sheet, setSheet] = useState(config.sheet != null ? String(config.sheet) : '');
  const [headerRow, setHeaderRow] = useState(config.header_row != null ? String(config.header_row) : '1');
  const { busy, error, version, run } = useSaving();

  const fields = (params ?? []).filter((p) => p.data_type !== 'detail' && p.data_type !== 'subgrid').map((p) => ({ id: p.field_path, label: p.label_name || p.field_path }));
  const save = () =>
    run(() =>
      saveConfig(meta.id, {
        mode,
        key: mode === 'insert' ? [] : keys.filter(Boolean),
        sheet: sheet.trim() || null,
        header_row: Math.max(1, Number(headerRow) || 1),
      }),
    );

  return (
    <>
      <Panel
        title={t("Excel import")}
        description={t("Records go into this meta's table. Each row below is a column of the file: its label is the heading, its field path the table column, and its type, required flag, options and lookup check every value.")}
        actions={
          <Button size="sm" isDisabled={!params} isLoading={busy} showTextWhileLoading onPress={save}>
            {t("Save settings")}
          </Button>
        }
      >
        {error && <div className="mb-4"><Alert>{error}</Alert></div>}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <NativeSelect label={t("Each row")} value={mode} onChange={(e) => setMode(e.target.value)} options={tLabels(IMPORT_MODES)} />
            {mode !== 'insert' && (
              <Field title={t("Match records by")} hint={t("Rows whose values here equal a record's update it. None set: the unique columns, else the primary key.")}>
                {keys.map((k, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <ComboField aria-label={t('Match column {n}', { n: i + 1 })} size="sm" items={fields} value={k} onChange={(v) => setKeys(keys.map((x, j) => (j === i ? v : x)))} />
                    </div>
                    <IconAction icon={Trash01} danger label={t('Remove match column {n}', { n: i + 1 })} onPress={() => setKeys(keys.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => setKeys([...keys, ''])}>
                  {t("Add a column")}
                </Button>
              </Field>
            )}
          </div>
          <div className="grid content-start gap-4 sm:grid-cols-2">
            <Input label={t("Sheet")} placeholder={t("The first one")} value={sheet} onChange={setSheet} hint={t("Its name, or its position (1, 2, …).")} />
            <Input label={t("Headings on row")} type="number" value={headerRow} onChange={setHeaderRow} hint={t("Rows under it are imported.")} />
          </div>
        </div>
      </Panel>

      <SavedPreview key={version} metaId={meta.id} render={(def) => <ImportView def={def} />} />
    </>
  );
}

/** The fields of a grid or form, for picking a label or weight column; empty until one is picked. */
function useGridFields(metaId: number | null | undefined) {
  const params = useParams(metaId ?? 0);
  return useMemo(() => (metaId && params ? params.filter((p) => !p.is_primary).map((p) => ({ id: p.field_path, label: p.label_name || p.field_path })) : []), [metaId, params]);
}

/**
 * A matrix's settings (json_config): the grid down the side and the one across the top,
 * which columns of its table hold the pair and the value, and how values compare and add up.
 */
export function MatrixDesigner({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const [config, setConfig] = useState<MatrixConfig>(() => (meta.json_config ?? {}) as MatrixConfig);
  const { busy, error, version, run } = useSaving();
  const grids = options.filter((o) => o.type === 'datagrid').map((o) => ({ value: String(o.id), label: `${o.name} (${o.code})` }));
  const rowFields = useGridFields(config.rows?.meta_id);
  const columnFields = useGridFields(config.columns?.meta_id);
  const set = <K extends keyof MatrixConfig>(key: K, value: MatrixConfig[K]) => setConfig((c) => ({ ...c, [key]: value }));
  const cell = config.cell ?? {};
  const table = meta.table_name || 'this meta’s table';

  return (
    <>
      <Panel
        title={t("Matrix")}
        description={t('One value for each pair of records from two grids, kept in {table}, one row per pair. In a workspace, scope keeps both grids to its record.', { table })}
        actions={
          <Button size="sm" isLoading={busy} showTextWhileLoading onPress={() => run(() => saveConfig(meta.id, { ...config }))}>
            {t("Save settings")}
          </Button>
        }
      >
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Field title={t("Rows")} hint={t("The grid listed down the side, e.g. items or KPIs, and the field each row is shown by.")}>
              <NativeSelect aria-label={t("Rows grid")} value={String(config.rows?.meta_id ?? '')} onChange={(e) => set('rows', { ...config.rows, meta_id: Number(e.target.value) || undefined })} options={[{ value: '', label: t("Pick a grid…") }, ...grids]} />
              <ComboField aria-label={t("Row label")} size="sm" placeholder="name" items={rowFields} value={config.rows?.label ?? ''} onChange={(v) => set('rows', { ...config.rows, label: v })} />
            </Field>
            <Field title={t("Columns")} hint={t("The grid across the top, e.g. bidders, and the field each column is shown by.")}>
              <NativeSelect aria-label={t("Columns grid")} value={String(config.columns?.meta_id ?? '')} onChange={(e) => set('columns', { ...config.columns, meta_id: Number(e.target.value) || undefined })} options={[{ value: '', label: t("Pick a grid…") }, ...grids]} />
              <ComboField aria-label={t("Column label")} size="sm" placeholder="name" items={columnFields} value={config.columns?.label ?? ''} onChange={(v) => set('columns', { ...config.columns, label: v })} />
            </Field>
          </div>
          <div className="space-y-6">
            <Field title={t("Value table columns")} hint={t('Columns of {table}: the row’s id, the column’s id, and the value.', { table })}>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input aria-label={t("Row id column")} size="sm" placeholder="item_id" value={cell.row ?? ''} onChange={(v) => set('cell', { ...cell, row: v })} />
                <Input aria-label={t("Column id column")} size="sm" placeholder="bidder_id" value={cell.column ?? ''} onChange={(v) => set('cell', { ...cell, column: v })} />
                <Input aria-label={t("Value column")} size="sm" placeholder="unit_price" value={cell.value ?? ''} onChange={(v) => set('cell', { ...cell, value: v })} />
              </div>
              <NativeSelect
                aria-label={t("Value type")}
                value={cell.type ?? 'decimal'}
                onChange={(e) => set('cell', { ...cell, type: e.target.value as Matrix['type'] })}
                options={[
                  { value: 'decimal', label: t("Number") },
                  { value: 'integer', label: t("Whole number") },
                  { value: 'string', label: t("Text") },
                ]}
              />
            </Field>
            <Field title={t("Comparing")} hint={t("Which value in a row is best, and what each column adds up to. Weight is a rows field, e.g. quantity or a KPI’s weight.")}>
              <div className="grid gap-2 sm:grid-cols-3">
                <NativeSelect
                  aria-label={t("Best value")}
                  value={config.best ?? ''}
                  onChange={(e) => set('best', (e.target.value || null) as Matrix['best'])}
                  options={[
                    { value: '', label: t("No best") },
                    { value: 'min', label: t("Lowest is best") },
                    { value: 'max', label: t("Highest is best") },
                  ]}
                />
                <NativeSelect
                  aria-label={t("Column total")}
                  value={config.total ?? ''}
                  onChange={(e) => set('total', (e.target.value || null) as Matrix['total'])}
                  options={[
                    { value: '', label: t("No total") },
                    { value: 'sum', label: t("Sum") },
                    { value: 'avg', label: t("Average") },
                    { value: 'weighted', label: t("Weighted average") },
                    { value: 'amount', label: t("Value × weight, summed") },
                  ]}
                />
                <ComboField aria-label={t("Weight")} size="sm" placeholder={t("Weight")} items={rowFields} value={config.weight ?? ''} onChange={(v) => set('weight', v || null)} />
              </div>
            </Field>
          </div>
        </div>
      </Panel>
      {!!config.rows?.meta_id && !!config.columns?.meta_id && (
        <Panel title={t("Preview")} description={t("Every record of both grids; a workspace shows only its record’s.")}>
          <MatrixPreview key={version} metaId={meta.id} />
        </Panel>
      )}
    </>
  );
}

function MatrixPreview({ metaId }: { metaId: number }) {
  const { def, error } = useMetaDef(metaId);
  if (error) return <Alert>{error}</Alert>;
  return def ? <MatrixView def={def} /> : null;
}

/**
 * A workspace's settings: the field that names the record and the fields shown above the
 * sections. The sections are the rows below: each refers to a grid or matrix, with
 * json_config.scope saying how it keeps to the record ({"tender_id": "id"}).
 */
export function WorkspaceDesigner({ meta }: { meta: Meta }) {
  const config = meta.json_config ?? {};
  const formFields = useGridFields(meta.ref_meta_id);
  const [titleField, setTitleField] = useState(typeof config.title_field === 'string' ? config.title_field : '');
  const [header, setHeader] = useState<string[]>(() => (Array.isArray(config.header) ? (config.header as string[]) : []));
  const { busy, error, run } = useSaving();

  return (
    <Panel
      title={t("Workspace")}
      description={
        meta.ref_meta_id
          ? t("The record’s name and the fields shown above the sections. Add each section as a row below: refer it to a grid or matrix, with config { \"scope\": { \"tender_id\": \"id\" } }.")
          : t("Set “Refers to” to the form of the record this workspace is about.")
      }
      actions={
        <Button size="sm" isDisabled={!meta.ref_meta_id} isLoading={busy} showTextWhileLoading onPress={() => run(() => saveConfig(meta.id, { title_field: titleField || null, header: header.filter(Boolean) }))}>
          {t("Save settings")}
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Field title={t("Named by")} hint={t("The field shown as the record’s title.")}>
          <ComboField aria-label={t("Title field")} size="sm" items={formFields} value={titleField} onChange={setTitleField} />
        </Field>
        <Field title={t("Shown at the top")} hint={t("In this order. None: the form’s first six fields.")}>
          {header.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ComboField aria-label={t('Header field {n}', { n: i + 1 })} size="sm" items={formFields} value={h} onChange={(v) => setHeader(header.map((x, j) => (j === i ? v : x)))} />
              </div>
              <IconAction icon={Trash01} danger label={t("Remove this field")} onPress={() => setHeader(header.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => setHeader([...header, ''])}>
            {t("Add a field")}
          </Button>
        </Field>
      </div>
    </Panel>
  );
}

const FILTER_LAYOUTS = [
  { value: 'panel', label: 'Panel above the grid', hint: 'Opens with the Filters button; applies with Apply filters.' },
  { value: 'sidebar', label: 'Sidebar beside the grid', hint: 'Always open and applied as they change; lists show how many records each value has.' },
  { value: 'dropdown', label: 'Dropdown from the button', hint: 'Opens over the grid with the Filters button and closes when they are applied.' },
];

/** Where a grid's filters sit: a panel above it (the default), a sidebar beside it, or a dropdown from the Filters button (json_config.filter_layout). */
export function GridFilterLayoutPanel({ meta }: { meta: Meta }) {
  const params = useParams(meta.id);
  const [layout, setLayout] = useState(FILTER_LAYOUTS.some((l) => l.value === meta.json_config?.filter_layout) ? String(meta.json_config?.filter_layout) : 'panel');
  const [saved, setSaved] = useState(layout);
  const { busy, error, run } = useSaving();
  const filters = (params ?? []).filter((p) => p.is_criteria).length;

  return (
    <Panel
      title={t("Filters")}
      description={filters ? t('{count} fields are filters (Use as filter on the rows below).', { count: filters }) : t("No field is a filter yet: turn on “Use as filter” on the rows below.")}
      actions={
        <Button size="sm" isDisabled={layout === saved} isLoading={busy} showTextWhileLoading onPress={() => run(async () => {
          await saveConfig(meta.id, { filter_layout: layout });
          setSaved(layout);
        })}>
          {layout === saved ? t("Saved") : t("Save")}
        </Button>
      }
    >
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <div role="radiogroup" aria-label={t("Where the filters sit")} className="grid max-w-4xl gap-3 sm:grid-cols-3">
        {FILTER_LAYOUTS.map((l) => (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={layout === l.value}
            onClick={() => setLayout(l.value)}
            className={`rounded-lg p-4 text-left outline-focus-ring ring-1 transition duration-100 ease-linear focus-visible:outline-2 ${layout === l.value ? 'bg-brand-primary_alt ring-2 ring-brand' : 'ring-secondary hover:bg-primary_hover'}`}
          >
            <p className="text-sm font-semibold text-primary">{t(l.label)}</p>
            <p className="mt-1 text-sm text-tertiary">{t(l.hint)}</p>
          </button>
        ))}
      </div>
    </Panel>
  );
}

/**
 * How a grid's table looks: a # column (json_config.row_numbers), how many leading columns
 * stay in view when it scrolls sideways (json_config.frozen_columns), and a fixed size in px
 * (json_config.height, width) that its rows scroll inside, both ways.
 */
export function GridColumnsPanel({ meta }: { meta: Meta }) {
  const config = meta.json_config ?? {};
  const [rowNumbers, setRowNumbers] = useState(config.row_numbers === true);
  const [frozen, setFrozen] = useState(config.frozen_columns ? String(config.frozen_columns) : '0');
  const [height, setHeight] = useState(config.height ? String(config.height) : '');
  const [width, setWidth] = useState(config.width ? String(config.width) : '');
  const state = JSON.stringify([rowNumbers, frozen, height, width]);
  const [saved, setSaved] = useState(state);
  const { busy, error, run } = useSaving();
  const dirty = state !== saved;
  const px = (v: string) => (Number(v) > 0 ? Math.round(Number(v)) : null);
  const params = useParams(meta.id);
  const count = params ? visibleParams(params).length : 0;
  const nested = (params ?? []).filter((p) => p.data_type === 'subgrid' && p.json_config?.display === 'nested').length;

  return (
    <Panel
      title={t("Columns")}
      description={`${t("Row numbers, frozen columns and the grid's size.")} ${nested ? t('Each row also has an arrow that opens its nested subgrid; it freezes with the columns.') : t('To open a subgrid inside each row, give it {code}.', { code: '{ "display": "nested" }' })}`}
      actions={
        <Button size="sm" isDisabled={!dirty} isLoading={busy} showTextWhileLoading onPress={() => run(async () => {
          await saveConfig(meta.id, { row_numbers: rowNumbers, frozen_columns: Number(frozen) || null, height: px(height), width: px(width) });
          setSaved(state);
        })}>
          {dirty ? t("Save") : t("Saved")}
        </Button>
      }
    >
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <div className="flex max-w-3xl flex-col gap-5 sm:flex-row sm:items-end">
        <Toggle label={t("Row numbers")} hint={t("A # column counting the rows, across pages.")} isSelected={rowNumbers} onChange={setRowNumbers} />
        <div className="sm:w-64">
          <NativeSelect
            label={t("Frozen columns")}
            hint={t("Stay in view when the table scrolls sideways.")}
            value={frozen}
            onChange={(e) => setFrozen(e.target.value)}
            options={[{ value: '0', label: t("None") }, ...Array.from({ length: Math.min(count, 5) }, (_, i) => ({ value: String(i + 1), label: t('First {n}', { n: i + 1 }) }))]}
          />
        </div>
      </div>
      <div className="mt-5 grid max-w-3xl gap-5 sm:grid-cols-2">
        <Input label={t("Height (px)")} type="number" placeholder={t("Fits the window")} value={height} onChange={setHeight} hint={t("Fixed: rows scroll under a header that stays on top.")} />
        <Input label={t("Width (px)")} type="number" placeholder={t("Fills the page")} value={width} onChange={setWidth} hint={t("Fixed, never wider than the screen: columns scroll sideways.")} />
      </div>
    </Panel>
  );
}

/**
 * A form's buttons besides Save: Save and add (json_config.save_and_add, on unless false)
 * and Save and print, with the report that prints the saved record (json_config.print_meta_id,
 * kept as a print link in meta_meta_map).
 */
export function FormSettingsPanel({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const config = meta.json_config ?? {};
  const [printId, setPrintId] = useState(typeof config.print_meta_id === 'number' ? String(config.print_meta_id) : '');
  const [saveAndAdd, setSaveAndAdd] = useState(config.save_and_add !== false);
  const [saved, setSaved] = useState(() => JSON.stringify([printId, saveAndAdd]));
  const { busy, error, run } = useSaving();
  const dirty = JSON.stringify([printId, saveAndAdd]) !== saved;
  const reports = options.filter((o) => o.type === 'report');

  return (
    <Panel
      title={t("Form")}
      description={t("The buttons beside Save. Save and add saves and starts the next record; Save and print saves and prints the record with a report on the same table.")}
      actions={
        <Button size="sm" isDisabled={!dirty} isLoading={busy} showTextWhileLoading onPress={() => run(async () => {
          await saveConfig(meta.id, { print_meta_id: printId ? Number(printId) : null, save_and_add: saveAndAdd });
          setSaved(JSON.stringify([printId, saveAndAdd]));
        })}>
          {dirty ? t("Save settings") : t("Saved")}
        </Button>
      }
    >
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
        <Field title={t("Save and print")} hint={reports.length ? t("The report that prints the saved record. None: no Save and print button.") : t("Make a report meta on this table first.")}>
          <NativeSelect aria-label={t("Print with")} value={printId} onChange={(e) => setPrintId(e.target.value)} options={[{ value: '', label: t("No printing") }, ...reports.map((r) => ({ value: String(r.id), label: `${r.name} (${r.code})` }))]} />
        </Field>
        <Field title={t("Save and add")} hint={t("Shown in dialogs opened from a grid and when editing a record. A form on its own page already starts a new record after Save.")}>
          <Toggle label={t("Show Save and add")} isSelected={saveAndAdd} onChange={setSaveAndAdd} />
        </Field>
      </div>
    </Panel>
  );
}

/** A small drawing of a menu style: the menu on the left, the screen on the right. */
function MenuStyleSketch({ style }: { style: MenuStyle }) {
  return (
    <div aria-hidden="true" className={cx('flex h-16 overflow-hidden rounded-md ring-1 ring-secondary', style === 'inset' ? 'bg-tertiary' : 'bg-secondary', style === 'topbar' && 'flex-col')}>
      <div
        className={cx(
          style === 'topbar' ? 'flex items-center gap-1.5 border-b border-secondary bg-primary px-1.5 py-1' : 'flex w-1/3 flex-col gap-1 p-1.5',
          style === 'classic' && 'border-r border-secondary bg-primary',
          style === 'floating' && 'm-1 rounded-md bg-primary shadow-sm ring-1 ring-secondary',
          style === 'dark' && 'bg-gray-900',
        )}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className={cx('h-1 rounded-full', style === 'dark' ? 'bg-gray-600' : 'bg-quaternary', style === 'topbar' ? 'w-4' : i === 0 ? 'w-3/4' : 'w-1/2')} />
        ))}
      </div>
      <div className={cx('flex-1 p-1.5', style === 'inset' && 'my-1 mr-1 rounded-md bg-secondary ring-1 ring-secondary')}>
        <span className="block h-full rounded-sm bg-primary ring-1 ring-secondary" />
      </div>
    </div>
  );
}

/** An app's menu style (json_config.menu_style), saved as soon as it is picked. */
export function AppSettingsPanel({ meta }: { meta: Meta }) {
  const [style, setStyle] = useState<MenuStyle>(menuStyleOf(meta.json_config?.menu_style));
  const { busy, error, run } = useSaving();

  const pick = (next: MenuStyle) => {
    const before = style;
    setStyle(next);
    void run(async () => {
      try {
        await saveConfig(meta.id, { menu_style: next === 'classic' ? null : next });
      } catch (err) {
        setStyle(before);
        throw err;
      }
    });
  };

  return (
    <Panel title={t('App menu')} description={t('How the menu sits beside the screens while the app is open. Phones always get the top bar and its drawer.')}>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <div role="radiogroup" aria-label={t('Menu style')} className="grid max-w-3xl grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        {MENU_STYLES.map((m) => {
          const on = style === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={busy}
              onClick={() => !on && pick(m.id)}
              className={cx(
                'flex flex-col gap-2 rounded-lg p-2.5 text-left outline-focus-ring transition-shadow duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait',
                on ? 'ring-2 ring-brand' : 'ring-1 ring-secondary hover:ring-primary',
              )}
            >
              <MenuStyleSketch style={m.id} />
              <span>
                <span className="block text-sm font-semibold text-primary">{t(m.name)}</span>
                <span className="block text-xs text-tertiary">{t(m.hint)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/** The :names a stage query's SQL uses, the way the backend finds them: not in comments or '...' text. */
export function sqlNames(sql: string): string[] {
  const code = sql.replace(/'(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  return [...new Set([...code.matchAll(/(?<![:\w]):([A-Za-z_]\w*)/g)].map((m) => m[1]))];
}

/** Built in to every query, so they need no parameter. */
const BUILTIN_NAMES = ['user_id', 'today'];

const labelOf = (name: string) => name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * A stage query's SQL and its named parameters side by side: every :name should have a
 * parameter (its params, by field path), and a parameter the SQL doesn't use does nothing.
 * onParamsChanged: parameters were added here, so the list below should reload.
 */
export function StageQueryPanel({ meta, onParamsChanged }: { meta: Meta; onParamsChanged: () => void }) {
  const [version, setVersion] = useState(0);
  const [params, setParams] = useState<MetaParam[] | null>(null);
  const { busy, error, run } = useSaving();
  useEffect(() => {
    metaApi.params(meta.id).then(setParams, () => setParams([]));
  }, [meta.id, version]);

  const sql = meta.query_string ?? '';
  const names = sqlNames(sql).filter((n) => !BUILTIN_NAMES.includes(n));
  const defined = new Set((params ?? []).map((p) => p.field_path));
  const missing = names.filter((n) => !defined.has(n));
  const unused = (params ?? []).filter((p) => !names.includes(p.field_path));

  return (
    <Panel
      title={t("Stage query")}
      description={t("The SQL runs with its parameters' values, all statements together. It runs from its own screen (Open), as a step of a form's process flow, or on a schedule once for each row of a grid.")}
      actions={
        missing.length > 0 && (
          <Button size="sm" iconLeading={Plus} isLoading={busy} showTextWhileLoading onPress={() => run(async () => {
            const last = Math.max(0, ...(params ?? []).map((p) => p.order_number));
            for (const [i, name] of missing.entries()) {
              await metaApi.createParam(meta.id, { field_path: name, param_name: name, label_name: labelOf(name), data_type: 'string', order_number: last + i + 1, is_show: true });
            }
            setVersion((v) => v + 1);
            onParamsChanged();
          })}>
            {missing.length === 1 ? t('Add its parameter') : t('Add {count} parameters', { count: missing.length })}
          </Button>
        )
      }
    >
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {sql.trim() ? (
        <pre className="max-h-72 overflow-auto rounded-lg bg-secondary p-4 font-mono text-sm whitespace-pre-wrap text-primary ring-1 ring-secondary ring-inset">{sql}</pre>
      ) : (
        <p className="text-sm text-tertiary">{t("No SQL yet. Edit the meta to write it.")}</p>
      )}
      <div className="mt-4 space-y-2 text-sm">
        <p className="text-secondary">
          <span className="font-medium">{t("Parameters in the SQL:")} </span>
          {names.length === 0 ? <span className="text-tertiary">{t("none")}</span> : names.map((n) => (
            <code key={n} className={`mr-1.5 inline-block rounded px-1.5 py-0.5 font-mono text-xs ring-1 ring-inset ${defined.has(n) ? 'bg-secondary text-secondary ring-secondary' : 'bg-warning-primary text-warning-primary ring-secondary'}`}>
              :{n}
            </code>
          ))}
        </p>
        {missing.length > 0 && <p className="text-warning-primary">{t('{names} has no parameter yet, so it is always empty (null).', { names: missing.map((n) => `:${n}`).join(', ') })}</p>}
        {unused.length > 0 && <p className="text-tertiary">{t('Not used by the SQL: {names}.', { names: unused.map((p) => p.field_path).join(', ') })}</p>}
        <p className="text-xs text-quaternary">{t(":user_id and :today are always there. A parameter's default value is used when it is left empty; a required one must be filled in.")}</p>
      </div>
    </Panel>
  );
}

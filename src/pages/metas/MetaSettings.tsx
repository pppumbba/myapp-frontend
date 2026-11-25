import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Download01, MagicWand01, Plus, Trash01, Upload01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { GRID_VIEWS, GRID_VIEW_LABELS, gridViewOf, metaApi, RECORD_SLOTS, type GridViewName, type Meta, type MetaOption, type MetaParam, type MetaUse, type RecordSlot } from '../../lib/metaApi';
import { ComboField } from '../../components/ComboField';
import { MetaLookupField, metaChoices } from './MetaLookupField';
import { Alert, IconAction } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { Toggle } from '@/components/base/toggle/toggle';
import { clearRenderCache, useMetaDef, visibleParams, type MetaDef } from '../../render/definitions';
import { drilldownOf, type Drilldown } from '../../render/drilldown';
import { ImportView } from '../../render/ImportView';
import { StatementView, aggregateOf } from '../../render/StatementView';
import { DocumentDesigner } from './DocumentDesigner';
import { DrilldownEditor } from './DrilldownEditor';
import type { Matrix, MatrixConfig } from '../../lib/matrixApi';
import { MENU_STYLES, menuSideOf, menuStyleOf, type MenuSide, type MenuStyle } from '../../components/AppSidebar';
import { menuSurface, useMenuStyles, type MenuSettings } from '../../lib/menuStyle';
import { mobileApi, mobilePreviewUrl, type MobileSettings } from '../../lib/mobileApi';
import { appImageApi, type AppImageKind, type AppImagePaths } from '../../lib/appImageApi';
import { AppImage } from '../../components/AppArt';
import { cx } from '@/utils/cx';
import { t, tLabels } from '@/i18n';
import { SettingRow } from './SettingRow';

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
const fieldSources = (params: MetaParam[]) =>
  params.filter((p) => p.data_type !== 'detail' && p.data_type !== 'subgrid').map((p) => ({ id: p.field_path, label: t('{field} (this row)', { field: p.label_name || p.field_path }) }));

function Panel({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={title}>
      <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-primary">{title}</h2>
          <p className="mt-0.5 max-w-prose text-sm text-tertiary">{description}</p>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
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
      <p className="mb-2 text-sm font-medium text-secondary">{t('Preview (saved settings)')}</p>
      {def ? render(def) : <div className="h-48 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />}
    </div>
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
      setError(err instanceof ApiError ? err.message : t('The settings could not be saved.'));
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
      title={t('Drilldown')}
      description={t('A row button that opens another meta with the row’s values.')}
      actions={
        <Button
          size="sm"
          isDisabled={!dirty}
          isLoading={busy}
          showTextWhileLoading
          onPress={() =>
            run(async () => {
              await saveConfig(meta.id, { drilldown: drill });
              setSaved(JSON.stringify(drill));
            })
          }
        >
          {dirty ? t('Save drilldown') : t('Saved')}
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="divide-y divide-secondary">
        <DrilldownEditor value={drill} onChange={setDrill} options={options} sources={fieldSources(params ?? [])} selfId={meta.id} withLabel rows />
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
        title={t('Statement')}
        description={t('Groups, totals and what a row opens. Columns and filters are under Columns.')}
        actions={
          <Button size="sm" isDisabled={!params} isLoading={busy} showTextWhileLoading onPress={save}>
            {t('Save settings')}
          </Button>
        }
      >
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}
        {!params ? (
          <div className="h-40 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
        ) : (
          <div className="divide-y divide-secondary">
            <SettingRow title={t('Group by')} hint={t('Outer group first; each group gets a subtotal.')}>
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
                {t('Add a group level')}
              </Button>
            </SettingRow>

            <SettingRow title={t('Order within groups')}>
              {sort.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ComboField
                      aria-label={t('Order by {n}', { n: i + 1 })}
                      size="sm"
                      items={fields}
                      value={s.field}
                      onChange={(field) => setSort(sort.map((x, j) => (j === i ? { ...x, field } : x)))}
                    />
                  </div>
                  <NativeSelect
                    aria-label={t('Direction {n}', { n: i + 1 })}
                    size="sm"
                    value={s.dir}
                    onChange={(e) => setSort(sort.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)))}
                    options={[
                      { value: 'asc', label: t('Ascending') },
                      { value: 'desc', label: t('Descending') },
                    ]}
                  />
                  <IconAction icon={Trash01} danger label={t('Remove order {n}', { n: i + 1 })} onPress={() => setSort(sort.filter((_, j) => j !== i))} />
                </div>
              ))}
              <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => setSort([...sort, { field: '', dir: 'asc' }])}>
                {t('Add an order')}
              </Button>
            </SettingRow>

            <SettingRow title={t('List the records under each group')} hint={t('Off: one line per group, with its totals.')}>
              <Toggle aria-label={t('List the records under each group')} label={details ? t('On') : t('Off')} isSelected={details} onChange={setDetails} />
            </SettingRow>
            <SettingRow title={t('Totals')} hint={t('Shown for each group and for the whole statement.')}>
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
                {!columns.length && <p className="px-3 py-3 text-sm text-tertiary">{t('Add columns under Columns first.')}</p>}
              </div>
            </SettingRow>

            <SettingRow title={t('A record opens')} hint={t('Its first column becomes a link.')}>
              <DrilldownEditor value={drill} onChange={setDrill} options={options} sources={fieldSources(params)} selfId={meta.id} />
            </SettingRow>
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
        title={t('Excel import')}
        description={t('Each row under Columns is a file column, saved into this meta’s table.')}
        actions={
          <Button size="sm" isDisabled={!params} isLoading={busy} showTextWhileLoading onPress={save}>
            {t('Save settings')}
          </Button>
        }
      >
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="divide-y divide-secondary">
          <SettingRow title={t('Each row')} hint={t('Add, update, or both.')}>
            <NativeSelect aria-label={t('Each row')} value={mode} onChange={(e) => setMode(e.target.value)} options={tLabels(IMPORT_MODES)} />
          </SettingRow>
          {mode !== 'insert' && (
            <SettingRow title={t('Match records by')} hint={t('Rows matching these values update a record. None: unique columns or the key.')}>
              {keys.map((k, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ComboField aria-label={t('Match column {n}', { n: i + 1 })} size="sm" items={fields} value={k} onChange={(v) => setKeys(keys.map((x, j) => (j === i ? v : x)))} />
                  </div>
                  <IconAction icon={Trash01} danger label={t('Remove match column {n}', { n: i + 1 })} onPress={() => setKeys(keys.filter((_, j) => j !== i))} />
                </div>
              ))}
              <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => setKeys([...keys, ''])}>
                {t('Add a column')}
              </Button>
            </SettingRow>
          )}
          <SettingRow title={t('Sheet')} hint={t('Its name, or its position (1, 2, …).')}>
            <Input aria-label={t('Sheet')} placeholder={t('The first one')} value={sheet} onChange={setSheet} />
          </SettingRow>
          <SettingRow title={t('Headings on row')} hint={t('Rows under it are imported.')}>
            <Input aria-label={t('Headings on row')} type="number" value={headerRow} onChange={setHeaderRow} />
          </SettingRow>
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
  const { busy, error, run } = useSaving();
  const grids = metaChoices(options.filter((o) => o.type === 'datagrid'));
  const rowFields = useGridFields(config.rows?.meta_id);
  const columnFields = useGridFields(config.columns?.meta_id);
  const set = <K extends keyof MatrixConfig>(key: K, value: MatrixConfig[K]) => setConfig((c) => ({ ...c, [key]: value }));
  const cell = config.cell ?? {};
  const table = meta.table_name || 'this meta’s table';

  return (
    <Panel
      title={t('Matrix')}
      description={t('One value per pair of records from two grids, saved in {table}.', { table })}
      actions={
        <Button size="sm" isLoading={busy} showTextWhileLoading onPress={() => run(() => saveConfig(meta.id, { ...config }))}>
          {t('Save settings')}
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="divide-y divide-secondary">
        <SettingRow title={t('Rows')} hint={t('The grid down the side, e.g. items.')}>
          <MetaLookupField
            aria-label={t('Rows grid')}
            placeholder={t('Pick a grid…')}
            value={String(config.rows?.meta_id ?? '')}
            onChange={(v) => set('rows', { ...config.rows, meta_id: Number(v) || undefined })}
            items={grids}
          />
          <ComboField aria-label={t('Row label')} size="sm" placeholder="name" items={rowFields} value={config.rows?.label ?? ''} onChange={(v) => set('rows', { ...config.rows, label: v })} />
        </SettingRow>
        <SettingRow title={t('Columns')} hint={t('The grid across the top, e.g. bidders.')}>
          <MetaLookupField
            aria-label={t('Columns grid')}
            placeholder={t('Pick a grid…')}
            value={String(config.columns?.meta_id ?? '')}
            onChange={(v) => set('columns', { ...config.columns, meta_id: Number(v) || undefined })}
            items={grids}
          />
          <ComboField
            aria-label={t('Column label')}
            size="sm"
            placeholder="name"
            items={columnFields}
            value={config.columns?.label ?? ''}
            onChange={(v) => set('columns', { ...config.columns, label: v })}
          />
        </SettingRow>
        <SettingRow wide title={t('Value table columns')} hint={t('Row id, column id and value columns of {table}.', { table })}>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input aria-label={t('Row id column')} size="sm" placeholder="item_id" value={cell.row ?? ''} onChange={(v) => set('cell', { ...cell, row: v })} />
            <Input aria-label={t('Column id column')} size="sm" placeholder="bidder_id" value={cell.column ?? ''} onChange={(v) => set('cell', { ...cell, column: v })} />
            <Input aria-label={t('Value column')} size="sm" placeholder="unit_price" value={cell.value ?? ''} onChange={(v) => set('cell', { ...cell, value: v })} />
          </div>
          <NativeSelect
            aria-label={t('Value type')}
            value={cell.type ?? 'decimal'}
            onChange={(e) => set('cell', { ...cell, type: e.target.value as Matrix['type'] })}
            options={[
              { value: 'decimal', label: t('Number') },
              { value: 'integer', label: t('Whole number') },
              { value: 'string', label: t('Text') },
            ]}
          />
        </SettingRow>
        <SettingRow wide title={t('Comparing')} hint={t('The best value in a row, and column totals.')}>
          <div className="grid gap-2 sm:grid-cols-3">
            <NativeSelect
              aria-label={t('Best value')}
              value={config.best ?? ''}
              onChange={(e) => set('best', (e.target.value || null) as Matrix['best'])}
              options={[
                { value: '', label: t('No best') },
                { value: 'min', label: t('Lowest is best') },
                { value: 'max', label: t('Highest is best') },
              ]}
            />
            <NativeSelect
              aria-label={t('Column total')}
              value={config.total ?? ''}
              onChange={(e) => set('total', (e.target.value || null) as Matrix['total'])}
              options={[
                { value: '', label: t('No total') },
                { value: 'sum', label: t('Sum') },
                { value: 'avg', label: t('Average') },
                { value: 'weighted', label: t('Weighted average') },
                { value: 'amount', label: t('Value × weight, summed') },
              ]}
            />
            <ComboField aria-label={t('Weight')} size="sm" placeholder={t('Weight')} items={rowFields} value={config.weight ?? ''} onChange={(v) => set('weight', v || null)} />
          </div>
        </SettingRow>
      </div>
    </Panel>
  );
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
      title={t('Workspace')}
      description={meta.ref_meta_id ? t('The record’s name and the fields shown above the sections.') : t('Set “Refers to” to the record’s form first.')}
      actions={
        <Button
          size="sm"
          isDisabled={!meta.ref_meta_id}
          isLoading={busy}
          showTextWhileLoading
          onPress={() => run(() => saveConfig(meta.id, { title_field: titleField || null, header: header.filter(Boolean) }))}
        >
          {t('Save settings')}
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="divide-y divide-secondary">
        <SettingRow title={t('Named by')} hint={t('The field shown as the record’s title.')}>
          <ComboField aria-label={t('Title field')} size="sm" items={formFields} value={titleField} onChange={setTitleField} />
        </SettingRow>
        <SettingRow title={t('Shown at the top')} hint={t('In this order. None: the form’s first six fields.')}>
          {header.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ComboField aria-label={t('Header field {n}', { n: i + 1 })} size="sm" items={formFields} value={h} onChange={(v) => setHeader(header.map((x, j) => (j === i ? v : x)))} />
              </div>
              <IconAction icon={Trash01} danger label={t('Remove this field')} onPress={() => setHeader(header.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => setHeader([...header, ''])}>
            {t('Add a field')}
          </Button>
        </SettingRow>
      </div>
    </Panel>
  );
}

const FILTER_LAYOUTS = [
  { value: 'dropdown', label: 'Dropdown from the button', hint: 'Opens from the Filters button.' },
  { value: 'panel', label: 'Panel above the grid', hint: 'Above the grid, applied with Apply.' },
  { value: 'sidebar', label: 'Sidebar beside the grid', hint: 'Always open, with counts.' },
];

/** A tiny grey grid with the filters drawn where that layout puts them (brand-tinted). */
function FilterLayoutSketch({ layout }: { layout: string }) {
  const rows = (
    <div className="flex flex-1 flex-col gap-1 p-1.5">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="h-1.5 rounded-xs bg-primary ring-1 ring-secondary" />
      ))}
    </div>
  );
  return (
    <div aria-hidden="true" className="relative flex h-16 overflow-hidden rounded-md bg-secondary ring-1 ring-secondary">
      {layout === 'sidebar' && (
        <div className="m-1 mr-0 flex w-7 flex-col gap-1 rounded-sm bg-brand-primary p-1 ring-1 ring-brand">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 rounded-full bg-brand-solid opacity-40" />
          ))}
        </div>
      )}
      <div className="flex flex-1 flex-col">
        {layout !== 'sidebar' && (
          <div className="flex items-center gap-1 px-1.5 pt-1.5">
            <span className="h-2 w-5 rounded-xs bg-brand-solid opacity-70" />
            <span className="h-2 flex-1" />
          </div>
        )}
        {layout === 'panel' && (
          <div className="mx-1.5 mt-1 flex gap-1 rounded-sm bg-brand-primary p-1 ring-1 ring-brand">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1 flex-1 rounded-full bg-brand-solid opacity-40" />
            ))}
          </div>
        )}
        {rows}
      </div>
      {layout === 'dropdown' && (
        <div className="absolute top-4 left-1.5 flex w-12 flex-col gap-1 rounded-sm bg-primary p-1 shadow-md ring-1 ring-brand">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 rounded-full bg-brand-solid opacity-40" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Where a grid's filters sit: a dropdown from the Filters button (the default), a panel above it, or a sidebar beside it (json_config.filter_layout). */
export function GridFilterLayoutPanel({ meta }: { meta: Meta }) {
  const params = useParams(meta.id);
  const [layout, setLayout] = useState(FILTER_LAYOUTS.some((l) => l.value === meta.json_config?.filter_layout) ? String(meta.json_config?.filter_layout) : 'dropdown');
  const [saved, setSaved] = useState(layout);
  const { busy, error, run } = useSaving();
  const filters = (params ?? []).filter((p) => p.is_criteria);

  return (
    <Panel
      title={t('Filters')}
      description={t('Which fields filter the grid, and where the filters sit.')}
      actions={
        <Button
          size="sm"
          isDisabled={layout === saved}
          isLoading={busy}
          showTextWhileLoading
          onPress={() =>
            run(async () => {
              await saveConfig(meta.id, { filter_layout: layout });
              setSaved(layout);
            })
          }
        >
          {layout === saved ? t('Saved') : t('Save')}
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="divide-y divide-secondary">
        <SettingRow title={t('Filter fields')} hint={t('The fields with “Use as filter” turned on, under Columns.')}>
          {!params ? (
            <div aria-busy="true" className="h-6 w-48 animate-pulse rounded-md bg-secondary motion-reduce:animate-none" />
          ) : filters.length ? (
            <div className="flex flex-wrap gap-1.5">
              {filters.map((p) => (
                <span key={p.id} className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-secondary ring-1 ring-secondary ring-inset">
                  {p.label_name || p.field_path}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-tertiary">{t('None yet: turn on “Use as filter” under Columns.')}</p>
          )}
          <Link to="?section=main" className="inline-block text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
            {t('Change under Columns')}
          </Link>
        </SettingRow>
        <SettingRow title={t('Where the filters sit')} hint={t('Each person sees the filters the same way.')} wide>
          <div role="radiogroup" aria-label={t('Where the filters sit')} className="grid gap-3 sm:grid-cols-3">
            {FILTER_LAYOUTS.map((l) => {
              const on = layout === l.value;
              return (
                <button
                  key={l.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setLayout(l.value)}
                  className={cx(
                    'relative flex flex-col gap-2 rounded-lg p-2.5 text-left outline-focus-ring transition-shadow duration-100 focus-visible:outline-2 focus-visible:outline-offset-2',
                    on ? 'ring-2 ring-brand' : 'ring-1 ring-secondary hover:ring-primary',
                  )}
                >
                  <FilterLayoutSketch layout={l.value} />
                  <span className="pr-6">
                    <span className="block text-sm font-semibold text-primary">{t(l.label)}</span>
                    <span className="block text-xs text-tertiary">{t(l.hint)}</span>
                  </span>
                  {on && <CheckCircle className="absolute right-2.5 bottom-3 size-5 text-fg-brand-primary" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </SettingRow>
      </div>
    </Panel>
  );
}

const SLOT_LABELS: Record<RecordSlot, string> = { image: 'Image', title: 'Title', subtitle: 'Subtitle', badge: 'Badge', body: 'Details', footer: 'Footer' };

/** Where each of the grid's own columns sits on a record's widget (widget_position); saved as it's chosen. */
function RecordSlotsEditor({ meta, params }: { meta: Meta; params: MetaParam[] | null }) {
  const [chosen, setChosen] = useState<Record<number, RecordSlot | null>>({});
  const { busy, error, run } = useSaving();
  const columns = visibleParams(params ?? []).filter((p) => p.main_meta_id === meta.id);
  if (!columns.length) return null;

  const place = (param: MetaParam, slot: RecordSlot | null) =>
    run(async () => {
      await metaApi.updateParam(param.id, { widget_position: slot });
      setChosen((current) => ({ ...current, [param.id]: slot }));
      clearRenderCache();
    });

  return (
    <fieldset className="mb-5 max-w-xl">
      <legend className="text-sm font-medium text-secondary">{t('Place on the widget')}</legend>
      <p className="mt-0.5 text-sm text-tertiary">{t('Auto: the first column is the title, the rest are details.')}</p>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul className="mt-3 divide-y divide-secondary rounded-lg ring-1 ring-secondary">
        {columns.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-primary">{p.label_name || p.param_name}</span>
            <NativeSelect
              aria-label={t('Place of {field}', { field: p.label_name || p.param_name })}
              size="sm"
              className="w-40"
              disabled={busy}
              value={(p.id in chosen ? chosen[p.id] : p.widget_position) ?? ''}
              onChange={(e) => void place(p, (e.target.value || null) as RecordSlot | null)}
              options={[{ value: '', label: t('Automatic') }, ...RECORD_SLOTS.map((slot) => ({ value: slot, label: t(SLOT_LABELS[slot]) }))]}
            />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/**
 * How a grid's table looks: a # column (json_config.row_numbers), how many leading columns
 * stay in view when it scrolls sideways (json_config.frozen_columns), and a fixed size in px
 * (json_config.height, width) that its rows scroll inside, both ways. json_config.view shows
 * the records as widgets instead of table rows, each column at its widget_position, and
 * json_config.view_buttons are the other views people can switch to from the toolbar.
 */
export function GridColumnsPanel({ meta }: { meta: Meta }) {
  const config = meta.json_config ?? {};
  const [view, setView] = useState<GridViewName>(gridViewOf(config));
  const [ticked, setTicked] = useState<unknown[]>(Array.isArray(config.view_buttons) ? config.view_buttons : []);
  const otherViews = GRID_VIEWS.filter((v) => v !== view && ticked.includes(v));
  const [rowNumbers, setRowNumbers] = useState(config.row_numbers === true);
  const [frozen, setFrozen] = useState(config.frozen_columns ? String(config.frozen_columns) : '0');
  const [height, setHeight] = useState(config.height ? String(config.height) : '');
  const [width, setWidth] = useState(config.width ? String(config.width) : '');
  const state = JSON.stringify([view, otherViews, rowNumbers, frozen, height, width]);
  const [saved, setSaved] = useState(state);
  const { busy, error, run } = useSaving();
  const dirty = state !== saved;
  const px = (v: string) => (Number(v) > 0 ? Math.round(Number(v)) : null);
  const params = useParams(meta.id);
  const count = params ? visibleParams(params).length : 0;
  const nested = (params ?? []).filter((p) => p.data_type === 'subgrid' && p.json_config?.display === 'nested').length;

  const save = () =>
    run(async () => {
      await saveConfig(meta.id, {
        view: view === 'table' ? null : view,
        view_buttons: otherViews.length ? otherViews : null,
        row_numbers: rowNumbers,
        frozen_columns: Number(frozen) || null,
        height: px(height),
        width: px(width),
      });
      setSaved(state);
    });

  return (
    <Panel
      title={t('Layout')}
      description={`${t('How the grid shows its records, and its size.')} ${nested ? t('Rows open their nested subgrid.') : t('To open a subgrid inside each row, give it {code}.', { code: '{ "display": "nested" }' })}`}
      actions={
        <Button size="sm" isDisabled={!dirty} isLoading={busy} showTextWhileLoading onPress={save}>
          {dirty ? t('Save') : t('Saved')}
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="divide-y divide-secondary">
        <SettingRow title={t('Show records as')} hint={t('Cards and tiles show each record as a widget.')}>
          <NativeSelect
            aria-label={t('Show records as')}
            value={view}
            onChange={(e) => setView(e.target.value as GridViewName)}
            options={GRID_VIEWS.map((v) => ({ value: v, label: t(GRID_VIEW_LABELS[v]) }))}
          />
        </SettingRow>
        <SettingRow title={t('View buttons')} hint={t('Buttons above the grid to switch views.')}>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
            {GRID_VIEWS.map((v) => (
              <Checkbox
                key={v}
                label={t(GRID_VIEW_LABELS[v])}
                isDisabled={v === view}
                isSelected={v === view || ticked.includes(v)}
                onChange={(on) => setTicked((current) => (on ? [...current, v] : current.filter((x) => x !== v)))}
              />
            ))}
          </div>
        </SettingRow>
        {(view !== 'table' || otherViews.length > 0) && (
          <div className="py-5">
            <RecordSlotsEditor meta={meta} params={params} />
          </div>
        )}
        <SettingRow title={t('Row numbers')} hint={t('A # column counting rows.')}>
          <Toggle aria-label={t('Row numbers')} label={rowNumbers ? t('Shown') : t('Hidden')} isSelected={rowNumbers} onChange={setRowNumbers} />
        </SettingRow>
        <SettingRow title={t('Frozen columns')} hint={t('Stay in view when the table scrolls sideways.')}>
          <NativeSelect
            aria-label={t('Frozen columns')}
            value={frozen}
            onChange={(e) => setFrozen(e.target.value)}
            options={[{ value: '0', label: t('None') }, ...Array.from({ length: Math.min(count, 5) }, (_, i) => ({ value: String(i + 1), label: t('First {n}', { n: i + 1 }) }))]}
          />
        </SettingRow>
        <SettingRow title={t('Size')} hint={t('Empty fits the window.')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={t('Height (px)')} type="number" placeholder={t('Fits the window')} value={height} onChange={setHeight} />
            <Input label={t('Width (px)')} type="number" placeholder={t('Fills the page')} value={width} onChange={setWidth} />
          </div>
        </SettingRow>
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
  const [layout, setLayout] = useState(typeof config.layout === 'string' ? config.layout : '');
  const [saved, setSaved] = useState(() => JSON.stringify([printId, saveAndAdd, layout]));
  const { busy, error, run } = useSaving();
  const dirty = JSON.stringify([printId, saveAndAdd, layout]) !== saved;
  const reports = options.filter((o) => o.type === 'report');

  return (
    <Panel
      title={t('Layout and buttons')}
      description={t('Field layout and extra buttons.')}
      actions={
        <Button
          size="sm"
          isDisabled={!dirty}
          isLoading={busy}
          showTextWhileLoading
          onPress={() =>
            run(async () => {
              await saveConfig(meta.id, { print_meta_id: printId ? Number(printId) : null, save_and_add: saveAndAdd, layout: layout || null });
              setSaved(JSON.stringify([printId, saveAndAdd, layout]));
            })
          }
        >
          {dirty ? t('Save settings') : t('Saved')}
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="divide-y divide-secondary">
        <SettingRow title={t('Layout')} hint={t('Groups fields by their Group setting.')}>
          <NativeSelect
            aria-label={t('Layout')}
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            options={[
              { value: '', label: t('One page, no groups') },
              { value: 'sections', label: t('Sections: groups one under another') },
              { value: 'tabs', label: t('Tabs: one group at a time') },
              { value: 'wizard', label: t('Wizard: steps with Back and Next') },
            ]}
          />
        </SettingRow>
        <SettingRow title={t('Save and add')} hint={t('Shown in dialogs and when editing a record.')}>
          <Toggle label={t('Show Save and add')} isSelected={saveAndAdd} onChange={setSaveAndAdd} />
        </SettingRow>
        <SettingRow title={t('Save and print')} hint={reports.length ? t('The report it prints. None: no button.') : t('Make a report meta on this table first.')}>
          <MetaLookupField aria-label={t('Print with')} placeholder={t('No printing')} value={printId} onChange={setPrintId} items={metaChoices(reports)} />
        </SettingRow>
      </div>
    </Panel>
  );
}

/** A small drawing of a menu style: the menu on the left, the screen on the right. */
function MenuStyleSketch({ style, side }: { style: MenuStyle; side: MenuSide }) {
  if (style === 'header') {
    // The header: logo, a long search and the user across the top; a few icons down the left.
    return (
      <div aria-hidden="true" className="flex h-16 flex-col overflow-hidden rounded-md bg-secondary ring-1 ring-secondary">
        <div className="flex items-center gap-1.5 border-b border-secondary bg-primary px-1.5 py-1">
          <span className="size-1.5 rounded-xs bg-brand-solid" />
          <span className="h-1.5 flex-1 rounded-full ring-1 ring-secondary" />
          <span className="size-1.5 rounded-full bg-quaternary" />
        </div>
        <div className="flex flex-1">
          <div className="m-1 flex w-4 flex-col items-center justify-center gap-1 self-center rounded-md bg-primary py-1 shadow-sm ring-1 ring-secondary">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1 rounded-full bg-quaternary" />
            ))}
          </div>
          <div className="flex-1 p-1.5 pl-0.5">
            <span className="block h-full rounded-sm bg-primary ring-1 ring-secondary" />
          </div>
        </div>
      </div>
    );
  }
  const onRight = side === 'right' && style !== 'topbar';
  return (
    <div
      aria-hidden="true"
      className={cx('flex h-16 overflow-hidden rounded-md ring-1 ring-secondary', style === 'inset' ? 'bg-tertiary' : 'bg-secondary', style === 'topbar' && 'flex-col', onRight && 'flex-row-reverse')}
    >
      <div
        className={cx(
          style === 'topbar' ? 'flex items-center gap-1.5 border-b border-secondary bg-primary px-1.5 py-1' : cx('flex flex-col gap-1 p-1.5', style === 'compact' ? 'w-6' : 'w-1/3'),
          style === 'classic' && (onRight ? 'border-l' : 'border-r'),
          style === 'classic' && 'border-secondary bg-primary',
          style === 'floating' && 'm-1 rounded-md bg-primary shadow-sm ring-1 ring-secondary',
          style === 'compact' && 'm-1 self-center rounded-md bg-primary shadow-sm ring-1 ring-secondary',
          style === 'dark' && 'bg-gray-900',
        )}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className={cx('h-1 rounded-full', style === 'dark' ? 'bg-gray-600' : 'bg-quaternary', style === 'topbar' ? 'w-4' : i === 0 ? 'w-3/4' : 'w-1/2')} />
        ))}
      </div>
      <div className={cx('flex-1 p-1.5', style === 'inset' && 'my-1 rounded-md bg-secondary ring-1 ring-secondary', style === 'inset' && (onRight ? 'ml-1' : 'mr-1'))}>
        <span className="block h-full rounded-sm bg-primary ring-1 ring-secondary" />
      </div>
    </div>
  );
}

/** A small drawing of a menu style meta, from its settings. */
function MenuSettingsSketch({ settings, side }: { settings: MenuSettings; side: MenuSide }) {
  const onRight = side === 'right';
  const { dark, glass, vars } = menuSurface(settings);
  return (
    <div
      aria-hidden="true"
      style={vars as React.CSSProperties}
      className={cx(
        'flex h-16 overflow-hidden rounded-md ring-1 ring-secondary',
        settings.backdrop ? '[background:var(--menu-backdrop)]' : settings.frame ? '[background:var(--menu-fill)]' : 'bg-secondary',
        onRight && 'flex-row-reverse',
      )}
    >
      <div
        className={cx(
          'flex w-1/3 flex-col gap-1 p-1.5',
          (!settings.frame || glass) && '[background:var(--menu-fill)]',
          glass && 'menu-glass',
          dark && 'dark-mode',
          settings.gap > 0 && 'm-1 rounded-md',
          settings.edge === 'line' && (onRight ? 'border-l border-secondary' : 'border-r border-secondary'),
          settings.edge === 'shadow' && 'shadow-sm ring-1 ring-secondary',
        )}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className={cx('h-1 rounded-full', dark ? 'bg-white/40' : 'bg-quaternary', i === 0 ? 'w-3/4' : 'w-1/2')} />
        ))}
      </div>
      <div className={cx('flex-1 p-1.5', settings.frame && 'my-1 rounded-md bg-secondary ring-1 ring-secondary', settings.frame && (onRight ? 'ml-1' : 'mr-1'))}>
        <span className="block h-full rounded-sm bg-primary ring-1 ring-secondary" />
      </div>
    </div>
  );
}

/**
 * An app's menu: a built-in style (json_config.menu_style) or a menu style meta
 * (menu_style_meta_id), and its side (menu_side), saved as soon as they are picked.
 */
export function AppSettingsPanel({ meta }: { meta: Meta }) {
  const [style, setStyle] = useState<MenuStyle>(menuStyleOf(meta.json_config?.menu_style));
  const [customId, setCustomId] = useState<number | null>(Number(meta.json_config?.menu_style_meta_id) || null);
  const [side, setSide] = useState<MenuSide>(menuSideOf(meta.json_config?.menu_side));
  const customStyles = useMenuStyles();
  const { busy, error, run } = useSaving();
  // A picked style that is gone or turned off shows as the built-in the app falls back to.
  const custom = customStyles?.find((s) => s.id === customId) ?? null;

  const pickCustom = (id: number) => {
    const before = { style, customId };
    setStyle('classic');
    setCustomId(id);
    void run(async () => {
      try {
        await saveConfig(meta.id, { menu_style: null, menu_style_meta_id: id });
      } catch (err) {
        setStyle(before.style);
        setCustomId(before.customId);
        throw err;
      }
    });
  };

  const pickSide = (next: MenuSide) => {
    const before = side;
    setSide(next);
    void run(async () => {
      try {
        await saveConfig(meta.id, { menu_side: next === 'right' ? 'right' : null });
      } catch (err) {
        setSide(before);
        throw err;
      }
    });
  };

  const pick = (next: MenuStyle) => {
    const before = { style, customId };
    setStyle(next);
    setCustomId(null);
    void run(async () => {
      try {
        await saveConfig(meta.id, { menu_style: next === 'classic' ? null : next, menu_style_meta_id: null });
      } catch (err) {
        setStyle(before.style);
        setCustomId(before.customId);
        throw err;
      }
    });
  };
  const card = (on: boolean) =>
    cx(
      'flex flex-col gap-2 rounded-lg p-2.5 text-left outline-focus-ring transition-shadow duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait',
      on ? 'ring-2 ring-brand' : 'ring-1 ring-secondary hover:ring-primary',
    );

  return (
    <Panel title={t('App menu')} description={t('Where the menu sits. Phones use the top bar.')}>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="divide-y divide-secondary">
        <SettingRow title={t('Menu style')} hint={customStyles?.length === 0 ? t('Saved when picked. Add a Menu style meta for your own.') : t('Saved as soon as you pick one.')} wide>
          <div role="radiogroup" aria-label={t('Menu style')} className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
            {MENU_STYLES.map((m) => {
              const on = !custom && style === m.id;
              return (
                <button key={m.id} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => !on && pick(m.id)} className={card(on)}>
                  <MenuStyleSketch style={m.id} side={side} />
                  <span>
                    <span className="block text-sm font-semibold text-primary">{t(m.name)}</span>
                    <span className="block text-xs text-tertiary">{t(m.hint)}</span>
                  </span>
                </button>
              );
            })}
            {customStyles?.map((s) => {
              const on = custom?.id === s.id;
              return (
                <button key={s.id} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => !on && pickCustom(s.id)} className={card(on)}>
                  <MenuSettingsSketch settings={s.menu} side={side} />
                  <span>
                    <span className="block text-sm font-semibold text-primary">{s.name}</span>
                    <span className="block text-xs text-tertiary">{t('Your own menu style.')}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </SettingRow>
        {(custom || (style !== 'topbar' && style !== 'header')) && (
          <SettingRow title={t('Menu side')} hint={t('Which side of the screens the menu sits on.')}>
            <ButtonGroup
              size="sm"
              aria-label={t('Menu side')}
              selectionMode="single"
              disallowEmptySelection
              isDisabled={busy}
              selectedKeys={[side]}
              onSelectionChange={(keys) => pickSide([...keys][0] === 'right' ? 'right' : 'left')}
            >
              <ButtonGroupItem id="left">{t('Left')}</ButtonGroupItem>
              <ButtonGroupItem id="right">{t('Right')}</ButtonGroupItem>
            </ButtonGroup>
          </SettingRow>
        )}
      </div>
    </Panel>
  );
}

/** A package id to start from, made from the app's code: mn.wand.assets_app. */
const packageIdFor = (code: string) =>
  `mn.wand.${
    code
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^[^a-z]+/, '') || 'app'
  }`;

/**
 * An app's pictures, each the Wand mark until one is uploaded: its icon, its brand (the logo
 * inside the app and on its tile, metas.image_path), and its card cover (metas.cover_path).
 */
export function AppPicturePanel({ meta }: { meta: Meta }) {
  const [config, setConfig] = useState<Record<string, unknown>>(meta.json_config ?? {});
  const [paths, setPaths] = useState<AppImagePaths>({ image_path: meta.image_path ?? null, cover_path: meta.cover_path ?? null });
  const [busy, setBusy] = useState<AppImageKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (kind: AppImageKind, work: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await work();
      clearRenderCache();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('The picture could not be saved.'));
    } finally {
      setBusy(null);
    }
  };
  const upload = (kind: AppImageKind, file: File) => change(kind, async () => setPaths(await appImageApi.upload(meta.id, file, kind)));
  const remove = (kind: AppImageKind) => change(kind, async () => setPaths(await appImageApi.remove(meta.id, kind)));

  // Where each picture shows (on unless turned off).
  const toggle = (kind: AppImageKind, on: boolean) =>
    change(kind, async () => {
      const key = kind === 'icon' ? 'show_icon' : 'show_cover';
      await saveConfig(meta.id, { [key]: on ? null : false });
      setConfig({ ...config, [key]: on ? null : false });
    });

  return (
    <Panel title={t('Pictures')} description={t('The app’s logo and its card cover.')}>
      <div className="divide-y divide-secondary">
        <AppPictureRow
          kind="icon"
          title={t('Icon')}
          hint={t('Square. None: the Wand logo.')}
          preview={(faded) => <AppImage app={paths} variant="icon" className={cx('size-16 shrink-0 rounded-xl ring-1 ring-secondary transition-opacity', faded && 'opacity-35')} />}
          has={!!paths.image_path}
          shown={config.show_icon !== false}
          busy={busy}
          onUpload={upload}
          onRemove={remove}
          onToggle={toggle}
        />
        <AppPictureRow
          kind="cover"
          title={t('Cover')}
          hint={t('Wide, about 16 × 7.')}
          preview={(faded) => (
            <AppImage app={paths} variant="cover" className={cx('aspect-[16/7] w-full max-w-xs shrink-0 rounded-xl ring-1 ring-secondary transition-opacity', faded && 'opacity-35')} />
          )}
          has={!!paths.cover_path}
          shown={config.show_cover !== false}
          busy={busy}
          onUpload={upload}
          onRemove={remove}
          onToggle={toggle}
        />
      </div>
      <p className="mt-3 text-sm text-tertiary">{t('A PNG, JPG or WebP up to 5 MB each, cut to fit.')}</p>
      {error && <p className="mt-2 text-sm text-error-primary">{error}</p>}
    </Panel>
  );
}

/** One of an app's pictures: its preview, Upload/Replace and Remove, and whether it shows. */
function AppPictureRow({
  kind,
  title,
  hint,
  preview,
  has,
  shown,
  busy,
  onUpload,
  onRemove,
  onToggle,
}: {
  kind: AppImageKind;
  title: string;
  hint: string;
  preview: (faded: boolean) => ReactNode;
  has: boolean;
  shown: boolean;
  busy: AppImageKind | null;
  onUpload: (kind: AppImageKind, file: File) => void;
  onRemove: (kind: AppImageKind) => void;
  onToggle: (kind: AppImageKind, on: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pick = (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (file) onUpload(kind, file);
  };

  return (
    <SettingRow title={title} hint={hint}>
      {/* Faded while switched off. */}
      {preview(!shown)}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" color="secondary" iconLeading={Upload01} isLoading={busy === kind} showTextWhileLoading isDisabled={!!busy && busy !== kind} onPress={() => input.current?.click()}>
          {has ? t('Replace') : t('Upload')}
        </Button>
        {has && (
          <Button size="sm" color="tertiary" isDisabled={!!busy} onPress={() => onRemove(kind)}>
            {t('Remove')}
          </Button>
        )}
      </div>
      <Toggle label={t('Show it')} isSelected={shown} isDisabled={!!busy} onChange={(on) => onToggle(kind, on)} />
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={t('{name} file', { name: title })} onChange={(e) => pick(e.target.files?.[0])} />
    </SettingRow>
  );
}

/**
 * Where this meta is used: the fields, buttons, settings, process steps, links, page widgets and
 * schedules that point at it, so it can be changed or removed knowing what it touches.
 */
/**
 * Export: a file with this meta and everything defined with it, to import in another
 * installation of the app. Records are not included.
 */
export function MetaExportPanel({ meta }: { meta: Meta }) {
  const [withUsed, setWithUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await metaApi.exportFile([meta.id], withUsed);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('The meta could not be exported.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={t('Export')}
      description={t('A file with {name} and its parts, without records.', { name: meta.name })}
      actions={
        <Button size="sm" iconLeading={Download01} isLoading={busy} showTextWhileLoading onPress={download}>
          {t('Export')}
        </Button>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="divide-y divide-secondary">
        <SettingRow title={t('Also the metas it uses')} hint={t('Lookups, opened forms, linked metas and what they use.')}>
          <Toggle aria-label={t('Also the metas it uses')} label={withUsed ? t('On') : t('Off')} isSelected={withUsed} onChange={setWithUsed} />
        </SettingRow>
      </div>
    </Panel>
  );
}

export function WhereUsedPanel({ meta }: { meta: Meta }) {
  const [uses, setUses] = useState<MetaUse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    metaApi.usageOf(meta.id).then(setUses, (e) => setError(e instanceof ApiError ? e.message : t('The list could not be loaded.')));
  }, [meta.id]);

  const count = uses?.length ?? 0;
  return (
    <Panel
      title={t('Where used')}
      description={!uses ? t('What uses this meta. Check before changing it.') : count === 0 ? t('Not used anywhere.') : count === 1 ? t('Used in 1 place.') : t('Used in {count} places.', { count })}
    >
      {error ? (
        <Alert>{error}</Alert>
      ) : !uses ? (
        <div className="h-24 animate-pulse rounded-lg bg-secondary_subtle motion-reduce:animate-none" aria-busy="true" />
      ) : count === 0 ? (
        <p className="text-sm text-tertiary">{t('Nothing refers to this meta, so changing or deleting it touches nothing else.')}</p>
      ) : (
        <ul className="divide-y divide-secondary rounded-lg bg-secondary_subtle px-3 ring-1 ring-secondary">
          {uses.map((u, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-2 text-sm">
              {u.meta ? (
                <>
                  <Link to={`/metas/${u.meta.id}`} className="font-medium text-brand-secondary hover:underline">
                    {u.meta.name}
                  </Link>
                  <span className="text-quaternary">{u.meta.type.name ?? u.meta.type.code}</span>
                  <span className="text-tertiary">· {u.where}</span>
                </>
              ) : (
                <span className="text-secondary">{u.where}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * An app built into its own phone app (json_config.mobile): its name on the phone, the Android
 * package id it is published under, and its colour. The phone app opens this app and nothing else.
 */
export function MobileSettingsPanel({ meta }: { meta: Meta }) {
  const saved = (meta.json_config?.mobile ?? {}) as MobileSettings;
  const [enabled, setEnabled] = useState(!!saved.enabled);
  const [name, setName] = useState(saved.name ?? '');
  const [packageId, setPackageId] = useState(saved.package_id ?? packageIdFor(meta.code));
  const [color, setColor] = useState(saved.color ?? '#4f39f6');
  // Saved by its own field at once; kept here so Save sends it back unchanged.
  const [icon, setIcon] = useState(saved.icon ?? null);
  // Saved as a phone app: the preview can open it.
  const [live, setLive] = useState(!!saved.enabled);
  const { busy, error, run } = useSaving();
  const validId = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageId);

  const save = () =>
    void run(async () => {
      await saveConfig(meta.id, { mobile: { enabled, name: name.trim() || null, package_id: packageId.trim(), color, icon } satisfies MobileSettings });
      setLive(enabled);
    });

  return (
    <Panel
      title={t('Phone app')}
      description={t('Build this app as its own Android app.')}
      actions={
        <div className="flex items-center gap-4">
          {live && (
            <a href={mobilePreviewUrl(meta.id)} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
              {t('Open phone preview')}
            </a>
          )}
          <Button size="sm" onClick={save} isLoading={busy} isDisabled={enabled && !validId}>
            {t('Save')}
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="divide-y divide-secondary">
        <SettingRow title={t('Make a phone app')} hint={t('Off: this app is only on the web.')}>
          <Toggle aria-label={t('Make a phone app')} label={enabled ? t('On') : t('Off')} isSelected={enabled} onChange={setEnabled} />
        </SettingRow>
        {enabled && (
          <>
            <SettingRow title={t('Name on the phone')} hint={t('Under the home screen icon. Empty: app name.')}>
              <Input aria-label={t('Name on the phone')} placeholder={meta.name} value={name} onChange={setName} maxLength={30} />
            </SettingRow>
            <SettingRow title={t('Package id')} hint={t('Its Google Play name. Fixed once published.')}>
              <Input
                aria-label={t('Package id')}
                value={packageId}
                onChange={setPackageId}
                isInvalid={!validId}
                hint={validId ? undefined : t('Lower-case words joined by dots, e.g. mn.wand.assets.')}
              />
            </SettingRow>
            <SettingRow title={t('Colour')} hint={t("The sign-in screen and the phone's top bar.")}>
              <div className="flex items-center gap-3">
                <input
                  aria-label={t('Colour')}
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-primary bg-primary p-1"
                />
                <span className="text-sm text-tertiary tabular-nums">{color}</span>
              </div>
            </SettingRow>
            <SettingRow title={t('Icon')} hint={t('Square PNG, JPG or WebP, 512 × 512 or more. Keep the logo centred.')}>
              <MobileIconField appId={meta.id} icon={icon} color={color} onChange={setIcon} />
            </SettingRow>
          </>
        )}
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
      title={t('Stage query')}
      description={t('Runs its SQL with its parameters: by hand, in a process flow or on a schedule.')}
      actions={
        missing.length > 0 && (
          <Button
            size="sm"
            iconLeading={Plus}
            isLoading={busy}
            showTextWhileLoading
            onPress={() =>
              run(async () => {
                const last = Math.max(0, ...(params ?? []).map((p) => p.order_number));
                for (const [i, name] of missing.entries()) {
                  await metaApi.createParam(meta.id, { field_path: name, param_name: name, label_name: labelOf(name), data_type: 'string', order_number: last + i + 1, is_show: true });
                }
                setVersion((v) => v + 1);
                onParamsChanged();
              })
            }
          >
            {missing.length === 1 ? t('Add its parameter') : t('Add {count} parameters', { count: missing.length })}
          </Button>
        )
      }
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {sql.trim() ? (
        <pre className="max-h-72 overflow-auto rounded-lg bg-secondary p-4 font-mono text-sm whitespace-pre-wrap text-primary ring-1 ring-secondary ring-inset">{sql}</pre>
      ) : (
        <p className="text-sm text-tertiary">{t('No SQL yet. Edit the meta to write it.')}</p>
      )}
      <div className="mt-4 space-y-2 text-sm">
        <p className="text-secondary">
          <span className="font-medium">{t('Parameters in the SQL:')} </span>
          {names.length === 0 ? (
            <span className="text-tertiary">{t('none')}</span>
          ) : (
            names.map((n) => (
              <code
                key={n}
                className={`mr-1.5 inline-block rounded px-1.5 py-0.5 font-mono text-xs ring-1 ring-inset ${defined.has(n) ? 'bg-secondary text-secondary ring-secondary' : 'bg-warning-primary text-warning-primary ring-secondary'}`}
              >
                :{n}
              </code>
            ))
          )}
        </p>
        {missing.length > 0 && <p className="text-warning-primary">{t('{names} has no parameter yet, so it is always empty (null).', { names: missing.map((n) => `:${n}`).join(', ') })}</p>}
        {unused.length > 0 && <p className="text-tertiary">{t('Not used by the SQL: {names}.', { names: unused.map((p) => p.field_path).join(', ') })}</p>}
        <p className="text-xs text-quaternary">{t('Plus :user_id and :today. Empty ones use their default.')}</p>
      </div>
    </Panel>
  );
}

/**
 * The phone app's launcher icon: a preview tile in the app's colour (the Wand mark until one is
 * uploaded), Upload/Replace and Remove. Saved at once; the next build of the phone app uses it.
 */
function MobileIconField({ appId, icon, color, onChange }: { appId: number; icon: string | null; color: string; onChange: (icon: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The saved icon comes with the token (and this customer), so it is fetched as a blob.
  useEffect(() => {
    if (!icon) return setUrl(null);
    let gone = false;
    let made: string | null = null;
    mobileApi.iconUrl(appId).then(
      (u) => (gone ? URL.revokeObjectURL(u) : setUrl((made = u))),
      () => !gone && setUrl(null),
    );
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [appId, icon]);

  const change = async (work: () => Promise<{ icon?: string | null }>) => {
    setBusy(true);
    setError(null);
    try {
      onChange((await work()).icon ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('The icon could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const pick = (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (file) void change(() => mobileApi.uploadIcon(appId, file));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-4">
        {/* Rounded like a home screen icon. */}
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-xs ring-1 ring-secondary" style={url ? undefined : { backgroundColor: color }}>
          {url ? <img src={url} alt={t('App icon')} className="size-full object-cover" /> : <MagicWand01 className="size-8 text-white" aria-hidden />}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" color="secondary" iconLeading={Upload01} isLoading={busy} showTextWhileLoading onPress={() => input.current?.click()}>
            {icon ? t('Replace') : t('Upload')}
          </Button>
          {icon && (
            <Button size="sm" color="tertiary" isDisabled={busy} onPress={() => void change(() => mobileApi.removeIcon(appId))}>
              {t('Remove')}
            </Button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={t('Icon file')} onChange={(e) => pick(e.target.files?.[0])} />
      {error && <p className="text-sm text-error-primary">{error}</p>}
    </div>
  );
}

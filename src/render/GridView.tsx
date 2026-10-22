import { useEffect, useMemo, useState, type FC } from 'react';
import type { Selection, SortDescriptor } from 'react-aria-components';
import { ArrowUpRight, Check, Copy01, Download01, Edit01, Eye, File06, FilterLines, GitBranch01, Plus, SearchLg, Trash01, Upload01, Zap } from '@untitledui/icons';
import { Button as AriaButton } from 'react-aria-components';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Ability } from '../lib/accessApi';
import { ApiError } from '../lib/api';
import { dataApi, type DataRow, type Page } from '../lib/dataApi';
import type { MetaAction, MetaParam } from '../lib/metaApi';
import { Alert, IconAction } from '../components/ui';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Table, TableCard } from '@/components/application/table/table';
import { PaginationCardMinimal } from '@/components/application/pagination/pagination';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { useDebounced } from '@/hooks/use-debounced';
import { Input } from '@/components/base/input/input';
import { ColumnValue } from './Cell';
import { FormView } from './FormView';
import { GridFilters, type Filters } from './GridFilters';
import { GridSidebar } from './GridSidebar';
import { ImportView } from './ImportView';
import { detailParams, primaryKey, subgridParams, title, useActions, useGridWorkflow, useMetaDef, visibleParams, type MetaDef } from './definitions';
import { drilldownOf, drillParams, useDrilldown } from './drilldown';
import { StageQueryView } from './StageQueryView';
import { StatusBadge, StatusDialog } from './StatusDialog';

/** Quantities and amounts line up on the right; lookup ids don't count as numbers. */
const isNumber = (p: MetaParam) => (p.data_type === 'integer' || p.data_type === 'decimal') && !p.is_select;

// An action's icon_cls picks one of these; without one, its kind decides.
const actionIcons: Record<string, FC<{ className?: string }>> = { plus: Plus, edit: Edit01, trash: Trash01, copy: Copy01, eye: Eye, check: Check, file: File06, upload: Upload01 };
const kindIcons: Record<MetaAction['action'], FC<{ className?: string }>> = {
  add: Plus,
  edit: Edit01,
  delete: Trash01,
  custom: File06,
  import: Upload01,
  stage_query: Zap,
};
const iconOf = (a: MetaAction) => (a.icon_cls && actionIcons[a.icon_cls]) || kindIcons[a.action];

/** The column a workflow adds to its grid when the grid doesn't list status_id itself. */
const statusColumn = {
  id: -1,
  field_path: 'status_id',
  param_name: 'status_id',
  label_name: 'Status',
  data_type: 'integer',
  is_show: true,
  is_select: false,
  ref_meta_id: null,
  render_type: null,
  json_config: null,
} as MetaParam;

/**
 * An action's named parameters from a row: json_config.params maps each to a field of the
 * row. A button that needs a row and names none passes the row's key as :id.
 */
function actionParams(action: MetaAction, row: DataRow | undefined, key: string): Record<string, string> {
  const map = action.json_config?.params ?? (action.needs_row ? { id: key } : {});
  return Object.fromEntries(Object.entries(map).map(([name, field]) => [name, row?.[field] == null ? '' : String(row[field])]));
}

/** What a toolbar button is doing right now. */
type Running = { action: MetaAction; row?: DataRow };

/** What the user must be allowed to do with an action's form to see the button. */
// Running a stage query needs edit access to it, as the run endpoint does.
const abilityOf: Record<MetaAction['action'], Ability> = { add: 'create', custom: 'create', edit: 'edit', delete: 'delete', import: 'create', stage_query: 'edit' };

/**
 * A datagrid meta as a searchable, filterable, sortable, paged table. Its toolbar buttons
 * come from meta_actions (add, edit, delete, custom), each working through a form, and a
 * get meta decides what the form opens with; an import button loads an Excel file through
 * its excel_import meta. Export downloads what the grid shows, with its filters, as .xlsx. Click a row to pick it (buttons that need a
 * row act on it, and subgrids show its records); double-click runs its Edit button.
 *
 * fixed: filter values set from outside, e.g. a subgrid's parameters from the parent row.
 * scope: exact values every row has and every new record gets, e.g. a workspace's tender_id;
 * unlike fixed, they hold whether or not the field is a filter.
 * initialFilters: what the filters start at, e.g. from a tab; people can change them.
 */
export function GridView({ def, fixed, scope, initialFilters, label }: { def: MetaDef; fixed?: Filters; scope?: Filters; initialFilters?: Filters; label?: string }) {
  const { meta, params } = def;
  const workflow = useGridWorkflow(meta);
  const columns = useMemo(() => {
    // A scoped column holds the same value on every row, so it isn't shown.
    const visible = visibleParams(params).filter((p) => !(scope && p.field_path in scope));
    return workflow && !visible.some((p) => p.field_path === 'status_id') ? [...visible, statusColumn] : visible;
  }, [params, workflow, scope]);
  const statuses = useMemo(() => new Map((workflow?.statuses ?? []).map((s) => [s.id, s])), [workflow]);
  const filterParams = useMemo(
    () => params.filter((p) => p.is_criteria && p.data_type !== 'detail' && p.data_type !== 'subgrid' && !(fixed && p.field_path in fixed) && !(scope && p.field_path in scope)),
    [params, fixed, scope],
  );
  const subgrids = useMemo(() => subgridParams(params), [params]);
  const key = primaryKey(params);
  const actions = useActions(meta.id);
  const { can } = useAuth();
  const toolbar = useMemo(() => (actions ?? []).filter((a) => can(a.form_meta_id, abilityOf[a.action])), [actions, can]);
  const rowActions = toolbar.filter((a) => a.show_in_row);
  const editAction = toolbar.find((a) => a.action === 'edit');
  // A drilldown on the grid opens from each row's button; one on a column, from its values.
  const drill = useDrilldown();
  const rowDrill = drill ? drilldownOf(meta.json_config) : null;
  // json_config.filter_layout "sidebar": the filters sit beside the grid, always open.
  const sidebar = meta.json_config?.filter_layout === 'sidebar' && filterParams.length > 0;
  const searchable = filterParams.some((p) => (p.data_type === 'string' || p.data_type === 'text') && !p.is_select && !Array.isArray(p.json_config?.options));

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [filters, setFilters] = useState<Filters>(() => initialFilters ?? {});
  const [showFilters, setShowFilters] = useState(() => filterParams.some((p) => p.is_mandatory_criteria) || !!initialFilters);
  const [sort, setSort] = useState<SortDescriptor | undefined>();
  const [result, setResult] = useState<Page<DataRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const [running, setRunning] = useState<Running | null>(null);
  const [deleting, setDeleting] = useState<Running | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [changingStatus, setChangingStatus] = useState<DataRow | null>(null);
  const [exporting, setExporting] = useState(false);

  // A notification links to /run/{grid}?record={id}: open that record's status straight away.
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedRecord = pathname === `/run/${meta.id}` ? searchParams.get('record') : null;
  const closeLinked = () =>
    setSearchParams(
      (p) => {
        p.delete('record');
        return p;
      },
      { replace: true },
    );

  const fixedKey = JSON.stringify([fixed ?? {}, scope ?? {}]);
  const filterKey = JSON.stringify(filters);
  useEffect(() => setPage(1), [search, perPage, filterKey, fixedKey]);

  useEffect(() => {
    let live = true;
    dataApi
      .list(meta.id, {
        page,
        per_page: perPage,
        search,
        filter: { ...filters, ...fixed },
        scope,
        sort: sort?.column ? String(sort.column) : undefined,
        dir: sort?.direction === 'descending' ? 'desc' : 'asc',
      })
      .then(
        (r) => {
          if (!live) return;
          setResult(r);
          setError(null);
          // Keep the pick only while its row is still on the page.
          setSelected((s) => (s && r.data.some((row) => String(row[key]) === s) ? s : null));
        },
        (err) => live && setError(err instanceof ApiError ? err.message : 'Records could not be loaded.'),
      );
    return () => {
      live = false;
    };
    // filters and fixed are compared by value.
  }, [meta.id, page, perPage, search, filterKey, fixedKey, sort, reload, key]);

  const rows = result?.data ?? [];
  const selectedRow = selected ? rows.find((r) => String(r[key]) === selected) : undefined;
  const missing = result?.missing_filters ?? [];
  const activeFilters = Object.keys(filters).length;

  function run(action: MetaAction, row = selectedRow) {
    if (action.needs_row && !row) return;
    if (row) setSelected(String(row[key]));
    if (action.action === 'delete') setDeleting({ action, row });
    else setRunning({ action, row });
  }

  async function confirmDelete() {
    if (!deleting?.row || !deleting.action.form_meta_id) return;
    setDeleteBusy(true);
    try {
      const id = actionParams(deleting.action, deleting.row, key).id || String(deleting.row[key]);
      await dataApi.remove(deleting.action.form_meta_id, id);
      setDeleting(null);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The record could not be deleted.');
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function exportExcel() {
    setExporting(true);
    try {
      await dataApi.exportExcel(meta.id, meta.code, {
        search,
        filter: { ...filters, ...fixed },
        scope,
        sort: sort?.column ? String(sort.column) : undefined,
        dir: sort?.direction === 'descending' ? 'desc' : 'asc',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The records could not be exported.');
    } finally {
      setExporting(false);
    }
  }

  const rowName = (row?: DataRow) => (row && columns[0] && !columns[0].is_select ? String(row[columns[0].field_path] ?? '') : '');

  return (
    <>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className={sidebar ? 'flex flex-col gap-4 lg:flex-row lg:items-start' : undefined}>
      {sidebar && (
        <div className="shrink-0 lg:w-64">
          <GridSidebar metaId={meta.id} params={filterParams} filters={filters} onChange={setFilters} statuses={workflow?.statuses} search={search} scope={scope} fixed={fixed} />
        </div>
      )}
      <TableCard.Root size="sm" className={sidebar ? 'min-w-0 flex-1' : undefined}>
        <TableCard.Header
          title={label ?? title(meta)}
          badge={
            result && !missing.length ? (
              <Badge type="pill-color" size="sm" color="brand">
                {result.total} {result.total === 1 ? 'record' : 'records'}
              </Badge>
            ) : undefined
          }
          description={meta.description ?? undefined}
          contentTrailing={
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {searchable && (
                <Input
                  aria-label={`Search ${title(meta)}`}
                  type="search"
                  size="sm"
                  icon={SearchLg}
                  placeholder="Search"
                  value={query}
                  onChange={setQuery}
                  className="sm:w-56"
                />
              )}
              <div className="flex flex-wrap gap-2">
                {filterParams.length > 0 && !sidebar && (
                  <Button size="sm" color="secondary" iconLeading={FilterLines} onPress={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
                    Filters{activeFilters ? ` (${activeFilters})` : ''}
                  </Button>
                )}
                {toolbar.map((a) => (
                  <Button
                    key={a.id}
                    size="sm"
                    color={a.action === 'add' ? 'primary' : a.action === 'delete' ? 'secondary-destructive' : 'secondary'}
                    iconLeading={iconOf(a)}
                    isDisabled={(a.needs_row && !selectedRow) || !a.form_meta_id}
                    onPress={() => run(a)}
                  >
                    {a.label}
                  </Button>
                ))}
                <Button size="sm" color="secondary" iconLeading={Download01} isDisabled={!result?.total} isLoading={exporting} onPress={exportExcel}>
                  Export
                </Button>
                {workflow && (
                  <Button size="sm" color="secondary" iconLeading={GitBranch01} isDisabled={!selectedRow} onPress={() => selectedRow && setChangingStatus(selectedRow)}>
                    Change status
                  </Button>
                )}
              </div>
            </div>
          }
        />

        {showFilters && !sidebar && filterParams.length > 0 && <GridFilters params={filterParams} applied={filters} onApply={setFilters} statuses={workflow?.statuses} />}

        <Table
          aria-label={title(meta)}
          sortDescriptor={sort}
          onSortChange={setSort}
          selectionMode="single"
          selectionBehavior="replace"
          selectedKeys={selected ? [selected] : []}
          onSelectionChange={(keys: Selection) => setSelected(keys === 'all' ? null : ([...keys][0] != null ? String([...keys][0]) : null))}
          onRowAction={editAction ? (id) => run(editAction, rows.find((r) => String(r[key]) === String(id))) : undefined}
        >
          <Table.Header>
            {[
              ...columns.map((c, i) => (
                <Table.Head
                  key={c.field_path}
                  id={c.field_path}
                  label={c.label_name || c.param_name}
                  allowsSorting={c !== statusColumn}
                  isRowHeader={i === 0}
                  className={isNumber(c) && !(workflow && c.field_path === 'status_id') ? '[&>div]:justify-end' : undefined}
                />
              )),
              ...(rowActions.length || rowDrill ? [<Table.Head key="_actions" id="_actions" />] : []),
            ]}
          </Table.Header>
          <Table.Body
            items={rows.map((r): DataRow & { _key: string } => ({ ...r, _key: String(r[key]) }))}
            dependencies={[columns, rowActions, rowDrill]}
            renderEmptyState={() => (
              <div className="px-6 py-10 text-center">
                {missing.length ? (
                  <>
                    <p className="text-sm font-semibold text-primary">Fill in the required filters</p>
                    <p className="mt-1 text-sm text-tertiary">{`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} needed before records show.`}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-primary">{result ? (search || activeFilters ? 'No matches' : 'Nothing here yet') : 'Loading…'}</p>
                    {result && <p className="mt-1 text-sm text-tertiary">{search || activeFilters ? 'Try other filters.' : 'Records will show up here.'}</p>}
                  </>
                )}
              </div>
            )}
          >
            {(row) => (
              <Table.Row id={row._key} className="cursor-pointer selected:bg-brand-primary_alt selected:hover:bg-brand-primary_alt">

                {[
                  ...columns.map((c, i) => (
                    <Table.Cell
                      key={c.field_path}
                      className={`${i === 0 ? 'font-medium text-primary' : 'whitespace-nowrap'} ${isNumber(c) && !(workflow && c.field_path === 'status_id') ? 'text-right' : ''}`}
                    >
                      {workflow && c.field_path === 'status_id' ? (
                        <StatusBadge status={statuses.get(Number(row.status_id))} />
                      ) : drill && drilldownOf(c.json_config) ? (
                        <AriaButton
                          onPress={() => {
                            const d = drilldownOf(c.json_config)!;
                            drill({ metaId: d.meta_id, params: drillParams(d, row), label: rowName(row) || title(meta) });
                          }}
                          className="rounded text-left font-medium text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                        >
                          <ColumnValue param={c} value={row[c.field_path]} />
                        </AriaButton>
                      ) : (
                        <ColumnValue param={c} value={row[c.field_path]} />
                      )}
                    </Table.Cell>
                  )),
                  ...(rowActions.length || rowDrill
                    ? [
                        <Table.Cell key="_actions" className="w-px">
                          <div className="flex justify-end gap-0.5">
                            {rowDrill && (
                              <IconAction
                                icon={ArrowUpRight}
                                label={rowDrill.label || 'Open'}
                                onPress={() => drill!({ metaId: rowDrill.meta_id, params: drillParams(rowDrill, row), label: rowName(row) || title(meta) })}
                              />
                            )}
                            {rowActions.map((a) => (
                              <IconAction key={a.id} icon={iconOf(a)} danger={a.action === 'delete'} label={a.label} onPress={() => run(a, row)} />
                            ))}
                          </div>
                        </Table.Cell>,
                      ]
                    : []),
                ]}
              </Table.Row>
            )}
          </Table.Body>
        </Table>

        {result && result.last_page > 1 && (
          <PaginationCardMinimal
            page={result.current_page}
            total={result.last_page}
            pageSize={perPage}
            onPageChange={(p) => setPage(Math.max(1, p))}
            onPageSizeChange={setPerPage}
          />
        )}
      </TableCard.Root>
      </div>

      {subgrids.map((s) => (
        <div key={s.id} className="mt-4">
          <SubGrid param={s} row={selectedRow} parentTitle={title(meta)} />
        </div>
      ))}

      {running && running.action.action === 'import' && running.action.form_meta_id && (
        <ImportDialog
          label={running.action.label}
          importId={running.action.form_meta_id}
          onClose={() => setRunning(null)}
          onDone={() => {
            setRunning(null);
            setReload((n) => n + 1);
          }}
        />
      )}

      {running && running.action.action === 'stage_query' && running.action.form_meta_id && (
        <StageQueryDialog
          running={running}
          queryId={running.action.form_meta_id}
          params={actionParams(running.action, running.row, key)}
          rowName={rowName(running.row)}
          onClose={(ran) => {
            setRunning(null);
            if (ran) setReload((n) => n + 1);
          }}
        />
      )}

      {running && running.action.action !== 'import' && running.action.action !== 'stage_query' && running.action.form_meta_id && (
        <ActionDialog
          running={running}
          formId={running.action.form_meta_id}
          recordId={running.action.action === 'edit' && running.row ? actionParams(running.action, running.row, key).id || String(running.row[key]) : null}
          fillParams={actionParams(running.action, running.row, key)}
          rowName={rowName(running.row)}
          scope={scope}
          onClose={() => setRunning(null)}
          onSaved={(next) => {
            if (next !== 'new') setRunning(null);
            setReload((n) => n + 1);
          }}
        />
      )}

      {changingStatus && workflow && (
        <StatusDialog
          workflowId={workflow.id}
          statuses={workflow.statuses}
          recordId={String(changingStatus[key])}
          recordName={rowName(changingStatus)}
          sourceId={meta.id}
          onClose={() => setChangingStatus(null)}
          onMoved={() => {
            setChangingStatus(null);
            setReload((n) => n + 1);
          }}
        />
      )}

      {linkedRecord && workflow && !changingStatus && (
        <StatusDialog
          workflowId={workflow.id}
          statuses={workflow.statuses}
          recordId={linkedRecord}
          recordName={`Record #${linkedRecord}`}
          sourceId={meta.id}
          onClose={closeLinked}
          onMoved={() => {
            closeLinked();
            setReload((n) => n + 1);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`${deleting.action.label} this record?`}
          message={`${rowName(deleting.row) ? `"${rowName(deleting.row)}" ` : ''}will be removed. This can't be undone.`}
          confirmLabel={deleting.action.label}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/** The form a toolbar button opens, filled by its get meta when it has one. */
function ActionDialog({
  running,
  formId,
  recordId,
  fillParams,
  rowName,
  scope,
  onClose,
  onSaved,
}: {
  running: Running;
  formId: number;
  recordId: string | null;
  fillParams: Record<string, string>;
  rowName: string;
  scope?: Filters;
  onClose: () => void;
  /** next "new": the form stays open for another record. */
  onSaved: (next?: 'new') => void;
}) {
  const { def: formDef } = useMetaDef(formId);
  const wide = !!formDef && detailParams(formDef.params).length > 0;
  const { action } = running;

  return (
    <Modal title={rowName && action.needs_row ? `${action.label} · ${rowName}` : action.label} onClose={onClose} size={wide ? 'xl' : 'lg'}>
      <FormView
        metaId={formId}
        recordId={recordId}
        fill={action.get_meta_id ? { metaId: action.get_meta_id, params: fillParams } : undefined}
        fixed={scope}
        embedded
        onCancel={onClose}
        onSaved={(_, next) => onSaved(next)}
      />
    </Modal>
  );
}

/**
 * A stage query button, in a dialog. Its parameters start filled: by the get meta's first row
 * (same-named columns) when the button has one, else straight from the row fields that
 * json_config.params names. Closing after a run refreshes the grid.
 */
function StageQueryDialog({
  running,
  queryId,
  params,
  rowName,
  onClose,
}: {
  running: Running;
  queryId: number;
  params: Record<string, string>;
  rowName: string;
  onClose: (ran: boolean) => void;
}) {
  const { action } = running;
  const { def, error } = useMetaDef(queryId);
  const [defaults, setDefaults] = useState<Record<string, string> | null>(action.get_meta_id ? null : params);
  const [fillError, setFillError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  useEffect(() => {
    if (!action.get_meta_id) return;
    let live = true;
    dataApi
      .fill(action.get_meta_id, params)
      .then((row) => live && setDefaults(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? '' : String(v)]))))
      .catch((err) => {
        if (!live) return;
        setFillError(err instanceof ApiError ? err.message : 'The starting values could not be loaded.');
        setDefaults({});
      });
    return () => {
      live = false;
    };
    // Fills once per opening.
  }, []);

  return (
    <Modal
      title={rowName && action.needs_row ? `${action.label} · ${rowName}` : action.label}
      description={def?.meta.description ?? undefined}
      onClose={() => onClose(ran)}
      size="lg"
    >
      {error ? (
        <Alert>{error}</Alert>
      ) : def && defaults ? (
        <div className="space-y-4">
          {fillError && <Alert>{fillError}</Alert>}
          <StageQueryView def={def} defaults={defaults} embedded onRan={() => setRan(true)} />
        </div>
      ) : (
        <div className="h-48 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
      )}
    </Modal>
  );
}

/** An import button's excel_import meta, in a dialog. Closing after an import refreshes the grid. */
function ImportDialog({ label, importId, onClose, onDone }: { label: string; importId: number; onClose: () => void; onDone: () => void }) {
  const { def, error } = useMetaDef(importId);
  const [imported, setImported] = useState(false);

  return (
    <Modal title={label} description={def?.meta.description ?? undefined} onClose={imported ? onDone : onClose} size="lg">
      {error ? (
        <Alert>{error}</Alert>
      ) : def ? (
        <ImportView def={def} embedded onDone={onDone} onImported={() => setImported(true)} />
      ) : (
        <div className="h-48 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
      )}
    </Modal>
  );
}

/** A grid under a grid: the picked row's fields fill its parameters (json_config.params). */
function SubGrid({ param, row, parentTitle }: { param: MetaParam & { ref_meta_id: number }; row?: DataRow; parentTitle: string }) {
  const { def, error } = useMetaDef(param.ref_meta_id);
  const map = (param.json_config?.params ?? {}) as Record<string, string>;
  const fixed = useMemo(
    () => (row ? Object.fromEntries(Object.entries(map).map(([name, field]) => [name, row[field] == null ? '' : String(row[field])])) : undefined),
    [row, JSON.stringify(map)],
  );
  const label = param.label_name || param.param_name;

  if (error) return <Alert>{error}</Alert>;
  if (!row || !fixed) {
    return (
      <div className="rounded-xl border border-dashed border-primary px-5 py-6 text-center">
        <p className="text-sm font-semibold text-secondary">{label}</p>
        <p className="mt-0.5 text-sm text-tertiary">Pick a row in {parentTitle} to see its records here.</p>
      </div>
    );
  }
  if (!def) return <div className="h-40 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />;

  return <GridView def={def} fixed={fixed} label={label} />;
}

import { useEffect, useMemo, useState, type FC } from 'react';
import type { Selection, SortDescriptor } from 'react-aria-components';
import { Check, Copy01, Edit01, Eye, File06, FilterLines, GitBranch01, Plus, SearchLg, Trash01 } from '@untitledui/icons';
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
import { detailParams, primaryKey, subgridParams, title, useActions, useGridWorkflow, useMetaDef, visibleParams, type MetaDef } from './definitions';
import { StatusBadge, StatusDialog } from './StatusDialog';

/** Quantities and amounts line up on the right; lookup ids don't count as numbers. */
const isNumber = (p: MetaParam) => (p.data_type === 'integer' || p.data_type === 'decimal') && !p.is_select;

// An action's icon_cls picks one of these; without one, its kind decides.
const actionIcons: Record<string, FC<{ className?: string }>> = { plus: Plus, edit: Edit01, trash: Trash01, copy: Copy01, eye: Eye, check: Check, file: File06 };
const kindIcons: Record<MetaAction['action'], FC<{ className?: string }>> = { add: Plus, edit: Edit01, delete: Trash01, custom: File06 };
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
const abilityOf: Record<MetaAction['action'], Ability> = { add: 'create', custom: 'create', edit: 'edit', delete: 'delete' };

/**
 * A datagrid meta as a searchable, filterable, sortable, paged table. Its toolbar buttons
 * come from meta_actions (add, edit, delete, custom), each working through a form, and a
 * get meta decides what the form opens with. Click a row to pick it (buttons that need a
 * row act on it, and subgrids show its records); double-click runs its Edit button.
 *
 * fixed: filter values set from outside, e.g. a subgrid's parameters from the parent row.
 */
export function GridView({ def, fixed, label }: { def: MetaDef; fixed?: Filters; label?: string }) {
  const { meta, params } = def;
  const workflow = useGridWorkflow(meta);
  const columns = useMemo(() => {
    const visible = visibleParams(params);
    return workflow && !visible.some((p) => p.field_path === 'status_id') ? [...visible, statusColumn] : visible;
  }, [params, workflow]);
  const statuses = useMemo(() => new Map((workflow?.statuses ?? []).map((s) => [s.id, s])), [workflow]);
  const filterParams = useMemo(
    () => params.filter((p) => p.is_criteria && p.data_type !== 'detail' && p.data_type !== 'subgrid' && !(fixed && p.field_path in fixed)),
    [params, fixed],
  );
  const subgrids = useMemo(() => subgridParams(params), [params]);
  const key = primaryKey(params);
  const actions = useActions(meta.id);
  const { can } = useAuth();
  const toolbar = useMemo(() => (actions ?? []).filter((a) => can(a.form_meta_id, abilityOf[a.action])), [actions, can]);
  const rowActions = toolbar.filter((a) => a.show_in_row);
  const editAction = toolbar.find((a) => a.action === 'edit');
  const searchable = filterParams.some((p) => (p.data_type === 'string' || p.data_type === 'text') && !p.is_select && !Array.isArray(p.json_config?.options));

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [filters, setFilters] = useState<Filters>({});
  const [showFilters, setShowFilters] = useState(() => filterParams.some((p) => p.is_mandatory_criteria));
  const [sort, setSort] = useState<SortDescriptor | undefined>();
  const [result, setResult] = useState<Page<DataRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const [running, setRunning] = useState<Running | null>(null);
  const [deleting, setDeleting] = useState<Running | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [changingStatus, setChangingStatus] = useState<DataRow | null>(null);

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

  const fixedKey = JSON.stringify(fixed ?? {});
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

  const rowName = (row?: DataRow) => (row && columns[0] && !columns[0].is_select ? String(row[columns[0].field_path] ?? '') : '');

  return (
    <>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <TableCard.Root size="sm">
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
                {filterParams.length > 0 && (
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
                {workflow && (
                  <Button size="sm" color="secondary" iconLeading={GitBranch01} isDisabled={!selectedRow} onPress={() => selectedRow && setChangingStatus(selectedRow)}>
                    Change status
                  </Button>
                )}
              </div>
            </div>
          }
        />

        {showFilters && filterParams.length > 0 && <GridFilters params={filterParams} applied={filters} onApply={setFilters} statuses={workflow?.statuses} />}

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
              ...(rowActions.length ? [<Table.Head key="_actions" id="_actions" />] : []),
            ]}
          </Table.Header>
          <Table.Body
            items={rows.map((r): DataRow & { _key: string } => ({ ...r, _key: String(r[key]) }))}
            dependencies={[columns, rowActions]}
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
                      ) : (
                        <ColumnValue param={c} value={row[c.field_path]} />
                      )}
                    </Table.Cell>
                  )),
                  ...(rowActions.length
                    ? [
                        <Table.Cell key="_actions" className="w-px">
                          <div className="flex justify-end gap-0.5">
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

      {subgrids.map((s) => (
        <div key={s.id} className="mt-4">
          <SubGrid param={s} row={selectedRow} parentTitle={title(meta)} />
        </div>
      ))}

      {running && running.action.form_meta_id && (
        <ActionDialog
          running={running}
          formId={running.action.form_meta_id}
          recordId={running.action.action === 'edit' && running.row ? actionParams(running.action, running.row, key).id || String(running.row[key]) : null}
          fillParams={actionParams(running.action, running.row, key)}
          rowName={rowName(running.row)}
          onClose={() => setRunning(null)}
          onSaved={() => {
            setRunning(null);
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
  onClose,
  onSaved,
}: {
  running: Running;
  formId: number;
  recordId: string | null;
  fillParams: Record<string, string>;
  rowName: string;
  onClose: () => void;
  onSaved: () => void;
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
        embedded
        onCancel={onClose}
        onSaved={onSaved}
      />
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

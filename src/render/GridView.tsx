import { useEffect, useMemo, useState } from 'react';
import type { SortDescriptor } from 'react-aria-components';
import { Edit01, Plus, SearchLg, Trash01 } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { dataApi, type DataRow, type Page } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { Alert, IconAction } from '../components/ui';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Table, TableCard } from '@/components/application/table/table';
import { PaginationCardMinimal } from '@/components/application/pagination/pagination';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Cell } from './Cell';
import { FormView } from './FormView';
import { primaryKey, title, useLookup, visibleParams, type MetaDef } from './definitions';

/** Waits until typing stops before searching. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** id -> label for one lookup column. */
function useLookupMap(param: MetaParam): Map<string, string> | undefined {
  const options = useLookup(param);
  return useMemo(() => (options ? new Map(options.map((o) => [o.value, o.label])) : undefined), [options]);
}

/**
 * A datagrid meta as a searchable, sortable, paged table. The meta's ref_meta is the form
 * used to add and edit records; without one the grid is read-only.
 */
export function GridView({ def }: { def: MetaDef }) {
  const { meta, params } = def;
  const columns = useMemo(() => visibleParams(params), [params]);
  const key = primaryKey(params);
  const formId = meta.ref_meta_id;
  const searchable = params.some((p) => p.is_criteria);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [sort, setSort] = useState<SortDescriptor | undefined>();
  const [result, setResult] = useState<Page<DataRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // undefined: closed, null: adding, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<DataRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => setPage(1), [search, perPage]);

  useEffect(() => {
    let live = true;
    dataApi
      .list(meta.id, {
        page,
        per_page: perPage,
        search,
        sort: sort?.column ? String(sort.column) : undefined,
        dir: sort?.direction === 'descending' ? 'desc' : 'asc',
      })
      .then(
        (r) => {
          if (!live) return;
          setResult(r);
          setError(null);
        },
        (err) => live && setError(err instanceof ApiError ? err.message : 'Records could not be loaded.'),
      );
    return () => {
      live = false;
    };
  }, [meta.id, page, perPage, search, sort, reload]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await dataApi.remove(meta.id, String(deleting[key]));
      setDeleting(null);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The record could not be deleted.');
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  const rows = result?.data ?? [];

  return (
    <>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <TableCard.Root size="sm">
        <TableCard.Header
          title={title(meta)}
          badge={
            result ? (
              <Badge type="pill-color" size="sm" color="brand">
                {result.total} {result.total === 1 ? 'record' : 'records'}
              </Badge>
            ) : undefined
          }
          description={meta.description ?? undefined}
          contentTrailing={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {searchable && (
                <Input
                  aria-label={`Search ${title(meta)}`}
                  type="search"
                  size="sm"
                  icon={SearchLg}
                  placeholder="Search"
                  value={query}
                  onChange={setQuery}
                  className="sm:w-64"
                />
              )}
              {formId && (
                <Button size="sm" iconLeading={Plus} onPress={() => setEditing(null)}>
                  Add
                </Button>
              )}
            </div>
          }
        />

        <Table
          aria-label={title(meta)}
          sortDescriptor={sort}
          onSortChange={setSort}
          onRowAction={formId ? (id) => setEditing(String(id)) : undefined}
        >
          <Table.Header>
            {[
              ...columns.map((c, i) => (
                <Table.Head key={c.field_path} id={c.field_path} label={c.label_name || c.param_name} allowsSorting isRowHeader={i === 0} />
              )),
              ...(formId ? [<Table.Head key="_actions" id="_actions" />] : []),
            ]}
          </Table.Header>
          <Table.Body
            items={rows.map((r): DataRow & { _key: string } => ({ ...r, _key: String(r[key]) }))}
            dependencies={[columns, formId]}
            renderEmptyState={() => (
              <div className="px-6 py-12 text-center">
                <p className="text-md font-semibold text-primary">{result ? (search ? 'No matches' : 'Nothing here yet') : 'Loading…'}</p>
                {result && (
                  <p className="mt-1 text-sm text-tertiary">
                    {search ? 'Try another search.' : formId ? 'Add the first record.' : 'Records will show up here.'}
                  </p>
                )}
              </div>
            )}
          >
            {(row) => (
              <Table.Row id={row._key}>
                {[
                  ...columns.map((c, i) => (
                    <Table.Cell key={c.field_path} className={i === 0 ? 'font-medium text-primary' : 'whitespace-nowrap'}>
                      <ColumnValue param={c} value={row[c.field_path]} />
                    </Table.Cell>
                  )),
                  ...(formId
                    ? [
                        <Table.Cell key="_actions" className="w-px">
                          <div className="flex justify-end gap-0.5">
                            <IconAction icon={Edit01} label="Edit" onPress={() => setEditing(row._key)} />
                            <IconAction icon={Trash01} danger label="Delete" onPress={() => setDeleting(row)} />
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

      {editing !== undefined && formId && (
        <Modal title={editing ? 'Edit record' : `New record in ${title(meta)}`} onClose={() => setEditing(undefined)} size="lg">
          <FormView
            metaId={formId}
            recordId={editing}
            embedded
            onCancel={() => setEditing(undefined)}
            onSaved={() => {
              setEditing(undefined);
              setReload((n) => n + 1);
            }}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this record?"
          message={`${columns[0] ? `"${String(deleting[columns[0].field_path] ?? '')}" ` : ''}will be removed from ${title(meta)}. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/** A lookup column needs its own hook, so it gets its own component. */
function ColumnValue({ param, value }: { param: MetaParam; value: unknown }) {
  return param.is_select && param.ref_meta_id ? <LookupValue param={param} value={value} /> : <Cell param={param} value={value} />;
}

function LookupValue({ param, value }: { param: MetaParam; value: unknown }) {
  const map = useLookupMap(param);
  return <Cell param={param} value={value} lookup={map} />;
}

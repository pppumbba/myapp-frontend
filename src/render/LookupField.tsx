import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Grid01, SearchLg } from '@untitledui/icons';
import { Button as AriaButton } from 'react-aria-components';
import { dataApi, type DataRow, type Page } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { ComboField } from '../components/ComboField';
import { Modal } from '../components/Modal';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { useDebounced } from '@/hooks/use-debounced';
import { cx } from '@/utils/cx';
import { ColumnValue } from './Cell';
import { rowLabel, title, useLookup, useMetaDef, visibleParams, type LookupOption } from './definitions';

const option = (row: DataRow, labelField: unknown): LookupOption => ({ value: String(row.id), label: rowLabel(row, labelField), row });

/**
 * A lookup param (is_select + ref_meta_id) as a searchable combo. Typing searches the
 * lookup meta's records on the server; the table button opens them as a grid to browse.
 * onChange also gets the picked record, for json_config.fill.
 */
export function LookupField({
  param,
  value,
  onChange,
  label,
  'aria-label': ariaLabel,
  placeholder,
  size,
  isRequired,
  isInvalid,
  hint,
}: {
  param: MetaParam;
  value: string;
  onChange: (value: string, row?: DataRow) => void;
  label?: string;
  'aria-label'?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
  isRequired?: boolean;
  isInvalid?: boolean;
  hint?: string;
}) {
  const refId = param.ref_meta_id!;
  const labelField = param.json_config?.label_field;
  const first = useLookup(param);
  const [text, setText] = useState('');
  const search = useDebounced(text);
  const [found, setFound] = useState<LookupOption[] | null>(null);
  // Records picked or loaded outside the lists above, so the field can always name its value.
  const [known, setKnown] = useState<LookupOption[]>([]);
  const [browsing, setBrowsing] = useState(false);

  const listed = useMemo(() => [...known, ...(found ?? []), ...(first ?? [])], [known, found, first]);
  const current = listed.find((o) => o.value === value);
  const searching = search !== '' && search !== current?.label;

  useEffect(() => {
    if (!searching) {
      setFound(null);
      return;
    }
    let live = true;
    dataApi.list(refId, { search, per_page: 50 }).then(
      (page) => live && setFound(page.data.map((r) => option(r, labelField))),
      () => live && setFound([]),
    );
    return () => {
      live = false;
    };
  }, [refId, search, searching, labelField]);

  // A saved value beyond the first 100 records: fetch it once to show its name.
  useEffect(() => {
    if (!value || current || !first) return;
    let live = true;
    dataApi.get(refId, value).then(
      (row) => live && setKnown((k) => [...k, option(row, labelField)]),
      () => live && setKnown((k) => [...k, { value, label: `#${value}`, row: {} }]),
    );
    return () => {
      live = false;
    };
  }, [refId, value, current, first, labelField]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    return listed.filter((o) => !seen.has(o.value) && seen.add(o.value)).map((o) => ({ id: o.value, label: o.label }));
  }, [listed]);

  const pick = (row: DataRow) => {
    const o = option(row, labelField);
    setKnown((k) => [o, ...k.filter((x) => x.value !== o.value)]);
    onChange(o.value, row);
  };

  return (
    <>
      <ComboField
        label={label}
        aria-label={ariaLabel}
        items={items}
        value={value}
        onChange={(v) => onChange(v, listed.find((o) => o.value === v)?.row)}
        onSearch={setText}
        isLoading={!first || (searching && !found)}
        placeholder={placeholder}
        size={size}
        isRequired={isRequired}
        isInvalid={isInvalid}
        hint={hint}
        addon={
          <AriaButton
            slot={null}
            aria-label={`Browse ${label ?? ariaLabel ?? 'records'}`}
            onPress={() => setBrowsing(true)}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2"
          >
            <Grid01 className="size-4 stroke-[2.25px]" />
          </AriaButton>
        }
      />
      {browsing && (
        <LookupDialog
          refId={refId}
          value={value}
          onPick={(row) => {
            pick(row);
            setBrowsing(false);
          }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </>
  );
}

const PER_PAGE = 10;

/** The lookup meta's records as a searchable, paged table; a row click picks it. */
function LookupDialog({ refId, value, onPick, onClose }: { refId: number; value: string; onPick: (row: DataRow) => void; onClose: () => void }) {
  const { def, error: defError } = useMetaDef(refId);
  const columns = useMemo(() => (def ? visibleParams(def.params).slice(0, 6) : []), [def]);
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<DataRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [search]);

  useEffect(() => {
    let live = true;
    setError(null);
    dataApi.list(refId, { search, page, per_page: PER_PAGE }).then(
      (r) => live && setResult(r),
      () => live && setError('These records could not be loaded.'),
    );
    return () => {
      live = false;
    };
  }, [refId, search, page]);

  const name = def ? title(def.meta) : 'records';

  return (
    <Modal title={`Choose from ${name}`} onClose={onClose} size="xl">
      <Input aria-label={`Search ${name}`} icon={SearchLg} placeholder="Search" value={query} onChange={setQuery} autoFocus />

      <div className="mt-4">
        {defError || error ? (
          <Alert>{defError ?? error}</Alert>
        ) : !def || !result ? (
          <div className="h-60 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-secondary">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs font-medium text-tertiary">
                <tr>
                  {columns.map((c) => (
                    <th key={c.field_path} scope="col" className="px-4 py-2.5 font-medium">
                      {c.label_name || c.param_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {result.data.map((row) => {
                  const picked = String(row.id) === value;
                  return (
                    <tr
                      key={String(row.id)}
                      onClick={() => onPick(row)}
                      className={cx('cursor-pointer transition duration-100 ease-linear', picked ? 'bg-brand-primary_alt' : 'hover:bg-primary_hover')}
                    >
                      {columns.map((c, i) => (
                        <td key={c.field_path} className="px-4 py-3 text-tertiary">
                          {i === 0 ? (
                            // The first cell is the row's button, for the keyboard.
                            <button
                              type="button"
                              aria-pressed={picked}
                              onClick={(e) => {
                                e.stopPropagation();
                                onPick(row);
                              }}
                              className="rounded text-left font-medium text-primary outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              <ColumnValue param={c} value={row[c.field_path]} />
                            </button>
                          ) : (
                            <ColumnValue param={c} value={row[c.field_path]} />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {!result.data.length && (
                  <tr>
                    <td colSpan={columns.length || 1} className="px-4 py-10 text-center text-tertiary">
                      {search ? `Nothing matches “${search}”.` : 'There are no records yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {result && result.last_page > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-tertiary">
            Page {result.current_page} of {result.last_page}
          </p>
          <div className="flex gap-2">
            <Button size="sm" color="secondary" iconLeading={ChevronLeft} isDisabled={page <= 1} onPress={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button size="sm" color="secondary" iconTrailing={ChevronRight} isDisabled={page >= result.last_page} onPress={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

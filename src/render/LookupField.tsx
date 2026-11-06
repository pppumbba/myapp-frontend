import { useEffect, useMemo, useState } from 'react';
import { Grid01, SearchLg, ShoppingCart01, XClose } from '@untitledui/icons';
import { Button as AriaButton } from 'react-aria-components';
import { dataApi, type DataRow, type Page } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { ComboField } from '../components/ComboField';
import { Modal } from '../components/Modal';
import { Alert } from '../components/ui';
import { PaginationCardMinimal } from '@/components/application/pagination/pagination';
import { Button } from '@/components/base/buttons/button';
import { CheckboxBase } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { useDebounced } from '@/hooks/use-debounced';
import { cx } from '@/utils/cx';
import { ColumnValue } from './Cell';
import { lookupFields, lookupOption, rowLabel, title, useLookup, useMetaDef, visibleParams, type LookupOption } from './definitions';
import { t } from '@/i18n';

/**
 * A lookup param (is_select + ref_meta_id) as a searchable combo. Typing searches the
 * lookup meta's records on the server; the table button opens them as a grid to browse.
 * onChange also gets the picked record, for json_config.fill. With onPickMany the browse
 * dialog has a basket: several records are picked at once (detail lines make a line of each).
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
  onPickMany,
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
  onPickMany?: (rows: DataRow[]) => void;
}) {
  const refId = param.ref_meta_id!;
  const fields = lookupFields(param);
  const option = (row: DataRow) => lookupOption(row, param);
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
      (page) => live && setFound(page.data.map(option)),
      () => live && setFound([]),
    );
    return () => {
      live = false;
    };
  }, [refId, search, searching, fields.label, fields.value]);

  // A saved value beyond the first 100 records: fetch it once to show its name.
  useEffect(() => {
    if (!value || current || !first) return;
    let live = true;
    // By the stored field, which need not be the id (e.g. a code).
    dataApi.list(refId, { scope: { [fields.value]: value }, per_page: 1 }).then(
      (page) => live && setKnown((k) => [...k, page.data[0] ? option(page.data[0]) : { value, label: `#${value}`, row: {} }]),
      () => live && setKnown((k) => [...k, { value, label: `#${value}`, row: {} }]),
    );
    return () => {
      live = false;
    };
  }, [refId, value, current, first, fields.label, fields.value]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    return listed.filter((o) => !seen.has(o.value) && seen.add(o.value)).map((o) => ({ id: o.value, label: o.label }));
  }, [listed]);

  const pick = (row: DataRow) => {
    const o = option(row);
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
            aria-label={t('Browse {name}', {
              name: label ?? ariaLabel ?? t('records'),
            })}
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
          valueField={fields.value}
          onPick={(row) => {
            pick(row);
            setBrowsing(false);
          }}
          onPickMany={
            onPickMany &&
            ((rows) => {
              setKnown((k) => [...rows.map(option), ...k]);
              onPickMany(rows);
              setBrowsing(false);
            })
          }
          onClose={() => setBrowsing(false)}
        />
      )}
    </>
  );
}

/**
 * The lookup meta's records as a searchable, paged table; a row click picks it. With
 * onPickMany a row click puts it in the basket (or takes it out) instead: the basket keeps its
 * records across pages and searches, can be looked over on its own, and "Add" hands them all
 * over in the order they were picked.
 */
export function LookupDialog({
  refId,
  value,
  valueField,
  onPick,
  onPickMany,
  onClose,
}: {
  refId: number;
  value: string;
  valueField: string;
  onPick: (row: DataRow) => void;
  onPickMany?: (rows: DataRow[]) => void;
  onClose: () => void;
}) {
  const [basket, setBasket] = useState<Map<string, DataRow>>(() => new Map());
  const [showBasket, setShowBasket] = useState(false);
  const keyOf = (row: DataRow) => String(row[valueField] ?? row.id);
  const toggle = (row: DataRow) =>
    setBasket((b) => {
      const next = new Map(b);
      if (next.has(keyOf(row))) next.delete(keyOf(row));
      else next.set(keyOf(row), row);
      return next;
    });
  const choose = (row: DataRow) => (onPickMany ? toggle(row) : onPick(row));
  const { def, error: defError } = useMetaDef(refId);
  const columns = useMemo(() => (def ? visibleParams(def.params).slice(0, 6) : []), [def]);
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<Page<DataRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [search, perPage]);

  useEffect(() => {
    let live = true;
    setError(null);
    dataApi.list(refId, { search, page, per_page: perPage }).then(
      (r) => live && setResult(r),
      () => live && setError(t('These records could not be loaded.')),
    );
    return () => {
      live = false;
    };
  }, [refId, search, page, perPage, reload]);

  const name = def ? title(def.meta) : 'records';
  const rows = showBasket ? [...basket.values()] : (result?.data ?? []);

  return (
    <Modal title={t('Choose from {name}', { name })} onClose={onClose} size="xl" fill>
      {/* Only the rows scroll: the search, the column names and the paging stay in place (index.css). */}
      <div className="modal-split gap-4">
        <div className="flex shrink-0 items-center gap-2 px-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <Input
              aria-label={t('Search {name}', { name })}
              icon={SearchLg}
              placeholder={t('Search')}
              value={query}
              onChange={(v) => {
                setQuery(v);
                setShowBasket(false);
              }}
              autoFocus
            />
          </div>
          {onPickMany && (
            <Button size="md" color={showBasket ? 'primary' : 'secondary'} iconLeading={ShoppingCart01} aria-pressed={showBasket} onPress={() => setShowBasket((s) => !s)}>
              {t('Basket ({count})', { count: basket.size })}
            </Button>
          )}
        </div>

        <div className="modal-scroll flex flex-col pt-px">
          {defError || error ? (
            <Alert>{defError ?? error}</Alert>
          ) : !def || !result ? (
            <div className="h-60 shrink-0 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
          ) : (
            <div className="flex min-h-0 flex-col overflow-hidden rounded-xl ring-1 ring-secondary">
              <div className="min-h-0 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-secondary text-left text-xs font-medium text-tertiary">
                    <tr>
                      {onPickMany && (
                        <th scope="col" className="w-10 py-2.5 pl-4">
                          <span className="sr-only">{t('In the basket')}</span>
                        </th>
                      )}
                      {columns.map((c) => (
                        <th key={c.field_path} scope="col" className="px-4 py-2.5 font-medium">
                          {c.label_name || c.param_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary">
                    {rows.map((row) => {
                      const picked = onPickMany ? basket.has(keyOf(row)) : String(row[valueField]) === value;
                      return (
                        <tr
                          key={String(row.id)}
                          onClick={() => choose(row)}
                          className={cx('cursor-pointer transition duration-100 ease-linear', picked ? 'bg-brand-primary_alt' : 'hover:bg-primary_hover')}
                        >
                          {onPickMany && (
                            <td className="py-3 pl-4">
                              <CheckboxBase isSelected={picked} />
                            </td>
                          )}
                          {columns.map((c, i) => (
                            <td key={c.field_path} className="px-4 py-3 text-tertiary">
                              {i === 0 ? (
                                // The first cell is the row's button, for the keyboard.
                                <button
                                  type="button"
                                  aria-pressed={picked}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    choose(row);
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
                    {!rows.length && (
                      <tr>
                        <td colSpan={(columns.length || 1) + (onPickMany ? 1 : 0)} className="px-4 py-10 text-center text-tertiary">
                          {showBasket ? t('The basket is empty. Tick records to add them.') : search ? t('Nothing matches “{search}”.', { search }) : t('There are no records yet.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* As under a datagrid; shown on one page too, but not over the basket (it isn't paged). */}
              {!showBasket && (
                <PaginationCardMinimal
                  page={result.current_page}
                  total={Math.max(1, result.last_page)}
                  pageSize={perPage}
                  onPageChange={(p) => setPage(Math.max(1, p))}
                  onPageSizeChange={setPerPage}
                  onRefresh={() => setReload((n) => n + 1)}
                  className="shrink-0"
                />
              )}
            </div>
          )}
        </div>

        {onPickMany && (
          <div className="modal-footer flex flex-wrap items-center justify-between gap-3 border-t border-secondary pt-4">
            <p className="text-sm text-tertiary">{t('{count} in the basket', { count: basket.size })}</p>
            <div className="flex flex-wrap gap-2">
              {onPickMany && (
                <>
                  {basket.size > 0 && (
                    <Button size="sm" color="tertiary" iconLeading={XClose} onPress={() => setBasket(new Map())}>
                      {t('Empty basket')}
                    </Button>
                  )}
                  <Button size="sm" isDisabled={basket.size === 0} onPress={() => onPickMany([...basket.values()])}>
                    {basket.size === 1 ? t('Add 1 record') : t('Add {count} records', { count: basket.size })}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

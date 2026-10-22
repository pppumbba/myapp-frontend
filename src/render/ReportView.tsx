import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Printer } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { dataApi, type DataRow } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { ComboField } from '../components/ComboField';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { useDebounced } from '@/hooks/use-debounced';
import { cx } from '@/utils/cx';
import { ColumnValue, formatNumber } from './Cell';
import { lineAmount, type Line } from './DetailLines';
import { primaryKey, rowLabel, title, useDetailTree, visibleParams, type DetailNode, type MetaDef } from './definitions';
import { printElement } from './print';

/** Report params that print as a line to sign, and ones printed under the lines as totals. */
const isSignature = (p: MetaParam) => p.is_show && p.data_type === 'signature';
const isTotal = (p: MetaParam) => p.json_config?.total === true;

/**
 * A report meta: one record of its table laid out as a document to print or save as PDF.
 *
 * Its params place the record's values: fields print in two columns at the top (text ones
 * across the page), a detail param (ref_meta_id = the line form, json_config.foreign_key)
 * prints its lines as a table, params with json_config.total print under the lines, and
 * data_type "signature" leaves a line to sign. json_config: title (e.g. "Purchase order"),
 * number_field (shown by the title), issuer (top line) and note (at the bottom).
 *
 * Without recordId (opened from a menu) it first asks which record.
 */
/** autoPrint: print once the record has loaded, e.g. after a form's Save and print. */
export function ReportView({ def, recordId: given, autoPrint }: { def: MetaDef; recordId?: string | null; autoPrint?: boolean }) {
  const { meta, params } = def;
  const config = meta.json_config ?? {};
  const [picked, setPicked] = useState<string | null>(given ?? null);
  const recordId = given ?? picked;
  const [record, setRecord] = useState<DataRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paper = useRef<HTMLDivElement>(null);

  const { tree } = useDetailTree(def);
  const all = useMemo(() => visibleParams(params).filter((p) => !isSignature(p)), [params]);
  const numberField = typeof config.number_field === 'string' ? config.number_field : null;
  const fields = all.filter((p) => !isTotal(p) && p.field_path !== numberField);
  const totals = all.filter(isTotal);
  const signatures = params.filter(isSignature);

  useEffect(() => {
    if (!recordId) return;
    let live = true;
    setRecord(null);
    setError(null);
    dataApi.get(meta.id, recordId).then(
      (r) => live && setRecord(r),
      (err) => live && setError(err instanceof ApiError ? err.message : 'This record could not be loaded.'),
    );
    return () => {
      live = false;
    };
  }, [meta.id, recordId]);

  const heading = typeof config.title === 'string' && config.title ? config.title : title(meta);
  const number = record && numberField ? String(record[numberField] ?? '') : '';

  const printed = useRef(false);
  useEffect(() => {
    if (!autoPrint || printed.current || !record || !tree) return;
    printed.current = true;
    // After the paper has been drawn.
    const timer = setTimeout(() => printElement(paper.current, number ? `${heading} ${number}` : heading), 150);
    return () => clearTimeout(timer);
  }, [autoPrint, record, tree]);
  const wide = (p: MetaParam) => p.data_type === 'text';

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        {!given ? <RecordPicker def={def} value={picked} onChange={setPicked} /> : <span />}
        <Button iconLeading={Printer} isDisabled={!record || !tree} onPress={() => printElement(paper.current, number ? `${heading} ${number}` : heading)}>
          Print or save as PDF
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}

      {!recordId ? (
        <div className="rounded-xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary">
          <p className="text-md font-semibold text-primary">Pick a record to print</p>
          <p className="mt-1 text-sm text-tertiary">{`${heading} shows here once you choose which one.`}</p>
        </div>
      ) : !record || !tree ? (
        !error && <div className="mx-auto h-[28rem] max-w-[52rem] animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : (
        <div ref={paper} className="mx-auto max-w-[52rem] bg-white px-8 py-10 text-gray-900 shadow-md ring-1 ring-secondary sm:px-12">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-gray-900 pb-4">
            <div>
              {typeof config.issuer === 'string' && config.issuer && <p className="text-xs tracking-wide text-gray-500 uppercase">{config.issuer}</p>}
              <h1 className="mt-1 text-2xl font-bold tracking-wide uppercase">{heading}</h1>
            </div>
            {number && <p className="text-lg font-semibold tabular-nums">{number}</p>}
          </header>

          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {fields.map((p) => (
              <div key={p.field_path} className={cx(wide(p) && 'col-span-2')}>
                <dt className="text-xs text-gray-500">{p.label_name || p.param_name}</dt>
                <dd className="mt-0.5 font-medium whitespace-pre-line">
                  <ColumnValue param={p} value={record[p.field_path]} />
                </dd>
              </div>
            ))}
          </dl>

          {tree.map((n) => (
            <ReportLines key={n.detail.field_path} node={n} rows={(record[n.detail.field_path] as DataRow[] | undefined) ?? []} />
          ))}

          {totals.length > 0 && (
            <dl className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
              {totals.map((p) => (
                <div key={p.field_path} className="flex justify-between gap-6 border-t border-gray-300 pt-1.5 font-semibold">
                  <dt>{p.label_name || p.param_name}</dt>
                  <dd className="tabular-nums">
                    <ColumnValue param={p} value={record[p.field_path]} />
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {signatures.length > 0 && (
            <div className="mt-14 grid grid-cols-2 gap-x-10 gap-y-10 text-sm">
              {signatures.map((p) => (
                <div key={p.field_path}>
                  <div className="h-8 border-b border-gray-900" />
                  <p className="mt-1 text-xs text-gray-500">{p.label_name || p.param_name} · Name, signature, date</p>
                </div>
              ))}
            </div>
          )}

          {typeof config.note === 'string' && config.note && <p className="mt-10 border-t border-gray-300 pt-3 text-xs text-gray-500">{config.note}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * A detail's lines as a table, with each line's amount when json_config.amount says how.
 * A line with lines of its own has them printed under it, indented.
 */
function ReportLines({ node, rows, nested }: { node: DetailNode; rows: DataRow[]; nested?: boolean }) {
  const { detail, def, children } = node;
  const fk = detail.json_config?.foreign_key;
  const columns = visibleParams(def.params).filter((p) => p.field_path !== fk);
  const amounts = rows.map((r) => lineAmount(detail, r as Line));
  const hasAmount = amounts.some((a) => a !== null);
  const numeric = (p: MetaParam) => (p.data_type === 'integer' || p.data_type === 'decimal') && !p.is_select;

  return (
    <section className={nested ? 'my-2' : 'mt-8'} aria-label={detail.label_name || title(def.meta)}>
      <h2 className={cx('mb-2 font-semibold', nested ? 'text-xs text-gray-600' : 'text-sm')}>{detail.label_name || title(def.meta)}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-900 text-left text-xs text-gray-500">
            <th scope="col" className="w-8 py-1.5 font-medium">
              #
            </th>
            {columns.map((p) => (
              <th key={p.field_path} scope="col" className={cx('py-1.5 pr-2 font-medium', numeric(p) && 'text-right')}>
                {p.label_name || p.param_name}
              </th>
            ))}
            {hasAmount && (
              <th scope="col" className="py-1.5 text-right font-medium">
                Amount
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const own = children.filter((c) => Array.isArray(r[c.detail.field_path]) && (r[c.detail.field_path] as DataRow[]).length > 0);
            return (
              <Fragment key={i}>
                <tr className={cx(!own.length && 'border-b border-gray-200')}>
                  <td className="py-1.5 text-gray-500 tabular-nums">{i + 1}</td>
                  {columns.map((p) => (
                    <td key={p.field_path} className={cx('py-1.5 pr-2', numeric(p) && 'text-right')}>
                      <ColumnValue param={p} value={r[p.field_path]} />
                    </td>
                  ))}
                  {hasAmount && <td className="py-1.5 text-right font-medium tabular-nums">{formatNumber(amounts[i])}</td>}
                </tr>
                {own.length > 0 && (
                  <tr className="border-b border-gray-200">
                    <td />
                    <td colSpan={columns.length + (hasAmount ? 1 : 0)} className="pb-2 pl-4">
                      {own.map((c) => (
                        <ReportLines key={c.detail.field_path} node={c} rows={r[c.detail.field_path] as DataRow[]} nested />
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={columns.length + 2} className="py-4 text-center text-gray-500">
                No lines.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

/** Which record to print: typing searches the report's table. */
export function RecordPicker({
  def,
  value,
  onChange,
  labelField: given,
  label = 'Record',
}: {
  def: MetaDef;
  value: string | null;
  onChange: (id: string | null) => void;
  /** The field a record is shown by; a report's json_config.number_field by default. */
  labelField?: string;
  label?: string;
}) {
  const config = def.meta.json_config ?? {};
  const labelField = given ?? (typeof config.number_field === 'string' ? config.number_field : def.params.find((p) => p.is_label)?.field_path);
  const key = primaryKey(def.params);
  const [text, setText] = useState('');
  const search = useDebounced(text);
  const [rows, setRows] = useState<DataRow[] | null>(null);
  const [known, setKnown] = useState<DataRow[]>([]);

  useEffect(() => {
    let live = true;
    dataApi.list(def.meta.id, { search, per_page: 50 }).then(
      (page) => live && setRows(page.data),
      () => live && setRows([]),
    );
    return () => {
      live = false;
    };
  }, [def.meta.id, search]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    return [...known, ...(rows ?? [])]
      .filter((r) => !seen.has(String(r[key])) && seen.add(String(r[key])))
      .map((r) => ({ id: String(r[key]), label: rowLabel(r, labelField) }));
  }, [rows, known, key, labelField]);

  return (
    <div className="w-full max-w-sm">
      <ComboField
        label={label}
        placeholder="Search…"
        items={items}
        value={value ?? ''}
        isLoading={!rows}
        onSearch={setText}
        onChange={(id) => {
          const row = rows?.find((r) => String(r[key]) === id);
          if (row) setKnown((k) => [row, ...k]);
          onChange(id || null);
        }}
      />
    </div>
  );
}

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash01 } from '@untitledui/icons';
import type { DataRow } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { ComboField } from '../components/ComboField';
import { DatePicker } from '../components/DatePicker';
import { IconAction } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Toggle } from '@/components/base/toggle/toggle';
import { formatNumber } from './Cell';
import { filledFrom, isOneToOne, optionsOf, primaryKey, title, visibleParams, type DetailNode } from './definitions';
import { startValues, toPayload } from './formValues';
import { LookupField } from './LookupField';
import { t } from '@/i18n';

/** Where a line keeps its own lines, by sub-detail field. A symbol, so it never mixes with field values. */
export const SUBLINES: unique symbol = Symbol('sublines');

/** One line being edited. _key keeps React rows stable; _id is the saved line's primary key. */
export type Line = Record<string, string | boolean> & { _key: string; _id?: string; [SUBLINES]?: Record<string, Line[]> };

/**
 * A line's amount from the detail's json_config.amount: one column as it is (e.g. quantity),
 * or two multiplied (quantity × unit price). Null when the detail has no amount.
 */
export function lineAmount(detail: MetaParam, line: Line): number | null {
  const amount = detail.json_config?.amount;
  if (!Array.isArray(amount) || amount.length < 1 || amount.length > 2) return null;
  const n = amount.reduce((product: number, column) => product * Number(line[String(column)]), 1);
  return Number.isFinite(n) ? n : 0;
}

let lineSeq = 0;

/** A new, empty line of this detail; its own details start with no lines, and a one-to-one with its one blank record. */
export function blankLine(node: DetailNode): Line {
  return {
    ...startValues(visibleParams(node.def.params), null),
    _key: `new-${++lineSeq}`,
    [SUBLINES]: Object.fromEntries(node.children.map((c) => [c.detail.field_path, isOneToOne(c.detail) ? [blankLine(c)] : []])),
  };
}

/**
 * Saved lines (as the API sends them, each with its own lines under their fields) as editable
 * lines. A one-to-one arrives as one object or null, and is always one line: its record, or a
 * blank one to fill in.
 */
export function startLines(node: DetailNode, rows: unknown): Line[] {
  if (isOneToOne(node.detail)) return rows && typeof rows === 'object' && !Array.isArray(rows) ? toLines(node, [rows as DataRow]) : [blankLine(node)];
  return Array.isArray(rows) ? toLines(node, rows as DataRow[]) : [];
}

function toLines(node: DetailNode, rows: DataRow[]): Line[] {
  const key = primaryKey(node.def.params);
  return rows.map((r) => ({
    ...startValues(visibleParams(node.def.params), r),
    _key: `${node.detail.field_path}-${r[key]}`,
    _id: String(r[key]),
    [SUBLINES]: Object.fromEntries(node.children.map((c) => [c.detail.field_path, startLines(c, r[c.detail.field_path])])),
  }));
}

/** What the API takes for a detail: its lines, or for a one-to-one its one record. */
export function detailPayload(node: DetailNode, lines: Line[]): DataRow[] | DataRow | null {
  const out = linesPayload(node, lines);
  return isOneToOne(node.detail) ? (out[0] ?? null) : out;
}

/**
 * Lines as the API expects them: kept lines with their id, each with its own lines under
 * their fields, and the fields those lines add up into (total_field) filled with the sum.
 */
export function linesPayload(node: DetailNode, lines: Line[]): DataRow[] {
  const fields = visibleParams(node.def.params);
  const key = primaryKey(node.def.params);
  return lines.map((l) => {
    const out: DataRow = { ...(l._id ? { [key]: Number(l._id) } : {}), ...toPayload(fields, l) };
    for (const c of node.children) {
      const sub = l[SUBLINES]?.[c.detail.field_path] ?? [];
      out[c.detail.field_path] = detailPayload(c, sub);
      const total = c.detail.json_config?.total_field;
      if (typeof total === 'string' && Array.isArray(c.detail.json_config?.amount) && !isOneToOne(c.detail)) {
        out[total] = Math.round(sub.reduce((s, x) => s + (lineAmount(c.detail, x) ?? 0), 0) * 100) / 100;
      }
    }
    return out;
  });
}

/** Typed-in numbers (not lookups, whose ids are integers too) sit right-aligned. */
const numeric = (f: MetaParam) => (f.data_type === 'integer' || f.data_type === 'decimal') && !f.is_select && !Array.isArray(f.json_config?.options);
const choice = (f: MetaParam) => (f.is_select && !!f.ref_meta_id) || Array.isArray(f.json_config?.options);

/** Column widths, so names and prices aren't cut off. */
const width = (f: MetaParam) => (choice(f) ? 'min-w-56' : f.data_type === 'datetime' ? 'min-w-60' : f.data_type === 'date' ? 'min-w-44' : f.data_type === 'decimal' ? 'w-36' : numeric(f) ? 'w-24' : 'min-w-40');

/**
 * A detail as an editable table: one row per line, one column per visible param of the line
 * form. When the line form has details of its own, each row opens to show its lines in
 * tables below it, and a line field they add up into (their total_field) is worked out, not
 * typed. Errors arrive keyed like "lines.2.deliveries.0.quantity", as the API sends them;
 * prefix is the part above this table ("lines.2.").
 */
export function DetailLines({
  node,
  lines,
  errors,
  prefix = '',
  onChange,
}: {
  node: DetailNode;
  lines: Line[];
  errors: Record<string, string[]>;
  prefix?: string;
  onChange: (lines: Line[]) => void;
}) {
  const { detail, def, children } = node;
  // The column pointing back at the record above is filled in by the server.
  const columns = visibleParams(def.params).filter((p) => p.field_path !== detail.json_config?.foreign_key);
  // A one-column amount (e.g. quantity) is already a column; only a product gets its own.
  const amount = detail.json_config?.amount;
  const hasAmount = Array.isArray(amount) && amount.length === 2;
  const hasTotal = Array.isArray(amount) && amount.length > 0;
  const total = lines.reduce((sum, l) => sum + (lineAmount(detail, l) ?? 0), 0);
  const name = detail.label_name || title(def.meta);
  const listError = errors[`${prefix}${detail.field_path}`]?.[0];
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  // Line fields their own lines add up into: total_field -> the sub-detail.
  const subTotals = new Map(
    children.flatMap((c) => {
      const field = c.detail.json_config?.total_field;
      return typeof field === 'string' && Array.isArray(c.detail.json_config?.amount) ? [[field, c] as const] : [];
    }),
  );
  const span = columns.length + (hasAmount ? 1 : 0) + (children.length ? 1 : 0) + 2;

  const update = (i: number, values: Partial<Line>) => onChange(lines.map((l, j) => (j === i ? ({ ...l, ...values } as Line) : l)));
  const updateSub = (i: number, field: string, next: Line[]) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, [SUBLINES]: { ...(l[SUBLINES] ?? {}), [field]: next } } : l)));
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section aria-label={name} className="sm:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-primary">{name}</h3>
        <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => onChange([...lines, blankLine(node)])}>
          {t('Add line')}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl bg-primary ring-1 ring-secondary">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-secondary text-left text-xs font-medium text-tertiary">
            <tr>
              <th className="w-8 py-2 pl-3 font-medium">#</th>
              {columns.map((c) => (
                <th key={c.field_path} className={`px-2 py-2 font-medium ${numeric(c) || subTotals.has(c.field_path) ? 'text-right' : ''}`}>
                  {c.label_name || c.param_name}
                  {c.is_required && !subTotals.has(c.field_path) && <span className="text-brand-tertiary"> *</span>}
                </th>
              ))}
              {hasAmount && <th className="px-2 py-2 text-right font-medium">{t('Amount')}</th>}
              {children.length > 0 && <th className="px-2 py-2 font-medium">{children.map((c) => c.detail.label_name || title(c.def.meta)).join(', ')}</th>}
              <th className="w-10" aria-label={t('Remove')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {lines.map((line, i) => {
              const at = `${prefix}${detail.field_path}.${i}.`;
              const sub = line[SUBLINES] ?? {};
              const count = children.reduce((n, c) => n + (isOneToOne(c.detail) ? 0 : (sub[c.detail.field_path]?.length ?? 0)), 0);
              // A row whose own lines have errors stays open, so they can be seen.
              const subErrors = children.some((c) => Object.keys(errors).some((k) => k.startsWith(`${at}${c.detail.field_path}`)));
              const expanded = open.has(line._key) || subErrors;
              return (
                <Fragment key={line._key}>
                  <tr className="align-top">
                    <td className="py-3.5 pl-3 text-tertiary tabular-nums">{i + 1}</td>
                    {columns.map((c) => {
                      const sum = subTotals.get(c.field_path);
                      return (
                        <td key={c.field_path} className={`px-1.5 py-1.5 ${width(c)}`}>
                          {sum ? (
                            <p className="px-1 py-2 text-right font-medium text-primary tabular-nums" title={t('Adds up its {lines}', { lines: sum.detail.label_name || t('lines') })}>
                              {formatNumber((sub[sum.detail.field_path] ?? []).reduce((s, l) => s + (lineAmount(sum.detail, l) ?? 0), 0))}
                            </p>
                          ) : (
                            <LineField
                              param={c}
                              label={t('{field}, line {line}', { field: c.label_name || c.param_name, line: i + 1 })}
                              value={line[c.field_path]}
                              error={errors[`${at}${c.field_path}`]?.[0]}
                              onChange={(v, fill) => update(i, { [c.field_path]: v, ...fill })}
                            />
                          )}
                        </td>
                      );
                    })}
                    {hasAmount && <td className="px-2 py-3.5 text-right font-medium text-primary tabular-nums">{formatNumber(lineAmount(detail, line))}</td>}
                    {children.length > 0 && (
                      <td className="px-1.5 py-1.5">
                        <Button
                          size="sm"
                          color={subErrors ? 'link-destructive' : 'link-gray'}
                          iconLeading={expanded ? ChevronDown : ChevronRight}
                          aria-expanded={expanded}
                          aria-label={expanded ? t('Hide the lines of line {line}', { line: i + 1 }) : t('Show the lines of line {line}', { line: i + 1 })}
                          isDisabled={subErrors}
                          onPress={() => toggle(line._key)}
                          className="py-2"
                        >
                          {count ? `${count} ${count === 1 ? 'line' : 'lines'}` : children.every((c) => isOneToOne(c.detail)) ? t('Open') : t('Add')}
                        </Button>
                      </td>
                    )}
                    <td className="py-2 pr-1.5">
                      <IconAction icon={Trash01} danger label={t('Remove line {line}', { line: i + 1 })} onPress={() => onChange(lines.filter((_, j) => j !== i))} />
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={span} className="bg-secondary_alt py-3 pr-3 pl-8">
                        <div className="space-y-4">
                          {children.map((c) => (
                            <DetailSection
                              key={c.detail.field_path}
                              node={c}
                              lines={sub[c.detail.field_path] ?? []}
                              errors={errors}
                              prefix={at}
                              onChange={(next) => updateSub(i, c.detail.field_path, next)}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!lines.length && (
              <tr>
                <td colSpan={span} className="px-4 py-8 text-center text-sm text-tertiary">
                  {t('No lines yet. Add the first one.')}
                </td>
              </tr>
            )}
          </tbody>
          {hasTotal && lines.length > 0 && (
            <tfoot className="border-t border-secondary bg-secondary">
              <tr>
                <td colSpan={columns.length + 1} className="py-2.5 pl-3 text-sm font-semibold text-primary">
                  {t('Total')}{!hasAmount && <span className="tabular-nums">: {formatNumber(total)}</span>}
                </td>
                {hasAmount && <td className="px-2 py-2.5 text-right text-sm font-semibold text-primary tabular-nums">{formatNumber(total)}</td>}
                <td colSpan={children.length ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {listError && <p className="mt-1.5 text-sm text-error-primary">{listError}</p>}
    </section>
  );
}

/** A detail in a form: its lines as a table, or a one-to-one's record as a section of fields. */
export function DetailSection(props: { node: DetailNode; lines: Line[]; errors: Record<string, string[]>; prefix?: string; onChange: (lines: Line[]) => void }) {
  return isOneToOne(props.node.detail) ? <OneRecord {...props} /> : <DetailLines {...props} />;
}

/**
 * A one-to-one detail: the one record pointing back at this one, as labelled fields under a
 * heading, with its own details below them. It is always the single line lines[0]. Errors
 * arrive keyed like "terms.currency" (prefix is the part above, as for lines).
 */
function OneRecord({ node, lines, errors, prefix = '', onChange }: { node: DetailNode; lines: Line[]; errors: Record<string, string[]>; prefix?: string; onChange: (lines: Line[]) => void }) {
  const { detail, def, children } = node;
  const fields = visibleParams(def.params).filter((p) => p.field_path !== detail.json_config?.foreign_key);
  const line = lines[0] ?? blankLine(node);
  const at = `${prefix}${detail.field_path}.`;
  const name = detail.label_name || title(def.meta);
  const sub = line[SUBLINES] ?? {};

  return (
    <section aria-label={name} className="rounded-xl bg-secondary_alt p-4 ring-1 ring-secondary sm:col-span-2">
      <h3 className="text-sm font-semibold text-primary">{name}</h3>
      {def.meta.description && <p className="mt-0.5 text-sm text-tertiary">{def.meta.description}</p>}
      <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.field_path} className={f.data_type === 'text' ? 'sm:col-span-2' : undefined}>
            <p className="mb-1.5 text-sm font-medium text-secondary">
              {f.label_name || f.param_name}
              {f.is_required && <span className="text-brand-tertiary"> *</span>}
            </p>
            <LineField
              param={f}
              label={`${f.label_name || f.param_name}, ${name}`}
              value={line[f.field_path]}
              error={errors[`${at}${f.field_path}`]?.[0]}
              onChange={(v, fill) => onChange([{ ...line, [f.field_path]: v, ...fill } as Line])}
            />
          </div>
        ))}
        {children.map((c) => (
          <DetailSection
            key={c.detail.field_path}
            node={c}
            lines={sub[c.detail.field_path] ?? []}
            errors={errors}
            prefix={at}
            onChange={(next) => onChange([{ ...line, [SUBLINES]: { ...sub, [c.detail.field_path]: next } }])}
          />
        ))}
      </div>
    </section>
  );
}

/** A compact control for one cell. Picking a lookup record also returns the values json_config.fill copies from it. */
function LineField({
  param: f,
  label,
  value,
  error,
  onChange,
}: {
  param: MetaParam;
  label: string;
  value: string | boolean | undefined;
  error?: string;
  onChange: (value: string | boolean, fill?: Record<string, string>) => void;
}) {
  const options = optionsOf(f);
  const common = { 'aria-label': label, size: 'sm' as const, isRequired: f.is_required, isInvalid: !!error, hint: error };

  if (f.data_type === 'boolean') {
    return <Toggle aria-label={label} size="sm" isSelected={value === true} onChange={onChange} className="py-2" />;
  }

  if (f.is_select && f.ref_meta_id) {
    return <LookupField {...common} param={f} value={String(value ?? '')} onChange={(v, row) => onChange(v, filledFrom(f, row))} />;
  }

  if (options) {
    return <ComboField {...common} items={options} value={String(value ?? '')} onChange={onChange} />;
  }

  if (f.data_type === 'date' || f.data_type === 'datetime') {
    return <DatePicker {...common} withTime={f.data_type === 'datetime'} value={String(value ?? '')} onChange={onChange} />;
  }

  return (
    <>
      <Input
        aria-label={label}
        size="sm"
        type={numeric(f) ? 'number' : 'text'}
        value={String(value ?? '')}
        onChange={onChange}
        isInvalid={!!error}
        inputClassName={numeric(f) ? 'text-right tabular-nums' : undefined}
      />
      {error && <p className="mt-1 text-xs text-error-primary">{error}</p>}
    </>
  );
}

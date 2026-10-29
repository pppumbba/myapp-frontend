import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw01, Upload01, XClose } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { excelStructureApi, STRUCTURE_TYPES, type Cell, type SheetPreview, type StructureColumn } from '../../lib/excelStructureApi';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const field = 'rounded-md bg-primary px-2 py-1 text-sm text-primary shadow-xs ring-1 ring-primary ring-inset outline-none focus:ring-2 focus:ring-brand';
const letter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const filled = (v: Cell) => v !== null && String(v).trim() !== '';
/** Column letters to a 0-based index: A → 0, AA → 26. */
const fromLetter = (text: string) => [...text.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/**
 * Typed ranges to 0-based indices: "1-3, 7, 20-" for rows (20- runs to the last), and the
 * same with letters or numbers for columns ("A, C-E"). An error message when it can't be read.
 */
function parseRanges(text: string, count: number, letters: boolean): number[] | string {
  const out = new Set<number>();
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(letters ? /^([A-Za-z]+|\d+)(?:-([A-Za-z]+|\d+)?)?$/ : /^(\d+)(?:-(\d+)?)?$/);
    if (!m) return `"${part}" isn't ${letters ? 'a column (A, C-E)' : 'a row number or range (1-3, 20-)'}.`;
    const at = (v: string) => (/^\d+$/.test(v) ? Number(v) - 1 : fromLetter(v));
    const from = at(m[1]);
    const to = part.includes('-') ? (m[2] ? at(m[2]) : count - 1) : from;
    if (from < 0 || to < from) return t('"{part}" isn\'t a range from low to high.', { part });
    for (let i = from; i <= Math.min(to, count - 1); i++) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

/** Indices back to the shortest ranges: [0, 1, 2, 6] → "1-3, 7" (or "A-C, G"). */
function formatRanges(indices: number[], letters: boolean): string {
  const name = (i: number) => (letters ? letter(i) : String(i + 1));
  const sorted = [...indices].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${name(sorted[i])}-${name(sorted[j])}` : name(sorted[i]));
    i = j;
  }
  return parts.join(', ');
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'sheet';

/**
 * Makes a table and a datagrid from a spreadsheet. Upload it, pick the sheet and click the
 * rows and columns that aren't the table (titles, notes, totals) to leave them out; the
 * first row left labels the columns, the rest become the table's rows. The table's columns
 * are c1, c2, …; their labels and types can be changed before it is made.
 */
export function ExcelStructureModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [skipRows, setSkipRows] = useState<number[]>([]);
  const [skipColumns, setSkipColumns] = useState<number[]>([]);
  // What is typed in the skip inputs; clicking rows and columns writes them too.
  const [rowsText, setRowsText] = useState('');
  const [colsText, setColsText] = useState('');
  const [columns, setColumns] = useState<StructureColumn[] | null>(null);
  const [labels, setLabels] = useState<Record<number, string>>({});
  const [types, setTypes] = useState<Record<number, string>>({});
  const [name, setName] = useState('');
  const [table, setTable] = useState('');
  const [busy, setBusy] = useState<'upload' | 'sheet' | 'create' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The first row left with something in it labels the columns (wholly empty rows are left out anyway).
  const headerRow = useMemo(() => preview?.rows.findIndex((r, i) => !skipRows.includes(i) && r.some((v, c) => !skipColumns.includes(c) && filled(v))) ?? -1, [preview, skipRows, skipColumns]);

  async function upload(f: File) {
    setFile(f);
    setBusy('upload');
    setError(null);
    try {
      const p = await excelStructureApi.upload(f);
      setPreview(p);
      leaveOutRows([]);
      leaveOutColumns([]);
      if (!name) setName(f.name.replace(/\.(xlsx|csv)$/i, ''));
    } catch (err) {
      setError(message(err, t("The file could not be read.")));
    } finally {
      setBusy(null);
    }
  }

  async function pickSheet(sheet: string) {
    if (!preview) return;
    setBusy('sheet');
    setError(null);
    try {
      setPreview(await excelStructureApi.sheet(preview.token, sheet));
      leaveOutRows([]);
      leaveOutColumns([]);
      setLabels({});
      setTypes({});
    } catch (err) {
      setError(message(err, t("That sheet could not be read.")));
    } finally {
      setBusy(null);
    }
  }

  // The columns the rows left would make, worked out again as rows and columns are left out.
  useEffect(() => {
    if (!preview) return;
    let live = true;
    const timer = setTimeout(() => {
      excelStructureApi.columns(preview.token, { sheet: preview.sheet, skip_rows: skipRows, skip_columns: skipColumns }).then(
        (c) => {
          if (!live) return;
          setColumns(c);
          setError(null);
        },
        (err) => {
          if (!live) return;
          setColumns(null);
          setError(message(err, t("The columns could not be worked out.")));
        },
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [preview, skipRows, skipColumns]);

  const leaveOutRows = (rows: number[]) => {
    setSkipRows(rows);
    setRowsText(formatRanges(rows, false));
  };
  const leaveOutColumns = (cols: number[]) => {
    setSkipColumns(cols);
    setColsText(formatRanges(cols, true));
  };
  const toggle = (list: number[], i: number) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]);
  const rowsParsed = preview ? parseRanges(rowsText, preview.total, false) : [];
  const colsParsed = preview ? parseRanges(colsText, preview.width, true) : [];

  async function create() {
    if (!preview) return;
    setBusy('create');
    setError(null);
    try {
      const meta = await excelStructureApi.create(preview.token, {
        sheet: preview.sheet,
        skip_rows: skipRows,
        skip_columns: skipColumns,
        name: name.trim(),
        table: table.trim() || undefined,
        types,
        labels,
      });
      navigate(`/metas/${meta.id}`);
    } catch (err) {
      setError(message(err, t("The table could not be made.")));
      setBusy(null);
    }
  }

  return (
    <Modal title={t("Create structure from Excel")} description={t("A new table and datagrid from a spreadsheet: the first row left gives the columns, the rest are its rows.")} onClose={onClose} size="xl">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {!preview ? (
          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-secondary p-10 text-center hover:border-brand hover:bg-brand-primary_alt"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void upload(f);
            }}
          >
            <Upload01 className="size-8 text-fg-quaternary" aria-hidden="true" />
            <span className="text-sm font-semibold text-primary">{busy === 'upload' ? t('Reading {name}…', { name: file?.name }) : t("Drop an .xlsx or .csv file here, or click to choose one")}</span>
            <span className="text-xs text-tertiary">{t("Up to 20 MB.")}</span>
            <input type="file" accept=".xlsx,.csv" className="sr-only" aria-label={t("Spreadsheet file")} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          </label>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {preview.sheets.length > 1 && (
                <div role="tablist" aria-label={t("Sheets")} className="flex flex-wrap gap-1">
                  {preview.sheets.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="tab"
                      aria-selected={s === preview.sheet}
                      disabled={busy !== null}
                      onClick={() => s !== preview.sheet && void pickSheet(s)}
                      className={cx('rounded-md px-2.5 py-1 text-sm font-semibold ring-1 ring-inset', s === preview.sheet ? 'bg-brand-primary_alt text-brand-secondary ring-brand' : 'bg-primary text-secondary ring-secondary hover:bg-primary_hover')}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <p className="min-w-0 flex-1 text-xs text-tertiary">
                {file?.name} · {t('{rows} rows × {columns} columns', { rows: preview.total, columns: preview.width })}
                {preview.total > preview.rows.length ? ` ${t('(the first {count} shown; the rest are imported too)', { count: preview.rows.length })}` : ''}. {t('Click a row number or column letter to leave it out.')}
              </p>
              {(skipRows.length > 0 || skipColumns.length > 0) && (
                <Button size="sm" color="secondary" iconLeading={RefreshCcw01} onPress={() => { leaveOutRows([]); leaveOutColumns([]); }}>
                  {t("Keep all")}
                </Button>
              )}
              <Button size="sm" color="secondary" onPress={() => { setPreview(null); setFile(null); setColumns(null); }}>
                {t("Another file")}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-secondary">{t("Skip rows")}</span>
                <input
                  className={cx(field, 'w-full font-mono')}
                  value={rowsText}
                  placeholder={t("e.g. 1-3, 7, 50-")}
                  aria-invalid={typeof rowsParsed === 'string'}
                  onChange={(e) => {
                    setRowsText(e.target.value);
                    const parsed = parseRanges(e.target.value, preview.total, false);
                    if (typeof parsed !== 'string') setSkipRows(parsed);
                  }}
                />
                <span className={cx('mt-1 block text-xs', typeof rowsParsed === 'string' ? 'text-error-primary' : 'text-tertiary')}>
                  {typeof rowsParsed === 'string' ? rowsParsed : t('Row numbers as in Excel; "50-" skips row 50 to the last ({last}).', { last: preview.total })}
                </span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-secondary">{t("Skip columns")}</span>
                <input
                  className={cx(field, 'w-full font-mono')}
                  value={colsText}
                  placeholder={t("e.g. A, E-G")}
                  aria-invalid={typeof colsParsed === 'string'}
                  onChange={(e) => {
                    setColsText(e.target.value);
                    const parsed = parseRanges(e.target.value, preview.width, true);
                    if (typeof parsed !== 'string') setSkipColumns(parsed);
                  }}
                />
                <span className={cx('mt-1 block text-xs', typeof colsParsed === 'string' ? 'text-error-primary' : 'text-tertiary')}>
                  {typeof colsParsed === 'string' ? colsParsed : t('Letters or numbers; "E-" skips E to the last column ({last}).', { last: letter(preview.width - 1) })}
                </span>
              </label>
            </div>

            <div className="max-h-[42vh] overflow-auto rounded-lg ring-1 ring-secondary">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-[1] bg-secondary">
                  <tr>
                    <th className="sticky left-0 z-[2] w-12 border-b border-secondary bg-secondary" />
                    {Array.from({ length: preview.width }, (_, c) => {
                      const off = skipColumns.includes(c);
                      return (
                        <th key={c} className="border-b border-l border-secondary p-0">
                          <button
                            type="button"
                            onClick={() => leaveOutColumns(toggle(skipColumns, c))}
                            aria-pressed={off}
                            aria-label={off ? t('Keep column {name}', { name: letter(c) }) : t('Leave out column {name}', { name: letter(c) })}
                            className={cx('flex w-full items-center justify-center gap-1 px-2 py-1 text-xs font-semibold', off ? 'text-fg-error-primary line-through' : 'text-tertiary hover:bg-primary_hover')}
                          >
                            {letter(c)}
                            {off && <XClose className="size-3" aria-hidden="true" />}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, r) => {
                    const off = skipRows.includes(r);
                    const header = r === headerRow;
                    const empty = !row.some(filled);
                    return (
                      <tr key={r} className={cx(header && 'bg-brand-primary_alt font-semibold', (off || empty) && 'opacity-40')}>
                        <td className="sticky left-0 border-b border-secondary bg-secondary p-0">
                          <button
                            type="button"
                            onClick={() => leaveOutRows(toggle(skipRows, r))}
                            aria-pressed={off}
                            aria-label={off ? t('Keep row {n}', { n: r + 1 }) : t('Leave out row {n}', { n: r + 1 })}
                            className={cx('w-full px-2 py-1 text-right text-xs tabular-nums', off ? 'text-fg-error-primary line-through' : 'text-tertiary hover:bg-primary_hover')}
                          >
                            {r + 1}
                          </button>
                        </td>
                        {row.map((v, c) => (
                          <td key={c} className={cx('max-w-56 truncate border-b border-l border-secondary px-2 py-1 text-primary', (off || skipColumns.includes(c)) && 'line-through', typeof v === 'number' && 'text-right tabular-nums')} title={v === null ? '' : String(v)}>
                            {v === null ? '' : String(v)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {headerRow >= 0 && headerRow < preview.rows.length && (
              <p className="text-xs text-tertiary">
                {t("Row {n} (highlighted) labels the columns; the rows under it become the table's rows. Rows left wholly empty are left out.", { n: headerRow + 1 })}
                {headerRow > 0 && !skipRows.length && (
                  <>
                    {' '}
                    <button type="button" className="font-semibold text-brand-secondary hover:underline" onClick={() => leaveOutRows(Array.from({ length: headerRow }, (_, i) => i))}>
                      {t('Leave out rows 1–{n}', { n: headerRow })}
                    </button>
                  </>
                )}
              </p>
            )}

            {columns && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-secondary">{t('Columns of the new table ({count})', { count: columns.length })}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {columns.map((c) => (
                    <div key={c.index} className="flex items-center gap-1.5 rounded-lg bg-primary p-1.5 ring-1 ring-secondary">
                      <code className="w-9 shrink-0 text-center font-mono text-xs text-brand-secondary" title={t('From column {name}', { name: letter(c.index) })}>{c.column}</code>
                      <input aria-label={t('Label of {name}', { name: c.column })} className={cx(field, 'min-w-0 flex-1')} value={labels[c.index] ?? c.label} onChange={(e) => setLabels((l) => ({ ...l, [c.index]: e.target.value }))} />
                      <select aria-label={t('Type of {name}', { name: c.column })} className={field} value={types[c.index] ?? c.data_type} onChange={(e) => setTypes((item) => ({ ...item, [c.index]: e.target.value }))}>
                        {STRUCTURE_TYPES.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t("Grid name")} isRequired value={name} onChange={setName} placeholder={t("Stock report")} />
              <Input label={t("Table")} value={table} onChange={setTable} placeholder={`xl_${slug(name)}`} inputClassName="font-mono" hint={t("A new table; its name starts with xl_.")} />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t("Cancel")}
          </Button>
          <Button size="sm" isDisabled={!preview || !columns || !name.trim() || typeof rowsParsed === 'string' || typeof colsParsed === 'string'} isLoading={busy === 'create'} showTextWhileLoading onPress={create}>
            {t("Create table and grid")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

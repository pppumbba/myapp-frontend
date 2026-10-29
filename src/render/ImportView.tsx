import { useState } from 'react';
import { AlertTriangle, CheckCircle, Download01, FileCheck02, Upload01 } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { dataApi, type ImportResult } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { Alert } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { InputFile } from '@/components/base/input/input-file';
import { title, type MetaDef } from './definitions';
import { t } from '@/i18n';

const MODE_TEXT: Record<ImportResult['mode'], string> = {
  insert: 'Every row is added as a new record.',
  update: 'Rows change the records they match; empty cells are left alone.',
  upsert: 'Rows that match a record change it; the rest are added.',
};

/** What a column takes, in a few words. */
function kindOf(p: MetaParam): string {
  if (p.is_select && p.ref_meta_id) return 'name of a record';
  if (Array.isArray(p.json_config?.options)) return (p.json_config.options as unknown[]).join(' / ');
  if (p.data_type === 'boolean') return 'yes / no';
  return p.data_type;
}

/**
 * An excel_import meta: download its template, pick an .xlsx or .csv file, check it, then
 * import it. Checking lists every problem by row and column; nothing is saved while any
 * remain. Opened from a menu, or from a grid's Import button (embedded, with onDone).
 */
export function ImportView({ def, embedded, onDone, onImported }: { def: MetaDef; embedded?: boolean; onDone?: () => void; onImported?: () => void }) {
  const { meta, params } = def;
  const columns = params.filter((p) => !p.is_primary && !['detail', 'subgrid', 'signature', 'json', 'singlefile', 'multifile', 'document'].includes(p.data_type));
  const mode = (['insert', 'update', 'upsert'] as const).find((m) => m === meta.json_config?.mode) ?? 'insert';

  const [file, setFile] = useState<File | null>(null);
  // Remounts the file picker so it forgets the last file.
  const [picker, setPicker] = useState(0);
  const [checked, setChecked] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'check' | 'import' | 'template' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(dryRun ? 'check' : 'import');
    setError(null);
    try {
      const result = await dataApi.importExcel(meta.id, file, dryRun);
      if (result.saved) {
        setDone(result);
        setChecked(null);
        onImported?.();
      } else {
        setChecked(result);
      }
    } catch (err) {
      setError(err instanceof ApiError ? (err.errors ? Object.values(err.errors)[0]?.[0] : null) ?? err.message : t('The file could not be read.'));
    } finally {
      setBusy(null);
    }
  }

  async function template() {
    setBusy('template');
    setError(null);
    try {
      await dataApi.importTemplate(meta.id, meta.code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The template could not be downloaded.'));
    } finally {
      setBusy(null);
    }
  }

  const ready = checked && checked.error_count === 0 && checked.total > 0;
  const missing = checked?.columns.filter((c) => !c.column) ?? [];

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-5 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary sm:p-6'}>
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-primary">{title(meta)}</h2>
          {meta.description && <p className="mt-0.5 text-sm text-tertiary">{meta.description}</p>}
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      {done ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-success-primary px-6 py-8 text-center">
          <CheckCircle className="size-8 text-fg-success-primary" />
          <div>
            <p className="text-md font-semibold text-primary">{t('Imported {count} rows', { count: done.total })}</p>
            <p className="mt-1 text-sm text-tertiary">
              {done.updated ? t('{added} added, {updated} updated.', { added: done.inserted, updated: done.updated }) : t('{added} added.', { added: done.inserted })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              color="secondary"
              onPress={() => {
                setDone(null);
                setFile(null);
                setPicker((n) => n + 1);
              }}
            >
              {t('Import another file')}
            </Button>
            {onDone && (
              <Button size="sm" onPress={onDone}>
                {t('Done')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-secondary">{t('Columns the file needs')}</p>
                <p className="text-xs text-tertiary">{t(MODE_TEXT[mode])} {t('Headings are matched by name, in any order.')}</p>
              </div>
              <Button size="sm" color="link-color" iconLeading={Download01} isLoading={busy === 'template'} onPress={template}>
                {t('Download template')}
              </Button>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {columns.map((p) => {
                const absent = missing.some((m) => m.field === p.field_path);
                return (
                  <li
                    key={p.id}
                    className={`rounded-md px-2 py-1 text-xs ring-1 ring-inset ${absent ? 'bg-warning-primary text-warning-primary ring-secondary' : 'bg-secondary text-secondary ring-secondary'}`}
                    title={kindOf(p)}
                  >
                    <span className="font-medium">{p.label_name || p.field_path}</span>
                    {p.is_required && <span className="text-error-primary"> *</span>}
                    <span className="text-quaternary"> · {kindOf(p)}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <InputFile
            key={picker}
            label={t('File')}
            hint={t('.xlsx or .csv. The first row holds the headings.')}
            placeholder={t('Choose an Excel file')}
            buttonText={t('Browse')}
            acceptedFileTypes={['.xlsx', '.csv']}
            onChange={(files) => {
              setFile(files?.[0] ?? null);
              setChecked(null);
              setError(null);
            }}
          />

          {checked && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge type="pill-color" size="sm" color={checked.error_count ? 'error' : 'success'}>
                  {checked.error_count ? `${checked.error_count} ${checked.error_count === 1 ? 'problem' : 'problems'}` : t('Ready to import')}
                </Badge>
                <span className="text-sm text-tertiary">
                  {checked.total} {checked.total === 1 ? 'row' : 'rows'}
                  {checked.error_count === 0 && checked.total > 0 && ` · ${checked.updated ? t('{added} to add, {updated} to update', { added: checked.inserted, updated: checked.updated }) : t('{added} to add', { added: checked.inserted })}`}
                </span>
              </div>

              {checked.errors.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-lg ring-1 ring-secondary">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-secondary text-xs text-tertiary">
                      <tr>
                        <th className="px-3 py-2 font-medium">{t('Row')}</th>
                        <th className="px-3 py-2 font-medium">{t('Column')}</th>
                        <th className="px-3 py-2 font-medium">{t('Problem')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary">
                      {checked.errors.map((e, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 tabular-nums text-tertiary">{e.row}</td>
                          <td className="px-3 py-2 font-medium whitespace-nowrap text-secondary">{e.column ?? '—'}</td>
                          <td className="px-3 py-2 text-secondary">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {checked.error_count > checked.errors.length && (
                    <p className="border-t border-secondary px-3 py-2 text-xs text-tertiary">{t('And {count} more. Fix these and check again.', { count: checked.error_count - checked.errors.length })}</p>
                  )}
                </div>
              )}

              {ready && missing.length > 0 && (
                <p className="flex items-start gap-2 text-sm text-tertiary">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fg-warning-primary" />
                  {t('Not in the file, so left empty or at their defaults: {fields}.', { fields: missing.map((m) => m.heading).join(', ') })}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-secondary pt-4">
            <Button size="md" color="secondary" iconLeading={FileCheck02} isDisabled={!file} isLoading={busy === 'check'} showTextWhileLoading onPress={() => run(true)}>
              {t('Check file')}
            </Button>
            <Button size="md" iconLeading={Upload01} isDisabled={!ready} isLoading={busy === 'import'} showTextWhileLoading onPress={() => run(false)}>
              {ready ? t('Import {count} rows', { count: checked.total }) : t('Import')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

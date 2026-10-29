import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { queryApi, type QueryRun } from '../lib/queryApi';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';
import type { MetaDef } from './definitions';
import { t } from '@/i18n';

/**
 * A query meta opened on its own: its :parameters to fill in and the rows it reads (the
 * first QueryDesignController::RUN_ROWS). Grids that read it page and filter them instead.
 */
export function QueryView({ def, defaults }: { def: MetaDef; defaults?: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...defaults }));
  const [run, setRun] = useState<QueryRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(params: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      setRun(await queryApi.rows(def.meta.id, params));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("The query could not be run."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void go(defaults ?? {});
  }, [def.meta.id]);

  return (
    <section className="space-y-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary sm:p-5" aria-label={def.meta.label_name || def.meta.name}>
      <div>
        <h2 className="text-lg font-semibold text-primary">{def.meta.label_name || def.meta.name}</h2>
        {def.meta.description && <p className="mt-0.5 text-sm text-tertiary">{def.meta.description}</p>}
      </div>
      {(run?.params.length ?? 0) > 0 && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void go(values);
          }}
        >
          {run!.params.map((p) => (
            <label key={p} className="text-sm">
              <span className="mb-1 block font-medium text-secondary">{p.replace(/_/g, ' ')}</span>
              <input
                className="rounded-md bg-primary px-2.5 py-1.5 text-sm text-primary shadow-xs ring-1 ring-primary ring-inset outline-none focus:ring-2 focus:ring-brand"
                value={values[p] ?? ''}
                placeholder={t("Any")}
                onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
              />
            </label>
          ))}
          <Button type="submit" size="sm" isLoading={busy}>
            {t("Show")}
          </Button>
        </form>
      )}
      {error && <Alert>{error}</Alert>}
      {!run && busy ? <div className="h-48 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" /> : <ResultTable run={run} />}
    </section>
  );
}

/** Rows a query gave, as plain text. */
export function ResultTable({ run }: { run: QueryRun | null }) {
  if (!run) return <p className="text-sm text-tertiary">{t("Run the query to see its rows.")}</p>;
  if (!run.rows.length) return <p className="text-sm text-tertiary">{t("No rows.")}</p>;
  return (
    <div className="space-y-1.5">
      <div className="max-h-96 overflow-auto rounded-lg ring-1 ring-secondary">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-secondary text-xs text-tertiary">
            <tr>
              {run.columns.map((c) => (
                <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {run.rows.map((r, i) => (
              <tr key={i} className="border-t border-secondary">
                {run.columns.map((c) => (
                  <td key={c} className={cx('px-3 py-1.5 whitespace-nowrap', typeof r[c] === 'number' ? 'text-right tabular-nums' : 'text-secondary', r[c] === null && 'text-quaternary italic')}>
                    {r[c] === null ? 'null' : String(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-tertiary">{t('{count} rows', { count: run.rows.length })}{run.truncated ? t(", more not shown") : ''}.</p>
    </div>
  );
}

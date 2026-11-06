import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database02, RefreshCw01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaParam } from '../../lib/metaApi';
import { structureApi, type StructureApplied, type StructureChange, type StructurePlan } from '../../lib/structureApi';
import { Alert } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { Toggle } from '@/components/base/toggle/toggle';
import { t } from '@/i18n';

/** The column kinds a structure takes (backend: Structure::TYPES). */
const TYPES = ['string', 'text', 'integer', 'decimal', 'date', 'datetime', 'boolean'];

const KIND: Record<StructureChange['kind'], { label: string; color: 'success' | 'brand' | 'warning' | 'gray' }> = {
  create: { label: 'New table', color: 'success' },
  add: { label: 'New column', color: 'success' },
  change: { label: 'Changes', color: 'brand' },
  keep: { label: 'No param, kept', color: 'gray' },
};

/**
 * A structure meta's table: its params are the columns. Shows what "Apply to database" would
 * create or change, each column's length and uniqueness, and applies it (backend: Structure).
 * A column is never dropped: removing its param leaves it and its data.
 */
export function StructurePanel({ meta }: { meta: Meta }) {
  const [plan, setPlan] = useState<StructurePlan | null>(null);
  const [params, setParams] = useState<MetaParam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<StructureApplied | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const [p, list] = await Promise.all([structureApi.plan(meta.id), metaApi.params(meta.id)]);
      setPlan(p);
      setParams(list.filter((x) => x.parent_id === null).sort((a, b) => a.order_number - b.order_number));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The table could not be checked.'));
    } finally {
      setChecking(false);
    }
  }, [meta.id]);

  useEffect(() => {
    check();
  }, [check]);

  async function saveParam(p: MetaParam, input: Partial<MetaParam>) {
    try {
      await metaApi.updateParam(p.id, input);
      await check();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The column could not be saved.'));
    }
  }

  if (!plan) {
    return error ? <Alert>{error}</Alert> : <div className="h-48 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />;
  }

  const byColumn = new Map(plan.changes.map((c) => [c.column, c]));
  const pending = plan.changes.filter((c) => c.kind !== 'keep');
  const kept = plan.changes.filter((c) => c.kind === 'keep');

  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-labelledby="structure-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 id="structure-title" className="flex items-center gap-2 text-lg font-semibold text-primary">
            <Database02 className="size-5 text-fg-brand-primary" aria-hidden="true" />
            {t('Database table')}
          </h2>
          <p className="mt-0.5 max-w-3xl text-sm text-tertiary">
            {t('Each param above is a column. Nothing changes in the database until you apply. Later applies add new columns and change edited ones; a column is never dropped.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" color="secondary" iconLeading={RefreshCw01} isLoading={checking} onPress={check}>
            {t('Check again')}
          </Button>
          <Button size="sm" isDisabled={plan.problems.length > 0 || pending.length === 0} onPress={() => setApplying(true)}>
            {t('Apply to database')}
          </Button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-tertiary">{t('Table')}</span>
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-secondary">{plan.table || t('not set')}</code>
          {plan.creating ? (
            <Badge type="pill-color" color="gray" size="sm">{t('Not made yet')}</Badge>
          ) : (
            <Badge type="pill-color" color="success" size="sm">
              {plan.applied_at ? t('Made · last applied {date}', { date: new Date(plan.applied_at).toLocaleString() }) : t('Made')}
            </Badge>
          )}
          {!plan.problems.length && pending.length === 0 && !plan.creating && <span className="text-tertiary">{t('The table matches the params.')}</span>}
        </div>

        {error && <Alert>{error}</Alert>}
        {plan.problems.map((p) => (
          <Alert key={p}>{p}</Alert>
        ))}

        {done && (
          <div className="rounded-lg bg-success-primary px-4 py-3 text-sm text-success-primary ring-1 ring-success-secondary">
            {done.changes.length === 1 ? t('Applied 1 change.') : t('Applied {count} changes.', { count: done.changes.length })}{' '}
            {done.grid_id && (
              <>
                <Link className="font-semibold underline" to={`/metas/${done.grid_id}`}>{t('Open the grid')}</Link>
                {' · '}
              </>
            )}
            {done.form_id && <Link className="font-semibold underline" to={`/metas/${done.form_id}`}>{t('Open the form')}</Link>}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg ring-1 ring-secondary">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary_alt text-xs text-tertiary">
              <tr>
                <th className="px-3 py-2 font-medium">{t('Column')}</th>
                <th className="px-3 py-2 font-medium">{t('Type')}</th>
                <th className="px-3 py-2 font-medium">{t('Length')}</th>
                <th className="px-3 py-2 font-medium">{t('Required')}</th>
                <th className="px-3 py-2 font-medium">{t('Unique')}</th>
                <th className="px-3 py-2 font-medium">{t('In the database')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary">
              <tr className="text-quaternary">
                <td className="px-3 py-2 font-mono" colSpan={5}>id, created_at, updated_at</td>
                <td className="px-3 py-2 text-xs">{t('Every table has these')}</td>
              </tr>
              {params.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-tertiary" colSpan={6}>{t('No params yet: add one above for each column.')}</td>
                </tr>
              )}
              {params.map((p) => {
                const change = byColumn.get(p.field_path.toLowerCase());
                const usable = TYPES.includes(p.data_type);
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <span className="block font-mono text-primary">{p.field_path}</span>
                      {p.label_name && <span className="block text-xs text-tertiary">{p.label_name}</span>}
                    </td>
                    <td className={`px-3 py-2 ${usable ? 'text-secondary' : 'text-error-primary'}`}>{p.data_type}</td>
                    <td className="px-3 py-2">
                      {p.data_type === 'string' ? (
                        <LengthInput param={p} onSave={(length) => saveParam(p, { json_config: { ...(p.json_config ?? {}), length } })} />
                      ) : (
                        <span className="text-quaternary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-secondary">{p.is_required ? t('Yes') : t('No')}</td>
                    <td className="px-3 py-2">
                      <Toggle size="sm" aria-label={t('Unique {name}', { name: p.field_path })} isSelected={p.is_unique} onChange={(v) => saveParam(p, { is_unique: v })} />
                    </td>
                    <td className="px-3 py-2">
                      {change ? (
                        <span className="flex flex-col gap-0.5">
                          <Badge type="pill-color" color={KIND[change.kind].color} size="sm">{t(KIND[change.kind].label)}</Badge>
                          <span className="text-xs text-tertiary">{change.detail}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-tertiary">{plan.creating ? '—' : t('Up to date')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {kept.map((c) => (
                <tr key={`kept-${c.column}`} className="text-quaternary">
                  <td className="px-3 py-2 font-mono" colSpan={5}>{c.column}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-col gap-0.5">
                      <Badge type="pill-color" color="gray" size="sm">{t(KIND.keep.label)}</Badge>
                      <span className="text-xs">{c.detail}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-quaternary">{t('Required is set in the param itself. Renaming a param adds a new column and keeps the old one.')}</p>
      </div>

      {applying && (
        <ApplyDialog
          meta={meta}
          plan={plan}
          onClose={() => setApplying(false)}
          onDone={(result) => {
            setDone(result);
            setPlan(result.plan);
            setApplying(false);
          }}
        />
      )}
    </section>
  );
}

/** A string column's length, saved when the field is left. */
function LengthInput({ param, onSave }: { param: MetaParam; onSave: (length: number) => void }) {
  const saved = Number(param.json_config?.length ?? 255);
  const [value, setValue] = useState(String(saved));
  return (
    <div className="w-24" onBlur={() => Number(value) > 0 && Number(value) !== saved && onSave(Math.min(2000, Math.round(Number(value))))}>
      <Input size="sm" type="number" aria-label={t('Length of {name}', { name: param.field_path })} value={value} onChange={setValue} />
    </div>
  );
}

function ApplyDialog({ meta, plan, onClose, onDone }: { meta: Meta; plan: StructurePlan; onClose: () => void; onDone: (result: StructureApplied) => void }) {
  const [makeScreens, setMakeScreens] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changes = plan.changes.filter((c) => c.kind !== 'keep');

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      onDone(await structureApi.apply(meta.id, plan.creating && makeScreens));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The table could not be changed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={plan.creating ? t('Make the table {table}?', { table: plan.table }) : t('Change the table {table}?', { table: plan.table })}
      description={t('This changes the database right away. It can’t be undone from here.')}
      onClose={onClose}
      size="md"
    >
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <ul className="space-y-1.5 text-sm">
          {changes.map((c) => (
            <li key={c.column} className="flex flex-wrap items-baseline gap-2">
              <Badge type="pill-color" color={KIND[c.kind].color} size="sm">{t(KIND[c.kind].label)}</Badge>
              <code className="font-mono text-primary">{c.column}</code>
              <span className="text-tertiary">{c.detail}</span>
            </li>
          ))}
        </ul>
        {plan.creating && (
          <Checkbox
            label={t('Also make a grid and a form')}
            hint={t('A datagrid showing the rows and a form adding and editing them, with a field per column.')}
            isSelected={makeScreens}
            onChange={setMakeScreens}
          />
        )}
        <div className="flex justify-end gap-2 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button size="sm" isLoading={busy} showTextWhileLoading onPress={apply}>
            {plan.creating ? t('Make table') : t('Apply changes')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

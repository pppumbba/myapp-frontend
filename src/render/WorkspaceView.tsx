import { useEffect, useMemo, useState } from 'react';
import { Edit01 } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { dataApi, type DataRow } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';
import { Alert } from '../components/ui';
import { Tab, TabList, TabPanel, Tabs } from '@/components/application/tabs/tabs';
import { Button } from '@/components/base/buttons/button';
import { ColumnValue } from './Cell';
import { FormView } from './FormView';
import { GridView } from './GridView';
import { MatrixView } from './MatrixView';
import { MetaView } from './MetaView';
import { RecordPicker, ReportView } from './ReportView';
import { StatementView } from './StatementView';
import { primaryKey, rowLabel, title, useMetaDef, type MetaDef } from './definitions';

type Section = MetaParam & { ref_meta_id: number };

/**
 * A workspace meta: one record and everything about it, e.g. a tender with its items,
 * bidders, prices and evaluation. ref_meta_id is the record's form; json_config.header the
 * form's fields shown at the top and title_field the one that names the record. Each param
 * is a section (a tab) showing the meta it refers to; its json_config.scope maps that
 * meta's fields to the record's ({"tender_id": "id"}), so a grid shows only this record's
 * rows and new rows belong to it, and a matrix pairs only its rows and columns.
 */
export function WorkspaceView({ def, recordId: given }: { def: MetaDef; recordId?: string | null }) {
  const config = def.meta.json_config ?? {};
  const { def: mainDef, error: mainError } = useMetaDef(def.meta.ref_meta_id);
  // Named by json_config.title_field, else the form's field that names its records.
  const titleField = typeof config.title_field === 'string' && config.title_field ? config.title_field : mainDef?.params.find((p) => p.is_label)?.field_path;
  const { can } = useAuth();
  const [picked, setPicked] = useState<string | null>(given ?? null);
  const [record, setRecord] = useState<DataRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => setPicked(given ?? null), [given]);

  useEffect(() => {
    if (!mainDef || !picked) return;
    let live = true;
    setError(null);
    dataApi.get(mainDef.meta.id, picked).then(
      (r) => live && setRecord(r),
      (err) => live && setError(err instanceof ApiError ? err.message : 'This record could not be loaded.'),
    );
    return () => {
      live = false;
    };
  }, [mainDef, picked, reload]);

  const sections = def.params.filter((p): p is Section => p.is_show && !!p.ref_meta_id);
  const header = useMemo(() => {
    const wanted = Array.isArray(config.header) ? (config.header as string[]) : null;
    const params = (mainDef?.params ?? []).filter((p) => p.is_show && !p.is_primary && p.data_type !== 'detail' && p.field_path !== titleField);
    return wanted ? wanted.map((f) => params.find((p) => p.field_path === f)).filter((p): p is MetaParam => !!p) : params.slice(0, 6);
  }, [mainDef, config.header, titleField]);

  if (!def.meta.ref_meta_id) return <Alert>This workspace needs a form for its record (Refers to).</Alert>;
  if (mainError) return <Alert>{mainError}</Alert>;
  if (!mainDef) return <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />;

  const noun = title(mainDef.meta).replace(/ form$/i, '');
  const current = record && picked && String(record[primaryKey(mainDef.params)]) === picked ? record : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <RecordPicker def={mainDef} labelField={titleField} label={noun} value={picked} onChange={setPicked} />
        {current && can(mainDef.meta.id, 'edit') && (
          <Button size="sm" color="secondary" iconLeading={Edit01} onPress={() => setEditing(true)}>
            Edit {noun.toLowerCase()}
          </Button>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
      {!picked ? (
        <div className="rounded-xl border border-dashed border-primary px-5 py-12 text-center">
          <p className="text-sm font-semibold text-secondary">Pick a {noun.toLowerCase()} to work on</p>
          <p className="mt-1 text-sm text-tertiary">{def.meta.description}</p>
        </div>
      ) : !current ? (
        !error && <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : (
        <>
          <header className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
            <p className="text-xs font-medium tracking-wide text-quaternary uppercase">{noun}</p>
            <h2 className="mt-1 text-xl font-semibold text-primary">{titleField ? String(current[titleField] ?? '') : rowLabel(current)}</h2>
            {header.length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                {header.map((p) => (
                  <div key={p.field_path} className="min-w-0">
                    <dt className="text-xs text-tertiary">{p.label_name || p.param_name}</dt>
                    <dd className="mt-0.5 truncate text-sm font-medium text-primary">
                      <ColumnValue param={p} value={current[p.field_path]} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </header>

          {sections.length === 0 ? (
            <Alert>This workspace has no sections yet. Add params that refer to grids or matrices.</Alert>
          ) : (
            <Tabs>
              <TabList type="underline" size="sm" aria-label={`${noun} sections`} className="mb-5">
                {sections.map((s) => (
                  <Tab key={s.id} id={String(s.id)} label={s.label_name || s.param_name} />
                ))}
              </TabList>
              {sections.map((s) => (
                <TabPanel key={s.id} id={String(s.id)}>
                  <WorkspaceSection section={s} record={current} recordKey={primaryKey(mainDef.params)} />
                </TabPanel>
              ))}
            </Tabs>
          )}
        </>
      )}

      {editing && current && (
        <Modal title={`Edit ${noun.toLowerCase()}`} onClose={() => setEditing(false)} size="lg">
          <FormView
            metaId={mainDef.meta.id}
            recordId={picked}
            embedded
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              setReload((n) => n + 1);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/** One section: its meta, kept to the record by json_config.scope. */
function WorkspaceSection({ section, record, recordKey }: { section: Section; record: DataRow; recordKey: string }) {
  const { def, error } = useMetaDef(section.ref_meta_id);
  const map = (section.json_config?.scope ?? {}) as Record<string, string>;
  const scope = useMemo(
    () => Object.fromEntries(Object.entries(map).map(([field, from]) => [field, record[from] == null ? '' : String(record[from])])),
    [record, JSON.stringify(map)],
  );

  if (error) return <Alert>{error}</Alert>;
  if (!def) return <div className="h-48 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />;

  return <SectionBody def={def} scope={scope} record={record} recordKey={recordKey} label={section.label_name || section.param_name} />;
}

function SectionBody({ def, scope, record, recordKey, label }: { def: MetaDef; scope: Record<string, string>; record: DataRow; recordKey: string; label: string }) {
  switch (def.meta.type?.code) {
    case 'datagrid':
      return <GridView def={def} scope={scope} label={label} />;
    case 'matrix':
      return <MatrixView def={def} scope={scope} />;
    case 'statement':
      return <StatementView def={def} fixed={scope} />;
    case 'report':
      return <ReportView def={def} recordId={String(record[recordKey])} />;
    case 'form':
      return <FormView metaId={def.meta.id} recordId={String(record[recordKey])} embedded />;
    default:
      return <MetaView metaId={def.meta.id} />;
  }
}

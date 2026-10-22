import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaType } from '../../lib/metaApi';
import { AppShell } from '../../components/AppShell';
import { ArrowLeft, Edit01, PlayCircle, Trash01 } from '@untitledui/icons';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { BadgeWithDot } from '@/components/base/badges/badges';
import { ConfirmDialog } from '../../components/Modal';
import { TypePreview, typeLook } from '../../components/TypePreview';
import { MetaFormModal } from './MetaFormModal';
import { ChartDesigner } from './ChartDesigner';
import { DashboardDesigner } from './DashboardDesigner';
import { MetaActionsPanel } from './MetaActionsPanel';
import { ExcelImportDesigner, FormSettingsPanel, GridDrilldownPanel, GridFilterLayoutPanel, MatrixDesigner, ReportDesigner, StageQueryPanel, StatementDesigner, WorkspaceDesigner } from './MetaSettings';
import { MetaParamsPanel } from './MetaParamsPanel';
import { ProcessFlowPanel } from './ProcessFlowPanel';
import { VersionsPanel } from './VersionsPanel';
import { NotificationDesigner } from './NotificationDesigner';
import { PageDesigner } from './PageDesigner';
import { MetaPermissionsPanel, StatusPermissionsPanel } from './PermissionsPanel';
import { WidgetDesigner } from './WidgetDesigner';
import { WorkflowDesigner } from './WorkflowDesigner';

export default function MetaDetailPage() {
  const { id } = useParams();
  const metaId = Number(id);
  const navigate = useNavigate();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [types, setTypes] = useState<MetaType[]>([]);
  const [options, setOptions] = useState<MetaOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Bumped after a version is restored, so every panel below reloads what it shows.
  const [revision, setRevision] = useState(0);
  // Bumped when the stage query panel adds parameters, so the parameter list reloads.
  const [paramsVersion, setParamsVersion] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, t, o] = await Promise.all([metaApi.get(metaId), metaApi.types(), metaApi.options()]);
      setMeta(m);
      setTypes(t);
      setOptions(o);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'This meta no longer exists.'
          : err instanceof ApiError
            ? err.message
            : 'This meta could not be loaded.',
      );
    }
  }, [metaId]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmDelete() {
    if (!meta) return;
    setDeleteBusy(true);
    try {
      await metaApi.remove(meta.id);
      navigate('/metas', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The meta could not be deleted.');
      setDeleting(false);
      setDeleteBusy(false);
    }
  }

  const look = typeLook(meta?.type?.code);

  return (
    <AppShell>
      <Link to="/metas" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-tertiary hover:text-tertiary_hover">
        <ArrowLeft className="size-5 text-fg-quaternary" />
        All metas
      </Link>

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      {!meta && !error && <div className="h-40 animate-pulse rounded-2xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />}

      {meta && (
        <>
          <header className="mb-10 flex flex-col gap-6 overflow-hidden rounded-2xl bg-primary shadow-xs ring-1 ring-secondary sm:flex-row">
            <div className="flex items-center justify-center px-8 py-6 sm:w-64" style={{ background: look.tint }}>
              <TypePreview code={meta.type?.code} className="h-24 w-full max-w-[200px]" />
            </div>
            <div className="flex flex-1 flex-col justify-center gap-4 px-6 pb-6 sm:py-6 sm:pr-8 sm:pl-0">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <span
                    className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-current/15 ring-inset"
                    style={{ background: look.tint, color: look.ink }}
                  >
                    {meta.type?.name ?? 'No type'}
                  </span>
                  <h1 className="mt-2 text-display-xs font-semibold text-primary">{meta.name}</h1>
                  <p className="mt-1 text-sm text-tertiary">{meta.code}</p>
                </div>
                <div className="flex gap-3">
                  <Button color="secondary-destructive" iconLeading={Trash01} onPress={() => setDeleting(true)} aria-label="Delete meta" />
                  <Button color="secondary" iconLeading={Edit01} onPress={() => setEditing(true)}>
                    Edit
                  </Button>
                  {meta.type?.code && (
                    <Button iconLeading={PlayCircle} onPress={() => navigate(`/run/${meta.id}`)}>
                      Open
                    </Button>
                  )}
                </div>
              </div>
              {meta.description && <p className="max-w-prose text-md text-tertiary">{meta.description}</p>}
              <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <Detail term="Table" value={meta.table_name} />
                <Detail
                  term="Refers to"
                  value={
                    meta.ref_meta ? (
                      <Link to={`/metas/${meta.ref_meta.id}`} className="font-semibold text-brand-secondary hover:text-brand-secondary_hover">
                        {meta.ref_meta.name}
                      </Link>
                    ) : null
                  }
                />
                <Detail
                  term="Status"
                  value={
                    <BadgeWithDot type="pill-color" size="sm" color={meta.is_active ? 'success' : 'gray'}>
                      {meta.is_active ? 'Active' : 'Inactive'}
                    </BadgeWithDot>
                  }
                />
              </dl>
            </div>
          </header>

          <VersionsPanel
            meta={meta}
            onRestored={async () => {
              await load();
              setRevision((r) => r + 1);
            }}
          />

          {/* The page spaces its sections; they keep no outer margins of their own. */}
          <div key={revision} className="space-y-8">

          {meta.type?.code === 'datagrid' && (
            <>
              <MetaActionsPanel key={`actions-${meta.id}`} meta={meta} options={options} />
              <GridDrilldownPanel key={`drilldown-${meta.id}`} meta={meta} options={options} />
              <GridFilterLayoutPanel key={`filter-layout-${meta.id}`} meta={meta} />
            </>
          )}
          {meta.type?.code === 'form' && <FormSettingsPanel key={`form-settings-${meta.id}`} meta={meta} options={options} />}
          {meta.type?.code === 'statement' && <StatementDesigner key={`statement-${meta.id}`} meta={meta} options={options} />}
          {meta.type?.code === 'report' && <ReportDesigner key={`report-${meta.id}`} meta={meta} />}
          {meta.type?.code === 'excel_import' && <ExcelImportDesigner key={`import-${meta.id}`} meta={meta} />}
          {meta.type?.code === 'stage_query' && (
            <StageQueryPanel key={`stage-${meta.id}-${meta.query_string}`} meta={meta} onParamsChanged={() => setParamsVersion((v) => v + 1)} />
          )}
          {meta.type?.code === 'workspace' && <WorkspaceDesigner key={`workspace-${meta.id}-${meta.ref_meta_id}`} meta={meta} />}

          {meta.type?.code === 'workflow' ? (
            <>
              <StatusPermissionsPanel key={`status-permissions-${meta.id}`} meta={meta} />
              <WorkflowDesigner key={`workflow-${meta.id}`} meta={meta} options={options} />
            </>
          ) : (
            <>
              <MetaPermissionsPanel key={`permissions-${meta.id}`} meta={meta} />
              {meta.type?.code === 'chart' ? (
                // Keyed on the source too, so editing the table or query reloads the columns.
                <ChartDesigner key={`chart-${meta.id}-${meta.table_name}-${meta.query_string}`} meta={meta} options={options} />
              ) : meta.type?.code === 'dashboard' ? (
                <DashboardDesigner key={`dashboard-${meta.id}`} meta={meta} options={options} />
              ) : meta.type?.code === 'notification' ? (
                <NotificationDesigner key={`notification-${meta.id}`} meta={meta} options={options} />
              ) : meta.type?.code === 'page' || meta.type?.code === 'widget_template' ? (
                <PageDesigner key={`page-${meta.id}`} meta={meta} options={options} />
              ) : meta.type?.code === 'matrix' ? (
                <MatrixDesigner key={`matrix-${meta.id}`} meta={meta} options={options} />
              ) : meta.type?.code === 'widget' ? (
                <WidgetDesigner key={`widget-${meta.id}-${meta.widget_id}`} meta={meta} options={options} onSaved={load} />
              ) : (
                <MetaParamsPanel key={`${meta.id}-${paramsVersion}`} meta={meta} options={options} />
              )}
              {meta.type?.code === 'form' && <ProcessFlowPanel key={`process-flow-${meta.id}`} meta={meta} options={options} />}
            </>
          )}

          </div>

          {editing && (
            <MetaFormModal
              meta={meta}
              types={types}
              options={options}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                load();
              }}
            />
          )}

          {deleting && (
            <ConfirmDialog
              title={`Delete ${meta.name}?`}
              message={`Everything inside it is deleted too. Other metas that link to it will lose that link. This can't be undone.`}
              confirmLabel="Delete meta"
              busy={deleteBusy}
              onConfirm={confirmDelete}
              onCancel={() => setDeleting(false)}
            />
          )}
        </>
      )}
    </AppShell>
  );
}

function Detail({ term, value }: { term: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-tertiary">{term}</dt>
      <dd className="mt-0.5 font-medium text-primary">{value || <span className="font-normal text-quaternary">Not set</span>}</dd>
    </div>
  );
}

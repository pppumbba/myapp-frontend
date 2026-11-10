import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaType } from '../../lib/metaApi';
import { ArrowLeft, Dataflow03, Edit01, PlayCircle, Trash01 } from '@untitledui/icons';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { BadgeWithDot } from '@/components/base/badges/badges';
import { ConfirmDialog } from '../../components/Modal';
import { typeColors, typeLook } from '../../components/TypePreview';
import { sideNavItemClass } from './sideNav';
import { TypeIcon } from '../../components/TypeIcon';
import { MetaFormModal } from './MetaFormModal';
import { ChartDesigner } from './ChartDesigner';
import { DashboardDesigner } from './DashboardDesigner';
import { MetaActionsPanel } from './MetaActionsPanel';
import { AppSettingsPanel, MobileSettingsPanel, ExcelImportDesigner, FormSettingsPanel, GridColumnsPanel, GridDrilldownPanel, GridFilterLayoutPanel, MatrixDesigner, ReportDesigner, StageQueryPanel, StatementDesigner, WorkspaceDesigner } from './MetaSettings';
import { MetaParamsPanel } from './MetaParamsPanel';
import { ProcessFlowPanel } from './ProcessFlowPanel';
import { StructurePanel } from './StructurePanel';
import { VersionsPanel } from './VersionsPanel';
import { NotificationDesigner } from './NotificationDesigner';
import { PageDesigner } from './PageDesigner';
import { QueryDesigner } from './QueryDesigner';
import { ThemeDesigner } from './ThemeDesigner';
import { TranslationsPanel } from './TranslationsPanel';
import { MetaPermissionsPanel, StatusPermissionsPanel } from './PermissionsPanel';
import { WidgetDesigner } from './WidgetDesigner';
import { WorkflowDesigner } from './WorkflowDesigner';
import { useAuth } from '../../auth/AuthContext';
import { t } from '@/i18n';

export default function MetaDetailPage() {
  const { id } = useParams();
  const metaId = Number(id);
  const navigate = useNavigate();
  // A builder changes only the metas they made, and the versions, permissions, translations and
  // process flow stay with admins.
  const { isAdmin, designs, hasFeature, access } = useAuth();

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
      const [m, item, o] = await Promise.all([metaApi.get(metaId), metaApi.types(), metaApi.options()]);
      setMeta(m);
      setTypes(isAdmin ? item : item.filter((x) => !!access?.build_types?.includes(x.code)));
      setOptions(o);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? t('This meta no longer exists.')
          : err instanceof ApiError
            ? err.message
            : t('This meta could not be loaded.'),
      );
    }
  }, [metaId, isAdmin, access]);

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
      setError(err instanceof ApiError ? err.message : t('The meta could not be deleted.'));
      setDeleting(false);
      setDeleteBusy(false);
    }
  }

  const colors = typeColors(meta?.type?.code);
  const mine = designs(meta);

  return (
    <>
      <Link to="/metas" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-tertiary hover:text-tertiary_hover">
        <ArrowLeft className="size-5 text-fg-quaternary" />
        {t('All metas')}
      </Link>

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      {!meta && !error && <div className="h-40 animate-pulse rounded-2xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />}

      {meta && (
        <>
          <header className="mb-10 flex flex-col gap-5 rounded-2xl bg-primary p-6 shadow-xs ring-1 ring-secondary sm:flex-row sm:items-center sm:pr-8">
            <TypeIcon code={meta.type?.code} size="xl" />
            <div className="flex flex-1 flex-col justify-center gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-current/15 ring-inset ${colors.className}`}
                    style={colors.style}
                  >
                    {meta.type?.name ?? t('No type')}
                  </span>
                  <h1 className="mt-2 text-display-xs font-semibold text-primary">{meta.name}</h1>
                  <p className="mt-1 text-sm text-tertiary">{meta.code}</p>
                </div>
                <div className="flex gap-3">
                  {mine && (
                    <>
                      <Button color="secondary-destructive" iconLeading={Trash01} onPress={() => setDeleting(true)} aria-label={t('Delete meta')} />
                      <Button color="secondary" iconLeading={Edit01} onPress={() => setEditing(true)}>
                        {t('Edit')}
                      </Button>
                    </>
                  )}
                  {mine && hasFeature('studio') && meta.type?.code === 'app' && (
                    <Button color="secondary" iconLeading={Dataflow03} onPress={() => navigate(`/studio/${meta.id}`)}>
                      {t('Open in studio')}
                    </Button>
                  )}
                  {meta.type?.code === 'website' && (
                    <Button color="secondary" iconLeading={Dataflow03} onPress={() => navigate(`/sites/${meta.id}`)}>
                      {t('Open in website manager')}
                    </Button>
                  )}
                  {meta.type?.code && meta.type.code !== 'website' && (
                    <Button iconLeading={PlayCircle} onPress={() => navigate(`/run/${meta.id}`)}>
                      {t('Open')}
                    </Button>
                  )}
                </div>
              </div>
              {meta.description && <p className="max-w-prose text-md text-tertiary">{meta.description}</p>}
              <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <Detail term={t('Table')} value={meta.table_name} />
                <Detail
                  term={t('Refers to')}
                  value={
                    meta.ref_meta ? (
                      <Link to={`/metas/${meta.ref_meta.id}`} className="font-semibold text-brand-secondary hover:text-brand-secondary_hover">
                        {meta.ref_meta.name}
                      </Link>
                    ) : null
                  }
                />
                <Detail
                  term={t('Status')}
                  value={
                    <BadgeWithDot type="pill-color" size="sm" color={meta.is_active ? 'success' : 'gray'}>
                      {meta.is_active ? t('Active') : t('Inactive')}
                    </BadgeWithDot>
                  }
                />
              </dl>
            </div>
          </header>

          {!mine && (
            <div className="mb-8">
              <Alert>{t('You can only change metas you made.')}</Alert>
            </div>
          )}

          {mine && (
            <MetaSections
              key={`${meta.id}-${revision}`}
              sections={sectionsFor(meta, options, isAdmin, {
                paramsVersion,
                onParamsChanged: () => setParamsVersion((v) => v + 1),
                onSaved: load,
                onRestored: async () => {
                  await load();
                  setRevision((r) => r + 1);
                },
              })}
            />
          )}

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
              title={t('Delete {name}?', { name: meta.name })}
              message={t("Everything inside it is deleted too. Other metas that link to it will lose that link. This can't be undone.")}
              confirmLabel={t('Delete meta')}
              busy={deleteBusy}
              onConfirm={confirmDelete}
              onCancel={() => setDeleting(false)}
            />
          )}
        </>
      )}
    </>
  );
}

type MetaSection = { id: string; label: string; node: ReactNode };

/** The type's own settings, shown before its rows (they say what the rows below mean). */
const SETTINGS_FIRST: Record<string, string> = {
  statement: 'Statement',
  report: 'Document',
  excel_import: 'Excel import',
  stage_query: 'SQL',
  workspace: 'Workspace',
};

/** Designer types: one big editor instead of the rows list. */
const DESIGNERS = ['chart', 'dashboard', 'notification', 'page', 'widget_template', 'theme', 'query', 'matrix', 'widget'];

/** "Columns", "Menu items", "Statuses": what the rows list holds for this type. */
function rowsLabel(code?: string | null): string {
  const noun = typeLook(code).rowNoun;
  const plural = noun.endsWith('s') ? `${noun}es` : `${noun}s`;
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/**
 * The meta's builder sections, in menu order: what it's made of first (its rows or its designer,
 * with the type's own settings), then how it behaves, then who may use it, its translations and
 * versions (admins only).
 */
function sectionsFor(
  meta: Meta,
  options: MetaOption[],
  isAdmin: boolean,
  { paramsVersion, onParamsChanged, onSaved, onRestored }: { paramsVersion: number; onParamsChanged: () => void; onSaved: () => void; onRestored: () => Promise<void> },
): MetaSection[] {
  const code = meta.type?.code ?? '';
  const list: MetaSection[] = [];
  const add = (id: string, label: string, node: ReactNode) => list.push({ id, label: t(label), node });

  if (code in SETTINGS_FIRST) {
    add(
      'settings',
      SETTINGS_FIRST[code],
      code === 'statement' ? (
        <StatementDesigner meta={meta} options={options} />
      ) : code === 'report' ? (
        <ReportDesigner meta={meta} />
      ) : code === 'excel_import' ? (
        <ExcelImportDesigner meta={meta} />
      ) : code === 'stage_query' ? (
        <StageQueryPanel key={meta.query_string ?? ''} meta={meta} onParamsChanged={onParamsChanged} />
      ) : (
        <WorkspaceDesigner key={meta.ref_meta_id ?? 0} meta={meta} />
      ),
    );
  }

  if (code === 'workflow') {
    add('main', 'Statuses', <WorkflowDesigner meta={meta} options={options} />);
    add('status-permissions', 'Status permissions', <StatusPermissionsPanel meta={meta} />);
  } else if (DESIGNERS.includes(code)) {
    add(
      'main',
      'Design',
      code === 'chart' ? (
        // Keyed on the source too, so editing the table or query reloads the columns.
        <ChartDesigner key={`${meta.table_name}-${meta.query_string}`} meta={meta} options={options} />
      ) : code === 'dashboard' ? (
        <DashboardDesigner meta={meta} options={options} />
      ) : code === 'notification' ? (
        <NotificationDesigner meta={meta} options={options} />
      ) : code === 'page' || code === 'widget_template' ? (
        <PageDesigner meta={meta} options={options} />
      ) : code === 'theme' ? (
        <ThemeDesigner meta={meta} options={options} />
      ) : code === 'query' ? (
        <QueryDesigner meta={meta} />
      ) : code === 'matrix' ? (
        <MatrixDesigner meta={meta} options={options} />
      ) : (
        <WidgetDesigner key={meta.widget_id ?? 0} meta={meta} options={options} onSaved={onSaved} />
      ),
    );
  } else {
    add('main', rowsLabel(code), <MetaParamsPanel key={paramsVersion} meta={meta} options={options} />);
  }

  if (code === 'datagrid') {
    add('buttons', 'Buttons', <MetaActionsPanel meta={meta} options={options} />);
    add('drilldown', 'Drilldown', <GridDrilldownPanel meta={meta} options={options} />);
    add('filters', 'Filters', <GridFilterLayoutPanel meta={meta} />);
    add('layout', 'Layout', <GridColumnsPanel meta={meta} />);
  }
  if (code === 'form') add('form', 'Layout and buttons', <FormSettingsPanel meta={meta} options={options} />);
  if (code === 'app') {
    add('menu', 'App menu', <AppSettingsPanel meta={meta} />);
    add('phone', 'Phone app', <MobileSettingsPanel meta={meta} />);
  }
  if (isAdmin && code === 'form') add('process-flow', 'Process flow', <ProcessFlowPanel meta={meta} options={options} />);
  if (isAdmin && code === 'structure') add('table', 'Table', <StructurePanel key={meta.table_name ?? ''} meta={meta} />);

  if (isAdmin && code !== 'workflow') add('permissions', 'Permissions', <MetaPermissionsPanel meta={meta} />);
  if (isAdmin && code !== 'theme') add('translations', 'Translations', <TranslationsPanel key={paramsVersion} meta={meta} />);
  if (isAdmin) add('versions', 'Versions', <VersionsPanel meta={meta} onRestored={onRestored} />);
  return list;
}

/**
 * The sections down the side (a sideways row on a phone) and the picked one beside them. The pick
 * is in the address (?section=), so reloading or going back keeps it. A section stays mounted
 * once opened, only hidden, so edits not yet saved survive a look at another one.
 */
function MetaSections({ sections }: { sections: MetaSection[] }) {
  const [params, setParams] = useSearchParams();
  const current = sections.find((s) => s.id === params.get('section')) ?? sections[0];
  const [opened, setOpened] = useState<string[]>([]);
  if (current && !opened.includes(current.id)) setOpened([...opened, current.id]);

  if (!current) return null;
  if (sections.length === 1) return <div>{current.node}</div>;

  const pick = (id: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id === sections[0].id) next.delete('section');
        else next.set('section', id);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-6">
      <nav aria-label={t('Meta sections')} className="mb-6 lg:sticky lg:top-6 lg:mb-0 lg:self-start">
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
          {sections.map((s) => (
            <li key={s.id} className="shrink-0">
              <button type="button" className={`${sideNavItemClass(s.id === current.id)} font-semibold whitespace-nowrap`} aria-current={s.id === current.id ? 'true' : undefined} onClick={() => pick(s.id)}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        {sections
          .filter((s) => opened.includes(s.id) || s.id === current.id)
          .map((s) => (
            <div key={s.id} hidden={s.id !== current.id}>
              {s.node}
            </div>
          ))}
      </div>
    </div>
  );
}

function Detail({ term, value }: { term: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-tertiary">{term}</dt>
      <dd className="mt-0.5 font-medium text-primary">{value || <span className="font-normal text-quaternary">{t('Not set')}</span>}</dd>
    </div>
  );
}

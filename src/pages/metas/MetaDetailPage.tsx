import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaType } from '../../lib/metaApi';
import { libraryApi } from '../../lib/libraryApi';
import { ArrowLeft, Dataflow03, PlayCircle, Trash01 } from '@untitledui/icons';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { ConfirmDialog } from '../../components/Modal';
import { typeLook } from '../../components/TypePreview';
import { sideNavItemClass } from './sideNav';
import { MetaFormModal, usesRefersTo, type MetaFormPart } from './MetaFormModal';
import { ChartDesigner } from './ChartDesigner';
import { DashboardDesigner } from './DashboardDesigner';
import { MetaActionsPanel } from './MetaActionsPanel';
import {
  AppPicturePanel,
  MetaExportPanel,
  WhereUsedPanel,
  AppSettingsPanel,
  MobileSettingsPanel,
  ExcelImportDesigner,
  FormSettingsPanel,
  GridColumnsPanel,
  GridDrilldownPanel,
  GridFilterLayoutPanel,
  MatrixDesigner,
  ReportDesigner,
  StageQueryPanel,
  StatementDesigner,
  WorkspaceDesigner,
} from './MetaSettings';
import { MetaParamsPanel } from './MetaParamsPanel';
import { ProcessFlowPanel } from './ProcessFlowPanel';
import { StructurePanel } from './StructurePanel';
import { VersionsPanel } from './VersionsPanel';
import { NotificationDesigner } from './NotificationDesigner';
import { ThemeDesigner } from './ThemeDesigner';
import { MenuStyleDesigner } from './MenuStyleDesigner';
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
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Bumped after a version is restored, so every panel below reloads what it shows.
  const [revision, setRevision] = useState(0);
  // Counts saves of the options: each options section starts again from what was saved, so one
  // section saving never sends another's stale values.
  const [optionsSaved, setOptionsSaved] = useState(0);
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
      setError(err instanceof ApiError && err.status === 404 ? t('This meta no longer exists.') : err instanceof ApiError ? err.message : t('This meta could not be loaded.'));
    }
  }, [metaId, isAdmin, access]);

  useEffect(() => {
    load();
  }, [load]);

  // For Recent on the Meta studio pages.
  useEffect(() => {
    if (meta?.id) libraryApi.viewed(meta.id).catch(() => undefined);
  }, [meta?.id]);

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

  const mine = designs(meta);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {/* Where you are: back to the list, then this meta's name. */}
        <nav aria-label={t('Breadcrumb')} className="flex min-w-0 items-center gap-2 text-sm">
          <Link to="/metas" state={{ keepScroll: true }} className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-tertiary hover:text-tertiary_hover">
            <ArrowLeft className="size-5 text-fg-quaternary" />
            {t('All metas')}
          </Link>
          {meta && (
            <>
              <span aria-hidden="true" className="text-quaternary">
                /
              </span>
              <span aria-current="page" className="truncate font-semibold text-primary">
                {meta.name}
              </span>
            </>
          )}
        </nav>
        {/* Quiet buttons, so the section's Save stays the one blue button. */}
        {meta && (
          <div className="flex flex-wrap gap-2">
            {mine && hasFeature('studio') && meta.type?.code === 'app' && (
              <Button size="sm" color="secondary" iconLeading={Dataflow03} onPress={() => navigate(`/studio/${meta.id}`)}>
                {t('Open in studio')}
              </Button>
            )}
            {isAdmin && meta.type?.code === 'query' && (
              <Button size="sm" color="secondary" iconLeading={Dataflow03} onPress={() => navigate(`/query-builder/${meta.id}`)}>
                {t('Open in query builder')}
              </Button>
            )}
            {(meta.type?.code === 'page' || meta.type?.code === 'widget_template') && (
              <Button size="sm" color="secondary" iconLeading={Dataflow03} onPress={() => navigate(`/page-builder/${meta.id}`)}>
                {t('Open in page builder')}
              </Button>
            )}
            {meta.type?.code === 'website' && (
              <Button size="sm" color="secondary" iconLeading={Dataflow03} onPress={() => navigate(`/sites/${meta.id}`)}>
                {t('Open in website manager')}
              </Button>
            )}
            {meta.type?.code && meta.type.code !== 'website' && (
              <Button size="sm" color="secondary" iconLeading={PlayCircle} onPress={() => navigate(`/run/${meta.id}`)}>
                {t('Open')}
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      {!meta && !error && <SectionsSkeleton />}

      {meta && (
        <>
          {!mine && (
            <div className="mb-8">
              <Alert>{t('You can only change metas you made.')}</Alert>
            </div>
          )}

          {mine && (
            <MetaSections
              key={`${meta.id}-${revision}`}
              sections={sectionsFor(meta, options, isAdmin, {
                // Its options (what Edit used to open), a section for each use, and deleting it.
                optionsPart: (parts, title, description, extra) => (
                  <div className="space-y-6">
                    <MetaFormModal
                      key={optionsSaved}
                      inline
                      parts={parts}
                      title={title}
                      description={description}
                      meta={meta}
                      types={types}
                      options={options}
                      onClose={() => {}}
                      onSaved={async () => {
                        await load();
                        setOptionsSaved((n) => n + 1);
                      }}
                    />
                    {extra}
                  </div>
                ),
                deleteCard: (
                  <section aria-label={t('Delete meta')} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-primary px-4 py-4 shadow-xs ring-1 ring-error_subtle sm:px-5">
                    <div className="min-w-0">
                      <h2 className="text-md font-semibold text-primary">{t('Delete this meta')}</h2>
                      <p className="mt-0.5 text-sm text-tertiary">{t('Everything inside it goes too.')}</p>
                    </div>
                    <Button color="secondary-destructive" iconLeading={Trash01} onPress={() => setDeleting(true)}>
                      {t('Delete meta')}
                    </Button>
                  </section>
                ),
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

/** While the meta loads (opened by its address; from the list it is usually loaded already): the side list and a section, not a blank box. */
function SectionsSkeleton() {
  return (
    <div aria-busy="true" aria-label={t('Loading')} className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-6 motion-safe:[&_.bone]:animate-pulse">
      <div className="mb-6 flex gap-2 lg:mb-0 lg:flex-col">
        {[70, 55, 80, 60, 65].map((w, i) => (
          <div key={i} className="bone h-8 rounded-md bg-secondary" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="space-y-4 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
        <div className="bone h-5 w-40 rounded bg-secondary" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="bone h-10 rounded-lg bg-secondary" />
        ))}
      </div>
    </div>
  );
}

type MetaSection = { id: string; label: string; node: ReactNode; danger?: boolean };

/** The type's own settings, shown before its rows (they say what the rows below mean). */
const SETTINGS_FIRST: Record<string, string> = {
  statement: 'Statement',
  report: 'Document',
  excel_import: 'Excel import',
  stage_query: 'SQL',
  workspace: 'Workspace',
};

/** Designer types: one big editor instead of the rows list. */
const DESIGNERS = ['chart', 'dashboard', 'notification', 'theme', 'menu_style', 'matrix', 'widget'];

/** What a designer type's one big section is called in the side list. */
const DESIGNER_NAMES: Record<string, string> = {
  chart: 'Chart',
  dashboard: 'Dashboard',
  notification: 'Notification',
  theme: 'Theme',
  menu_style: 'Menu style',
  matrix: 'Matrix',
  widget: 'Widget',
};

/** Types made in a full-screen builder (Open in query builder / page builder): no section for it here. */
const FULL_SCREEN = ['query', 'page', 'widget_template'];

/** "Columns", "Menu items", "Statuses": what the rows list holds for this type. */
function rowsLabel(code?: string | null): string {
  const noun = typeLook(code).rowNoun;
  const plural = noun.endsWith('s') ? `${noun}es` : `${noun}s`;
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/**
 * The meta's builder sections, in menu order: what it's made of first (its rows or its designer,
 * with the type's own settings), then how it behaves, its options (and deleting it), then who may
 * use it, its translations and versions (admins only).
 */
function sectionsFor(
  meta: Meta,
  options: MetaOption[],
  isAdmin: boolean,
  {
    optionsPart,
    deleteCard,
    paramsVersion,
    onParamsChanged,
    onSaved,
    onRestored,
  }: {
    optionsPart: (parts: MetaFormPart[], title: string, description: string, extra?: ReactNode) => ReactNode;
    deleteCard: ReactNode;
    paramsVersion: number;
    onParamsChanged: () => void;
    onSaved: () => void;
    onRestored: () => Promise<void>;
  },
): MetaSection[] {
  const code = meta.type?.code ?? '';
  const list: MetaSection[] = [];
  const add = (id: string, label: string, node: ReactNode) => list.push({ id, label: t(label), node });

  add('general', 'General', optionsPart(['name'], t('General'), t('Its name, code, description and tags.')));

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
  } else if (FULL_SCREEN.includes(code)) {
    // Nothing: the header's Open in … builder button edits it.
  } else if (DESIGNERS.includes(code)) {
    add(
      'main',
      DESIGNER_NAMES[code] ?? 'Design',
      code === 'chart' ? (
        // Keyed on the source too, so editing the table or query reloads the columns.
        <ChartDesigner key={`${meta.table_name}-${meta.query_string}`} meta={meta} options={options} />
      ) : code === 'dashboard' ? (
        <DashboardDesigner meta={meta} options={options} />
      ) : code === 'notification' ? (
        <NotificationDesigner meta={meta} options={options} />
      ) : code === 'theme' ? (
        <ThemeDesigner meta={meta} options={options} />
      ) : code === 'menu_style' ? (
        <MenuStyleDesigner meta={meta} />
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
    add('picture', 'Pictures', <AppPicturePanel meta={meta} />);
    add('phone', 'Phone app', <MobileSettingsPanel meta={meta} />);
  }
  if (isAdmin && code === 'form') add('process-flow', 'Process flow', <ProcessFlowPanel meta={meta} options={options} />);
  if (isAdmin && code === 'structure') add('table', 'Table', <StructurePanel key={meta.table_name ?? ''} meta={meta} />);

  // The options, a section for each use. Data source: its table for everyone, the query and an
  // outside service for admins (a stage query edits its SQL above instead).
  if (!['app', 'tabs', 'theme', 'menu_style', 'website', 'screen'].includes(code)) {
    add('data-source', 'Data source', optionsPart(['table', 'query', 'service'], t('Data source'), isAdmin ? t('Its table, query or outside service.') : t('The table its records are kept in.')));
  }
  if (isAdmin && code === 'form') add('scripts', 'Scripts', optionsPart(['scripts'], t('Scripts'), t('JavaScript run on load, change and save.')));
  add('access', 'Links & access', optionsPart(['links'], t('Links & access'), usesRefersTo(code, meta.ref_meta_id) ? t('What it refers to, and who may open it.') : t('Active, and who may open it.')));
  if (isAdmin) add('usage', 'Where used', <WhereUsedPanel meta={meta} />);
  if (isAdmin) add('export', 'Export', <MetaExportPanel meta={meta} />);
  if (isAdmin && code !== 'workflow') add('permissions', 'Permissions', <MetaPermissionsPanel meta={meta} />);
  if (isAdmin && code !== 'theme' && code !== 'menu_style') add('translations', 'Translations', <TranslationsPanel key={paramsVersion} meta={meta} />);
  if (isAdmin) add('versions', 'Versions', <VersionsPanel meta={meta} onRestored={onRestored} />);
  list.push({ id: 'delete', label: t('Delete meta'), node: deleteCard, danger: true });
  return list;
}

/**
 * The sections down the side (a sideways row on a phone) and the picked one beside them. The pick
 * is in the address (?section=), so reloading or going back keeps it. A section stays mounted
 * once opened, only hidden, so edits not yet saved survive a look at another one.
 */
/** The side list's groups, by section id; sections not named here (its own build sections) go under Build. */
const SECTION_GROUPS: Record<string, string> = {
  general: '',
  'data-source': 'Data & access',
  scripts: 'Data & access',
  access: 'Data & access',
  usage: 'Admin',
  export: 'Admin',
  permissions: 'Admin',
  translations: 'Admin',
  versions: 'Admin',
  delete: '',
};
const groupOf = (s: MetaSection) => (s.id in SECTION_GROUPS ? SECTION_GROUPS[s.id] : 'Build');

function MetaSections({ sections }: { sections: MetaSection[] }) {
  const [params, setParams] = useSearchParams();
  // Every meta opens on General.
  const first = sections.find((s) => s.id === 'general') ?? sections[0];
  const current = sections.find((s) => s.id === params.get('section')) ?? first;
  const [opened, setOpened] = useState<string[]>([]);
  if (current && !opened.includes(current.id)) setOpened([...opened, current.id]);

  if (!current) return null;
  if (sections.length === 1) return <div>{current.node}</div>;

  const pick = (id: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id === first.id) next.delete('section');
        else next.set('section', id);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-6">
      <nav aria-label={t('Meta sections')} className="mb-6 lg:sticky lg:top-6 lg:mb-0 lg:self-start">
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
          {sections.map((s, i) => (
            <li key={s.id} className={s.danger ? 'shrink-0 lg:mt-4 lg:border-t lg:border-secondary lg:pt-4' : 'shrink-0'}>
              {/* Where a group starts, its name, then a line (wide screens only; a phone gets one sideways row). */}
              {groupOf(s) && (i === 0 || groupOf(s) !== groupOf(sections[i - 1])) ? (
                <p className="mt-4 mb-1.5 hidden items-center gap-2 text-[11px] font-semibold tracking-wider text-quaternary uppercase px-2.5 lg:flex">
                  {t(groupOf(s))}
                  <span aria-hidden="true" className="h-px flex-1 bg-border-secondary" />
                </p>
              ) : null}
              <button type="button" className={`${sideNavItemClass(s.id === current.id)} whitespace-nowrap`} aria-current={s.id === current.id ? 'true' : undefined} onClick={() => pick(s.id)}>
                {s.danger ? <span className="text-error-primary">{s.label}</span> : s.label}
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

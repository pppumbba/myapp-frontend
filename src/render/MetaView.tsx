import { useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { MetaParam } from '../lib/metaApi';
import { Alert } from '../components/ui';
import { Tab, TabList, TabPanel, Tabs } from '@/components/application/tabs/tabs';
import { CalendarView } from './CalendarView';
import { ChartCard, DashboardView } from './DashboardView';
import { FormView } from './FormView';
import { GanttView } from './GanttView';
import { GridView } from './GridView';
import { ImportView } from './ImportView';
import { PageView, WidgetMetaView } from './PageView';
import { ReportView } from './ReportView';
import { MatrixView } from './MatrixView';
import { StageQueryView } from './StageQueryView';
import { StatementView } from './StatementView';
import { WorkspaceView } from './WorkspaceView';
import { presetOf, useMetaDef, type MetaDef, type Preset } from './definitions';
import { useAuth } from '../auth/AuthContext';

// Tabs can hold tabs; stop before a meta that (by mistake) contains itself loops forever.
const MAX_DEPTH = 4;

/**
 * Renders any non-app meta by its type. Apps are handled by AppView, which hosts these.
 * preset: values from the tab or menu item showing it (see presetOf): a grid's starting
 * and fixed filters, a form's starting and fixed values.
 */
export function MetaView({ metaId, depth = 0, preset: given }: { metaId: number; depth?: number; preset?: Preset }) {
  const { def, error } = useMetaDef(metaId);
  // Kept by value: a new object each render would reload the form it gives fixed values to.
  const presetKey = JSON.stringify(given ?? null);
  const preset = useMemo(() => given, [presetKey]);
  // A link like /run/{form or report}?record=12 (e.g. from a notification) opens that record.
  const { pathname } = useLocation();
  const [search] = useSearchParams();
  const linked = pathname === `/run/${metaId}` ? search.get('record') : null;

  if (error) return <Alert>{error}</Alert>;
  if (!def) return <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />;
  if (depth > MAX_DEPTH) return <Alert>These screens are nested too deeply to show.</Alert>;

  switch (def.meta.type?.code) {
    case 'datagrid':
      return <GridView def={def} scope={preset?.fixed} initialFilters={preset?.filters} />;
    case 'form':
      return <FormView metaId={def.meta.id} recordId={linked} defaults={preset?.defaults} fixed={preset?.fixed} />;
    case 'calendar':
      return <CalendarView def={def} scope={preset?.fixed} initialFilters={preset?.filters} />;
    case 'gantt':
      return <GanttView def={def} scope={preset?.fixed} initialFilters={preset?.filters} />;
    case 'statement':
      return <StatementView def={def} scope={preset?.fixed} initialFilters={preset?.filters} />;
    case 'report':
      return <ReportView def={def} recordId={linked} />;
    case 'dashboard':
      return <DashboardView def={def} />;
    case 'chart':
      return <ChartCard metaId={def.meta.id} height={420} />;
    case 'page':
    case 'widget_template':
      return <PageView def={def} />;
    case 'widget':
      return <WidgetMetaView def={def} />;
    case 'notification':
      return <Alert>{`"${def.meta.name}" is a notification: it is sent by itself when its moment comes. Change it in the builder.`}</Alert>;
    case 'excel_import':
      return <ImportView def={def} />;
    case 'tabs':
      return <TabsView def={def} depth={depth} />;
    case 'workspace':
      return <WorkspaceView def={def} recordId={linked} />;
    case 'matrix':
      return <MatrixView def={def} />;
    case 'stage_query':
      return <StageQueryView def={def} defaults={preset?.defaults} />;
    case 'app':
      return <Alert>An app can't be opened inside another screen. Open it on its own instead.</Alert>;
    default:
      return <Alert>{`"${def.meta.name}" has no type, so there is nothing to show.`}</Alert>;
  }
}

/**
 * A tabs meta: each param is a tab showing the meta it refers to, with the values its
 * json_config gives (filters, fixed, defaults: see presetOf).
 */
function TabsView({ def, depth }: { def: MetaDef; depth: number }) {
  const { user } = useAuth();
  const tabs = def.params.filter((p): p is MetaParam & { ref_meta_id: number } => p.is_show && !!p.ref_meta_id);

  if (!tabs.length) return <Alert>This tab set has no tabs that open a screen yet.</Alert>;

  return (
    <Tabs>
      <TabList type="underline" size="sm" aria-label={def.meta.name} className="mb-6">
        {tabs.map((t) => (
          <Tab key={t.id} id={String(t.id)} label={t.label_name || t.param_name} />
        ))}
      </TabList>
      {tabs.map((t) => (
        <TabPanel key={t.id} id={String(t.id)}>
          <MetaView metaId={t.ref_meta_id} depth={depth + 1} preset={presetOf(t, user)} />
        </TabPanel>
      ))}
    </Tabs>
  );
}

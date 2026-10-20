import type { MetaParam } from '../lib/metaApi';
import { Alert } from '../components/ui';
import { Tab, TabList, TabPanel, Tabs } from '@/components/application/tabs/tabs';
import { CalendarView } from './CalendarView';
import { FormView } from './FormView';
import { GanttView } from './GanttView';
import { GridView } from './GridView';
import { useMetaDef, type MetaDef } from './definitions';

// Tabs can hold tabs; stop before a meta that (by mistake) contains itself loops forever.
const MAX_DEPTH = 4;

/** Renders any non-app meta by its type. Apps are handled by AppView, which hosts these. */
export function MetaView({ metaId, depth = 0 }: { metaId: number; depth?: number }) {
  const { def, error } = useMetaDef(metaId);

  if (error) return <Alert>{error}</Alert>;
  if (!def) return <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />;
  if (depth > MAX_DEPTH) return <Alert>These screens are nested too deeply to show.</Alert>;

  switch (def.meta.type?.code) {
    case 'datagrid':
      return <GridView def={def} />;
    case 'form':
      return <FormView metaId={def.meta.id} />;
    case 'calendar':
      return <CalendarView def={def} />;
    case 'gantt':
      return <GanttView def={def} />;
    case 'tabs':
      return <TabsView def={def} depth={depth} />;
    case 'app':
      return <Alert>An app can't be opened inside another screen. Open it on its own instead.</Alert>;
    default:
      return <Alert>{`"${def.meta.name}" has no type, so there is nothing to show.`}</Alert>;
  }
}

/** A tabs meta: each param is a tab showing the meta it refers to. */
function TabsView({ def, depth }: { def: MetaDef; depth: number }) {
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
          <MetaView metaId={t.ref_meta_id} depth={depth + 1} />
        </TabPanel>
      ))}
    </Tabs>
  );
}

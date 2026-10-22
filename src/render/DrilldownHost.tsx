import { useCallback, useState, type ReactNode } from 'react';
import { ChevronRight } from '@untitledui/icons';
import { Modal } from '../components/Modal';
import { Alert } from '../components/ui';
import { FormView } from './FormView';
import { GridView } from './GridView';
import { MetaView } from './MetaView';
import { ReportView } from './ReportView';
import { StatementView } from './StatementView';
import { WorkspaceView } from './WorkspaceView';
import { title, useMetaDef } from './definitions';
import { DrilldownContextProvider, useDrilldown, type DrillTarget } from './drilldown';

/**
 * Lets everything inside open drilldowns. They open in one modal; drilling further from
 * there stacks up, with a breadcrumb to step back. Inside another host it adds nothing, so
 * there is only ever one modal.
 */
export function DrilldownHost({ children }: { children: ReactNode }) {
  const parent = useDrilldown();
  const [stack, setStack] = useState<DrillTarget[]>([]);
  const open = useCallback((target: DrillTarget) => setStack((s) => [...s, target]), []);

  if (parent) return <>{children}</>;

  return (
    <DrilldownContextProvider value={open}>
      {children}
      {stack.length > 0 && <DrillModal stack={stack} onBack={(depth) => setStack((s) => s.slice(0, depth + 1))} onClose={() => setStack([])} />}
    </DrilldownContextProvider>
  );
}

function DrillModal({ stack, onBack, onClose }: { stack: DrillTarget[]; onBack: (depth: number) => void; onClose: () => void }) {
  const top = stack[stack.length - 1];
  const { def } = useMetaDef(top.metaId);

  return (
    <Modal title={def ? title(def.meta) : 'Loading…'} description={top.label} onClose={onClose} size="xl">
      {stack.length > 1 && (
        <nav aria-label="Drilldown path" className="-mt-3 mb-4">
          <ol className="flex flex-wrap items-center gap-1 text-sm">
            {stack.map((t, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-4 text-fg-quaternary" aria-hidden="true" />}
                {i === stack.length - 1 ? (
                  <span aria-current="page" className="font-semibold text-secondary">
                    {t.label}
                  </span>
                ) : (
                  <button type="button" onClick={() => onBack(i)} className="rounded font-medium text-tertiary outline-focus-ring hover:text-tertiary_hover focus-visible:outline-2">
                    {t.label}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      {/* Keyed on the depth so stepping back starts the view fresh. */}
      <DrillTargetView key={stack.length} target={top} />
    </Modal>
  );
}

/** The target meta, given the drilldown's values as filters, parameters or the record to open. */
function DrillTargetView({ target }: { target: DrillTarget }) {
  const { def, error } = useMetaDef(target.metaId);
  if (error) return <Alert>{error}</Alert>;
  if (!def) return <div className="h-64 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />;

  switch (def.meta.type?.code) {
    case 'datagrid':
      return <GridView def={def} fixed={target.params} />;
    case 'statement':
      return <StatementView def={def} fixed={target.params} />;
    case 'report':
      return <ReportView def={def} recordId={target.params.id ?? null} />;
    case 'form':
      return <FormView metaId={def.meta.id} recordId={target.params.id ?? null} defaults={target.params} embedded />;
    case 'workspace':
      return <WorkspaceView def={def} recordId={target.params.id ?? null} />;
    default:
      return <MetaView metaId={def.meta.id} />;
  }
}

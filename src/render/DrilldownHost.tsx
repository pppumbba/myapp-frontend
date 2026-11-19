import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from '@untitledui/icons';
import { Dialog, Heading, Modal as AriaModal, ModalOverlay } from 'react-aria-components';
import { Modal } from '../components/Modal';
import { CloseButton } from '@/components/base/buttons/close-button';
import { cx } from '@/utils/cx';
import { Alert } from '../components/ui';
import { BlurWords, wordCount } from '../components/motion';
import { FormView } from './FormView';
import { GridView } from './GridView';
import { MetaView } from './MetaView';
import { ReportView } from './ReportView';
import { StatementView } from './StatementView';
import { WorkspaceView } from './WorkspaceView';
import { title, useMetaDef } from './definitions';
import { DrilldownContextProvider, useDrilldown, type DrillTarget } from './drilldown';
import { t } from '@/i18n';

/**
 * Lets everything inside open drilldowns. They open in one modal, a drawer from the right
 * (open_in "drawer") or full screen in place of the children (open_in "page"), as the first one
 * asks; drilling further from there stacks up in it, with a breadcrumb to step back. trail is
 * the page's own breadcrumb (an app's name and menu path): given one, the host draws it, and
 * full-screen drilldowns add to it. Inside another host it adds nothing, so there is only ever one.
 */
export function DrilldownHost({ children, trail, heading }: { children: ReactNode; trail?: string[]; /** Shown instead of the trail (the header menu style): the screen's name and description. */ heading?: { title: string; description?: string | null } }) {
  const parent = useDrilldown();
  const [stack, setStack] = useState<DrillTarget[]>([]);
  const open = useCallback((target: DrillTarget) => setStack((s) => [...s, target]), []);
  const onBack = (depth: number) => setStack((s) => s.slice(0, depth + 1));
  const onClose = () => setStack([]);
  const mode = stack[0]?.open ?? 'modal';
  const page = stack.length > 0 && mode === 'page';

  if (parent) return <>{children}</>;

  return (
    <DrilldownContextProvider value={open}>
      {/* A drilldown filling the page still needs the path back. */}
      {heading && !page ? (
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-primary">
            <BlurWords text={heading.title} />
          </h1>
          {heading.description && (
            <p className="mt-0.5 text-sm text-tertiary">
              <BlurWords text={heading.description} delay={wordCount(heading.title)} />
            </p>
          )}
        </div>
      ) : (
        (trail || heading || page) && <PagePath trail={trail ?? (heading ? [heading.title] : [t('Back')])} stack={page ? stack : []} onBack={onBack} onClose={onClose} />
      )}
      {/* Kept while a drilldown fills the page, so coming back finds the screen as it was. */}
      <div className={page ? 'hidden' : 'contents'}>{children}</div>
      {page && <DrillTargetView key={stack.length} target={stack[stack.length - 1]} />}
      {stack.length > 0 && mode === 'drawer' && <DrillDrawer stack={stack} onBack={onBack} onClose={onClose} />}
      {stack.length > 0 && mode === 'modal' && <DrillModal stack={stack} onBack={onBack} onClose={onClose} />}
    </DrilldownContextProvider>
  );
}

/**
 * The page's breadcrumb: its own trail, then what was drilled into full screen. The trail's
 * last step leads back to the screen, and each drilldown but the last back to itself.
 */
function PagePath({ trail, stack, onBack, onClose }: { trail: string[]; stack: DrillTarget[]; onBack: (depth: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  // A drilldown opened from far down a long grid starts at its top.
  useEffect(() => {
    if (stack.length) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [stack.length]);

  const steps = [
    ...trail.map((label, i) => ({ label, onPress: stack.length && i === trail.length - 1 ? onClose : undefined })),
    ...stack.map((item, i) => ({ label: item.label, onPress: i < stack.length - 1 ? () => onBack(i) : undefined })),
  ];
  return (
    <nav ref={ref} aria-label={t('Breadcrumb')} className="mb-5 scroll-mt-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-4 text-fg-quaternary" aria-hidden="true" />}
            {i === steps.length - 1 ? (
              <span aria-current="page" className="rounded-md bg-primary_hover px-2 py-0.5 font-semibold text-secondary">
                {step.label}
              </span>
            ) : step.onPress ? (
              <button type="button" onClick={step.onPress} className="rounded font-medium text-tertiary outline-focus-ring hover:text-tertiary_hover focus-visible:outline-2">
                {step.label}
              </button>
            ) : (
              <span className="font-medium text-tertiary">{step.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface DrillProps {
  stack: DrillTarget[];
  onBack: (depth: number) => void;
  onClose: () => void;
}

function DrillModal({ stack, onBack, onClose }: DrillProps) {
  const top = stack[stack.length - 1];
  const { def } = useMetaDef(top.metaId);

  return (
    // A datagrid gets the whole width and fills the height: only its rows scroll.
    <Modal title={def ? title(def.meta) : t('Loading…')} description={top.label} onClose={onClose} size={def?.meta.type?.code === 'datagrid' ? 'full' : 'xl'}>
      <DrillPath stack={stack} onBack={onBack} className="-mt-3 mb-4" />
      {/* Keyed on the depth so stepping back starts the view fresh. */}
      <DrillTargetView key={stack.length} target={top} fill />
    </Modal>
  );
}

/** The same as the modal, in a panel sliding in from the right that is as tall as the window. */
function DrillDrawer({ stack, onBack, onClose }: DrillProps) {
  const top = stack[stack.length - 1];
  const { def } = useMetaDef(top.metaId);
  const name = def ? title(def.meta) : t('Loading…');

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => !open && onClose()}
      className={({ isEntering, isExiting }) =>
        cx(
          'fixed inset-0 z-50 flex justify-end bg-overlay/70 outline-hidden backdrop-blur-[6px]',
          isEntering && 'duration-300 ease-out animate-in fade-in',
          isExiting && 'duration-200 ease-in animate-out fade-out',
        )
      }
    >
      <AriaModal
        className={({ isEntering, isExiting }) =>
          cx(
            'h-dvh w-full max-w-4xl bg-primary shadow-xl outline-hidden',
            isEntering && 'duration-300 ease-out animate-in slide-in-from-right',
            isExiting && 'duration-200 ease-in animate-out slide-out-to-right',
          )
        }
      >
        <Dialog aria-label={name} className="flex h-full flex-col outline-hidden">
          <header className="relative border-b border-secondary px-4 pt-5 pb-4 pr-14 sm:px-6">
            <Heading slot="title" className="text-lg font-semibold text-primary">
              {name}
            </Heading>
            {top.label && <p className="mt-0.5 text-sm text-tertiary">{top.label}</p>}
            <DrillPath stack={stack} onBack={onBack} className="mt-3" />
            <CloseButton onPress={onClose} slot={null} className="absolute top-3 right-3" />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <DrillTargetView key={stack.length} target={top} />
          </div>
        </Dialog>
      </AriaModal>
    </ModalOverlay>
  );
}

/** The breadcrumb back through what was drilled into; nothing until there are two. */
function DrillPath({ stack, onBack, className }: { stack: DrillTarget[]; onBack: (depth: number) => void; className?: string }) {
  if (stack.length < 2) return null;
  return (
    <nav aria-label={t('Drilldown path')} className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {stack.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-4 text-fg-quaternary" aria-hidden="true" />}
            {i === stack.length - 1 ? (
              <span aria-current="page" className="font-semibold text-secondary">
                {item.label}
              </span>
            ) : (
              <button type="button" onClick={() => onBack(i)} className="rounded font-medium text-tertiary outline-focus-ring hover:text-tertiary_hover focus-visible:outline-2">
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The target meta, given the drilldown's values as filters, parameters or the record to open. */
function DrillTargetView({ target, fill = false }: { target: DrillTarget; /** A grid fills the height it's given (in the modal). */ fill?: boolean }) {
  const { def, error } = useMetaDef(target.metaId);
  if (error) return <Alert>{error}</Alert>;
  if (!def) return <div className="h-64 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />;

  switch (def.meta.type?.code) {
    case 'datagrid':
      return <GridView def={def} fixed={target.params} fill={fill} />;
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

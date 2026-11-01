import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Trash01 } from '@untitledui/icons';
import { Dialog, Modal as UModal, ModalOverlay } from '@/components/application/modals/modal';
import { Button } from '@/components/base/buttons/button';
import { CloseButton } from '@/components/base/buttons/close-button';
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

type Edge = 'e' | 's' | 'se';

/** Smallest size a resized modal can shrink to, and how much of it must stay on screen when dragged. */
const MIN_W = 320;
const MIN_H = 200;
const KEEP_VISIBLE = 80;

/**
 * Untitled UI modal. React Aria handles Escape, clicking outside, focus trapping and
 * stopping the page behind from scrolling.
 *
 * Drag it by the header, resize it from the right/bottom edges or the corner. The header stays
 * fixed and only the body scrolls; a footer marked `modal-footer` sticks to the bottom.
 * With `fill`, phones get it at full height from the top, so its edges stay put as the content
 * changes and the on-screen keyboard covers none of it.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  size = 'md',
  fill = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fill?: boolean;
}) {
  const width = { sm: 'sm:max-w-100', md: 'sm:max-w-2xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }[size];
  const boxRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [active, setActive] = useState(false);

  /** Tracks one pointer gesture on the window until it is released. */
  const track = (e: ReactPointerEvent, onMove: (dx: number, dy: number) => void) => {
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    setActive(true);
    const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy);
    const up = () => {
      setActive(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startDrag = (e: ReactPointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input')) return;
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = offset;
    track(e, (dx, dy) => {
      // Keep the header reachable: never let it leave the top, and keep a strip on screen elsewhere.
      const x = Math.min(Math.max(dx, KEEP_VISIBLE - rect.right), window.innerWidth - KEEP_VISIBLE - rect.left);
      const y = Math.min(Math.max(dy, -rect.top), window.innerHeight - KEEP_VISIBLE - rect.top);
      setOffset({ x: start.x + x, y: start.y + y });
    });
  };

  const startResize = (edge: Edge) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = offset;
    track(e, (dx, dy) => {
      const w = edge === 's' ? rect.width : Math.min(Math.max(rect.width + dx, MIN_W), window.innerWidth - 16);
      const h = edge === 'e' ? rect.height : Math.min(Math.max(rect.height + dy, MIN_H), window.innerHeight - 16);
      setBox({ w, h });
      // The overlay centres the modal, so shift by half the growth to keep the top-left edge still.
      setOffset({ x: start.x + (w - rect.width) / 2, y: start.y + (h - rect.height) / 2 });
    });
  };

  return (
    <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && onClose()} className={fill ? 'max-sm:items-start' : undefined}>
      <UModal
        ref={boxRef}
        className={cx('relative flex flex-col max-sm:overflow-hidden', width, fill && 'max-sm:h-full', active && 'select-none')}
        style={{
          translate: `${offset.x}px ${offset.y}px`,
          ...(box && { width: box.w, height: box.h, maxWidth: 'none' }),
        }}
      >
        <Dialog aria-label={title} className="flex h-full flex-col overflow-hidden">
          <div
            onPointerDown={startDrag}
            className="relative shrink-0 cursor-move touch-none border-b border-secondary px-4 pt-4 pb-4 sm:px-6 sm:pt-6"
          >
            <CloseButton onPress={onClose} slot={null} className="absolute top-3 right-3" />
            <div className="pr-10">
              <h2 className="text-lg font-semibold text-primary">{title}</h2>
              {description && <p className="mt-1 text-sm text-tertiary">{description}</p>}
            </div>
          </div>
          <div className="modal-body min-h-0 flex-1 overflow-y-auto">
            <div className="p-4 sm:p-6">{children}</div>
          </div>
        </Dialog>

        <div onPointerDown={startResize('e')} className="absolute top-3 -right-1 bottom-3 w-2 cursor-ew-resize max-sm:hidden" />
        <div onPointerDown={startResize('s')} className="absolute -bottom-1 left-3 right-3 h-2 cursor-ns-resize max-sm:hidden" />
        <div
          onPointerDown={startResize('se')}
          className="absolute right-0 bottom-0 size-4 cursor-nwse-resize max-sm:hidden"
          aria-hidden
        >
          <svg viewBox="0 0 16 16" className="size-full text-fg-quaternary">
            <path d="M14 6 6 14M14 10l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </UModal>
    </ModalOverlay>
  );
}

/** Asks before something that can't be undone. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && onCancel()}>
      <UModal className="sm:max-w-100">
        <Dialog aria-label={title}>
          <div className="w-full p-4 sm:p-6">
            <FeaturedIcon icon={Trash01} color="error" theme="light" size="lg" />
            <h2 className="mt-4 text-lg font-semibold text-primary">{title}</h2>
            <p className="mt-1 text-sm text-tertiary">{message}</p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <Button size="lg" color="secondary" onPress={onCancel}>
                {t('Keep it')}
              </Button>
              <Button size="lg" color="primary-destructive" isLoading={busy} showTextWhileLoading onPress={onConfirm}>
                {busy ? t('Deleting…') : confirmLabel}
              </Button>
            </div>
          </div>
        </Dialog>
      </UModal>
    </ModalOverlay>
  );
}

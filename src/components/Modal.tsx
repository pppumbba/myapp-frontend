import type { ReactNode } from 'react';
import { Trash01 } from '@untitledui/icons';
import { Dialog, Modal as UModal, ModalOverlay } from '@/components/application/modals/modal';
import { Button } from '@/components/base/buttons/button';
import { CloseButton } from '@/components/base/buttons/close-button';
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon';

/**
 * Untitled UI modal. React Aria handles Escape, clicking outside, focus trapping and
 * stopping the page behind from scrolling.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  size = 'md',
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const width = { sm: 'sm:max-w-100', md: 'sm:max-w-2xl', lg: 'sm:max-w-3xl' }[size];

  return (
    <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
      <UModal className={width}>
        <Dialog aria-label={title}>
          <div className="relative w-full p-4 sm:p-6">
            <CloseButton onPress={onClose} slot={null} className="absolute top-3 right-3" />
            <div className="mb-5 pr-10">
              <h2 className="text-lg font-semibold text-primary">{title}</h2>
              {description && <p className="mt-1 text-sm text-tertiary">{description}</p>}
            </div>
            {children}
          </div>
        </Dialog>
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
                Keep it
              </Button>
              <Button size="lg" color="primary-destructive" isLoading={busy} showTextWhileLoading onPress={onConfirm}>
                {busy ? 'Deleting…' : confirmLabel}
              </Button>
            </div>
          </div>
        </Dialog>
      </UModal>
    </ModalOverlay>
  );
}

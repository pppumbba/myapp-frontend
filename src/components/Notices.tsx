import { useSyncExternalStore } from 'react';
import { AlertCircle, CheckCircle, InfoCircle, LogOut01 } from '@untitledui/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { Dialog, Modal as UModal, ModalOverlay } from '@/components/application/modals/modal';
import { Button } from '@/components/base/buttons/button';
import { CloseButton } from '@/components/base/buttons/close-button';
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon';
import { tokenStore } from '../lib/api';
import { closeError, dismissToast, notices, pauseToasts, resumeToasts, type ToastKind } from '../lib/notices';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

const KIND: Record<ToastKind, { icon: typeof CheckCircle; ink: string }> = {
  success: { icon: CheckCircle, ink: 'text-fg-success-primary' },
  info: { icon: InfoCircle, ink: 'text-fg-brand-primary' },
  error: { icon: AlertCircle, ink: 'text-fg-error-primary' },
};

/**
 * The toasts (bottom right) and the error dialog for the whole app. Website pages draw their own
 * messages in the site's look, so nothing shows over them.
 */
export function Notices() {
  const { toasts, error } = useSyncExternalStore(notices.subscribe, notices.get);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (/^\/site(-preview)?\//.test(pathname)) return null;

  const signIn = () => {
    closeError();
    tokenStore.clear();
    navigate('/login');
  };

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        onPointerEnter={pauseToasts}
        onPointerLeave={resumeToasts}
      >
        {toasts.map((toast) => {
          const { icon: Icon, ink } = KIND[toast.kind];
          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-center gap-3 rounded-xl bg-primary py-3 pr-2 pl-4 shadow-lg ring-1 ring-secondary motion-safe:animate-[toast-in_160ms_ease-out]"
            >
              <Icon className={cx('size-5 shrink-0', ink)} aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm font-semibold text-primary">
                {toast.message}
                {toast.count > 1 && <span className="ml-1.5 font-normal text-tertiary">×{toast.count}</span>}
              </p>
              <CloseButton size="sm" slot={null} label={t('Dismiss')} onPress={() => dismissToast(toast.id)} />
            </div>
          );
        })}
      </div>

      {error && (
        <ModalOverlay isOpen isDismissable={!error.session} onOpenChange={(open) => !open && closeError()}>
          <UModal className="sm:max-w-100">
            <Dialog aria-label={t(error.title)} role="alertdialog">
              <div className="w-full p-4 sm:p-6">
                <FeaturedIcon icon={error.session ? LogOut01 : AlertCircle} color={error.session ? 'gray' : 'error'} theme="light" size="lg" />
                <h2 className="mt-4 text-lg font-semibold text-primary">{t(error.title)}</h2>
                <p className="mt-1 text-sm whitespace-pre-line text-tertiary">{error.message}</p>
                {error.count > 1 && <p className="mt-2 text-xs text-quaternary">{t('This happened {n} times.', { n: error.count })}</p>}
                <div className="mt-8 flex justify-end gap-3">
                  {error.session ? (
                    <Button size="lg" color="primary" className="w-full" onPress={signIn}>
                      {t('Sign in again')}
                    </Button>
                  ) : (
                    <Button size="lg" color="secondary" className="w-full" onPress={closeError} autoFocus>
                      {t('Close')}
                    </Button>
                  )}
                </div>
              </div>
            </Dialog>
          </UModal>
        </ModalOverlay>
      )}
    </>
  );
}

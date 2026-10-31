import type { FC, ReactNode } from 'react';
import { AlertCircle } from '@untitledui/icons';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { wasShown } from '../lib/notices';
import { cx } from '@/utils/cx';

/** Error message in the Untitled UI alert style. */
export function Alert({ children }: { children: ReactNode }) {
  // The error dialog just said this (see lib/notices); saying it again under the dialog is noise.
  if (typeof children === 'string' && wasShown(children)) return null;
  return (
    <div role="alert" className="flex gap-3 rounded-xl bg-error-primary p-4 ring-1 ring-error_subtle ring-inset">
      <AlertCircle className="size-5 shrink-0 text-fg-error-primary" aria-hidden="true" />
      <p className="text-sm font-medium text-error-primary">{children}</p>
    </div>
  );
}

/** Small icon-only action. The label is the tooltip and the accessible name. */
export function IconAction({
  icon,
  label,
  onPress,
  danger,
  className,
}: {
  icon: FC<{ className?: string }>;
  label: string;
  onPress: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <ButtonUtility
      size="xs"
      color="tertiary"
      icon={icon}
      tooltip={label}
      aria-label={label}
      onPress={onPress}
      className={cx(danger && 'hover:bg-error-primary hover:text-fg-error-primary', className)}
    />
  );
}

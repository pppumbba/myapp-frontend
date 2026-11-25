import { useId, type ReactNode } from 'react';
import { HelpCircle } from '@untitledui/icons';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { t } from '@/i18n';

/**
 * One setting in a list of them on a meta's sections: its name on the left (the hint in a help
 * tooltip beside it), the control on the right. Put rows in a `divide-y divide-secondary` box so
 * a line parts them. `wide` lets the control use the whole right side (code, several fields side
 * by side). `stacked` puts the name above the control, for a narrow column.
 */
export function SettingRow({ title, hint, wide = false, stacked = false, children }: { title: string; hint?: ReactNode; wide?: boolean; stacked?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={id}
      className={stacked ? 'grid gap-y-2 py-3 first:pt-0 last:pb-0' : 'grid gap-x-8 gap-y-3 py-5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]'}
    >
      <div className="flex items-start gap-1">
        <p id={id} className="text-sm font-medium text-secondary">
          {title}
        </p>
        {hint && (
          <Tooltip title={hint} placement="top">
            <TooltipTrigger
              aria-label={t('About {name}', { name: title })}
              className="mt-0.5 cursor-pointer text-fg-quaternary transition duration-200 hover:text-fg-quaternary_hover focus:text-fg-quaternary_hover"
            >
              <HelpCircle className="size-4" />
            </TooltipTrigger>
          </Tooltip>
        )}
      </div>
      <div className={wide || stacked ? 'min-w-0 space-y-3' : 'min-w-0 max-w-lg space-y-3'}>{children}</div>
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import { CheckCircle, Copy01 } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { t } from '@/i18n';

/** A titled card, as on the profile page. */
export function Card({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={title}>
      <div className="flex items-start justify-between gap-3 border-b border-secondary px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-md font-semibold text-primary">{title}</h2>
          {description && <p className="text-sm text-tertiary">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

/** Good news, in green. */
export function Success({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex gap-3 rounded-xl bg-success-primary p-4 ring-1 ring-success-secondary ring-inset">
      <CheckCircle className="size-5 shrink-0 text-fg-success-primary" aria-hidden="true" />
      <p className="text-sm font-medium text-success-primary">{children}</p>
    </div>
  );
}

/** A link to hand to someone else, with a Copy button. */
export function ShareLink({ url, hint }: { url: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-sm text-tertiary">{hint}</p>
      <div className="flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg bg-secondary px-3 py-2 text-sm text-primary ring-1 ring-secondary ring-inset" />
        <Button
          size="sm"
          color="secondary"
          iconLeading={Copy01}
          onPress={() => {
            void navigator.clipboard?.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? t('Copied') : t('Copy')}
        </Button>
      </div>
    </div>
  );
}

/** A loading placeholder block. */
export function Pulse({ className = 'h-32' }: { className?: string }) {
  return <div className={`${className} animate-pulse rounded-xl bg-secondary motion-reduce:animate-none`} />;
}

import type { ReactNode } from 'react';

/** A group of related fields with a short heading; hideTitle keeps it for screen readers only (a form's one group). */
export function Section({ title, hideTitle = false, children }: { title: string; hideTitle?: boolean; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className={hideTitle ? 'sr-only' : 'mb-3 text-sm font-semibold text-primary'}>{title}</legend>
      {children}
    </fieldset>
  );
}

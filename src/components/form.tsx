import type { ReactNode } from 'react';

/** A group of related fields with a short heading. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-sm font-semibold text-primary">{title}</legend>
      {children}
    </fieldset>
  );
}

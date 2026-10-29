import type { ReactNode } from 'react';
import { Logo } from '../components/AppShell';
import { TypePreview, typeLook } from '../components/TypePreview';
import { t } from '@/i18n';

// The building blocks a user will assemble, shown as a loose stack on the brand panel.
const blocks: { code: string; label: string; offset: string }[] = [
  { code: 'app', label: 'App with menus', offset: 'translate-x-0' },
  { code: 'datagrid', label: 'Data grid', offset: 'translate-x-10' },
  { code: 'form', label: 'Form', offset: 'translate-x-3' },
  { code: 'calendar', label: 'Calendar', offset: 'translate-x-14' },
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-primary lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-90 py-12">
            <h1 className="text-display-xs font-semibold text-primary sm:text-display-sm">{title}</h1>
            <p className="mt-2 text-md text-tertiary sm:mt-3">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>

      <aside
        className="relative hidden overflow-hidden bg-brand-section lg:flex lg:flex-col lg:justify-center lg:px-16"
        aria-hidden="true"
      >
        <div className="absolute -top-24 -right-24 size-80 rounded-full bg-brand-500/30 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-400/20 blur-3xl" />
        <p className="relative max-w-md text-display-sm font-semibold text-white">
          {t("Build the apps your business runs on, one screen at a time.")}
        </p>
        <div className="relative mt-12 space-y-4">
          {blocks.map((b) => (
            <div key={b.code} className={`flex w-72 items-center gap-4 rounded-xl bg-primary p-3 shadow-xl ${b.offset}`}>
              <div className="w-20 shrink-0 rounded-lg p-1.5" style={{ background: typeLook(b.code).tint }}>
                <TypePreview code={b.code} className="w-full" />
              </div>
              <span className="text-sm font-semibold text-primary">{t(b.label)}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

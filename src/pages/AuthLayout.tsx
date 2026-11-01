import type { ReactNode } from 'react';
import { Logo } from '../components/AppShell';
import { TypePreview, typeLook } from '../components/TypePreview';
import { t } from '@/i18n';

/*
 * The brand panel draws the logo at full size: three squares stepping down the diagonal, each
 * smaller and fainter, and each one a thing the user builds. Sizes and offsets follow the logo's
 * proportions (14 : 9.5 : 5.5 with a 1.5 gap on a 32 square, see LogoMark), as shares of the square.
 */
const tiles: { code: string; label: string; box: string; tone: string; delay: string }[] = [
  { code: 'datagrid', label: 'Data grid', box: 'top-0 left-0 size-[43.75%]', tone: 'opacity-100', delay: 'delay-0' },
  { code: 'form', label: 'Form', box: 'top-[48.4%] left-[48.4%] size-[29.7%]', tone: 'opacity-75', delay: 'delay-150' },
  { code: 'calendar', label: 'Calendar', box: 'top-[82.8%] left-[82.8%] size-[17.2%]', tone: 'opacity-45', delay: 'delay-300' },
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-primary lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-12 sm:py-8">
        <Logo />
        <main className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-90 py-12">
            <h1 className="text-display-xs font-semibold text-primary sm:text-display-sm">{title}</h1>
            <p className="mt-2 text-md text-tertiary">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </main>
        <p className="text-xs text-quaternary">© {new Date().getFullYear()} Wand Studio</p>
      </div>

      <aside className="relative m-3 hidden overflow-hidden rounded-2xl bg-brand-section lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16" aria-hidden="true">
        {/* A faint dot grid: the page a builder lays things out on. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(color-mix(in_oklab,var(--color-white)_14%,transparent)_1px,transparent_1px)] bg-size-[24px_24px]" />

        <div className="relative max-w-md">
          <p className="text-display-xs font-semibold text-white xl:text-display-sm">{t('Build the apps your business runs on, one screen at a time.')}</p>
          <p className="mt-3 text-md text-white/70">{t('Grids, forms, calendars and dashboards, put together from the same few blocks.')}</p>
        </div>

        <div className="relative mx-auto mt-10 size-[min(34rem,calc(100dvh-23rem))] shrink-0">
          {tiles.map((tile) => (
            <figure
              key={tile.code}
              className={`absolute flex flex-col overflow-hidden rounded-xl bg-primary p-[6%] shadow-xl ${tile.box} ${tile.tone} animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ${tile.delay}`}
            >
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg p-[6%]" style={{ background: typeLook(tile.code).tint }}>
                <TypePreview code={tile.code} className="w-full" />
              </div>
              {tile.code !== 'calendar' && <figcaption className="mt-[5%] truncate text-sm font-semibold text-primary">{t(tile.label)}</figcaption>}
            </figure>
          ))}
        </div>
      </aside>
    </div>
  );
}

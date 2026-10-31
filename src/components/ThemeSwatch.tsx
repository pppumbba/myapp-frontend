import { brandScale, grayHex, radiusRem, type ThemeSettings } from '../lib/theme';

/** A small picture of a theme in its own colours: page, card, a line of text and a brand button. */
export function ThemeSwatch({ theme, dark, className = 'h-16 w-full' }: { theme: ThemeSettings; dark?: boolean; className?: string }) {
  const gray = grayHex(theme.gray);
  const brand = brandScale(theme.brand);
  const night = theme.mode === 'dark' || (theme.mode === 'any' && dark);
  const r = `${radiusRem(theme.radius, 0.375)}rem`;
  return (
    <div aria-hidden="true" className={`flex items-end gap-1.5 overflow-hidden p-2 ${className}`} style={{ background: night ? gray[10] : gray[1], borderRadius: r }}>
      <div className="flex flex-1 flex-col gap-1 p-1.5" style={{ background: night ? gray[9] : 'var(--color-white)', borderRadius: r, boxShadow: `inset 0 0 0 1px ${night ? gray[8] : gray[2]}` }}>
        <span className="h-1.5 w-3/4 rounded-full" style={{ background: night ? gray[3] : gray[8] }} />
        <span className="h-1.5 w-1/2 rounded-full" style={{ background: night ? gray[6] : gray[4] }} />
      </div>
      <span className="h-4 w-8 shrink-0" style={{ background: night ? brand[500] : brand[600], borderRadius: r }} />
    </div>
  );
}

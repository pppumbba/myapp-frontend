import { useState, type ReactNode } from 'react';
import { Check, Home01, File06, BarChart01, Users01, Settings01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import type { Meta } from '../../lib/metaApi';
import {
  BACKDROP_PRESETS,
  BASE_MENU,
  MENU_ANGLES,
  MENU_BACKGROUNDS,
  MENU_EDGES,
  MENU_GAPS,
  MENU_ITEMS,
  MENU_RADII,
  MENU_STARTS,
  MENU_WIDTHS,
  MENU_WIDTH_PX,
  gradientCss,
  isHex,
  menuStyleApi,
  menuSurface,
  type MenuGradient,
  type MenuSettings,
} from '../../lib/menuStyle';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Toggle } from '@/components/base/toggle/toggle';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

export const menuSettingsOf = (meta: Meta): MenuSettings => ({ ...BASE_MENU, ...((meta.json_config as { menu?: Partial<MenuSettings> } | null)?.menu ?? {}) });

const NAMES: Record<string, string> = {
  surface: 'Surface',
  subtle: 'Subtle',
  brand: 'Brand',
  dark: 'Dark',
  gradient: 'Gradient',
  line: 'Line',
  shadow: 'Shadow',
  none: 'None',
  sm: 'Small',
  md: 'Medium',
  lg: 'Large',
  narrow: 'Narrow',
  default: 'Default',
  wide: 'Wide',
  pill: 'Pill',
  bar: 'Bar',
  plain: 'Plain',
};
const STARTS: { id: keyof typeof MENU_STARTS; name: string }[] = [
  { id: 'classic', name: 'Classic' },
  { id: 'floating', name: 'Floating' },
  { id: 'inset', name: 'Inset' },
  { id: 'dark', name: 'Dark' },
];
const SAMPLE = [
  { icon: Home01, label: 'Home' },
  { icon: File06, label: 'Orders', current: true },
  { icon: Users01, label: 'Customers' },
  { icon: BarChart01, label: 'Reports' },
  { icon: Settings01, label: 'Settings' },
];

/**
 * A menu style meta's settings: background, edge, corners, gap, width, how the current item is
 * marked, and the inset frame. The preview on the right is drawn the way AppSidebar draws it.
 */
export function MenuStyleDesigner({ meta }: { meta: Meta }) {
  const [saved, setSaved] = useState(() => menuSettingsOf(meta));
  const [menu, setMenu] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const changed = JSON.stringify(menu) !== JSON.stringify(saved);

  const set = <K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) => {
    setMenu((item) => ({ ...item, [key]: value }));
    setDone(false);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const next = await menuStyleApi.save(meta.id, menu);
      setSaved(next);
      setMenu(next);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The menu style could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={t('Menu style')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-primary">{t('Menu style')}</h2>
          <p className="mt-0.5 text-sm text-tertiary">{t('How an app’s side menu looks. Apps pick it under App menu.')}</p>
        </div>
        <div className="flex items-center gap-3">
          {done && !changed && (
            <span role="status" className="flex items-center gap-1 text-sm font-medium text-success-primary">
              <Check className="size-4" aria-hidden="true" /> {t('Saved')}
            </span>
          )}
          {changed && (
            <Button size="sm" color="secondary" onPress={() => setMenu(saved)}>
              {t('Undo changes')}
            </Button>
          )}
          <Button size="sm" isDisabled={!changed} isLoading={busy} showTextWhileLoading onPress={save}>
            {t('Save menu style')}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 px-4 py-5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-6">
          {error && <Alert>{error}</Alert>}

          <Field label={t('Start from')} hint={t('Replaces the settings below with a built-in style’s.')}>
            <div className="flex flex-wrap gap-2">
              {STARTS.map((s) => (
                <Button key={s.id} size="sm" color="secondary" onPress={() => (setMenu(MENU_STARTS[s.id]), setDone(false))}>
                  {t(s.name)}
                </Button>
              ))}
            </div>
          </Field>

          <Field label={t('Background')} hint={t('Surface, subtle and brand follow the theme. Dark and darker colours get light text.')}>
            <div className="flex flex-wrap items-center gap-2">
              <ButtonGroup
                size="sm"
                aria-label={t('Background')}
                selectionMode="single"
                selectedKeys={isHex(menu.background) ? [] : [menu.background]}
                onSelectionChange={(keys) => [...keys][0] && set('background', String([...keys][0]))}
              >
                {MENU_BACKGROUNDS.map((b) => (
                  <ButtonGroupItem key={b} id={b}>
                    {t(NAMES[b])}
                  </ButtonGroupItem>
                ))}
              </ButtonGroup>
              <label className={cx('flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-secondary ring-1', isHex(menu.background) ? 'ring-brand' : 'ring-primary')}>
                <input
                  type="color"
                  value={isHex(menu.background) ? menu.background : '#1e293b'}
                  onChange={(e) => set('background', e.target.value.toLowerCase())}
                  aria-label={t('Any colour')}
                  className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span className="font-mono text-sm">{isHex(menu.background) ? menu.background : t('Colour')}</span>
              </label>
            </div>
            {menu.background === 'gradient' && (
              <div className="mt-3">
                <GradientPicker value={menu.gradient} onChange={(g) => set('gradient', g)} />
              </div>
            )}
          </Field>

          <Choice label={t('Edge')} value={menu.edge} items={MENU_EDGES} onChange={(v) => set('edge', v)} />
          <Choice label={t('Corners')} hint={t('Seen when the menu has a gap or a frame.')} value={menu.radius} items={MENU_RADII} onChange={(v) => set('radius', v)} />
          <Choice
            label={t('Gap from the page edge')}
            value={String(menu.gap)}
            items={MENU_GAPS.map(String)}
            names={(v) => (v === '0' ? t('None') : `${v} px`)}
            onChange={(v) => set('gap', Number(v) as MenuSettings['gap'])}
          />
          <Choice label={t('Width')} value={menu.width} items={MENU_WIDTHS} names={(v) => `${t(NAMES[v])} · ${MENU_WIDTH_PX[v as MenuSettings['width']]} px`} onChange={(v) => set('width', v)} />
          <Choice label={t('Current item')} value={menu.item} items={MENU_ITEMS} onChange={(v) => set('item', v)} />
          <Toggle label={t('Frame the screen')} hint={t('The screen sits as a rounded panel on the menu’s colour.')} isSelected={menu.frame} onChange={(v) => set('frame', v)} />

          <div className="space-y-5 border-t border-secondary pt-5">
            <Toggle
              label={t('Glass')}
              hint={t('See-through and blurred, so the backdrop shows through. Looks best with a backdrop and a frame or a gap.')}
              isSelected={menu.glass}
              onChange={(v) => set('glass', v)}
            />
            <Field label={t('Backdrop')} hint={t('A gradient behind the menu and the screens. Cards, grids and forms turn frosted glass so it glows through. Phones keep plain screens.')}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={!menu.backdrop}
                  onClick={() => set('backdrop', null)}
                  className={cx('h-8 rounded-lg px-3 text-sm font-medium ring-1 outline-focus-ring focus-visible:outline-2', !menu.backdrop ? 'text-brand-secondary ring-2 ring-brand' : 'text-secondary ring-primary hover:bg-primary_hover')}
                >
                  {t('None')}
                </button>
                {BACKDROP_PRESETS.map((p) => {
                  const on = JSON.stringify(menu.backdrop) === JSON.stringify(p.gradient);
                  return (
                    <button
                      key={p.name}
                      type="button"
                      aria-label={t(p.name)}
                      title={t(p.name)}
                      aria-pressed={on}
                      onClick={() => set('backdrop', p.gradient)}
                      style={{ background: gradientCss(p.gradient) }}
                      className={cx('size-8 rounded-lg outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2', on ? 'ring-2 ring-brand ring-offset-2 ring-offset-bg-primary' : 'ring-1 ring-secondary')}
                    />
                  );
                })}
              </div>
              {menu.backdrop && (
                <div className="mt-3">
                  <GradientPicker value={menu.backdrop} onChange={(g) => set('backdrop', g)} />
                </div>
              )}
            </Field>
          </div>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <MenuStylePreview menu={menu} />
        </div>
      </div>
    </section>
  );
}

/** A sample app with this menu, drawn with the same variables and item rules as AppSidebar. */
export function MenuStylePreview({ menu }: { menu: MenuSettings }) {
  const { dark, glass, vars } = menuSurface(menu);
  // The real widths, scaled to fit beside the settings.
  const width = Math.round(MENU_WIDTH_PX[menu.width] * 0.55);
  return (
    <div
      aria-hidden="true"
      data-menu-item={menu.item}
      style={vars as React.CSSProperties}
      className={cx(
        'flex h-80 overflow-hidden rounded-lg ring-1 ring-secondary',
        menu.backdrop ? '[background:var(--menu-backdrop)]' : menu.frame ? '[background:var(--menu-fill)]' : 'bg-secondary',
      )}
    >
      <div className="flex shrink-0" style={{ padding: menu.gap * 0.6 }}>
        <aside
          style={{ width }}
          className={cx(
            'flex flex-col gap-3 py-3 text-xs',
            (!menu.frame || glass) && '[background:var(--menu-fill)]',
            glass && 'menu-glass',
            dark && 'dark-mode scheme-dark',
            menu.edge === 'line' && 'border-r border-secondary',
            menu.edge === 'shadow' && 'shadow-lg ring-1 ring-secondary',
            'rounded-(--menu-radius)',
          )}
        >
          <p className="px-3 font-semibold text-primary">{t('Sample app')}</p>
          <nav className="flex flex-col gap-0.5 px-2">
            {SAMPLE.map(({ icon: Icon, label, current }) => (
              <a key={label} aria-current={current ? 'page' : undefined} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-secondary">
                <Icon className="size-3.5 text-fg-quaternary" />
                {t(label)}
              </a>
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-2 border-t border-secondary px-3 pt-2.5">
            <span className="size-5 rounded-full bg-quaternary" />
            <span className="h-1.5 w-12 rounded-full bg-quaternary" />
          </div>
        </aside>
      </div>
      <div
        className={cx(
          'flex-1 space-y-2 p-3',
          menu.frame && 'my-1.5 mr-1.5 rounded-lg ring-1',
          menu.frame && (menu.backdrop ? 'bg-secondary/35 ring-white/15 backdrop-blur-sm' : 'bg-secondary ring-secondary'),
        )}
      >
        <span className="block h-3 w-24 rounded-full bg-quaternary" />
        <span
          className={cx(
            'block h-full max-h-56 rounded-md ring-1 ring-secondary',
            // The same frost menu-style.css gives panels on a backdrop.
            menu.backdrop ? '[background:color-mix(in_srgb,var(--color-bg-primary)_72%,transparent)] backdrop-blur-md' : 'bg-primary',
          )}
        />
      </div>
    </div>
  );
}

/** Two ends (each brand or any colour) and an angle, with a strip showing the result. */
function GradientPicker({ value, onChange }: { value: MenuGradient; onChange: (g: MenuGradient) => void }) {
  const end = (key: 'from' | 'to', label: string) => {
    const brand = value[key] === 'brand';
    return (
      <div className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-secondary ring-1 ring-primary">
        <span className="text-xs text-tertiary">{label}</span>
        <input
          type="color"
          value={brand ? '#4f46e5' : value[key]}
          onChange={(e) => onChange({ ...value, [key]: e.target.value.toLowerCase() })}
          aria-label={label}
          className={cx('size-6 cursor-pointer rounded border-0 bg-transparent p-0', brand && 'opacity-40')}
        />
        <button
          type="button"
          aria-pressed={brand}
          onClick={() => onChange({ ...value, [key]: brand ? '#4f46e5' : 'brand' })}
          className={cx('rounded px-1.5 py-0.5 text-xs font-medium outline-focus-ring focus-visible:outline-2', brand ? 'bg-brand-primary_alt text-brand-secondary' : 'text-tertiary hover:bg-primary_hover')}
        >
          {t('Brand')}
        </button>
      </div>
    );
  };
  return (
    <div className="space-y-2">
      <span aria-hidden="true" className="block h-3 w-full max-w-sm rounded-full ring-1 ring-secondary" style={{ background: gradientCss(value) }} />
      <div className="flex flex-wrap items-center gap-2">
        {end('from', t('From'))}
        {end('to', t('To'))}
        <ButtonGroup
          size="sm"
          aria-label={t('Angle')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[String(value.angle)]}
          onSelectionChange={(keys) => onChange({ ...value, angle: Number([...keys][0]) as MenuGradient['angle'] })}
        >
          {MENU_ANGLES.map((a) => (
            <ButtonGroupItem key={a} id={String(a)}>
              {`${a}°`}
            </ButtonGroupItem>
          ))}
        </ButtonGroup>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-secondary">{label}</p>
      {hint && <p className="mb-2 text-sm text-tertiary">{hint}</p>}
      <div className={hint ? undefined : 'mt-1.5'}>{children}</div>
    </div>
  );
}

function Choice<T extends string>({ label, hint, value, items, names, onChange }: { label: string; hint?: string; value: T; items: T[]; names?: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <Field label={label} hint={hint}>
      <ButtonGroup size="sm" aria-label={label} selectionMode="single" disallowEmptySelection selectedKeys={[value]} onSelectionChange={(keys) => onChange([...keys][0] as T)}>
        {items.map((i) => (
          <ButtonGroupItem key={i} id={i}>
            {names ? names(i) : t(NAMES[i])}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
    </Field>
  );
}

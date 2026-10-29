import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import type { Meta, MetaOption } from '../../lib/metaApi';
import { BASE_THEME, BRAND_SWATCHES, DENSITIES, FONTS, GRAYS, RADII, themeApi, type ThemeSettings } from '../../lib/theme';
import { useTheme } from '../../components/ThemeProvider';
import { ThemeSample } from '../../components/ThemeSample';
import { ThemeSwatch } from '../../components/ThemeSwatch';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { NativeSelect } from '@/components/base/select/select-native';
import { Toggle } from '@/components/base/toggle/toggle';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

const settingsOf = (meta: Meta): ThemeSettings => ({ ...BASE_THEME, ...((meta.json_config as { theme?: Partial<ThemeSettings> } | null)?.theme ?? {}) });

/**
 * A theme meta's settings: brand colour, greys, corners, font, size and mode, whether it is
 * everyone's default and which apps always look like it. While editing, the whole app shows
 * the changes, so they are seen on real screens; leaving or saving goes back.
 */
export function ThemeDesigner({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const { setPreview, reload } = useTheme();
  const [saved, setSaved] = useState(() => settingsOf(meta));
  const [theme, setTheme] = useState(saved);
  const [previewing, setPreviewing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const apps = useMemo(() => options.filter((o) => o.type === 'app'), [options]);
  const changed = JSON.stringify(theme) !== JSON.stringify(saved);

  useEffect(() => {
    setPreview(previewing ? theme : null);
  }, [previewing, theme, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  const set = <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => {
    setTheme((item) => ({ ...item, [key]: value }));
    setDone(false);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const next = await themeApi.save(meta.id, theme);
      setSaved(next);
      setTheme(next);
      await reload();
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("The theme could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={t("Theme")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-primary">{t("Theme")}</h2>
          <p className="mt-0.5 text-sm text-tertiary">{t("How the app looks for the people using this theme.")}</p>
        </div>
        <div className="flex items-center gap-3">
          {done && !changed && (
            <span role="status" className="flex items-center gap-1 text-sm font-medium text-success-primary">
              <Check className="size-4" aria-hidden="true" /> {t("Saved")}
            </span>
          )}
          {changed && (
            <Button size="sm" color="secondary" onPress={() => setTheme(saved)}>
              {t("Undo changes")}
            </Button>
          )}
          <Button size="sm" isDisabled={!changed} isLoading={busy} showTextWhileLoading onPress={save}>
            {t("Save theme")}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 px-4 py-5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-6">
          {error && <Alert>{error}</Alert>}

          <Field label={t("Brand colour")} hint={t("Buttons, links, selected rows and highlights. Lighter and darker shades are made from it.")}>
            <div className="flex flex-wrap items-center gap-2">
              {BRAND_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={hex}
                  aria-pressed={theme.brand === hex}
                  onClick={() => set('brand', hex)}
                  className={cx('flex size-8 items-center justify-center rounded-full outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2', theme.brand === hex && 'ring-2 ring-offset-2 ring-offset-bg-primary')}
                  style={{ background: hex, ['--tw-ring-color' as string]: hex }}
                >
                  {theme.brand === hex && <Check className="size-4 text-white" aria-hidden="true" />}
                </button>
              ))}
              <label className="ml-1 flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-secondary ring-1 ring-primary">
                <input type="color" value={theme.brand} onChange={(e) => set('brand', e.target.value)} aria-label={t("Any colour")} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                <input
                  value={theme.brand}
                  onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && e.target.value.length === 7 && set('brand', e.target.value.toLowerCase())}
                  aria-label={t("Colour code")}
                  className="w-20 bg-transparent font-mono text-sm outline-none"
                  maxLength={7}
                />
              </label>
            </div>
          </Field>

          <Choice label={t("Greys")} hint={t("Backgrounds, borders and text.")} value={theme.gray} items={GRAYS} onChange={(v) => set('gray', v)} />
          <Choice label={t("Corners")} value={theme.radius} items={RADII} onChange={(v) => set('radius', v)} />
          <Choice label={t("Font")} value={theme.font} items={FONTS} onChange={(v) => set('font', v)} />
          <Choice label={t("Size")} hint={t("Compact fits more rows on a screen; comfortable is easier to read and tap.")} value={theme.density} items={DENSITIES} onChange={(v) => set('density', v)} />

          <Field label={t("Light or dark")}>
            <NativeSelect
              aria-label={t("Light or dark")}
              size="sm"
              value={theme.mode}
              onChange={(e) => set('mode', e.target.value as ThemeSettings['mode'])}
              options={[
                { value: 'any', label: t("As each user chooses (light, dark or their system)") },
                { value: 'light', label: t("Always light") },
                { value: 'dark', label: t("Always dark") },
              ]}
            />
          </Field>

          <div className="space-y-4 border-t border-secondary pt-5">
            <Toggle label={t("Everyone's default")} hint={t("Users who haven't picked a theme get this one. Only one theme is the default.")} isSelected={theme.default} onChange={(v) => set('default', v)} />
            <Field label={t("Apps that always use it")} hint={t("While one of these apps is open it looks like this, whatever theme the user picked. An app has one theme, so picking it here takes it from another.")}>
              {apps.length ? (
                <div className="flex flex-wrap gap-2">
                  {apps.map((a) => {
                    const on = theme.apps.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set('apps', on ? theme.apps.filter((x) => x !== a.id) : [...theme.apps, a.id])}
                        className={cx(
                          'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 outline-focus-ring focus-visible:outline-2',
                          on ? 'bg-brand-primary_alt text-brand-secondary ring-brand' : 'text-secondary ring-primary hover:bg-primary_hover',
                        )}
                      >
                        {on && <Check className="size-3.5" aria-hidden="true" />}
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-tertiary">{t("There are no apps yet.")}</p>
              )}
            </Field>
          </div>
        </div>

        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <Toggle label={t("Show it on the whole app while I edit")} isSelected={previewing} onChange={setPreviewing} />
          <ThemeSwatch theme={theme} className="h-20 w-full" />
          {previewing ? <ThemeSample /> : <p className="text-sm text-tertiary">{t("Turn on the preview to see the changes on this page and its controls.")}</p>}
        </div>
      </div>
    </section>
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

function Choice<T extends string>({ label, hint, value, items, onChange }: { label: string; hint?: string; value: T; items: { id: T; name: string }[]; onChange: (v: T) => void }) {
  return (
    <Field label={label} hint={hint}>
      <ButtonGroup size="sm" aria-label={label} selectionMode="single" disallowEmptySelection selectedKeys={[value]} onSelectionChange={(keys) => onChange([...keys][0] as T)}>
        {items.map((i) => (
          <ButtonGroupItem key={i.id} id={i.id}>
            {t(i.name)}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
    </Field>
  );
}

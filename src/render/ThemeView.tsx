import { useEffect, useState } from 'react';
import { Check } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import type { MetaDef } from './definitions';
import { BASE_THEME, type ThemeSettings } from '../lib/theme';
import { useTheme } from '../components/ThemeProvider';
import { ThemeSample } from '../components/ThemeSample';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { t } from '@/i18n';

/** A theme meta opened on its own: the page shows in it while open, and the user can keep it. */
export function ThemeView({ def }: { def: MetaDef }) {
  const { setPreview, themeId, mode, choose, list } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const theme: ThemeSettings = { ...BASE_THEME, ...((def.meta.json_config as { theme?: Partial<ThemeSettings> } | null)?.theme ?? {}) };
  const key = JSON.stringify(theme);
  const mine = themeId === def.meta.id || (themeId === null && list?.default_id === def.meta.id);

  useEffect(() => {
    setPreview(JSON.parse(key) as ThemeSettings);
    return () => setPreview(null);
  }, [key, setPreview]);

  async function use() {
    setBusy(true);
    setError(null);
    try {
      await choose(mode, def.meta.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The theme could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md space-y-4">
      {error && <Alert>{error}</Alert>}
      <p className="text-sm text-tertiary">{t('This page shows in {name} while it is open.', { name: def.meta.name })}</p>
      <ThemeSample />
      {mine ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-success-primary">
          <Check className="size-4" aria-hidden="true" /> {t('This is your theme.')}
        </p>
      ) : (
        <Button size="sm" isLoading={busy} showTextWhileLoading onPress={use}>
          {t('Use this theme')}
        </Button>
      )}
    </div>
  );
}

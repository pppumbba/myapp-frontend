import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption } from '../../lib/metaApi';
import { pageApi, propValues, type Widget } from '../../lib/pageApi';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { NativeSelect } from '@/components/base/select/select-native';
import { clearRenderCache } from '../../render/definitions';
import { DrilldownHost } from '../../render/DrilldownHost';
import { WidgetBlock } from '../../render/WidgetView';
import { PropField } from './PageDesigner';
import { t } from '@/i18n';

/**
 * A widget meta on its own: which library entry it is (widget_id) and its settings
 * (json_config), with a live preview. Pages place it through their params.
 */
export function WidgetDesigner({ meta, options, onSaved }: { meta: Meta; options: MetaOption[]; onSaved: () => void }) {
  const [library, setLibrary] = useState<Widget[] | null>(null);
  const [widgetId, setWidgetId] = useState(meta.widget_id ?? null);
  const [config, setConfig] = useState<Record<string, unknown>>(meta.json_config ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pageApi.widgets().then(setLibrary, () => setLibrary([]));
  }, []);

  const widget = library?.find((w) => w.id === widgetId) ?? null;
  const dirty = widgetId !== (meta.widget_id ?? null) || JSON.stringify(config) !== JSON.stringify(meta.json_config ?? {});
  const values = widget ? propValues(widget, config) : {};

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await metaApi.update(meta.id, { widget_id: widgetId, json_config: config });
      clearRenderCache();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("The widget could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-labelledby="widget-designer-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 id="widget-designer-title" className="text-lg font-semibold text-primary">
            {t("Widget")}
          </h2>
          <p className="mt-0.5 text-sm text-tertiary">
            {meta.ref_meta ? t('Made on the page "{name}".', { name: meta.ref_meta.name }) : t('Not tied to a page: place it on any page from Saved widgets.')}{' '}
            {t('Changes show everywhere it’s placed.')}
          </p>
        </div>
        <Button size="sm" isDisabled={!dirty || !widgetId} isLoading={busy} showTextWhileLoading onPress={save}>
          {dirty ? t("Save widget") : t("Saved")}
        </Button>
      </div>
      {error && (
        <div className="px-4 pt-4 sm:px-5">
          <Alert>{error}</Alert>
        </div>
      )}
      {!library ? (
        <div className="m-5 h-60 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
      ) : (
        <div className="grid lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="space-y-5 border-b border-secondary p-4 lg:border-r lg:border-b-0">
            <NativeSelect
              label={t("From the library")}
              value={widgetId ? String(widgetId) : ''}
              onChange={(e) => {
                const next = library.find((w) => w.id === Number(e.target.value));
                setWidgetId(next?.id ?? null);
                // Settings of another kind of widget rarely fit; start from the new one's defaults.
                if (next && next.renderer !== widget?.renderer) setConfig(propValues(next, null));
              }}
              options={[{ value: '', label: t("Choose a widget…") }, ...library.map((w) => ({ value: String(w.id), label: `${w.name} (${w.category})` }))]}
            />
            {widget?.props?.map((prop) => (
              <PropField key={prop.key} prop={prop} value={values[prop.key]} options={options} pageId={meta.id} onChange={(v) => setConfig((c) => ({ ...c, [prop.key]: v }))} />
            ))}
          </div>
          <div className="min-w-0 bg-secondary_alt px-4 py-6 sm:px-6">
            <p className="mb-3 text-sm font-medium text-secondary">{t("Preview")}</p>
            {widget ? (
              <DrilldownHost>
                <WidgetBlock widget={widget} config={config} />
              </DrilldownHost>
            ) : (
              <p className="text-sm text-tertiary">{t("Choose a widget from the library.")}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

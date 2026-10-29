import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { pageApi, type Page } from '../lib/pageApi';
import { Alert } from '../components/ui';
import { useMetaDef, type MetaDef } from './definitions';
import { PageItems, WidgetBlock } from './WidgetView';
import { t } from '@/i18n';

/** A page meta: its widgets, laid out on the 12-column grid, sections holding theirs. */
export function PageView({ def }: { def: MetaDef }) {
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    pageApi.get(def.meta.id).then(
      (p) => live && setPage(p),
      (err) => live && setError(err instanceof ApiError ? err.message : t("This page could not be loaded.")),
    );
    return () => {
      live = false;
    };
  }, [def.meta.id]);

  if (error) return <Alert>{error}</Alert>;
  if (!page) return <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />;
  if (!page.items.length) {
    return (
      <div className="rounded-xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary">
        <p className="text-md font-semibold text-primary">{t("This page is empty")}</p>
        <p className="mt-1 text-sm text-tertiary">{t("Add widgets to it in the page builder.")}</p>
      </div>
    );
  }

  return <PageItems items={page.items} />;
}

/** A widget meta on its own: its library entry drawn with its settings. */
export function WidgetMetaView({ def }: { def: MetaDef }) {
  const widgetId = def.meta.widget_id;
  const [widgets, setWidgets] = useState<Awaited<ReturnType<typeof pageApi.widgets>> | null>(null);
  useEffect(() => {
    pageApi.widgets().then(setWidgets, () => setWidgets([]));
  }, []);
  const widget = widgets?.find((w) => w.id === widgetId);

  if (!widgetId) return <Alert>{t("This widget has no library entry yet. Pick one in the builder.")}</Alert>;
  if (!widgets) return <div className="h-32 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />;
  if (!widget) return <Alert>{t("This widget's library entry is inactive or was removed.")}</Alert>;
  return <WidgetBlock widget={widget} config={def.meta.json_config} />;
}

/** Loads a widget meta by id, for previews in the builder. */
export function WidgetMetaPreview({ metaId }: { metaId: number }) {
  const { def, error } = useMetaDef(metaId);
  if (error) return <Alert>{error}</Alert>;
  return def ? <WidgetMetaView def={def} /> : null;
}

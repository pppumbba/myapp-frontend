import { useNavigate } from 'react-router-dom';
import { ArrowRight, Edit01 } from '@untitledui/icons';
import type { Meta } from '../lib/metaApi';
import { Button } from '@/components/base/buttons/button';
import { AppImage } from './AppArt';
import { IconAction } from './ui';
import { t } from '@/i18n';

/**
 * One app as a card: its picture as the cover, then its icon, name and description, with Open
 * (and optionally Edit in the builder). json_config.show_cover / show_icon false turn the cover
 * off, or show its first letter on a plain square instead of the picture.
 */
export function AppTile({ app, showEdit = false }: { app: Meta; showEdit?: boolean }) {
  const navigate = useNavigate();
  const name = app.label_name || app.name;
  const items = app.params_count ?? 0;
  const showCover = app.json_config?.show_cover !== false;
  const showIcon = app.json_config?.show_icon !== false;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset">
      {showCover && <AppImage app={app} variant="cover" className="aspect-[16/7] w-full" />}
      <div className="flex items-center gap-3 p-3">
        {showIcon ? (
          <AppImage app={app} variant="icon" className="size-9 shrink-0 rounded-lg ring-1 ring-black/5" />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-solid text-sm font-semibold text-white" aria-hidden="true">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold break-words text-primary sm:truncate">{name}</p>
          <p className="line-clamp-2 text-xs text-tertiary sm:line-clamp-1">{app.description || (items === 1 ? t('1 menu item') : t('{count} menu items', { count: items }))}</p>
        </div>
        {showEdit && <IconAction icon={Edit01} label={t('Edit {name} in the builder', { name })} onPress={() => navigate(`/metas/${app.id}`)} />}
        <Button color="secondary" size="sm" iconTrailing={ArrowRight} onPress={() => navigate(`/run/${app.id}`)}>
          {t('Open')}
        </Button>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { ArrowRight, Edit01 } from '@untitledui/icons';
import type { Meta } from '../lib/metaApi';
import { Button } from '@/components/base/buttons/button';
import { IconAction } from './ui';
import { t } from '@/i18n';

// Apps take turns with these, so they're told apart at a glance.
const colors = ['bg-brand-solid', 'bg-utility-blue-600', 'bg-utility-purple-600', 'bg-utility-amber-600', 'bg-utility-green-600'];

/** One app: its initial, name and description, with Open (and optionally Edit in the builder). */
export function AppTile({ app, index, showEdit = false }: { app: Meta; index: number; showEdit?: boolean }) {
  const navigate = useNavigate();
  const name = app.label_name || app.name;
  const items = app.params_count ?? 0;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-primary p-3 shadow-xs ring-1 ring-secondary ring-inset">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ${colors[index % colors.length]}`}
        aria-hidden="true"
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-primary">{name}</p>
        <p className="truncate text-xs text-tertiary">{app.description || (items === 1 ? t('1 menu item') : t('{count} menu items', { count: items }))}</p>
      </div>
      {showEdit && <IconAction icon={Edit01} label={t('Edit {name} in the builder', { name })} onPress={() => navigate(`/metas/${app.id}`)} />}
      <Button color="secondary" size="sm" iconTrailing={ArrowRight} onPress={() => navigate(`/run/${app.id}`)}>
        {t('Open')}
      </Button>
    </div>
  );
}

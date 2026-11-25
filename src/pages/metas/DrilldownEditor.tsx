import { useMemo } from 'react';
import { Plus, Trash01 } from '@untitledui/icons';
import type { MetaOption } from '../../lib/metaApi';
import { ComboField, type ComboOption } from '../../components/ComboField';
import { MetaLookupField, metaChoices } from './MetaLookupField';
import { SettingRow } from './SettingRow';
import { IconAction } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Input } from '@/components/base/input/input';
import { useMetaDef } from '../../render/definitions';
import type { Drilldown } from '../../render/drilldown';
import { t } from '@/i18n';

/** Metas a drilldown can open. */
const TARGETS = ['datagrid', 'statement', 'report', 'form', 'workspace', 'dashboard', 'chart', 'calendar', 'gantt'];

/**
 * Edits a json_config.drilldown: the meta it opens, whether in a modal, a drawer or
 * full screen (open_in), and which of its filters or parameters get which value. sources are what the clicked thing offers (a row's fields, or a chart's
 * x, x.from, x.to, range.from, range.to). withLabel asks for the row button's text.
 */
export function DrilldownEditor({
  value,
  onChange,
  options,
  sources,
  selfId,
  withLabel,
  rows,
}: {
  value: Drilldown | null;
  onChange: (value: Drilldown | null) => void;
  options: MetaOption[];
  sources: ComboOption[];
  selfId: number;
  withLabel?: boolean;
  /** Lays the parts out as setting rows (Opens, Shown, Values passed, Button text), for a section's row list. */
  rows?: boolean | 'stacked';
}) {
  const metas = useMemo(() => metaChoices(options.filter((o) => o.id !== selfId && o.type && TARGETS.includes(o.type))), [options, selfId]);
  const { def } = useMetaDef(value?.meta_id);
  // Filters and parameters of the target, and its key for opening one record.
  const names = useMemo(() => {
    if (!def) return [];
    const seen = new Set<string>();
    return [...def.params.filter((p) => p.is_primary), ...def.params.filter((p) => p.is_criteria)]
      .filter((p) => !seen.has(p.field_path) && seen.add(p.field_path))
      .map((p) => ({ id: p.field_path, label: `${p.label_name || p.field_path}${p.is_primary ? ' · opens this record' : ''}` }));
  }, [def]);
  const pairs = Object.entries(value?.params ?? {});
  const setPairs = (next: [string, string][]) => value && onChange({ ...value, params: Object.fromEntries(next) });

  const picker = (
    <MetaLookupField
      aria-label={t('Drilldown opens')}
      size="sm"
      placeholder={t('Nothing: clicking does nothing')}
      items={metas}
      value={value ? String(value.meta_id) : ''}
      onChange={(id) =>
        onChange(id ? { meta_id: Number(id), params: value?.meta_id === Number(id) ? value.params : {}, label: value?.label ?? null, ...(value?.open_in ? { open_in: value.open_in } : {}) } : null)
      }
    />
  );
  if (!value)
    return rows ? (
      <SettingRow title={t('Opens')} stacked={rows === 'stacked'} hint={t('The meta a row button opens. Nothing: rows have no button.')}>
        {picker}
      </SettingRow>
    ) : (
      <div className="space-y-2.5">{picker}</div>
    );

  const shown = (
    <ButtonGroup
      size="sm"
      aria-label={t('Opens in')}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value.open_in ?? 'modal']}
      onSelectionChange={(keys) => {
        const { open_in: _, ...rest } = value;
        const key = [...keys][0];
        onChange(key === 'drawer' || key === 'page' ? { ...rest, open_in: key } : rest);
      }}
    >
      <ButtonGroupItem id="modal">{t('In a modal')}</ButtonGroupItem>
      <ButtonGroupItem id="drawer">{t('In a drawer')}</ButtonGroupItem>
      <ButtonGroupItem id="page">{t('Full screen')}</ButtonGroupItem>
    </ButtonGroup>
  );

  const passed = (
    <div className="space-y-2.5">
      {pairs.map(([name, source], i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
          <ComboField
            aria-label={t('Parameter {n} of the opened meta', { n: i + 1 })}
            size="sm"
            placeholder={t('Its filter…')}
            items={names.some((n) => n.id === name) || !name ? names : [{ id: name, label: name }, ...names]}
            value={name}
            onChange={(n) => setPairs(pairs.map((p, j) => (j === i ? [n, p[1]] : p)))}
          />
          <span className="text-sm text-tertiary" aria-hidden="true">
            ←
          </span>
          <ComboField
            aria-label={t('Value for parameter {n}', { n: i + 1 })}
            size="sm"
            placeholder={t('From…')}
            items={sources.some((s) => s.id === source) || !source ? sources : [{ id: source, label: source }, ...sources]}
            value={source}
            onChange={(s) => setPairs(pairs.map((p, j) => (j === i ? [p[0], s] : p)))}
          />
          <IconAction icon={Trash01} danger label={t('Remove parameter {n}', { n: i + 1 })} onPress={() => setPairs(pairs.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="sm" color="link-color" iconLeading={Plus} isDisabled={pairs.some(([k]) => !k)} onPress={() => value && onChange({ ...value, params: { ...value.params, '': '' } })}>
        {t('Pass a value')}
      </Button>
    </div>
  );

  const label = withLabel && (
    <Input
      aria-label={t('Row button text')}
      size="sm"
      placeholder={rows ? t('e.g. Print order (optional)') : t('Button text, e.g. Print order (optional)')}
      value={value.label ?? ''}
      onChange={(text) => onChange({ ...value, label: text || null })}
    />
  );

  // On a meta's section: a row for each part, like the other settings.
  if (rows)
    return (
      <>
        <SettingRow title={t('Opens')} stacked={rows === 'stacked'} hint={t('The meta a row button opens. Nothing: rows have no button.')}>
          {picker}
        </SettingRow>
        <SettingRow title={t('Shown')} stacked={rows === 'stacked'} hint={t('Where the opened meta appears.')}>
          {shown}
        </SettingRow>
        <SettingRow title={t('Values passed')} stacked={rows === 'stacked'} hint={t('Each filter or parameter of the opened meta, and the row field that fills it.')} wide>
          {passed}
        </SettingRow>
        {label && (
          <SettingRow title={t('Button text')} stacked={rows === 'stacked'} hint={t('The row button’s text. Empty: Open.')}>
            {label}
          </SettingRow>
        )}
      </>
    );

  return (
    <div className="space-y-2.5">
      {picker}
      {shown}
      {passed}
      {label}
    </div>
  );
}

export const chartSources: ComboOption[] = [
  { id: 'x', label: 'The clicked group' },
  { id: 'x.from', label: 'The group’s first day (date groups)' },
  { id: 'x.to', label: 'The group’s last day (date groups)' },
  { id: 'range.from', label: 'Dashboard range: from' },
  { id: 'range.to', label: 'Dashboard range: to' },
];

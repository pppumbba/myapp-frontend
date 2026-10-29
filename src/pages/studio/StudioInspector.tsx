import { useState } from 'react';
import { ArrowRight, LinkExternal01, Plus } from '@untitledui/icons';
import type { ActionKind } from '../../lib/metaApi';
import { ComboField } from '../../components/ComboField';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { cx } from '@/utils/cx';
import { MENU_ICONS } from '../../render/AppView';
import { HEIGHTS, WIDTHS } from '../../render/DashboardView';
import { buttonValues, linkedType, type ActionNode, type ActionValues, type ParamNode, type ParamValues, type ScreenMeta, type StudioMode } from './tree';
import { t } from '@/i18n';

const WIDTH_NAMES: Record<number, string> = { 3: 'Quarter', 4: 'Third', 6: 'Half', 8: 'Two thirds', 9: 'Three quarters', 12: 'Full width' };
const HEIGHT_NAMES: Record<number, string> = { 1: 'Short', 2: 'Medium', 3: 'Tall' };

const DATA_TYPES =['string', 'text', 'integer', 'decimal', 'boolean', 'date', 'datetime', 'json', 'detail', 'subgrid', 'signature', 'singlefile', 'multifile', 'document'];

/**
 * A meta something can point at: a saved one (value: its id) or a screen made in this
 * studio and not saved yet (value: "k:" + its key).
 */
export interface Target {
  value: string;
  label: string;
  type: string;
}

export const targetValue = (id: number | null | undefined, key?: string) => (key ? `k:${key}` : id ? String(id) : '');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 border-b border-secondary px-4 py-4 last:border-b-0">
      <p className="text-xs font-semibold tracking-wide text-quaternary uppercase">{title}</p>
      {children}
    </div>
  );
}

function TargetPicker({ label, targets, types, value, onChange, hint, exclude }: { label: string; targets: Target[]; types?: string[]; value: string; onChange: (v: string) => void; hint?: string; exclude?: string }) {
  const items = targets
    .filter((o) => o.value !== exclude && (!types || types.includes(o.type)))
    .map((o) => ({ id: o.value, label: types?.length === 1 ? o.label : `${o.label} (${o.type})` }));
  return <ComboField label={label} size="sm" placeholder={t('Nothing')} items={items} value={value} onChange={onChange} hint={hint} />;
}

/** The app or the screen being designed, when nothing on the canvas is picked. */
export function MetaInspector({ mode, typeName, meta, isNew, onChange }: { mode: StudioMode; typeName: string; meta: ScreenMeta; isNew: boolean; onChange: (patch: Partial<ScreenMeta>) => void }) {
  return (
    <>
      <Section title={t('This {type}', { type: typeName })}>
        {isNew && <Badge type="color" size="sm" color="brand">{t('New: made with the next Save')}</Badge>}
        <Input label={t('Name')} size="sm" value={meta.name} onChange={(name) => onChange({ name })} />
        <Input label={t('Title shown')} size="sm" value={meta.label_name ?? ''} onChange={(v) => onChange({ label_name: v || null })} hint={t('Left empty, the name is shown.')} />
        <Input
          label={t('Code')}
          size="sm"
          value={meta.code}
          isDisabled={!isNew}
          onChange={(code) => onChange({ code })}
          placeholder={isNew ? t('Made from the name') : undefined}
          hint={isNew ? t('Unique; letters, digits and _.') : t('Set when it was made.')}
        />
        {(mode === 'datagrid' || mode === 'form') && (
          <Input label={t('Table')} size="sm" value={meta.table_name ?? ''} onChange={(v) => onChange({ table_name: v || null })} hint={t('Where its records are read and saved.')} />
        )}
        <TextArea label={t('Description')} rows={3} value={meta.description ?? ''} onChange={(v) => onChange({ description: v || null })} />
        <Toggle label={t('Active')} isSelected={meta.is_active} onChange={(is_active) => onChange({ is_active })} />
      </Section>
      <p className="px-4 py-4 text-sm text-tertiary">
        {mode === 'app'
          ? t('Drag menu items and new screens from the left. Double-click one to design the screen it opens.')
          : mode === 'datagrid'
            ? t('Drag columns, buttons and forms from the left. Pick one to change it.')
            : mode === 'dashboard'
              ? t('Drag charts from the left. Pick one to size it, or to change the chart it shows.')
              : mode === 'page'
              ? t('Add widgets from the library on the left; pick one on the page to change its settings.')
              : t('Pick something on the canvas to change it, or drag components from the left.')}
      </p>
    </>
  );
}

/** Advanced settings as JSON: kept as typed until it reads, then applied. */
function JsonField({ label, hint, value, onChange }: { label: string; hint: string; value: unknown; onChange: (v: Record<string, unknown> | null) => void }) {
  const [text, setText] = useState(() => (value && Object.keys(value as object).length ? JSON.stringify(value, null, 2) : ''));
  const [bad, setBad] = useState(false);
  return (
    <TextArea
      label={label}
      rows={5}
      value={text}
      isInvalid={bad}
      textAreaClassName="font-mono text-sm"
      hint={bad ? t('This is not valid JSON yet.') : hint}
      onChange={(v) => {
        setText(v);
        if (!v.trim()) {
          setBad(false);
          onChange(null);
          return;
        }
        try {
          const parsed = JSON.parse(v);
          const ok = parsed && typeof parsed === 'object' && !Array.isArray(parsed);
          setBad(!ok);
          if (ok) onChange(parsed);
        } catch {
          setBad(true);
        }
      }}
    />
  );
}

function OpenScreen({ onOpen, name }: { onOpen?: () => void; name: string | null }) {
  if (!onOpen) return null;
  return (
    <Button size="sm" iconTrailing={ArrowRight} onPress={onOpen} className="w-full">
      {t('Design {name}', { name: name ?? t('this screen') })}
    </Button>
  );
}

/** A menu item, column, field or tab. onRef sets what it opens or looks up (a Target value). */
export function ParamInspector({
  mode,
  node,
  targets,
  self,
  onChange,
  onRef,
  onOpen,
  onCreate,
}: {
  mode: StudioMode;
  node: ParamNode;
  targets: Target[];
  /** The Target value of the meta being designed: it can't point at itself. */
  self: string;
  onChange: (patch: ParamValues) => void;
  onRef: (value: string) => void;
  onOpen?: () => void;
  /** Makes a new line form or grid for it to point at. */
  onCreate?: () => void;
}) {
  const v = node.values;
  const config = (v.json_config ?? {}) as Record<string, unknown>;
  const list = Array.isArray(config.options) ? (config.options as unknown[]).map(String) : null;
  const ref = targetValue(v.ref_meta_id, node.refKey);
  const refName = targets.find((x) => x.value === ref)?.label ?? null;
  const pick = (label: string, types: string[] | undefined, hint?: string) => <TargetPicker label={label} targets={targets} types={types} value={ref} onChange={onRef} hint={hint} exclude={self} />;
  const field = mode === 'datagrid' || mode === 'form';
  const linked = linkedType(v);
  const create =
    !ref && linked && onCreate ? (
      <Button size="sm" color="secondary" iconLeading={Plus} onPress={onCreate} className="w-full">
        {linked === 'form' ? t('New line form') : t('New datagrid')}
      </Button>
    ) : null;
  const kind = { app: t('Menu item'), tabs: t('Tab'), datagrid: t('Column'), form: t('Field'), page: t('Widget'), dashboard: t('Chart') }[mode];

  return (
    <>
      <Section title={kind}>
        <Input label={t('Label')} size="sm" value={v.label_name ?? ''} onChange={(label_name) => onChange({ label_name: label_name || null })} />
        <Input
          label={field ? t('Field name') : t('Code')}
          size="sm"
          value={v.field_path ?? ''}
          onChange={(f) => onChange({ field_path: f, param_name: f })}
          hint={field ? t('The column in the table.') : undefined}
        />
        {node.id ? <p className="text-xs text-quaternary">{t('Saved as param #{id}', { id: node.id })}</p> : <Badge type="color" size="sm" color="brand">{t('New: saved with the next Save')}</Badge>}
      </Section>

      {(mode === 'app' || mode === 'tabs') && (
        <Section title={t('What it opens')}>
          {pick(t('Screen'), undefined, mode === 'app' ? t('Leave empty for a group that holds other items.') : undefined)}
          <OpenScreen onOpen={onOpen} name={refName} />
          {mode === 'app' && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-secondary">{t('Icon')}</p>
              <div className="grid grid-cols-6 gap-1">
                {Object.entries(MENU_ICONS).map(([name, Icon]) => (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    aria-label={name}
                    aria-pressed={v.icon_cls === name}
                    onClick={() => onChange({ icon_cls: v.icon_cls === name ? null : name })}
                    className={cx('flex aspect-square items-center justify-center rounded-md outline-focus-ring focus-visible:outline-2', v.icon_cls === name ? 'bg-brand-solid text-white' : 'text-fg-quaternary ring-1 ring-secondary hover:bg-primary_hover')}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <Toggle label={t('Shown')} isSelected={v.is_show !== false} onChange={(is_show) => onChange({ is_show })} />
        </Section>
      )}

      {field && (
        <Section title={t('Data')}>
          <NativeSelect
            label={t('Data type')}
            value={String(v.data_type ?? 'string')}
            onChange={(e) => onChange({ data_type: e.target.value })}
            options={(DATA_TYPES.includes(String(v.data_type)) ? DATA_TYPES : [String(v.data_type), ...DATA_TYPES]).map((d) => ({ value: d, label: d }))}
          />
          {(v.data_type === 'detail' || v.data_type === 'subgrid') && (
            <>
              {pick(v.data_type === 'detail' ? t('Line form') : t('Grid it shows'), v.data_type === 'detail' ? ['form'] : ['datagrid'])}
              <OpenScreen onOpen={onOpen} name={refName} />
              {create}
            </>
          )}
          {!['detail', 'subgrid', 'boolean'].includes(String(v.data_type)) && (
            <Toggle
              label={t('Lookup (picks a record)')}
              isSelected={!!v.is_select}
              onChange={(is_select) => {
                onChange({ is_select });
                if (!is_select) onRef('');
              }}
            />
          )}
          {v.is_select && (
            <>
              {pick(t('Looks up'), ['datagrid', 'query'], t('The grid whose records are picked from.'))}
              <OpenScreen onOpen={onOpen} name={refName} />
              {create}
            </>
          )}
          {!v.is_select && !['detail', 'subgrid', 'boolean'].includes(String(v.data_type)) && (
            <TextArea
              label={t('Options list')}
              rows={3}
              value={list ? list.join('\n') : ''}
              onChange={(text) => {
                const rows = text.split('\n').map((s) => s.trim()).filter(Boolean);
                const { options: _old, ...rest } = config;
                onChange({ json_config: rows.length ? { ...rest, options: rows } : Object.keys(rest).length ? rest : null });
              }}
              hint={t('One choice per line; empty for free input.')}
            />
          )}
        </Section>
      )}

      {mode === 'dashboard' && (
        <Section title={t('Chart')}>
          {pick(t('Chart'), ['chart'])}
          {v.ref_meta_id ? (
            <Button size="sm" color="secondary" iconTrailing={LinkExternal01} href={`/metas/${v.ref_meta_id}`} target="_blank" className="w-full">
              {t('Edit the chart in the meta builder')}
            </Button>
          ) : null}
          <NativeSelect
            label={t('Width')}
            value={String(Number(config.w) || 6)}
            onChange={(e) => onChange({ json_config: { ...config, w: Number(e.target.value) } })}
            options={WIDTHS.map((w) => ({ value: String(w), label: `${t(WIDTH_NAMES[w])} (${w}/12)` }))}
          />
          <NativeSelect
            label={t('Height')}
            value={String(Number(config.h) || 2)}
            onChange={(e) => onChange({ json_config: { ...config, h: Number(e.target.value) } })}
            options={HEIGHTS.map((h) => ({ value: String(h), label: t(HEIGHT_NAMES[h]) }))}
          />
          <Toggle label={t('Shown')} isSelected={v.is_show !== false} onChange={(is_show) => onChange({ is_show })} />
        </Section>
      )}

      {mode === 'datagrid' && (
        <Section title={t('Column')}>
          <Toggle label={t('Shown')} isSelected={v.is_show !== false} onChange={(is_show) => onChange({ is_show })} />
          <Toggle label={t('Filter by it')} isSelected={!!v.is_criteria} onChange={(is_criteria) => onChange({ is_criteria })} />
          <Toggle label={t('Names the record')} hint={t('Shown for it in lookups.')} isSelected={!!v.is_label} onChange={(is_label) => onChange({ is_label })} />
          <Input label={t('Width (px)')} size="sm" type="number" value={v.column_width ?? ''} onChange={(w) => onChange({ column_width: w || null })} />
          <Input label={t('Format')} size="sm" value={v.data_mask ?? ''} onChange={(m) => onChange({ data_mask: m || null })} hint={t('e.g. #,##0.00')} />
        </Section>
      )}

      {mode === 'form' && (
        <Section title={t('Field')}>
          <Toggle label={t('Required')} isSelected={!!v.is_required} onChange={(is_required) => onChange({ is_required })} />
          <Toggle label={t('Shown')} isSelected={v.is_show !== false} onChange={(is_show) => onChange({ is_show })} />
          <Toggle label={t('Unique')} isSelected={!!v.is_unique} onChange={(is_unique) => onChange({ is_unique })} />
          <Input label={t('Default value')} size="sm" value={v.default_value ?? ''} onChange={(d) => onChange({ default_value: d || null })} hint={t('{today}, {user_id} and session values work here.')} />
          {(v.data_type === 'integer' || v.data_type === 'decimal' || v.data_type === 'date') && (
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('Min')} size="sm" value={v.min_value ?? ''} onChange={(m) => onChange({ min_value: m || null })} />
              <Input label={t('Max')} size="sm" value={v.max_value ?? ''} onChange={(m) => onChange({ max_value: m || null })} />
            </div>
          )}
        </Section>
      )}

      <Section title={t('Advanced')}>
        <JsonField
          key={node.key}
          label={t('Advanced settings (JSON)')}
          hint={t('Presets (filters, fixed, defaults), autonumber and the rest of json_config.')}
          value={v.json_config}
          onChange={(json_config) => onChange({ json_config })}
        />
      </Section>
    </>
  );
}

const KINDS: { value: ActionKind; label: string }[] = [
  { value: 'add', label: 'Add' },
  { value: 'edit', label: 'Edit' },
  { value: 'delete', label: 'Delete' },
  { value: 'custom', label: 'Custom' },
  { value: 'import', label: 'Import' },
  { value: 'stage_query', label: 'Stage query' },
];
const ICONS = ['', 'plus', 'edit', 'trash', 'copy', 'eye', 'check', 'file', 'upload'];
const targetType = (kind: ActionKind) => (kind === 'import' ? 'excel_import' : kind === 'stage_query' ? 'stage_query' : 'form');

/** A datagrid's button: what it does and the form it opens (backend: meta_actions). */
export function ActionInspector({
  node,
  targets,
  onChange,
  onForm,
  onOpen,
}: {
  node: ActionNode;
  targets: Target[];
  onChange: (patch: Partial<ActionValues>) => void;
  /** Sets the form it opens (a Target value). */
  onForm: (value: string) => void;
  onOpen?: () => void;
}) {
  const v = node.values;
  const form = targetValue(v.form_meta_id, node.formKey);
  const formName = targets.find((x) => x.value === form)?.label ?? null;
  const type = targetType(v.action);

  function setKind(action: ActionKind) {
    const usual = KINDS.find((k) => k.value === v.action)?.label;
    const label = !v.label || v.label === t(usual ?? '') ? t(KINDS.find((k) => k.value === action)!.label) : v.label;
    const { form_meta_id: _form, ...next } = buttonValues(action, label);
    onChange({ ...next, icon_cls: v.icon_cls, get_meta_id: action === 'import' ? null : v.get_meta_id });
    // A form, an import and a stage query are different kinds of meta.
    if (targetType(action) !== type) onForm('');
  }

  return (
    <>
      <Section title={t('Button')}>
        <NativeSelect label={t('Does')} value={v.action} onChange={(e) => setKind(e.target.value as ActionKind)} options={KINDS.map((k) => ({ label: t(k.label), value: k.value }))} />
        <Input label={t('Label')} size="sm" value={v.label} onChange={(label) => onChange({ label })} />
        <NativeSelect label={t('Icon')} value={v.icon_cls ?? ''} onChange={(e) => onChange({ icon_cls: e.target.value || null })} options={ICONS.map((i) => ({ label: i || t('Usual for this kind'), value: i }))} />
        {node.id ? <p className="text-xs text-quaternary">{t('Saved as button #{id}', { id: node.id })}</p> : <Badge type="color" size="sm" color="brand">{t('New: saved with the next Save')}</Badge>}
      </Section>

      <Section title={t('Connected to')}>
        <TargetPicker
          label={type === 'excel_import' ? t('Excel import') : type === 'stage_query' ? t('Stage query') : t('Form')}
          targets={targets}
          types={[type]}
          value={form}
          onChange={onForm}
          hint={!form ? t('Needed before Save.') : v.action === 'delete' ? t('The row is removed from this form’s table.') : t('The form this button opens.')}
        />
        {type === 'form' && <OpenScreen onOpen={onOpen} name={formName} />}
        {v.action !== 'delete' && v.action !== 'import' && (
          <TargetPicker
            label={t('Get (opens with)')}
            targets={targets}
            types={['get']}
            value={v.get_meta_id ? String(v.get_meta_id) : ''}
            onChange={(g) => onChange({ get_meta_id: g && !g.startsWith('k:') ? Number(g) : null })}
            hint={t('Decides the values the form opens with.')}
          />
        )}
      </Section>

      <Section title={t('Placement')}>
        <Toggle label={t('Needs a picked row')} isSelected={v.needs_row} onChange={(needs_row) => onChange({ needs_row })} />
        <Toggle label={t('Show in the toolbar')} isSelected={v.show_in_toolbar} onChange={(show_in_toolbar) => onChange({ show_in_toolbar })} />
        <Toggle label={t('Show on each row')} isSelected={v.show_in_row} onChange={(show_in_row) => onChange({ show_in_row })} />
      </Section>

      {v.action !== 'import' && (
        <Section title={t('Advanced')}>
          <JsonField
            key={`${node.key}-${v.action}`}
            label={t('Settings (JSON)')}
            hint={t('params: which field of the picked row fills each :parameter. For edit and delete, "id" is the record.')}
            value={v.json_config}
            onChange={(json_config) => onChange({ json_config: json_config as ActionValues['json_config'] })}
          />
        </Section>
      )}
    </>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Copy01, Edit01, LayoutAlt01, Plus, Trash01 } from '@untitledui/icons';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { pageApi, propValues, type Widget, type WidgetInput, type WidgetProp } from '../lib/pageApi';
import { AppShell, PageHeader } from '../components/AppShell';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Section } from '../components/form';
import { Alert, IconAction } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { DrilldownHost } from '../render/DrilldownHost';
import { WIDGET_ICONS, WidgetBlock, widgetIcon } from '../render/WidgetView';
import { PropsEditor } from './metas/PropsEditor';
import { t } from '@/i18n';

/** The renderers the frontend draws (backend: Widget::RENDERERS). */
const RENDERERS = ['section', 'divider', 'spacer', 'heading', 'text', 'image', 'callout', 'button', 'links', 'stat', 'hero', 'list', 'meta', 'chart', 'iframe', 'composite', 'records', 'photo', 'table', 'schedule', 'carousel', 'gallery', 'accordion', 'collapse', 'tabs', 'quote', 'webform'];

/** What each renderer is for, shown under the choice. */
const RENDERER_HINTS: Record<string, string> = {
  composite: 'Made of other widgets: after adding it, lay out its parts. {{key}} in a part takes this widget’s setting.',
  records: 'Shows records from a grid; its “lines” setting writes each one with {field} placeholders.',
  meta: 'Embeds the meta picked in its meta_id setting.',
};

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

interface WidgetForm {
  code: string;
  name: string;
  category: string;
  renderer: string;
  icon: string;
  description: string;
  /** props as JSON text. */
  props: string;
  is_active: boolean;
}

function toForm(w: Widget | null, copy = false): WidgetForm {
  return {
    code: w ? (copy ? `${w.code}_copy` : w.code) : '',
    name: w ? (copy ? `${w.name} (copy)` : w.name) : '',
    category: w?.category ?? 'Content',
    renderer: w?.renderer ?? 'text',
    icon: w?.icon ?? '',
    description: w?.description ?? '',
    props: JSON.stringify(w?.props ?? [], null, 2),
    is_active: w?.is_active ?? true,
  };
}

/**
 * The page builder's widget library. Built-in entries come from the WidgetSeeder; admins
 * can add their own, e.g. a copy of Chart that starts on a set chart, or a Callout that is
 * always a warning. Each entry's renderer draws it and its props become its settings form.
 * A composite entry is built from other widgets: its parts open in the page builder.
 */
export default function WidgetsPage() {
  const navigate = useNavigate();
  const [widgets, setWidgets] = useState<Widget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // undefined: closed; {widget: null}: new; copy: a duplicate of widget.
  const [editing, setEditing] = useState<{ widget: Widget | null; copy?: boolean } | undefined>();
  const [deleting, setDeleting] = useState<Widget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function load() {
    try {
      setWidgets(await pageApi.widgets());
    } catch (err) {
      setError(message(err, t("The widget library could not be loaded.")));
    }
  }

  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Widget[]>();
    for (const w of widgets ?? []) map.set(w.category, [...(map.get(w.category) ?? []), w]);
    return [...map.entries()];
  }, [widgets]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await pageApi.removeWidget(deleting.id);
      await load();
    } catch (err) {
      setError(message(err, t("The widget could not be removed.")));
    } finally {
      setDeleting(null);
      setDeleteBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title={t("Widget library")}
        subtitle={t("What the page builder offers. Each widget placed on a page is a widget meta pointing at one of these.")}
        actions={
          <Button size="sm" iconLeading={Plus} onPress={() => setEditing({ widget: null })}>
            {t("New widget")}
          </Button>
        }
      />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}
      {!widgets ? (
        <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : (
        groups.map(([category, list]) => (
          <section key={category} className="mb-8" aria-labelledby={`cat-${category}`}>
            <h2 id={`cat-${category}`} className="mb-3 text-md font-semibold text-primary">
              {category}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((w) => {
                const Icon = widgetIcon(w.icon);
                return (
                  <li key={w.id} className="flex gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Icon className="size-5 text-fg-secondary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-primary">{w.name}</p>
                        {!w.is_active && (
                          <Badge type="color" size="sm" color="gray">
                            {t("Inactive")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-quaternary">
                        {w.code} · {w.renderer}
                        {w.metas_count ? ` · ${t('used {count}×', { count: w.metas_count })}` : ''}
                      </p>
                      {w.description && <p className="mt-1 text-sm text-tertiary">{w.description}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col">
                      {w.template_meta_id && <IconAction icon={LayoutAlt01} label={t('Lay out the parts of {name}', { name: w.name })} onPress={() => navigate(`/metas/${w.template_meta_id}`)} />}
                      <IconAction icon={Edit01} label={t('Edit {name}', { name: w.name })} onPress={() => setEditing({ widget: w })} />
                      <IconAction icon={Copy01} label={t('Duplicate {name}', { name: w.name })} onPress={() => setEditing({ widget: w, copy: true })} />
                      <IconAction icon={Trash01} danger label={t('Remove {name}', { name: w.name })} onPress={() => setDeleting(w)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {editing && (
        <WidgetModal
          widget={editing.copy ? null : editing.widget}
          initial={toForm(editing.widget, editing.copy)}
          categories={groups.map(([c]) => c)}
          onClose={() => setEditing(undefined)}
          onSaved={async (saved, isNew) => {
            setEditing(undefined);
            // A new composite has no parts yet: go straight to laying them out.
            if (isNew && saved.template_meta_id) navigate(`/metas/${saved.template_meta_id}`);
            else await load();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('Remove {name}?', { name: deleting.name })}
          message={t("It disappears from the page builder. While pages still use it, it can only be made inactive.")}
          confirmLabel={t("Remove widget")}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </AppShell>
  );
}

function WidgetModal({
  widget,
  initial,
  categories,
  onClose,
  onSaved,
}: {
  widget: Widget | null;
  initial: WidgetForm;
  categories: string[];
  onClose: () => void;
  onSaved: (saved: Widget, isNew: boolean) => void;
}) {
  const [form, setForm] = useState(initial);
  const [asJson, setAsJson] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof WidgetForm>(k: K, v: WidgetForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fe = (k: string) => fieldErrors[k]?.[0] ?? Object.entries(fieldErrors).find(([key]) => key.startsWith(`${k}.`))?.[1][0];

  // The props as typed, when they parse: they drive the preview.
  const props = useMemo(() => {
    try {
      const parsed = JSON.parse(form.props || '[]');
      return Array.isArray(parsed) ? (parsed as WidgetProp[]) : null;
    } catch {
      return null;
    }
  }, [form.props]);
  const draft: Widget = { id: widget?.id ?? 0, code: form.code, name: form.name || 'Widget', category: form.category, renderer: form.renderer, icon: form.icon || null, description: null, props: props ?? [], is_active: true, order_number: 0, template_meta_id: widget?.template_meta_id ?? null };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!props) {
      setFieldErrors({ props: [t("This is not a valid JSON list.")] });
      return;
    }
    const input: WidgetInput = {
      code: form.code.trim(),
      name: form.name.trim(),
      category: form.category.trim() || 'Content',
      renderer: form.renderer,
      icon: form.icon || null,
      description: form.description || null,
      props,
      is_active: form.is_active,
    };
    setSaving(true);
    setFieldErrors({});
    setError(null);
    try {
      if (widget) onSaved(await pageApi.updateWidget(widget.id, input), false);
      else onSaved(await pageApi.createWidget(input), true);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      else setError(message(err, t("The widget could not be saved.")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={widget ? t('Edit {name}', { name: widget.name }) : t("New widget")} onClose={onClose} size="xl">
      <form onSubmit={onSubmit} className="space-y-6">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Section title={t("Widget")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label={t("Name")} isRequired value={form.name} onChange={(v) => set('name', v)} isInvalid={!!fe('name')} hint={fe('name')} />
                <Input label={t("Code")} isRequired value={form.code} onChange={(v) => set('code', v)} isInvalid={!!fe('code')} hint={fe('code') ?? t("Lowercase letters, digits and _.")} />
                <Input label={t("Category")} value={form.category} onChange={(v) => set('category', v)} hint={fe('category') ?? t('e.g. {examples}', { examples: categories.slice(0, 3).join(', ') })} />
                <NativeSelect label={t("Drawn by")} value={form.renderer} onChange={(e) => set('renderer', e.target.value)} hint={fe('renderer') ?? (RENDERER_HINTS[form.renderer] && t(RENDERER_HINTS[form.renderer])) ?? t("The built-in renderer.")} options={RENDERERS.map((r) => ({ value: r, label: r }))} />
                <NativeSelect label={t("Icon")} value={form.icon} onChange={(e) => set('icon', e.target.value)} options={[{ value: '', label: t("Default") }, ...WIDGET_ICONS.map((i) => ({ value: i, label: i }))]} />
                <div className="self-end pb-2">
                  <Toggle label={t("Active")} hint={t("Offered in the page builder.")} isSelected={form.is_active} onChange={(v) => set('is_active', v)} />
                </div>
              </div>
              <TextArea label={t("Description")} rows={2} value={form.description} onChange={(v) => set('description', v)} />
            </Section>
            <Section title={t("Settings")}>
              <div className="-mt-2 flex items-center justify-between gap-2">
                <p className="text-sm text-tertiary">{t("What people fill in when they place this widget.")}</p>
                <Button size="sm" color="link-gray" isDisabled={asJson && props === null} onPress={() => setAsJson((j) => !j)}>
                  {asJson ? t("Edit as a form") : t("Edit as JSON")}
                </Button>
              </div>
              {fe('props') && <p className="text-sm text-error-primary">{fe('props')}</p>}
              {asJson || props === null ? (
                <TextArea
                  label={t("Props")}
                  rows={12}
                  value={form.props}
                  onChange={(v) => set('props', v)}
                  textAreaClassName="font-mono text-xs"
                  isInvalid={props === null}
                  hint={props === null ? t("Not valid JSON yet.") : t("A list of { key, label, type, default }.")}
                />
              ) : (
                <PropsEditor value={props} onChange={(next) => set('props', JSON.stringify(next, null, 2))} />
              )}
              {form.renderer === 'composite' && (
                <p className="text-sm text-tertiary">
                  {widget?.template_meta_id ? t("Its parts use these as {{key}}. ") : t("Add the widget, then lay out its parts. ")}
                  {t('Write')} <code className="font-mono text-xs">{'{{key}}'}</code> {t('in a part’s settings to fill it from this widget’s setting.')}
                </p>
              )}
            </Section>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-secondary">{t("Preview with the defaults")}</p>
            <div className="rounded-xl bg-secondary_alt p-4 ring-1 ring-secondary">
              <DrilldownHost>
                <WidgetBlock widget={draft} config={propValues(draft, null)} />
              </DrilldownHost>
            </div>
          </div>
        </div>
        <div className="modal-footer flex justify-end gap-3 border-t border-secondary pt-5">
          <Button size="md" color="secondary" onPress={onClose}>
            {t("Cancel")}
          </Button>
          <Button size="md" type="submit" isLoading={saving} showTextWhileLoading>
            {widget ? t("Save changes") : t("Add widget")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

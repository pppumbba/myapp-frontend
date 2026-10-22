import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash01 } from '@untitledui/icons';
import type { WidgetProp, WidgetPropType } from '../../lib/pageApi';
import { IconAction } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { Toggle } from '@/components/base/toggle/toggle';

const TYPES: { value: WidgetPropType; label: string }[] = [
  { value: 'text', label: 'Text (one line)' },
  { value: 'textarea', label: 'Text (several lines)' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Choice from a list' },
  { value: 'boolean', label: 'Yes / no' },
  { value: 'url', label: 'Web address' },
  { value: 'image', label: 'Image address' },
  { value: 'meta', label: 'A screen (meta)' },
  { value: 'list', label: 'List of rows' },
];

/** "Button label" -> "button_label". */
const toKey = (label: string) =>
  label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Comma-separated text kept as typed, handed on as a list. */
function CsvInput({ label, value, onChange, hint }: { label: string; value: string[] | undefined; onChange: (v: string[]) => void; hint?: string }) {
  const [text, setText] = useState(() => (value ?? []).join(', '));
  return (
    <Input
      label={label}
      size="sm"
      value={text}
      onChange={(t) => {
        setText(t);
        onChange(
          t
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
      hint={hint}
    />
  );
}

/**
 * The settings (props) of a library widget as a form: each one's label, key, type, default
 * and, by type, its choices, the meta types it may pick, or the fields of each row. These
 * become the settings form people fill in when they place the widget.
 */
export function PropsEditor({ value, onChange, nested = false }: { value: WidgetProp[]; onChange: (props: WidgetProp[]) => void; nested?: boolean }) {
  // Rows open for editing, by position; a new row opens.
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const set = (i: number, patch: Partial<WidgetProp>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
    setOpen(new Set());
  };

  function setLabel(i: number, label: string) {
    const p = value[i];
    // The key follows the label until it is changed by hand.
    set(i, { label, key: !p.key || p.key === toKey(p.label) ? toKey(label) : p.key });
  }

  function setType(i: number, type: WidgetPropType) {
    const { options: _o, meta_types: _m, fields: _f, default: _d, ...rest } = value[i];
    set(i, { ...rest, type, ...(type === 'select' ? { options: value[i].options ?? [] } : {}), ...(type === 'list' ? { fields: value[i].fields ?? [], default: [] } : {}) });
  }

  const duplicateKeys = new Set(value.map((p) => p.key).filter((k, i, all) => k && all.indexOf(k) !== i));

  return (
    <div className="space-y-2">
      {value.map((p, i) => (
        <div key={i} className="rounded-lg ring-1 ring-secondary">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <button type="button" onClick={() => toggle(i)} aria-expanded={open.has(i)} className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left outline-focus-ring focus-visible:outline-2">
              {open.has(i) ? <ChevronDown className="size-4 shrink-0 text-fg-quaternary" /> : <ChevronRight className="size-4 shrink-0 text-fg-quaternary" />}
              <span className="min-w-0 truncate text-sm font-medium text-primary">{p.label || 'New setting'}</span>
              <span className="shrink-0 font-mono text-xs text-quaternary">{p.key}</span>
              <span className="ml-auto shrink-0 text-xs text-tertiary">{TYPES.find((t) => t.value === p.type)?.label ?? p.type}</span>
            </button>
            <IconAction icon={ArrowUp} label={`Move ${p.label || 'setting'} up`} onPress={() => i > 0 && move(i, -1)} />
            <IconAction icon={ArrowDown} label={`Move ${p.label || 'setting'} down`} onPress={() => i < value.length - 1 && move(i, 1)} />
            <IconAction
              icon={Trash01}
              danger
              label={`Remove ${p.label || 'setting'}`}
              onPress={() => {
                onChange(value.filter((_, j) => j !== i));
                setOpen(new Set());
              }}
            />
          </div>

          {open.has(i) && (
            <div className="space-y-3 border-t border-secondary p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Label" size="sm" isRequired value={p.label} onChange={(v) => setLabel(i, v)} />
                <Input
                  label="Key"
                  size="sm"
                  isRequired
                  value={p.key}
                  onChange={(v) => set(i, { key: toKey(v) || v })}
                  isInvalid={duplicateKeys.has(p.key)}
                  hint={duplicateKeys.has(p.key) ? 'Another setting has this key.' : 'What the renderer reads; {{key}} in a composite’s parts.'}
                />
                <NativeSelect label="Type" value={p.type} onChange={(e) => setType(i, e.target.value as WidgetPropType)} options={TYPES} />
                {p.type === 'boolean' ? (
                  <div className="self-end pb-1.5">
                    <Toggle label="On by default" isSelected={p.default === true} onChange={(v) => set(i, { default: v })} />
                  </div>
                ) : p.type === 'select' ? (
                  <NativeSelect
                    label="Default"
                    value={p.default == null ? '' : String(p.default)}
                    onChange={(e) => set(i, { default: e.target.value || undefined })}
                    options={[{ value: '', label: 'None' }, ...(p.options ?? []).map((o) => ({ value: o, label: o }))]}
                  />
                ) : p.type === 'list' || p.type === 'meta' ? (
                  <div />
                ) : (
                  <Input
                    label="Default"
                    size="sm"
                    type={p.type === 'number' ? 'number' : 'text'}
                    value={p.default == null ? '' : String(p.default)}
                    onChange={(v) => set(i, { default: v === '' ? undefined : p.type === 'number' ? Number(v) : v })}
                  />
                )}
              </div>
              <Input label="Hint" size="sm" value={p.hint ?? ''} onChange={(v) => set(i, { hint: v || undefined })} hint="A line under the field, to help whoever fills it in." />
              {p.type === 'select' && <CsvInput label="Choices" value={p.options} onChange={(options) => set(i, { options })} hint="Comma separated, e.g. small, medium, large." />}
              {p.type === 'meta' && (
                <CsvInput label="Only these meta types" value={p.meta_types} onChange={(meta_types) => set(i, { meta_types: meta_types.length ? meta_types : undefined })} hint="Comma separated, e.g. chart, datagrid, form. Blank allows any." />
              )}
              {p.type === 'list' && !nested && (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-secondary">Each row has</p>
                  <PropsEditor nested value={p.fields ?? []} onChange={(fields) => set(i, { fields })} />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <Button
        size="sm"
        color="link-color"
        iconLeading={Plus}
        onPress={() => {
          onChange([...value, { key: '', label: '', type: 'text' }]);
          setOpen((s) => new Set(s).add(value.length));
        }}
      >
        Add a setting
      </Button>
    </div>
  );
}

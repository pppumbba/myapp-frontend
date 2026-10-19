import { useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaInput, type MetaOption, type MetaType } from '../../lib/metaApi';
import { Alert } from '../../components/ui';
import { Section } from '../../components/form';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { Modal } from '../../components/Modal';
import { TypePreview, typeLook } from '../../components/TypePreview';

interface FormState {
  code: string;
  name: string;
  label_name: string;
  type_id: string;
  ref_meta_id: string;
  description: string;
  table_name: string;
  is_active: boolean;
}

function initialState(meta: Meta | null, presetTypeId?: number): FormState {
  return {
    code: meta?.code ?? '',
    name: meta?.name ?? '',
    label_name: meta?.label_name ?? '',
    type_id: meta?.type_id ? String(meta.type_id) : presetTypeId ? String(presetTypeId) : '',
    ref_meta_id: meta?.ref_meta_id ? String(meta.ref_meta_id) : '',
    description: meta?.description ?? '',
    table_name: meta?.table_name ?? '',
    is_active: meta?.is_active ?? true,
  };
}

function toInput(f: FormState): MetaInput {
  return {
    code: f.code.trim(),
    name: f.name.trim(),
    label_name: f.label_name || null,
    type_id: f.type_id ? Number(f.type_id) : null,
    ref_meta_id: f.ref_meta_id ? Number(f.ref_meta_id) : null,
    description: f.description || null,
    table_name: f.table_name || null,
    is_active: f.is_active,
  };
}

/** "Customer list" -> "customer_list". Latin letters, digits and underscores only. */
function toCode(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function MetaFormModal({
  meta,
  types,
  options,
  presetTypeId,
  onClose,
  onSaved,
}: {
  /** null creates a new meta. */
  meta: Meta | null;
  types: MetaType[];
  options: MetaOption[];
  presetTypeId?: number;
  onClose: () => void;
  onSaved: (meta: Meta) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(meta, presetTypeId));
  // For a new meta, the code follows the name until the user edits the code themselves.
  const [codeTouched, setCodeTouched] = useState(meta !== null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const fe = (field: string) => fieldErrors[field]?.[0];

  function onName(name: string) {
    setForm((f) => ({ ...f, name, code: codeTouched ? f.code : toCode(name) }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const saved = meta ? await metaApi.update(meta.id, toInput(form)) : await metaApi.create(toInput(form));
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors ?? {});
        if (!err.errors) setError(err.message);
      } else {
        setError('The meta could not be saved. Check that the API is running, then try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={meta ? `Edit ${meta.name}` : 'New meta'}
      description={meta ? undefined : 'Pick what kind of screen this is, then give it a name.'}
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-8">
        {error && <Alert>{error}</Alert>}

        <Section title="Type">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {types.map((t) => {
              const look = typeLook(t.code);
              const selected = form.type_id === String(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set('type_id', String(t.id))}
                  className={`rounded-xl bg-primary p-2 text-left ring-inset transition duration-100 ease-linear ${
                    selected ? 'ring-2' : 'ring-1 ring-secondary hover:ring-primary'
                  }`}
                  style={selected ? { boxShadow: `inset 0 0 0 2px ${look.ink}` } : undefined}
                >
                  <div className="rounded-lg p-2" style={{ background: look.tint }}>
                    <TypePreview code={t.code} className="h-12 w-full" />
                  </div>
                  <span className="mt-2 block px-1 text-sm font-semibold text-primary">{t.name}</span>
                </button>
              );
            })}
          </div>
          {types.length === 0 && (
            <p className="text-sm text-tertiary">No meta types found. Add rows to the meta_types table first.</p>
          )}
          {fe('type_id') && <p className="text-sm text-error-primary">{fe('type_id')}</p>}
        </Section>

        <Section title="Name">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              isRequired
              autoFocus
              value={form.name}
              onChange={onName}
              placeholder="Customer list"
              isInvalid={!!fe('name')}
              hint={fe('name')}
            />
            <Input
              label="Code"
              isRequired
              value={form.code}
              onChange={(v) => {
                setCodeTouched(true);
                set('code', v);
              }}
              placeholder="customer_list"
              isInvalid={!!fe('code')}
              hint={fe('code') ?? 'Used in links and the API. Must be unique.'}
            />
            <Input
              label="Display label"
              value={form.label_name}
              onChange={(v) => set('label_name', v)}
              isInvalid={!!fe('label_name')}
              hint={fe('label_name') ?? 'Shown to people using the app. Leave blank to use the name.'}
            />
            <Input
              label="Database table"
              value={form.table_name}
              onChange={(v) => set('table_name', v)}
              placeholder="customers"
              isInvalid={!!fe('table_name')}
              hint={fe('table_name') ?? 'The table this screen reads and writes.'}
            />
          </div>
          <TextArea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(v) => set('description', v)}
            isInvalid={!!fe('description')}
            hint={fe('description')}
          />
        </Section>

        <Section title="Links">
          <NativeSelect
            label="Refers to"
            value={form.ref_meta_id}
            onChange={(e) => set('ref_meta_id', e.target.value)}
            hint={fe('ref_meta_id') ?? 'Another meta this one is based on or opens.'}
            options={[
              { label: 'Nothing', value: '' },
              ...options
                .filter((o) => o.id !== meta?.id)
                .map((o) => ({ label: `${o.name} (${o.type ?? 'no type'})`, value: String(o.id) })),
            ]}
          />
          <Toggle label="Active" hint="Inactive metas stay saved but are hidden from apps." isSelected={form.is_active} onChange={(v) => set('is_active', v)} />
        </Section>

        <div className="flex justify-end gap-3 border-t border-secondary pt-5">
          <Button size="lg" color="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button size="lg" type="submit" isLoading={saving} showTextWhileLoading>
            {saving ? 'Saving…' : meta ? 'Save changes' : 'Create meta'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

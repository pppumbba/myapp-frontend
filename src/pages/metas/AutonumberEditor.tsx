import { Plus, Trash01 } from '@untitledui/icons';
import { IconAction } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { Toggle } from '@/components/base/toggle/toggle';
import type { AutonumberConfig } from '../../render/definitions';
import { t } from '@/i18n';

const DEFAULT_FORMAT = 'PO-{yy}{MM}{dd}{seq:3}';

/** A format as the first number of today: {seq:3} -> 001, other {field}s stay as written. */
function example(format: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const parts: Record<string, string> = { yyyy: String(now.getFullYear()), yy: String(now.getFullYear()).slice(2), MM: pad(now.getMonth() + 1), dd: pad(now.getDate()) };
  return format.replace(/\{(\w+)(?::(\d+))?\}/g, (whole, name: string, digits?: string) =>
    name === 'seq' ? '1'.padStart(Number(digits ?? 1), '0') : (parts[name] ?? whole),
  );
}

/**
 * Edits json_config.autonumber inside a param's config JSON (backend: App\Support\Autonumber).
 * json is the config as typed; onChange gets it back with autonumber set or removed.
 */
export function AutonumberEditor({ json, fields, onChange }: { json: string; fields: string[]; onChange: (json: string) => void }) {
  let config: Record<string, unknown>;
  try {
    const parsed = json.trim() ? JSON.parse(json) : {};
    config = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return <p className="text-sm text-tertiary">{t("Fix the config JSON below to set up numbering here.")}</p>;
  }

  const auto = (config.autonumber as AutonumberConfig | undefined) ?? null;
  const save = (next: AutonumberConfig | null) => {
    const { autonumber: _old, ...rest } = config;
    const out = next ? { ...rest, autonumber: next } : rest;
    onChange(Object.keys(out).length ? JSON.stringify(out, null, 2) : '');
  };
  const rules = auto?.rules ?? [];
  const setRule = (i: number, patch: Partial<NonNullable<AutonumberConfig['rules']>[number]>) =>
    save({ ...auto!, rules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="space-y-4">
      <Toggle
        label={t("Number automatically")}
        hint={t("Each new record gets the next number, e.g. PO-261021001, then PO-261021002.")}
        isSelected={!!auto}
        onChange={(on) => save(on ? { format: DEFAULT_FORMAT } : null)}
      />
      {auto && (
        <>
          <Input
            label={t("Format")}
            value={auto.format}
            onChange={(v) => save({ ...auto, format: v })}
            inputClassName="font-mono"
            hint={t("Today's first: {example}. {yyyy} {yy} {MM} {dd} are the date, {seq:3} the number in 3 digits, {field} another field's value. The count starts again whenever the text around {seq} changes.", { example: example(auto.format) })}
          />
          <Toggle
            label={t("Can be typed over")}
            hint={t("Off: the number is always given. On: people may type their own; a blank one is numbered.")}
            isSelected={!!auto.editable}
            onChange={(v) => save({ ...auto, editable: v || undefined })}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium text-secondary">{t("Other formats, by a field's value")}</p>
            {rules.length === 0 && <p className="text-sm text-tertiary">{t("None: every record uses the format above.")}</p>}
            {rules.map((r, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_7rem_1.5fr_auto]">
                <NativeSelect
                  label={i === 0 ? t("When") : undefined}
                  aria-label={t("Field")}
                  value={r.field}
                  onChange={(e) => setRule(i, { field: e.target.value })}
                  options={[{ value: '', label: t("Pick a field…") }, ...fields.map((f) => ({ value: f, label: f }))]}
                />
                <Input label={i === 0 ? 'is' : undefined} aria-label={t("Value")} value={String(r.value ?? '')} onChange={(v) => setRule(i, { value: v })} />
                <Input label={i === 0 ? 'use' : undefined} aria-label={t("Format")} value={r.format} onChange={(v) => setRule(i, { format: v })} inputClassName="font-mono" />
                <IconAction icon={Trash01} danger label={t("Remove this format")} onPress={() => save({ ...auto, rules: rules.filter((_, j) => j !== i) })} className="mb-1.5" />
              </div>
            ))}
            <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => save({ ...auto, rules: [...rules, { field: '', value: '', format: auto.format.replace(/^[A-Za-z]+/, 'S$&') }] })}>
              {t("Add a format")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

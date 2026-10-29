import { useMemo, useState, type KeyboardEvent } from 'react';
import { Trash01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { metaApi, TAG_COLORS, type Tag, type TagColor } from '../../lib/metaApi';
import { Badge, BadgeWithButton } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { Alert, IconAction } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { t } from '@/i18n';

/** A tag without its own color gets one from its name, so it looks the same everywhere. */
export function tagColor(tag: Pick<Tag, 'name' | 'color'>): TagColor {
  if (tag.color) return tag.color;
  let h = 0;
  for (const ch of tag.name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export function TagBadge({ tag }: { tag: Tag }) {
  return (
    <Badge type="pill-color" size="sm" color={tagColor(tag)}>
      {tag.name}
    </Badge>
  );
}

/** A meta's tags: the ones picked, with a box that finds a tag or adds a new one. */
export function TagPicker({
  tags,
  value,
  onChange,
  onCreated,
  hint,
}: {
  /** Every tag there is. */
  tags: Tag[];
  /** The picked tags' ids. */
  value: number[];
  onChange: (ids: number[]) => void;
  /** A tag was just added, so the list of all tags can include it. */
  onCreated: (tag: Tag) => void;
  hint?: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = value.map((id) => tags.find((item) => item.id === id)).filter((item): item is Tag => !!item);
  const q = text.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? tags.filter((item) => !value.includes(item.id) && item.name.toLowerCase().includes(q)).slice(0, 8) : []),
    [tags, value, q],
  );
  const exact = tags.find((item) => item.name.toLowerCase() === q);

  function pick(tag: Tag) {
    if (!value.includes(tag.id)) onChange([...value, tag.id]);
    setText('');
    setError(null);
  }

  async function add() {
    const name = text.trim();
    if (!name) return;
    if (exact) return pick(exact);
    setBusy(true);
    try {
      const tag = await metaApi.createTag(name);
      onCreated(tag);
      pick(tag);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("The tag could not be added."));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      // Enter adds the tag instead of saving the meta.
      e.preventDefault();
      if (matches.length === 1 && !exact) pick(matches[0]);
      else add();
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="space-y-2">
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={t("Tags")}>
          {picked.map((item) => (
            <BadgeWithButton
              key={item.id}
              type="pill-color"
              size="md"
              color={tagColor(item)}
              buttonLabel={t('Remove {name}', { name: item.name })}
              onButtonClick={() => onChange(value.filter((id) => id !== item.id))}
            >
              {item.name}
            </BadgeWithButton>
          ))}
        </div>
      )}
      <div onKeyDown={onKeyDown}>
        <Input
          label={t("Tags")}
          value={text}
          onChange={setText}
          placeholder={t("Type to find a tag or add a new one")}
          isInvalid={!!error}
          hint={error ?? hint ?? t("What this meta is for. Enter adds the tag; a new name makes a new tag.")}
          isDisabled={busy}
        />
      </div>
      {q && (
        <div className="flex flex-wrap gap-1.5">
          {matches.map((item) => (
            <button key={item.id} type="button" onClick={() => pick(item)} className="rounded-full outline-focus-ring focus-visible:outline-2">
              <TagBadge tag={item} />
            </button>
          ))}
          {!exact && (
            <Button size="sm" color="link-color" onPress={add} isDisabled={busy}>
              {t('Add “{name}”', { name: text.trim() })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Admins rename, recolor and remove tags. */
export function TagsModal({ tags, onClose, onChanged }: { tags: Tag[]; onClose: () => void; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});

  async function run(job: () => Promise<unknown>) {
    setError(null);
    try {
      await job();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("The tag could not be changed."));
    }
  }

  function rename(tag: Tag) {
    const name = names[tag.id]?.trim();
    if (name && name !== tag.name) run(() => metaApi.updateTag(tag.id, { name }));
  }

  return (
    <Modal title={t("Tags")} description={t("Rename, recolor or remove the tags metas carry. Removing a tag only takes it off its metas.")} onClose={onClose}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {tags.length === 0 && <p className="text-sm text-tertiary">{t("No tags yet. Add them on a meta's form.")}</p>}
        <ul className="divide-y divide-secondary">
          {tags.map((item) => (
            <li key={item.id} className="flex items-end gap-3 py-3">
              <div className="flex-1">
                <Input
                  aria-label={t('Name of {name}', { name: item.name })}
                  size="sm"
                  value={names[item.id] ?? item.name}
                  onChange={(v) => setNames((n) => ({ ...n, [item.id]: v }))}
                  onBlur={() => rename(item)}
                />
              </div>
              <div className="w-32">
                <NativeSelect
                  aria-label={t('Color of {name}', { name: item.name })}
                  value={item.color ?? ''}
                  onChange={(e) => run(() => metaApi.updateTag(item.id, { color: (e.target.value || null) as TagColor | null }))}
                  options={[{ label: t("Automatic"), value: '' }, ...TAG_COLORS.map((c) => ({ label: c[0].toUpperCase() + c.slice(1), value: c }))]}
                />
              </div>
              <div className="flex w-28 items-center justify-end gap-2 pb-1">
                <TagBadge tag={item} />
                <span className="text-xs text-tertiary tabular-nums" title={t("Metas with this tag")}>
                  {item.metas_count ?? 0}
                </span>
                <IconAction icon={Trash01} danger label={t('Remove {name}', { name: item.name })} onPress={() => run(() => metaApi.removeTag(item.id))} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

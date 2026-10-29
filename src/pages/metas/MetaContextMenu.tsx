import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FC, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Copy01, Download01, Edit01, Eye, LayersTwo01, Link03, LinkExternal01, Plus, SearchLg, SwitchHorizontal01, Tag01, Trash01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type Tag } from '../../lib/metaApi';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';
import { TagBadge } from './MetaTags';
import { t } from '@/i18n';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const MENU_W = 224;

export type MenuAt = { x: number; y: number };

/** Where a menu opens for a contextmenu event: at the pointer, or under the element when opened from the keyboard. */
export function menuAt(e: { clientX: number; clientY: number; currentTarget: Element }): MenuAt {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + 16, y: r.top + 16 };
}

interface Props {
  meta: Meta;
  at: MenuAt;
  tags: Tag[];
  onClose: () => void;
  onEdit: (meta: Meta) => void;
  onDelete: (meta: Meta) => void;
  onReplace: (meta: Meta) => void;
  onExport: (meta: Meta) => void;
  /** After a copy, a new meta, or tags changed: the list is loaded again. */
  onChanged: (notice?: string) => void;
  onError: (message: string) => void;
}

type Sub = 'derive' | 'tags' | null;

/**
 * A meta's right-click menu on the Metas page: open it in the builder, view it as users do,
 * edit its settings, copy it whole, replace it with another, make a meta of another type
 * from it, tag it, export it to a file, delete it. Arrow keys move, → opens a submenu, Esc closes.
 */
export function MetaContextMenu({ meta, at, tags, onClose, onEdit, onDelete, onReplace, onExport, onChanged, onError }: Props) {
  const navigate = useNavigate();
  const menu = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [pos, setPos] = useState(at);
  const [busy, setBusy] = useState(false);

  // Kept inside the window.
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ x: Math.max(8, Math.min(at.x, window.innerWidth - width - 8)), y: Math.max(8, Math.min(at.y, window.innerHeight - height - 8)) });
    el.querySelector<HTMLElement>('[role=menuitem]')?.focus();
  }, [at]);

  // Closes on a click elsewhere, scrolling or resizing.
  useEffect(() => {
    const away = (e: Event) => {
      if (!(e.target instanceof Node) || !menu.current?.parentElement?.contains(e.target)) onClose();
    };
    const close = () => onClose();
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [onClose]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      onError(message(err, t("That did not work.")));
    } finally {
      setBusy(false);
      onClose();
    }
  }

  const copy = () =>
    run(async () => {
      const made = await metaApi.copy(meta.id);
      onChanged(`Copied as ${made.name} (${made.code}).`);
      onEdit(made);
    });

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <div className="fixed inset-0 z-50" onContextMenu={(e) => { e.preventDefault(); onClose(); }} style={{ pointerEvents: 'none' }}>
      <div
        ref={menu}
        role="menu"
        aria-label={t('{name} actions', { name: meta.name })}
        onKeyDown={(e) => keys(e, { onClose, onOpenSub: (s) => setSub(s) })}
        className="pointer-events-auto absolute rounded-lg bg-primary py-1 shadow-lg ring-1 ring-secondary"
        style={{ left: pos.x, top: pos.y, width: MENU_W }}
      >
        <p className="truncate px-3 pt-1 pb-1.5 text-xs font-semibold text-tertiary" title={`${meta.name} · ${meta.code}`}>{meta.name}</p>
        <Item icon={LinkExternal01} label={t("Open")} hint="builder" onSelect={() => go(`/metas/${meta.id}`)} onHover={() => setSub(null)} />
        <Item icon={Eye} label={t("View")} hint={t("as users see it")} onSelect={() => go(`/run/${meta.id}`)} onHover={() => setSub(null)} />
        <Item icon={Edit01} label={t("Edit")} hint="settings" onSelect={() => { onClose(); onEdit(meta); }} onHover={() => setSub(null)} />
        <Separator />
        <Item icon={Copy01} label={t("Copy")} disabled={busy} onSelect={copy} onHover={() => setSub(null)} />
        <Item icon={SwitchHorizontal01} label={t("Replace with…")} onSelect={() => { onClose(); onReplace(meta); }} onHover={() => setSub(null)} />
        <Item icon={LayersTwo01} label={t("Make based on")} submenu open={sub === 'derive'} onSelect={() => setSub('derive')} onHover={() => setSub('derive')} />
        <Item icon={Tag01} label={t("Tags")} submenu open={sub === 'tags'} onSelect={() => setSub('tags')} onHover={() => setSub('tags')} />
        <Item icon={Download01} label={t("Export…")} hint={t("to a file")} onSelect={() => { onClose(); onExport(meta); }} onHover={() => setSub(null)} />
        <Item icon={Link03} label={t("Where used")} onSelect={() => go(`/metas/usage?meta=${meta.id}`)} onHover={() => setSub(null)} />
        <Separator />
        <Item icon={Trash01} label={t("Delete")} danger onSelect={() => { onClose(); onDelete(meta); }} onHover={() => setSub(null)} />
      </div>
      {sub && (
        <SubPanel anchor={menu} index={sub === 'derive' ? 6 : 7} onBack={() => { setSub(null); menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]')[sub === 'derive' ? 5 : 6]?.focus(); }} onClose={onClose}>
          {sub === 'derive' ? (
            <DeriveItems meta={meta} onMade={(made) => run(async () => { onChanged(`Made ${made.type?.name ?? 'a meta'} ${made.name}.`); navigate(`/metas/${made.id}`); })} onError={onError} />
          ) : (
            <TagItems meta={meta} tags={tags} onChanged={onChanged} onError={onError} />
          )}
        </SubPanel>
      )}
    </div>
  );
}

/** Up and down move between the panel's items; → opens a submenu, ← and Esc go back. */
function keys(e: KeyboardEvent<HTMLDivElement>, { onClose, onOpenSub }: { onClose: () => void; onOpenSub?: (s: Sub) => void }) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem],[role=menuitemcheckbox]')].filter((el) => !el.hasAttribute('disabled'));
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    onClose();
  } else if (e.key === 'ArrowRight' && onOpenSub) {
    const s = (document.activeElement as HTMLElement | null)?.dataset.sub as Sub | undefined;
    if (s) {
      e.preventDefault();
      onOpenSub(s);
    }
  } else if (e.key === 'Tab') {
    e.preventDefault();
  }
}

function Item({ icon: Icon, label, hint, danger, disabled, submenu, open, onSelect, onHover }: {
  icon: FC<{ className?: string }>;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  submenu?: boolean;
  open?: boolean;
  onSelect: () => void;
  onHover?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-haspopup={submenu ? 'menu' : undefined}
      aria-expanded={submenu ? open : undefined}
      data-sub={submenu ? (label === 'Tags' ? 'tags' : 'derive') : undefined}
      disabled={disabled}
      onClick={onSelect}
      onPointerEnter={onHover}
      className={cx(
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none focus-visible:bg-primary_hover disabled:opacity-50',
        danger ? 'text-error-primary hover:bg-error-primary' : 'text-secondary hover:bg-primary_hover',
        open && 'bg-primary_hover',
      )}
    >
      <Icon className={cx('size-4 shrink-0', danger ? 'text-fg-error-secondary' : 'text-fg-quaternary')} />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-xs text-quaternary">{hint}</span>}
      {submenu && <ChevronRight className="size-4 text-fg-quaternary" />}
    </button>
  );
}

function Separator() {
  return <div role="separator" className="my-1 border-t border-secondary" />;
}

/** A submenu beside the main one (or on its left when there is no room), level with its item. */
function SubPanel({ anchor, index, onBack, onClose, children }: { anchor: RefObject<HTMLDivElement | null>; index: number; onBack: () => void; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuAt | null>(null);
  useLayoutEffect(() => {
    const menu = anchor.current?.getBoundingClientRect();
    const item = anchor.current?.querySelectorAll('[role=menuitem]')[index - 1]?.getBoundingClientRect();
    const el = panel.current?.getBoundingClientRect();
    if (!menu || !item || !el) return;
    const right = menu.right + el.width + 8 <= window.innerWidth;
    setPos({ x: right ? menu.right - 4 : menu.left - el.width + 4, y: Math.max(8, Math.min(item.top - 4, window.innerHeight - el.height - 8)) });
  }, [anchor, index, children]);
  useEffect(() => {
    if (pos) panel.current?.querySelector<HTMLElement>('[role=menuitem],[role=menuitemcheckbox],input')?.focus({ preventScroll: true });
  }, [pos === null]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={panel}
      role="menu"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
          onBack();
        } else if (!(e.target instanceof HTMLInputElement) || e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          keys(e, { onClose });
        }
      }}
      className="pointer-events-auto absolute max-h-80 w-60 overflow-auto rounded-lg bg-primary py-1 shadow-lg ring-1 ring-secondary"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? 0 }}
    >
      {children}
    </div>
  );
}

/** The types this meta can be made into; picking one makes it and opens it. */
function DeriveItems({ meta, onMade, onError }: { meta: Meta; onMade: (made: Meta) => void; onError: (m: string) => void }) {
  const [targets, setTargets] = useState<{ code: string; name: string }[] | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  useEffect(() => {
    metaApi.deriveTargets(meta.id).then(setTargets, (err) => {
      setTargets([]);
      onError(message(err, t("Could not tell what can be made from it.")));
    });
  }, [meta.id, onError]);

  if (!targets) return <p className="px-3 py-2 text-sm text-tertiary">{t("Loading…")}</p>;
  if (!targets.length) return <p className="px-3 py-2 text-sm text-tertiary">{t('Nothing can be made from a {type} like this: it reads no table or query.', { type: meta.type?.name?.toLowerCase() ?? 'meta' })}</p>;
  return (
    <>
      <p className="px-3 pt-1 pb-1.5 text-xs text-tertiary">{t("A new meta on the same data, with its fields")}</p>
      {targets.map((entry) => (
        <button
          key={entry.code}
          type="button"
          role="menuitem"
          disabled={making !== null}
          onClick={async () => {
            setMaking(entry.code);
            try {
              onMade(await metaApi.derive(meta.id, entry.code));
            } catch (err) {
              onError(message(err, t('The {name} could not be made.', { name: entry.name.toLowerCase() })));
              setMaking(null);
            }
          }}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-secondary outline-none hover:bg-primary_hover focus-visible:bg-primary_hover disabled:opacity-50"
        >
          <Plus className="size-4 shrink-0 text-fg-quaternary" />
          <span className="flex-1">{entry.name}</span>
          {making === entry.code && <span className="text-xs text-quaternary">{t("making…")}</span>}
        </button>
      ))}
    </>
  );
}

/** Every tag, ticked when the meta has it; ticking saves at once. A name typed in adds a new tag. */
function TagItems({ meta, tags, onChanged, onError }: { meta: Meta; tags: Tag[]; onChanged: (notice?: string) => void; onError: (m: string) => void }) {
  const [ids, setIds] = useState(() => (meta.tags ?? []).map((entry) => entry.id));
  const [all, setAll] = useState(tags);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => all.filter((entry) => entry.name.toLowerCase().includes(name.trim().toLowerCase())), [all, name]);
  const exact = all.some((entry) => entry.name.toLowerCase() === name.trim().toLowerCase());

  async function save(next: number[]) {
    const before = ids;
    setIds(next);
    setBusy(true);
    try {
      await metaApi.update(meta.id, { tag_ids: next });
      onChanged();
    } catch (err) {
      setIds(before);
      onError(message(err, t("The tags could not be saved.")));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const typed = name.trim();
    if (!typed) return;
    setBusy(true);
    try {
      const tag = await metaApi.createTag(typed);
      setAll((list) => (list.some((entry) => entry.id === tag.id) ? list : [...list, tag].sort((a, b) => a.name.localeCompare(b.name))));
      setName('');
      setBusy(false);
      if (!ids.includes(tag.id)) await save([...ids, tag.id]);
    } catch (err) {
      onError(message(err, t("The tag could not be made.")));
      setBusy(false);
    }
  }

  return (
    <>
      <label className="mx-2 mb-1 flex items-center gap-1.5 rounded-md px-2 py-1 ring-1 ring-secondary">
        <SearchLg className="size-3.5 text-fg-quaternary" aria-hidden="true" />
        <input
          aria-label={t("Find or add a tag")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (shown.length === 1 && exact) void save(ids.includes(shown[0].id) ? ids.filter((x) => x !== shown[0].id) : [...ids, shown[0].id]);
              else void add();
            }
          }}
          placeholder={t("Find or add a tag")}
          className="w-full bg-transparent text-sm text-primary outline-none placeholder:text-placeholder"
        />
      </label>
      {shown.map((entry) => {
        const on = ids.includes(entry.id);
        return (
          <button
            key={entry.id}
            type="button"
            role="menuitemcheckbox"
            aria-checked={on}
            disabled={busy}
            onClick={() => save(on ? ids.filter((x) => x !== entry.id) : [...ids, entry.id])}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-secondary outline-none hover:bg-primary_hover focus-visible:bg-primary_hover disabled:opacity-60"
          >
            <span className="flex size-4 items-center justify-center">{on && <Check className="size-4 text-fg-brand-primary" />}</span>
            <span className="min-w-0 flex-1 truncate">
              <TagBadge tag={entry} />
            </span>
          </button>
        );
      })}
      {name.trim() && !exact && (
        <button type="button" role="menuitem" disabled={busy} onClick={add} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm font-medium text-brand-secondary outline-none hover:bg-primary_hover focus-visible:bg-primary_hover">
          <Plus className="size-4" /> {t('Add tag “{name}”', { name: name.trim() })}
        </button>
      )}
      {!shown.length && !name.trim() && <p className="px-3 py-2 text-sm text-tertiary">{t("No tags yet. Type a name to add one.")}</p>}
    </>
  );
}

/**
 * Makes a meta the same as another: its type, table, fields, buttons, workflow, permissions,
 * tags… everything but its id, code and name, so whatever points at it keeps working. Its
 * current state is kept as a version, so it can be put back.
 */
export function ReplaceMetaModal({ target, metas, onClose, onDone }: { target: Meta; metas: Meta[]; onClose: () => void; onDone: (notice: string) => void }) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<Meta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const shown = metas.filter((m) => m.id !== target.id && `${m.name} ${m.code} ${m.type?.name ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 100);

  async function replace() {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const result = await metaApi.replace(target.id, source.id);
      if (result.warnings.length) setWarnings(result.warnings);
      else onDone(t('{target} is now the same as {source}. Its previous state is in its versions.', { target: target.name, source: source.name }));
    } catch (err) {
      setError(message(err, t("It could not be replaced.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('Replace {name}', { name: target.name })} description={t("It becomes the same as the meta you pick: type, table, fields, buttons, workflow, permissions and tags. Its id, code and name stay, so menus and links to it keep working.")} onClose={onClose} size="lg">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {warnings ? (
          <>
            <Alert>{t('Replaced, with notes: {notes}', { notes: warnings.join(' ') })}</Alert>
            <div className="flex justify-end">
              <Button size="sm" onPress={() => onDone(t('{target} is now the same as {source}.', { target: target.name, source: source?.name }))}>{t("Done")}</Button>
            </div>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ring-primary">
              <SearchLg className="size-4 text-fg-quaternary" aria-hidden="true" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Find the meta to copy from")} aria-label={t("Find the meta to copy from")} className="w-full bg-transparent text-sm text-primary outline-none placeholder:text-placeholder" />
            </label>
            <ul role="listbox" aria-label={t("Metas")} className="max-h-72 divide-y divide-secondary overflow-auto rounded-lg ring-1 ring-secondary">
              {shown.map((m) => (
                <li key={m.id} role="option" aria-selected={source?.id === m.id}>
                  <button type="button" onClick={() => setSource(m)} className={cx('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-primary_hover', source?.id === m.id && 'bg-brand-primary_alt')}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-primary">{m.name}</span>
                      <span className="block truncate text-xs text-tertiary">{m.code}</span>
                    </span>
                    <span className="text-xs text-tertiary">{m.type?.name}</span>
                    {source?.id === m.id && <Check className="size-4 text-fg-brand-primary" />}
                  </button>
                </li>
              ))}
              {!shown.length && <li className="px-3 py-4 text-sm text-tertiary">{t("No meta matches.")}</li>}
            </ul>
            {source && (
              <p className="rounded-lg bg-warning-primary p-3 text-sm text-warning-primary">
                {t('Everything {target} has now is replaced by a copy of {source}’s ({type}). Its current state is saved as a version first, so you can put it back from its Versions.', { target: target.name, source: source.name, type: source.type?.name })}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" color="secondary" onPress={onClose}>{t("Cancel")}</Button>
              <Button size="sm" color="primary-destructive" isDisabled={!source} isLoading={busy} showTextWhileLoading onPress={replace}>
                {t("Replace")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

import { Link } from 'react-router-dom';
import type { Meta } from '../../lib/metaApi';
import { TypePreview, typeLook } from '../../components/TypePreview';
import { DotsVertical, Edit01, Link01, Trash01 } from '@untitledui/icons';
import type { MouseEvent } from 'react';
import { menuAt, type MenuAt } from './MetaContextMenu';
import { IconAction } from '../../components/ui';
import { BadgeWithDot } from '@/components/base/badges/badges';
import { TagBadge } from './MetaTags';
import { t } from '@/i18n';

function rowsText(meta: Meta): string {
  const n = meta.params_count ?? 0;
  const noun = typeLook(meta.type?.code).rowNoun;
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function TypeTag({ meta }: { meta: Meta }) {
  const look = typeLook(meta.type?.code);
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-current/15 ring-inset"
      style={{ background: look.tint, color: look.ink }}
    >
      {meta.type?.name ?? t("No type")}
    </span>
  );
}

function Status({ active }: { active: boolean }) {
  return (
    <BadgeWithDot type="pill-color" size="sm" color={active ? 'success' : 'gray'}>
      {active ? t("Active") : t("Inactive")}
    </BadgeWithDot>
  );
}

/** A meta's tags, the first few and how many more. */
function Tags({ meta, max = 3 }: { meta: Meta; max?: number }) {
  const tags = meta.tags ?? [];
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.slice(0, max).map((item) => (
        <TagBadge key={item.id} tag={item} />
      ))}
      {tags.length > max && <span className="text-xs text-tertiary" title={tags.slice(max).map((item) => item.name).join(', ')}>+{tags.length - max}</span>}
    </div>
  );
}

interface CardProps {
  meta: Meta;
  onEdit?: (meta: Meta) => void;
  onDelete?: (meta: Meta) => void;
  /** Opens the meta's menu (right click, or the ⋮ button). */
  onMenu?: (meta: Meta, at: MenuAt) => void;
}

/** The right-click handler, when there is a menu. */
const contextMenu = (meta: Meta, onMenu?: CardProps['onMenu']) =>
  onMenu
    ? (e: MouseEvent<HTMLElement>) => {
        e.preventDefault();
        onMenu(meta, menuAt(e));
      }
    : undefined;

function MoreButton({ meta, onMenu }: { meta: Meta; onMenu: NonNullable<CardProps['onMenu']> }) {
  return (
    <button
      type="button"
      aria-label={t('More actions for {name}', { name: meta.name })}
      aria-haspopup="menu"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onMenu(meta, { x: r.right - 224, y: r.bottom + 4 });
      }}
      className="rounded-md p-1.5 text-fg-quaternary outline-focus-ring hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2"
    >
      <DotsVertical className="size-4" aria-hidden="true" />
    </button>
  );
}

/** Off-screen type drawings and rows are not drawn (content-visibility), so a list of hundreds stays quick; auto keeps each one's last drawn height. */
const offscreen = '[content-visibility:auto]';

/** Grid view: the type drawing on top, details and actions below. */
export function MetaCard({ meta, onEdit, onDelete, onMenu }: CardProps) {
  const look = typeLook(meta.type?.code);
  return (
    <article onContextMenu={contextMenu(meta, onMenu)} className="group relative flex flex-col overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary transition duration-100 ease-linear ring-inset hover:shadow-md">
      <div className={`relative px-5 pt-5 pb-3 ${offscreen} [contain-intrinsic-size:auto_112px]`} style={{ background: look.tint }}>
        <TypePreview code={meta.type?.code} className="mx-auto h-20 w-full max-w-[180px]" />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* The whole card is clickable through this link's ::after overlay. */}
            <Link
              to={`/metas/${meta.id}`}
              className="block truncate text-md font-semibold text-primary after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus-ring"
            >
              {meta.name}
            </Link>
            <p className="truncate text-sm text-tertiary">{meta.code}</p>
          </div>
          <TypeTag meta={meta} />
        </div>

        {meta.description && <p className="line-clamp-2 text-sm text-tertiary">{meta.description}</p>}
        <Tags meta={meta} />

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-secondary pt-3 text-sm text-tertiary">
          <span>{rowsText(meta)}</span>
          {meta.ref_meta && (
            <span className="inline-flex items-center gap-1">
              <Link01 className="size-3.5 text-fg-quaternary" />
              {meta.ref_meta.name}
            </span>
          )}
          <Status active={meta.is_active} />
        </div>
      </div>

      {(onEdit || onDelete || onMenu) && (
        <div className="absolute top-3 right-3 z-10 flex gap-0.5 rounded-lg bg-primary p-0.5 opacity-100 shadow-sm ring-1 ring-secondary sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          {onEdit && <IconAction icon={Edit01} label={t('Edit {name}', { name: meta.name })} onPress={() => onEdit(meta)} />}
          {onDelete && <IconAction icon={Trash01} danger label={t('Delete {name}', { name: meta.name })} onPress={() => onDelete(meta)} />}
          {onMenu && <MoreButton meta={meta} onMenu={onMenu} />}
        </div>
      )}
    </article>
  );
}

/** List view: one compact row per meta, same information. */
export function MetaRow({ meta, onEdit, onDelete, onMenu }: CardProps) {
  const look = typeLook(meta.type?.code);
  return (
    <article onContextMenu={contextMenu(meta, onMenu)} className={`group relative flex items-center gap-4 bg-primary px-4 py-3 transition duration-100 ease-linear hover:bg-primary_hover ${offscreen} [contain-intrinsic-size:auto_72px]`}>
      <div className="w-16 shrink-0 rounded-lg p-1.5" style={{ background: look.tint }}>
        <TypePreview code={meta.type?.code} className="w-full" />
      </div>
      <div className="min-w-0 flex-1">
        <Link
          to={`/metas/${meta.id}`}
          className="block truncate text-md font-semibold text-primary after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus-ring focus-visible:after:-outline-offset-2"
        >
          {meta.name}
        </Link>
        <p className="truncate text-sm text-tertiary">{meta.code}</p>
      </div>
      <div className="hidden w-56 lg:block">
        <Tags meta={meta} max={2} />
      </div>
      <div className="hidden w-28 sm:block">
        <TypeTag meta={meta} />
      </div>
      <span className="hidden w-28 text-sm text-tertiary md:block">{rowsText(meta)}</span>
      <span className="hidden w-24 md:block">
        <Status active={meta.is_active} />
      </span>
      <div className="relative z-10 flex gap-1">
        {onEdit && <IconAction icon={Edit01} label={t('Edit {name}', { name: meta.name })} onPress={() => onEdit(meta)} />}
        {onDelete && <IconAction icon={Trash01} danger label={t('Delete {name}', { name: meta.name })} onPress={() => onDelete(meta)} />}
        {onMenu && <MoreButton meta={meta} onMenu={onMenu} />}
      </div>
    </article>
  );
}

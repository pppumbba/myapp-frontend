import { Link } from 'react-router-dom';
import type { Meta } from '../../lib/metaApi';
import { api } from '../../lib/api';
import { typeColors, typeLook } from '../../components/TypePreview';
import { TypeIcon } from '../../components/TypeIcon';
import { DotsVertical, Link01, Star01 } from '@untitledui/icons';
import type { MouseEvent, ReactNode } from 'react';
import { menuAt, type MenuAt } from './MetaContextMenu';
import { BadgeWithDot } from '@/components/base/badges/badges';
import { TagBadge } from './MetaTags';
import { t } from '@/i18n';

function rowsText(meta: Meta): string {
  const n = meta.params_count ?? 0;
  const noun = typeLook(meta.type?.code).rowNoun;
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function TypeTag({ meta }: { meta: Pick<Meta, 'type'> }) {
  const colors = typeColors(meta.type?.code);
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-current/15 ring-inset ${colors.className}`} style={colors.style}>
      {meta.type?.name ?? t('No type')}
    </span>
  );
}

function Status({ active }: { active: boolean }) {
  return (
    <BadgeWithDot type="pill-color" size="sm" color={active ? 'success' : 'gray'}>
      {active ? t('Active') : t('Inactive')}
    </BadgeWithDot>
  );
}

/** A meta's tags, the first few and how many more. */
export function Tags({ meta, max = 3 }: { meta: Pick<Meta, 'tags'>; max?: number }) {
  const tags = meta.tags ?? [];
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.slice(0, max).map((item) => (
        <TagBadge key={item.id} tag={item} />
      ))}
      {tags.length > max && (
        <span
          className="text-xs text-tertiary"
          title={tags
            .slice(max)
            .map((item) => item.name)
            .join(', ')}
        >
          +{tags.length - max}
        </span>
      )}
    </div>
  );
}

interface CardProps {
  meta: Meta;
  /** Opens the meta's menu (right click, or the ⋮ button). */
  onMenu?: (meta: Meta, at: MenuAt) => void;
  /** Starred by the user: the star stays shown, filled. */
  starred?: boolean;
  /** Stars or unstars it; no star button without it. */
  onStar?: (meta: Meta) => void;
  /** A line under the details, e.g. when it was opened or who shared it. */
  note?: ReactNode;
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

function StarButton({ meta, starred, onStar }: { meta: Meta; starred: boolean; onStar: (meta: Meta) => void }) {
  return (
    <button
      type="button"
      aria-label={starred ? t('Remove {name} from starred', { name: meta.name }) : t('Star {name}', { name: meta.name })}
      aria-pressed={starred}
      onClick={() => onStar(meta)}
      className={`rounded-md p-1.5 outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 ${starred ? 'text-fg-warning-secondary' : 'text-fg-quaternary hover:text-fg-quaternary_hover'}`}
    >
      <Star01 className={`size-4 ${starred ? 'fill-current' : ''}`} aria-hidden="true" />
    </button>
  );
}

/**
 * Pointing at a meta starts loading what its page needs (kept, see SETUP in lib/api), so the page
 * opens with it at once instead of a loading box. Quiet: a failed early load is asked for again.
 */
function prefetch(meta: Meta) {
  for (const path of [`/metas/${meta.id}`, '/meta-types', '/metas/options']) api(path, { notify: false }).catch(() => undefined);
}

/** Off-screen cards and rows are not drawn (content-visibility), so a list of hundreds stays quick; auto keeps each one's last drawn height. */
const offscreen = '[content-visibility:auto]';

/** Grid view: the type icon and name on top, details and actions below. */
export function MetaCard({ meta, onMenu, starred = false, onStar, note }: CardProps) {
  return (
    <article
      onContextMenu={contextMenu(meta, onMenu)}
      onPointerEnter={() => prefetch(meta)}
      onFocus={() => prefetch(meta)}
      className={`group relative flex flex-col gap-2.5 rounded-xl bg-primary p-3.5 shadow-xs ring-1 ring-secondary transition duration-100 ease-linear ring-inset hover:shadow-md ${offscreen} [contain-intrinsic-size:auto_140px]`}
    >
      <div className="flex items-center gap-2.5">
        <TypeIcon code={meta.type?.code} size="sm" />
        <div className="min-w-0 flex-1">
          {/* The whole card is clickable through this link's ::after overlay. */}
          <Link
            to={`/metas/${meta.id}`}
            className="block truncate text-sm font-semibold text-primary after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus-ring"
          >
            {meta.name}
          </Link>
          <p className="truncate text-xs text-tertiary">{meta.code}</p>
        </div>
      </div>

      {meta.description && <p className="line-clamp-2 text-xs text-tertiary">{meta.description}</p>}
      <Tags meta={meta} max={2} />

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-secondary pt-2.5 text-xs text-tertiary">
        <TypeTag meta={meta} />
        <span>{rowsText(meta)}</span>
        {meta.ref_meta && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Link01 className="size-3 shrink-0 text-fg-quaternary" />
            <span className="truncate">{meta.ref_meta.name}</span>
          </span>
        )}
        <Status active={meta.is_active} />
      </div>
      {note && <p className="-mt-1 truncate text-xs text-tertiary">{note}</p>}

      {(onMenu || onStar) && (
        <div
          className={`absolute top-2.5 right-2.5 z-10 flex gap-0.5 rounded-lg bg-primary p-0.5 shadow-sm ring-1 ring-secondary sm:group-hover:opacity-100 sm:focus-within:opacity-100 ${starred ? '' : 'sm:opacity-0'}`}
        >
          {onStar && <StarButton meta={meta} starred={starred} onStar={onStar} />}
          {onMenu && <MoreButton meta={meta} onMenu={onMenu} />}
        </div>
      )}
    </article>
  );
}

/** List view: one compact row per meta, same information. */
export function MetaRow({ meta, onMenu, starred = false, onStar, note }: CardProps) {
  return (
    <article
      onContextMenu={contextMenu(meta, onMenu)}
      onPointerEnter={() => prefetch(meta)}
      onFocus={() => prefetch(meta)}
      className={`group relative flex items-center gap-4 bg-primary px-4 py-3 transition duration-100 ease-linear hover:bg-primary_hover ${offscreen} [contain-intrinsic-size:auto_64px]`}
    >
      <TypeIcon code={meta.type?.code} />
      <div className="min-w-0 flex-1">
        <Link
          to={`/metas/${meta.id}`}
          className="block truncate text-md font-semibold text-primary after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus-ring focus-visible:after:-outline-offset-2"
        >
          {meta.name}
        </Link>
        <p className="truncate text-sm text-tertiary">
          {meta.code}
          {note && <> · {note}</>}
        </p>
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
        {onStar && <StarButton meta={meta} starred={starred} onStar={onStar} />}
        {onMenu && <MoreButton meta={meta} onMenu={onMenu} />}
      </div>
    </article>
  );
}

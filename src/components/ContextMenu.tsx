import { useEffect, useLayoutEffect, useRef, useState, type FC, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

export type MenuPoint = { x: number; y: number };

export type MenuEntry =
  | { key: string; label: string; icon?: FC<{ className?: string }>; hint?: string; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | { key: string; separator: true };

/** Where a menu opens for a contextmenu event: at the pointer, or by the element when opened from the keyboard. */
export function pointOf(e: { clientX: number; clientY: number; currentTarget: Element }): MenuPoint {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + 16, y: r.top + r.height / 2 };
}

/**
 * A right-click menu at a point: a title and a list of entries. Arrow keys move, Enter
 * picks, Esc, a click elsewhere, scrolling or resizing close it. Separators at the ends or
 * next to each other are dropped, so callers can list them freely.
 * anchor: the button that opened it; a click there is left to the button, so it can toggle the menu.
 */
export function ContextMenu({ at, title, entries, onClose, anchor }: { at: MenuPoint; title?: string; entries: MenuEntry[]; onClose: () => void; anchor?: RefObject<Element | null> }) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const shown = entries.filter((e, i, all) => {
    if (!('separator' in e)) return true;
    const before = all.slice(0, i).filter((x) => !('separator' in x)).length;
    const after = all.slice(i + 1).filter((x) => !('separator' in x)).length;
    return before > 0 && after > 0 && !('separator' in (all[i + 1] ?? {}));
  });

  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ x: Math.max(8, Math.min(at.x, window.innerWidth - width - 8)), y: Math.max(8, Math.min(at.y, window.innerHeight - height - 8)) });
    el.querySelector<HTMLElement>('[role=menuitem]:not([disabled])')?.focus({ preventScroll: true });
  }, [at]);

  useEffect(() => {
    const away = (e: Event) => {
      if (!(e.target instanceof Node) || (!menu.current?.contains(e.target) && !anchor?.current?.contains(e.target))) onClose();
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
  }, [onClose, anchor]);

  function keys(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]:not([disabled])')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      onClose();
    }
  }

  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={title ?? t('Actions')}
      onKeyDown={keys}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[60] min-w-52 max-w-72 rounded-lg bg-primary py-1 shadow-lg ring-1 ring-secondary"
      style={{ left: pos.x, top: pos.y }}
    >
      {title && <p className="truncate px-3 pt-1 pb-1.5 text-xs font-semibold text-tertiary" title={title}>{title}</p>}
      {shown.map((e) =>
        'separator' in e ? (
          <div key={e.key} role="separator" className="my-1 border-t border-secondary" />
        ) : (
          <button
            key={e.key}
            type="button"
            role="menuitem"
            disabled={e.disabled}
            onClick={() => {
              onClose();
              e.onSelect();
            }}
            className={cx(
              'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none focus-visible:bg-primary_hover disabled:cursor-default disabled:opacity-50',
              e.danger ? 'text-error-primary hover:bg-error-primary' : 'text-secondary hover:bg-primary_hover',
            )}
          >
            {e.icon && <e.icon className={cx('size-4 shrink-0', e.danger ? 'text-fg-error-secondary' : 'text-fg-quaternary')} />}
            <span className="flex-1 truncate">{e.label}</span>
            {e.hint && <span className="text-xs text-quaternary">{e.hint}</span>}
          </button>
        ),
      )}
      {!shown.length && <p className="px-3 py-2 text-sm text-tertiary">{t('Nothing to do here.')}</p>}
    </div>,
    document.body,
  );
}

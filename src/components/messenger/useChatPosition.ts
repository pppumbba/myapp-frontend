import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** Where the chat button sits: its right edge from the window's right, its bottom edge from the window's bottom, in px. */
export interface Spot {
  x: number;
  y: number;
}

const KEY = 'chat_position';
/** The round button's size, and the least gap it keeps to the window edges. */
export const BUTTON = 48;
const EDGE = 8;
/** A press that moves less than this is a click, not a drag. */
const SLOP = 4;
const START: Spot = { x: 16, y: 16 };
/** Tailwind's lg: from here the side menu is fixed beside the page. */
const LARGE = 1024;

function read(): Spot {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) return s;
  } catch {
    // Blocked or broken storage: start in the corner.
  }
  return START;
}

function save(spot: Spot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(spot));
  } catch {
    // The button still moves for this visit.
  }
}

/** Inside the window; on large screens also clear of a menu taking `menuRight` px on the right. */
const clamp = (spot: Spot, w: number, h: number, menuRight: number): Spot => ({
  x: Math.round(Math.min(Math.max(spot.x, EDGE + (w >= LARGE ? menuRight : 0)), w - BUTTON - EDGE)),
  y: Math.round(Math.min(Math.max(spot.y, EDGE), h - BUTTON - EDGE)),
});

/**
 * The chat button's place, dragged with the pointer (the button itself or the panel's header) and
 * remembered in this browser. Kept inside the window when it shrinks. wasDragged() tells a click
 * that ended a drag apart from a real click. menuRight: the width of a menu fixed on the right,
 * which the button stays clear of so it doesn't cover the menu's foot.
 */
export function useChatPosition(menuRight = 0) {
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [stored, setStored] = useState(read);
  const [dragging, setDragging] = useState(false);
  const dragged = useRef(false);

  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const spot = clamp(stored, view.w, view.h, menuRight);

  const startDrag = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const from = { px: e.clientX, py: e.clientY, ...spot };
      let moved = false;
      let last = spot;
      dragged.current = false;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - from.px;
        const dy = ev.clientY - from.py;
        if (!moved && Math.hypot(dx, dy) < SLOP) return;
        if (!moved) {
          moved = true;
          setDragging(true);
          // No text gets selected on the page while dragging over it.
          document.documentElement.style.userSelect = 'none';
          window.getSelection()?.removeAllRanges();
        }
        last = clamp({ x: from.x - dx, y: from.y - dy }, window.innerWidth, window.innerHeight, menuRight);
        setStored(last);
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        if (moved) {
          document.documentElement.style.userSelect = '';
          save(last);
          setDragging(false);
          dragged.current = true;
          // The click that follows the drag's pointerup is swallowed, then clicks work again.
          window.setTimeout(() => (dragged.current = false), 0);
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [spot, menuRight],
  );

  return { spot, view, dragging, startDrag, wasDragged: () => dragged.current };
}

/**
 * Where the panel opens beside the button: on the side of the window the button is on, above it
 * in the lower half and below it in the upper half, as tall as fits (at most 34rem).
 */
export function panelPlace(spot: Spot, view: { w: number; h: number }): React.CSSProperties {
  const width = Math.min(368, view.w - 2 * EDGE);
  const left = view.w - spot.x - BUTTON;
  const top = view.h - spot.y - BUTTON;
  const gap = 12;
  const place: React.CSSProperties = { width };
  if (left + BUTTON / 2 > view.w / 2) place.right = Math.min(spot.x, view.w - width - EDGE);
  else place.left = Math.min(left, view.w - width - EDGE);
  if (top + BUTTON / 2 > view.h / 2) {
    place.bottom = spot.y + BUTTON + gap;
    place.height = Math.min(544, view.h - (spot.y + BUTTON + gap) - EDGE);
  } else {
    place.top = top + BUTTON + gap;
    place.height = Math.min(544, view.h - (top + BUTTON + gap) - EDGE);
  }
  return place;
}

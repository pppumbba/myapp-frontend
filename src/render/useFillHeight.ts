import { useLayoutEffect, useState, type RefObject } from 'react';

/** Never shorter than this, so a grid low on a small screen still shows some rows. */
const MIN_HEIGHT = 320;

/**
 * The height that takes an element from where it starts down to the bottom of the window
 * (less the padding at the bottom of its <main>), so the page itself doesn't scroll. In a
 * modal it stops at the bottom the modal can reach instead, so the modal doesn't scroll either.
 * Followed as the window resizes or what is above the element grows. undefined when off.
 */
export function useFillHeight(ref: RefObject<HTMLElement | null>, enabled: boolean): number | undefined {
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) {
      setHeight(undefined);
      return;
    }
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const main = el.closest('main');
      const body = el.closest<HTMLElement>('.modal-body');
      const bottom = body ? modalBottom(body) : main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 16;
      const next = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - top - bottom));
      // Only a real change: the element's own height changes the page, not where it starts.
      setHeight((was) => (was !== undefined && Math.abs(was - next) < 2 ? was : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener('resize', measure);
    // A modal zooms in, so it measured a little low at first: again once it has settled.
    const modal = el.closest('.modal-body')?.closest('[role=dialog]')?.parentElement;
    modal?.addEventListener('animationend', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      modal?.removeEventListener('animationend', measure);
    };
  }, [ref, enabled]);

  return height;
}

/**
 * Room a modal leaves under its content at full height: the overlay's bottom padding, the body's
 * own padding and the modal's border.
 */
function modalBottom(body: HTMLElement): number {
  let overlay = body.parentElement;
  while (overlay && getComputedStyle(overlay).position !== 'fixed') overlay = overlay.parentElement;
  const pad = (el: Element | null | undefined) => (el ? parseFloat(getComputedStyle(el).paddingBottom) || 0 : 0);
  return pad(overlay) + pad(body.firstElementChild) + 2;
}

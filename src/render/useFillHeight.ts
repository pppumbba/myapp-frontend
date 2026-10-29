import { useLayoutEffect, useState, type RefObject } from 'react';

/** Never shorter than this, so a grid low on a small screen still shows some rows. */
const MIN_HEIGHT = 320;

/**
 * The height that takes an element from where it starts down to the bottom of the window
 * (less the padding at the bottom of its <main>), so the page itself doesn't scroll.
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
      const bottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 16;
      const next = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - top - bottom));
      // Only a real change: the element's own height changes the page, not where it starts.
      setHeight((was) => (was !== undefined && Math.abs(was - next) < 2 ? was : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, enabled]);

  return height;
}

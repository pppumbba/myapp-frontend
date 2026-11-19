import { useEffect, useRef, useState } from 'react';

/**
 * Text that arrives word by word, each word coming out of a blur (.blur-word in index.css). It
 * plays again when the text changes. Screen readers get the text whole.
 */
export function BlurWords({ text, delay = 0 }: { text: string; /** How many words' time to wait first (a description after its title). */ delay?: number }) {
  const words = text.split(/(\s+)/).filter(Boolean);
  let n = 0;
  return (
    <span key={text}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((w, i) =>
          /^\s+$/.test(w) ? (
            w
          ) : (
            <span key={i} className="blur-word" style={{ '--word': delay + n++ } as React.CSSProperties}>
              {w}
            </span>
          ),
        )}
      </span>
    </span>
  );
}

/** How many words BlurWords shows for this text: a description can start after its title. */
export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fast at first, settling at the end. */
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * Time through an entrance, 0 to 1 over `ms` (linear: ease it where it's used), started again
 * whenever `replay` changes. Always 1 when motion is reduced.
 */
export function useProgress(replay: unknown, ms = 900): number {
  const [t, setT] = useState(() => (reduced() ? 1 : 0));
  useEffect(() => {
    if (reduced()) return setT(1);
    setT(0);
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setT(p);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [replay, ms]);
  return t;
}

/**
 * The eased progress of item i of n when they start one after another: the first at once, the
 * last after `spread` of the time.
 */
export function staggered(t: number, i: number, n: number, spread = 0.35): number {
  const start = n > 1 ? (i / (n - 1)) * spread : 0;
  return easeOut(Math.min(1, Math.max(0, (t - start) / (1 - spread))));
}

/**
 * A number that counts up from zero to its value (and from the old value to a new one), easing
 * out over `ms`. format draws each step; a whole number only ever shows whole steps.
 */
export function CountUp({ value, format, ms = 900 }: { value: number; format: (n: number) => string; ms?: number }) {
  const [shown, setShown] = useState(() => (reduced() ? value : 0));
  const from = useRef(shown);

  useEffect(() => {
    if (reduced()) return setShown(value);
    const start = from.current;
    const decimals = Number.isInteger(value) ? 0 : (String(value).split('.')[1]?.length ?? 2);
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 4);
      const n = p === 1 ? value : Number((start + (value - start) * eased).toFixed(decimals));
      from.current = n;
      setShown(n);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);

  return <>{format(shown)}</>;
}

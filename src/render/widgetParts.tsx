import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { t } from '@/i18n';

// The moving parts of the carousel, gallery and tabs widgets, drawn by the page builder
// (WidgetView, Tailwind classes) and by websites (SiteBlocks, site.css classes) alike.
// Each takes its class names, so the behaviour is written once.

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** A list prop's rows, as objects. */
export const rowsOf = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

export interface Picture {
  src: string;
  alt: string;
  title: string;
  text: string;
}

/** A list prop's rows that have a picture. */
export const picturesOf = (v: unknown): Picture[] =>
  rowsOf(v)
    .map((r) => ({ src: str(r.src), alt: str(r.alt), title: str(r.title), text: str(r.text || r.caption) }))
    .filter((p) => p.src);

/** A widget's frame setting ("16:9") as a CSS aspect-ratio. */
export const ratioOf = (v: unknown, fallback = '16 / 9') => {
  const m = /^(\d+):(\d+)$/.exec(str(v));
  return m ? `${m[1]} / ${m[2]}` : fallback;
};

const smooth = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth') as ScrollBehavior;

export interface CarouselClasses {
  root: string;
  track: string;
  slide: string;
  frame: string;
  caption: string;
  bar: string;
  button: string;
  dots: string;
  dot: string;
}

/**
 * Slides side by side in a track that scrolls (and swipes) one slide at a time; Previous,
 * Next and a dot per slide move it. Nothing moves by itself.
 */
export function Carousel({ slides, ratio, label, cls }: { slides: Picture[]; ratio: string; label: string; cls: CarouselClasses }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const id = useId();

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(slides.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: smooth() });
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') go(index - 1);
    else if (e.key === 'ArrowRight') go(index + 1);
    else return;
    e.preventDefault();
  };

  return (
    <section className={cls.root} aria-roledescription="carousel" aria-label={label} onKeyDown={onKey}>
      <div ref={track} className={cls.track} id={id} aria-live="polite">
        {slides.map((s, i) => (
          <figure key={i} className={cls.slide} role="group" aria-roledescription="slide" aria-label={t('{n} of {count}', { n: i + 1, count: slides.length })} aria-hidden={i !== index || undefined} inert={i !== index || undefined}>
            <div className={cls.frame} style={{ aspectRatio: ratio }}>
              <img src={s.src} alt={s.alt} loading={i === 0 ? undefined : 'lazy'} />
            </div>
            {(s.title || s.text) && (
              <figcaption className={cls.caption}>
                {s.title && <strong>{s.title}</strong>}
                {s.text && <span>{s.text}</span>}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
      {slides.length > 1 && (
        <div className={cls.bar}>
          <button type="button" className={cls.button} aria-controls={id} disabled={index === 0} onClick={() => go(index - 1)}>
            {t('Previous')}
          </button>
          <div className={cls.dots}>
            {slides.map((s, i) => (
              <button key={i} type="button" className={cls.dot} aria-controls={id} aria-current={i === index || undefined} aria-label={t('Show slide {n}: {title}', { n: i + 1, title: s.title || s.alt })} onClick={() => go(i)} />
            ))}
          </div>
          <button type="button" className={cls.button} aria-controls={id} disabled={index === slides.length - 1} onClick={() => go(index + 1)}>
            {t('Next')}
          </button>
        </div>
      )}
    </section>
  );
}

export interface GalleryClasses {
  grid: string;
  item: string;
  thumb: string;
  dialog: string;
  big: string;
  caption: string;
  bar: string;
  button: string;
}

/** Pictures on a grid; one opens large in a dialog, with Previous, Next and Close. */
export function Gallery({ pictures, columns, cls }: { pictures: Picture[]; columns: number; cls: GalleryClasses }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const show = (i: number) => {
    setOpen(i);
    if (!dialog.current?.open) dialog.current?.showModal();
  };
  const step = (by: number) => open !== null && setOpen((open + by + pictures.length) % pictures.length);
  const current = open === null ? null : pictures[open];

  return (
    <>
      <ul className={cls.grid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {pictures.map((p, i) => (
          <li key={i} className={cls.item}>
            <button type="button" className={cls.thumb} onClick={() => show(i)} aria-label={t('Open picture {n}: {alt}', { n: i + 1, alt: p.alt || p.text })}>
              <img src={p.src} alt="" loading="lazy" />
            </button>
            {p.text && <p>{p.text}</p>}
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        className={cls.dialog}
        aria-label={current?.alt || t('Picture')}
        onClose={() => setOpen(null)}
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') step(-1);
          if (e.key === 'ArrowRight') step(1);
        }}
      >
        {current && (
          <figure>
            <img className={cls.big} src={current.src} alt={current.alt} />
            {current.text && <figcaption className={cls.caption}>{current.text}</figcaption>}
          </figure>
        )}
        <div className={cls.bar}>
          {pictures.length > 1 && (
            <button type="button" className={cls.button} onClick={() => step(-1)}>
              {t('Previous')}
            </button>
          )}
          <button type="button" className={cls.button} onClick={() => dialog.current?.close()} autoFocus>
            {t('Close')}
          </button>
          {pictures.length > 1 && (
            <button type="button" className={cls.button} onClick={() => step(1)}>
              {t('Next')}
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}

export interface TabsClasses {
  root: string;
  list: string;
  tab: string;
  panel: string;
}

/** Tabs that switch panels; arrow keys, Home and End move between them. */
export function Tabs({ tabs, label, cls }: { tabs: { label: string; body: ReactNode }[]; label: string; cls: TabsClasses }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const next = (i + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const to = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    move(to);
  };
  const shown = Math.min(active, tabs.length - 1);

  return (
    <div className={cls.root}>
      <div role="tablist" aria-label={label || undefined} className={cls.list} onKeyDown={onKey}>
        {tabs.map((tab, i) => (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === shown}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === shown ? 0 : -1}
            className={cls.tab}
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div key={i} role="tabpanel" id={`${id}-panel-${i}`} aria-labelledby={`${id}-tab-${i}`} hidden={i !== shown} tabIndex={0} className={cls.panel}>
          {tab.body}
        </div>
      ))}
    </div>
  );
}

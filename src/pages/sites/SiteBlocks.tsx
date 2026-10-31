import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { propValues, type Page, type PageItem, type Widget } from '../../lib/pageApi';
import { fillItems, loadTemplate, openParams, parseTable, photoRatio, useOpen, useSchedule, WidgetBlock, type ScheduleSlot } from '../../render/WidgetView';
import { Carousel, Gallery, picturesOf, ratioOf, rowsOf, Tabs } from '../../render/widgetParts';
import { SiteForm } from './SiteForm';
import { SiteSocialContext, SocialLinks } from './SiteSocial';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

// A website's pages in its own look (site.css): the same widgets and settings as the page
// builder, drawn for visitors. Screens from the app (forms, grids, charts, records) are drawn
// by the app's WidgetBlock inside a frame, so they keep working exactly as they do there.

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const WIDTHS = new Set([3, 4, 6, 8, 9]);
const MAX_COMPOSITE_DEPTH = 4;

/** Text with blank lines between paragraphs; single line breaks are kept. */
function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i}>{p.trim()}</p>
        ))}
    </>
  );
}

/** Placed widgets in order on the twelve columns, sections holding theirs. */
export function SiteItems({ items, depth = 0 }: { items: PageItem[]; depth?: number }) {
  return (
    <div className="hm-grid">
      {items.map((item) => (
        <div key={item.param_id} className={cx(WIDTHS.has(item.w) && `hm-col-${item.w}`)}>
          <SiteBlock widget={item.widget} config={item.meta.json_config} depth={depth}>
            {item.children.length ? <SiteItems items={item.children} depth={depth + 1} /> : undefined}
          </SiteBlock>
        </div>
      ))}
    </div>
  );
}

function SiteBlock({ widget, config, children, depth }: { widget: Widget; config: Record<string, unknown> | null | undefined; children?: ReactNode; depth: number }) {
  const v = propValues(widget, config);
  const { can, open } = useOpen();
  const social = useContext(SiteSocialContext);
  const align = str(v.align);

  switch (widget.renderer) {
    case 'section': {
      const look = {
        card: 'hm-section--box',
        subtle: 'hm-section--band',
        brand: 'hm-section--ink hm-on-ink',
      }[str(v.background)];
      if (!children) return null;
      return (
        <section className={cx('hm-section', look)} aria-label={str(v.title) || undefined}>
          {(str(v.title) || str(v.subtitle)) && (
            <div className="hm-section__head">
              {str(v.title) && <h2>{str(v.title)}</h2>}
              {str(v.subtitle) && <p className="hm-section__line">{str(v.subtitle)}</p>}
            </div>
          )}
          {children}
        </section>
      );
    }

    case 'divider':
      return str(v.label) ? (
        <div className="hm-rule-labelled" role="separator">
          <hr className="hm-rule" />
          <p>{str(v.label)}</p>
        </div>
      ) : (
        <hr className="hm-rule" />
      );

    case 'spacer':
      return <div aria-hidden="true" className={`hm-space--${{ small: 'small', large: 'large' }[str(v.size)] ?? 'medium'}`} />;

    case 'hero': {
      const tone = str(v.tone);
      const field = tone === 'light' ? 'hm-hero--paper' : tone === 'dark' ? 'hm-hero--ink hm-on-ink' : 'hm-hero--signal hm-on-signal';
      const Head = depth > 0 ? 'h2' : 'h1';
      const text = (
        <>
          <Head>{str(v.title)}</Head>
          {str(v.subtitle) && (
            <div className="lead">
              <Paragraphs text={str(v.subtitle)} />
            </div>
          )}
          {str(v.button_label) && can(v) && (
            <div className="hm-actions">
              <button type="button" className="hm-btn hm-btn--primary" onClick={() => open(v, str(v.button_label))}>
                {str(v.button_label)}
              </button>
            </div>
          )}
        </>
      );
      return (
        <div className={cx('hm-hero', field)}>
          {str(v.image) ? (
            <div className="hm-hero__stage">
              <div className="hm-hero__text">{text}</div>
              <figure className="hm-hero__frame">
                <img src={str(v.image)} alt="" fetchPriority="high" />
              </figure>
            </div>
          ) : (
            <div className="hm-hero__corridor">{text}</div>
          )}
        </div>
      );
    }

    case 'heading': {
      const size = str(v.size);
      const Tag = depth > 0 || size === 'small' ? 'h3' : size === 'large' ? 'h1' : 'h2';
      return (
        <div className={cx('hm-head', align === 'center' && 'hm-head--center', align === 'right' && 'hm-head--right')}>
          <Tag>{str(v.text)}</Tag>
          {str(v.subtitle) && <p className="hm-head__line">{str(v.subtitle)}</p>}
        </div>
      );
    }

    case 'text':
      return (
        <div
          className={cx(
            'hm-prose',
            { small: 'hm-prose--small', large: 'hm-prose--large' }[str(v.size)],
            align === 'center' && 'hm-prose--center',
            align === 'right' && 'hm-prose--right',
          )}
        >
          <Paragraphs text={str(v.text)} />
        </div>
      );

    case 'image':
      if (!str(v.src)) return null;
      return (
        <figure className="hm-figure">
          <div className="hm-figure__frame" style={{ height: Math.max(40, Number(v.height) || 240) }}>
            <img
              src={str(v.src)}
              alt={str(v.alt)}
              loading="lazy"
              style={{
                objectFit: str(v.fit) === 'contain' ? 'contain' : 'cover',
              }}
            />
          </div>
          {str(v.caption) && <figcaption>{str(v.caption)}</figcaption>}
        </figure>
      );

    case 'photo':
      if (!str(v.src)) return null;
      return (
        <figure className="hm-figure">
          <div className="hm-figure__frame" style={{ aspectRatio: photoRatio(v.ratio) }}>
            <img
              src={str(v.src)}
              alt={str(v.alt)}
              loading="lazy"
              style={{
                objectFit: 'cover',
                objectPosition: str(v.focus) || 'center',
              }}
            />
          </div>
          {str(v.caption) && <figcaption>{str(v.caption)}</figcaption>}
        </figure>
      );

    case 'table': {
      const table = parseTable(str(v.rows));
      if (!table.rows.length) return null;
      const Title = depth > 0 ? 'h3' : 'h2';
      return (
        <div className="hm-table">
          {(str(v.title) || str(v.subtitle)) && (
            <div className="hm-section__head">
              {str(v.title) && <Title>{str(v.title)}</Title>}
              {str(v.subtitle) && <p className="hm-section__line">{str(v.subtitle)}</p>}
            </div>
          )}
          <div className="hm-table__scroll">
            <table>
              <thead>
                <tr>
                  {table.head.map((cell, i) => (
                    <th key={i} scope="col">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, i) =>
                      i === 0 ? (
                        <th key={i} scope="row">
                          {cell}
                        </th>
                      ) : (
                        <td key={i}>{cell}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {str(v.note) && <p className="hm-table__note">{str(v.note)}</p>}
        </div>
      );
    }

    case 'schedule':
      return <SiteSchedule values={v} depth={depth} />;

    case 'callout': {
      const tone = str(v.tone);
      const plate =
        {
          warning: 'hm-plate--amber',
          error: 'hm-plate--alert',
          success: 'hm-plate--quiet',
          info: 'hm-plate--ink',
        }[tone] ?? 'hm-plate--quiet';
      return (
        <div className={cx('hm-plate', plate)} role={tone === 'error' || tone === 'warning' ? 'alert' : 'note'}>
          {str(v.title) && <p className="hm-plate__title">{str(v.title)}</p>}
          <div className="hm-plate__body">
            <Paragraphs text={str(v.text)} />
          </div>
        </div>
      );
    }

    case 'list': {
      const items = Array.isArray(v.items) ? (v.items as Record<string, unknown>[]) : [];
      const cols = str(v.columns) === '1' ? '' : str(v.columns) === '3' ? 'hm-rows--cols hm-rows--cols-3' : 'hm-rows--cols hm-rows--cols-2';
      const Title = depth > 0 ? 'h3' : 'h2';
      const ItemTitle = depth > 0 ? 'h4' : 'h3';
      return (
        <div className={cx('hm-rows', cols)}>
          {str(v.title) && <Title>{str(v.title)}</Title>}
          <ul className="hm-rows__list">
            {items.map((item, i) => (
              <li key={i} className="hm-rows__item">
                <ItemTitle>{str(item.title)}</ItemTitle>
                {str(item.text) && <p>{str(item.text)}</p>}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case 'button': {
      const style = str(v.style);
      return (
        <div
          className="hm-actions"
          style={{
            justifyContent: { center: 'center', right: 'flex-end' }[align],
          }}
        >
          <button
            type="button"
            className={cx('hm-btn', style === 'secondary' ? '' : style === 'link' ? 'hm-btn--text' : 'hm-btn--primary')}
            disabled={!can(v)}
            onClick={() => open(v, str(v.label))}
          >
            {str(v.label) || t('Open')}
          </button>
        </div>
      );
    }

    case 'links': {
      const items = (Array.isArray(v.items) ? (v.items as Record<string, unknown>[]) : []).filter((l) => str(l.label));
      if (!items.length) return null;
      const Title = depth > 0 ? 'h3' : 'h2';
      return (
        <nav className="hm-index" aria-label={str(v.title) || undefined}>
          {str(v.title) && <Title>{str(v.title)}</Title>}
          <ul className="hm-index__list">
            {items.map((l, i) => (
              <li key={i}>
                <button type="button" className="hm-index__row" disabled={!can(l)} onClick={() => open(l, str(l.label))}>
                  <span className="hm-index__label">{str(l.label)}</span>
                  {str(l.description) && <span className="hm-index__text">{str(l.description)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      );
    }

    case 'stat': {
      const trend = str(v.trend);
      return (
        <div className="hm-sign">
          <p className="hm-sign__value">{str(v.value)}</p>
          <p className="hm-sign__label">{str(v.label)}</p>
          {str(v.change) && <p className={cx('hm-sign__change', trend === 'up' && 'hm-sign__change--up', trend === 'down' && 'hm-sign__change--down')}>{str(v.change)}</p>}
          {str(v.note) && <p className="hm-sign__note">{str(v.note)}</p>}
        </div>
      );
    }

    case 'iframe':
      if (!/^https:\/\//i.test(str(v.url))) return null;
      return (
        <div className="hm-embed hm-embed--frame">
          <iframe
            src={str(v.url)}
            title={str(v.title) || t('Embedded page')}
            style={{ height: Math.max(100, Number(v.height) || 400) }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        </div>
      );

    case 'carousel': {
      const slides = picturesOf(v.slides);
      if (!slides.length) return null;
      const Title = depth > 0 ? 'h3' : 'h2';
      return (
        <div className="hm-stack">
          {str(v.title) && <Title>{str(v.title)}</Title>}
          <Carousel
            slides={slides}
            ratio={ratioOf(v.ratio)}
            label={str(v.title) || t('Pictures')}
            cls={{
              root: 'hm-carousel',
              track: 'hm-carousel__track',
              slide: 'hm-carousel__slide',
              frame: 'hm-figure__frame',
              caption: 'hm-carousel__caption',
              bar: 'hm-carousel__bar',
              button: 'hm-btn',
              dots: 'hm-carousel__dots',
              dot: 'hm-carousel__dot',
            }}
          />
        </div>
      );
    }

    case 'gallery': {
      const pictures = picturesOf(v.images);
      if (!pictures.length) return null;
      const Title = depth > 0 ? 'h3' : 'h2';
      return (
        <div className="hm-stack">
          {str(v.title) && <Title>{str(v.title)}</Title>}
          <Gallery
            pictures={pictures}
            columns={Math.min(4, Math.max(2, Number(v.columns) || 3))}
            cls={{
              grid: 'hm-gallery',
              item: 'hm-gallery__item',
              thumb: 'hm-gallery__thumb',
              dialog: 'hm-lightbox',
              big: 'hm-lightbox__img',
              caption: 'hm-lightbox__caption',
              bar: 'hm-lightbox__bar',
              button: 'hm-btn',
            }}
          />
        </div>
      );
    }

    case 'accordion':
      return <SiteAccordion values={v} depth={depth} />;

    case 'collapse':
      return (
        <details className="hm-fold hm-fold--single" open={v.open === true}>
          <summary className="hm-fold__summary">{str(v.label) || t('Show more')}</summary>
          <div className="hm-fold__body hm-prose">
            <Paragraphs text={str(v.text)} />
          </div>
        </details>
      );

    case 'tabs': {
      const tabs = rowsOf(v.items).filter((r) => str(r.label));
      if (!tabs.length) return null;
      const Title = depth > 0 ? 'h3' : 'h2';
      return (
        <div className="hm-stack">
          {str(v.title) && <Title>{str(v.title)}</Title>}
          <Tabs
            label={str(v.title)}
            tabs={tabs.map((r) => ({
              label: str(r.label),
              body: <Paragraphs text={str(r.text)} />,
            }))}
            cls={{
              root: 'hm-tabs',
              list: 'hm-tabs__list',
              tab: 'hm-tabs__tab',
              panel: 'hm-tabs__panel hm-prose',
            }}
          />
        </div>
      );
    }

    case 'social': {
      const Title = depth > 0 ? 'h3' : 'h2';
      return (
        <div className={cx('hm-head', align === 'center' && 'hm-head--center', align === 'right' && 'hm-head--right')}>
          {str(v.title) && <Title>{str(v.title)}</Title>}
          <SocialLinks social={social} labels={v.labels !== false} className={cx(align === 'center' && 'hm-social--center', align === 'right' && 'hm-social--right')} />
        </div>
      );
    }

    case 'quote':
      if (!str(v.text)) return null;
      return (
        <figure className="hm-quote">
          <blockquote>
            <Paragraphs text={str(v.text)} />
          </blockquote>
          {str(v.name) && (
            <figcaption>
              <span className="hm-quote__name">{str(v.name)}</span>
              {str(v.role) && <span className="hm-quote__role">{str(v.role)}</span>}
            </figcaption>
          )}
        </figure>
      );

    case 'webform':
      if (!(Number(v.meta_id) > 0)) return null;
      return (
        <SiteForm
          formId={Number(v.meta_id)}
          heading={str(v.title)}
          intro={str(v.subtitle)}
          submitLabel={str(v.submit_label)}
          doneText={str(v.done_text)}
          level={depth > 0 ? 3 : 2}
        />
      );

    case 'composite':
      return <SiteComposite widget={widget} values={v} depth={depth} />;

    default:
      // Forms, grids, charts and records: the app's own screens, as they are.
      return (
        <div className="hm-embed">
          <WidgetBlock widget={widget} config={config} depth={depth} />
        </div>
      );
  }
}

/** Times from a grid, one row each: the time large, what is on, the spaces left, Book. */
function SiteSchedule({ values: v, depth }: { values: Record<string, unknown>; depth: number }) {
  const { metaId, slots, error, book } = useSchedule(v);
  const [booking, setBooking] = useState<ScheduleSlot | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const bookId = Number(v.book_meta_id) > 0 ? Number(v.book_meta_id) : null;
  useEffect(() => {
    if (booking && !dialog.current?.open) dialog.current?.showModal();
  }, [booking]);
  if (!metaId) return null;
  const onBook = bookId ? (slot: ScheduleSlot) => setBooking(slot) : book;
  const Title = depth > 0 ? 'h3' : 'h2';
  return (
    <section className="hm-schedule" aria-label={str(v.title) || undefined} aria-busy={!slots && !error}>
      {str(v.title) && <Title>{str(v.title)}</Title>}
      {error ? (
        <p role="alert">{error}</p>
      ) : !slots ? (
        <div className="hm-schedule__wait" />
      ) : slots.length === 0 ? (
        <p className="hm-section__line">{str(v.empty_text) || t('Nothing on today.')}</p>
      ) : (
        <ol className="hm-schedule__list">
          {slots.map((slot, i) => {
            const full = slot.spaces !== null && slot.spaces <= 0;
            return (
              <li key={i} className="hm-schedule__row" data-full={full || undefined}>
                <p className="hm-schedule__time">
                  <time>{slot.time}</time>
                  {slot.end && <span>{t('to {time}', { time: slot.end })}</span>}
                </p>
                <div className="hm-schedule__what">
                  <h3>{slot.name}</h3>
                  {slot.detail && <p>{slot.detail}</p>}
                </div>
                {slot.spaces !== null && <p className="hm-schedule__spaces">{full ? t('Full') : t('{count} left', { count: slot.spaces })}</p>}
                {onBook && (
                  <button type="button" className="hm-btn hm-btn--primary" disabled={full} onClick={() => onBook(slot)}>
                    {str(v.book_label) || t('Book')}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {bookId && (
        <dialog ref={dialog} className="hm-dialog" aria-label={booking ? [booking.time, booking.name].filter(Boolean).join(' ') : undefined} onClose={() => setBooking(null)}>
          <div className="hm-dialog__body">
            <div className="hm-dialog__head">
              {booking && (
                <h2 className="hm-dialog__for">
                  <time>{booking.end ? `${booking.time}–${booking.end}` : booking.time}</time>
                  <span>{booking.name}</span>
                </h2>
              )}
              <button type="button" className="hm-dialog__close" aria-label={t('Close')} onClick={() => dialog.current?.close()}>
                ×
              </button>
            </div>
            {booking &&
              (() => {
                const chosen = openParams(str(v.book_params), booking.row);
                return <SiteForm formId={bookId} defaults={chosen} fixed={Object.keys(chosen)} titled={false} submitLabel={str(v.book_label) || t('Book')} level={3} />;
              })()}
          </div>
        </dialog>
      )}
    </section>
  );
}

/** Questions that open one at a time (or several, when the setting allows). */
function SiteAccordion({ values: v, depth }: { values: Record<string, unknown>; depth: number }) {
  const group = useId();
  const items = rowsOf(v.items).filter((r) => str(r.title));
  if (!items.length) return null;
  const Title = depth > 0 ? 'h3' : 'h2';
  return (
    <div className="hm-stack">
      {str(v.title) && <Title>{str(v.title)}</Title>}
      <div className="hm-folds">
        {items.map((item, i) => (
          <details key={i} className="hm-fold" name={v.many === true ? undefined : group} open={i === 0 && v.first_open === true}>
            <summary className="hm-fold__summary">{str(item.title)}</summary>
            <div className="hm-fold__body hm-prose">
              <Paragraphs text={str(item.text)} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

/** A widget made of other widgets, drawn in the site's look. */
function SiteComposite({ widget, values, depth }: { widget: Widget; values: Record<string, unknown>; depth: number }) {
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const templateId = widget.template_meta_id;

  useEffect(() => {
    if (!templateId || depth > MAX_COMPOSITE_DEPTH) return;
    let live = true;
    loadTemplate(templateId).then(
      (p) => live && setPage(p),
      (err) => live && setError(err instanceof ApiError ? err.message : t('This widget’s parts could not be loaded.')),
    );
    return () => {
      live = false;
    };
  }, [templateId, depth]);

  if (!templateId || depth > MAX_COMPOSITE_DEPTH || !page) return error ? <p role="alert">{error}</p> : null;
  return <SiteItems items={fillItems(page.items, values)} depth={depth + 1} />;
}

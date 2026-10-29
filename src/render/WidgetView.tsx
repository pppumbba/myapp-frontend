import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from 'react';
import {
  AlertTriangle,
  AlignLeft,
  ArrowUpRight,
  BarChart01,
  Calendar,
  ChevronDown,
  ChevronSelectorVertical,
  Columns03,
  Grid01,
  Image03,
  MessageTextSquare01,
  Send01,
  CheckCircle,
  CursorClick01,
  File04,
  Globe01,
  Hash01,
  Image01,
  InfoCircle,
  LayersThree01,
  LayoutAlt01,
  Link01,
  List,
  Minus,
  SpacingHeight01,
  Star01,
  Table,
  TrendDown01,
  TrendUp01,
  Type01,
  XCircle,
} from '@untitledui/icons';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { dataApi, onDataWrite, type DataRow, type Page as RecordsPage } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { pageApi, propValues, type Page, type PageItem, type Widget } from '../lib/pageApi';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';
import { formatDate, formatDateTime, formatNumber } from './Cell';
import { ChartCard, cardHeight } from './DashboardView';
import { useLookupLabels, useMetaDef } from './definitions';
import { MetaView } from './MetaView';
import { useDrilldown } from './drilldown';
import { Carousel, Gallery, picturesOf, ratioOf, rowsOf, Tabs } from './widgetParts';
import { t } from '@/i18n';

/** A library entry's icon (widgets.icon), for the palette and the library page. */
const icons: Record<string, FC<{ className?: string }>> = {
  layout: LayoutAlt01,
  minus: Minus,
  expand: SpacingHeight01,
  star: Star01,
  type: Type01,
  'align-left': AlignLeft,
  image: Image01,
  info: InfoCircle,
  list: List,
  cursor: CursorClick01,
  link: Link01,
  hash: Hash01,
  chart: BarChart01,
  table: Table,
  form: File04,
  layers: LayersThree01,
  globe: Globe01,
  calendar: Calendar,
  slides: Image03,
  gallery: Grid01,
  accordion: ChevronSelectorVertical,
  collapse: ChevronDown,
  tabs: Columns03,
  quote: MessageTextSquare01,
  send: Send01,
};
export const WIDGET_ICONS = Object.keys(icons);
export const widgetIcon = (name: string | null | undefined) => (name && icons[name]) || LayersThree01;

/** Widths a widget can take on the page's 12-column grid (the dashboard's). */
export const PAGE_WIDTHS = [3, 4, 6, 8, 9, 12] as const;

// Widths follow the space the page has, not the window: a page in the builder's canvas or
// in a narrow section lays out like a page on a smaller screen. Narrow widgets pair up
// from 36rem and take their own width from 56rem; below 36rem everything stacks.
const span: Record<number, string> = {
  3: '@xl:col-span-6 @4xl:col-span-3',
  4: '@xl:col-span-6 @4xl:col-span-4',
  6: '@xl:col-span-6',
  8: '@xl:col-span-12 @4xl:col-span-8',
  9: '@xl:col-span-12 @4xl:col-span-9',
  12: '@xl:col-span-12',
};

export function PageGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="@container">
      <div className={cx('grid grid-cols-1 gap-5 @xl:grid-cols-12', className)}>{children}</div>
    </div>
  );
}

/** The grid cell a placed widget fills. */
export const widthClass = (w: number) => cx('col-span-1 min-w-0', span[w] ?? span[12]);

/**
 * Where a widget's links to "/…" go: on a website opened at /site/{code}, under that; everywhere
 * else as they are.
 */
export const LinkBaseContext = createContext('');

/** Opens what a widget links to: a screen (in the drilldown window, else full-screen) or a web address. */
export function useOpen() {
  const drill = useDrilldown();
  const navigate = useNavigate();
  const base = useContext(LinkBaseContext);
  const metaId = (v: unknown) => (Number(v) > 0 ? Number(v) : null);
  return {
    can: (values: Record<string, unknown>) => !!metaId(values.meta_id) || (typeof values.url === 'string' && values.url.trim() !== ''),
    open: (values: Record<string, unknown>, label: string) => {
      const id = metaId(values.meta_id);
      if (id) {
        if (drill) drill({ metaId: id, params: {}, label });
        else navigate(`/run/${id}`);
      } else if (typeof values.url === 'string' && values.url.trim()) {
        const url = values.url.trim();
        if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener');
        else navigate(url.startsWith('/') ? base + (url === '/' && base ? '' : url) : url);
      }
    },
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const alignClass: Record<string, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };
const justifyClass: Record<string, string> = { left: 'justify-start', center: 'justify-center', right: 'justify-end' };

/** Text with blank lines between paragraphs; single line breaks are kept. */
function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} className={cx('whitespace-pre-line', i > 0 && 'mt-3', className)}>
            {p.trim()}
          </p>
        ))}
    </>
  );
}

/**
 * One widget as a page shows it. A section draws its children with renderChild, so the
 * builder can wrap each in its own controls; on a page they render as they are.
 */
export function WidgetBlock({
  widget,
  config,
  children,
  depth = 0,
}: {
  widget: Widget;
  config: Record<string, unknown> | null | undefined;
  /** A section's placed widgets, already laid out. */
  children?: ReactNode;
  depth?: number;
}) {
  const v = propValues(widget, config);
  const { can, open } = useOpen();

  switch (widget.renderer) {
    case 'section': {
      const bg = { none: '', card: 'rounded-2xl bg-primary p-5 shadow-xs ring-1 ring-secondary sm:p-6', subtle: 'rounded-2xl bg-secondary p-5 sm:p-6', brand: 'rounded-2xl bg-brand-section_subtle p-5 sm:p-6' }[str(v.background)] ?? '';
      return (
        <section className={bg} aria-label={str(v.title) || undefined}>
          {(str(v.title) || str(v.subtitle)) && (
            <div className="mb-4">
              {str(v.title) && <h2 className="text-lg font-semibold text-primary">{str(v.title)}</h2>}
              {str(v.subtitle) && <p className="mt-0.5 text-sm text-tertiary">{str(v.subtitle)}</p>}
            </div>
          )}
          {children ?? <p className="rounded-lg border border-dashed border-primary px-4 py-6 text-center text-sm text-tertiary">{t('This section is empty.')}</p>}
        </section>
      );
    }

    case 'divider':
      return str(v.label) ? (
        <div className="flex items-center gap-3 py-2" role="separator">
          <span className="flex-1 border-t border-secondary" />
          <span className="text-sm font-medium text-tertiary">{str(v.label)}</span>
          <span className="flex-1 border-t border-secondary" />
        </div>
      ) : (
        <hr className="my-2 border-secondary" />
      );

    case 'spacer':
      return <div aria-hidden="true" className={{ small: 'h-4', medium: 'h-10', large: 'h-20' }[str(v.size)] ?? 'h-10'} />;

    case 'hero': {
      const tone = str(v.tone);
      const dark = tone !== 'light';
      return (
        <div
          className={cx(
            'flex flex-col overflow-hidden rounded-2xl md:flex-row',
            tone === 'brand' && 'bg-brand-section',
            tone === 'dark' && 'bg-primary-solid',
            tone === 'light' && 'bg-primary ring-1 ring-secondary',
          )}
        >
          <div className="flex flex-1 flex-col justify-center gap-4 px-6 py-10 sm:px-10">
            <h1 className={cx('text-display-xs font-semibold sm:text-display-sm', dark ? 'text-primary_on-brand' : 'text-primary')}>{str(v.title)}</h1>
            {str(v.subtitle) && (
              <div className={cx('max-w-prose text-md', dark ? 'text-tertiary_on-brand' : 'text-tertiary')}>
                <Paragraphs text={str(v.subtitle)} />
              </div>
            )}
            {str(v.button_label) && can(v) && (
              <div>
                <Button size="lg" color={dark ? 'secondary' : 'primary'} onPress={() => open(v, str(v.button_label))}>
                  {str(v.button_label)}
                </Button>
              </div>
            )}
          </div>
          {str(v.image) && <img src={str(v.image)} alt="" className="h-48 w-full object-cover md:h-auto md:w-2/5" />}
        </div>
      );
    }

    case 'heading': {
      const size = str(v.size);
      const Tag = depth > 0 || size === 'small' ? 'h3' : size === 'large' ? 'h1' : 'h2';
      return (
        <div className={alignClass[str(v.align)]}>
          <Tag className={cx('font-semibold text-primary', size === 'large' ? 'text-display-xs' : size === 'small' ? 'text-md' : 'text-xl')}>{str(v.text)}</Tag>
          {str(v.subtitle) && <p className="mt-1 text-md text-tertiary">{str(v.subtitle)}</p>}
        </div>
      );
    }

    case 'text':
      return (
        <div className={cx('max-w-prose text-secondary', alignClass[str(v.align)], str(v.align) === 'center' && 'mx-auto', { small: 'text-sm', normal: 'text-md', large: 'text-lg' }[str(v.size)])}>
          <Paragraphs text={str(v.text)} />
        </div>
      );

    case 'image':
      return str(v.src) ? (
        <figure>
          <img
            src={str(v.src)}
            alt={str(v.alt)}
            style={{ height: Math.max(40, Number(v.height) || 240) }}
            className={cx('w-full rounded-xl bg-secondary', str(v.fit) === 'contain' ? 'object-contain' : 'object-cover')}
          />
          {str(v.caption) && <figcaption className="mt-2 text-sm text-tertiary">{str(v.caption)}</figcaption>}
        </figure>
      ) : (
        <Placeholder icon={Image01} text={t('Set the image address.')} />
      );

    case 'photo':
      return str(v.src) ? (
        <figure>
          <img src={str(v.src)} alt={str(v.alt)} style={{ aspectRatio: photoRatio(v.ratio), objectPosition: str(v.focus) || 'center' }} className="w-full rounded-xl bg-secondary object-cover" />
          {str(v.caption) && <figcaption className="mt-2 text-sm text-tertiary">{str(v.caption)}</figcaption>}
        </figure>
      ) : (
        <Placeholder icon={Image01} text={t('Set the image address.')} />
      );

    case 'table': {
      const table = parseTable(str(v.rows));
      return (
        <div>
          {str(v.title) && <h3 className="text-md font-semibold text-primary">{str(v.title)}</h3>}
          {str(v.subtitle) && <p className="mt-0.5 text-sm text-tertiary">{str(v.subtitle)}</p>}
          <div className={cx('overflow-x-auto', (str(v.title) || str(v.subtitle)) && 'mt-3')}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-secondary">
                  {table.head.map((cell, i) => (
                    <th key={i} scope="col" className="py-2 pr-4 font-medium whitespace-nowrap text-tertiary">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-b border-secondary last:border-0">
                    {row.map((cell, i) =>
                      i === 0 ? (
                        <th key={i} scope="row" className="py-2.5 pr-4 font-medium text-primary">
                          {cell}
                        </th>
                      ) : (
                        <td key={i} className="py-2.5 pr-4 text-secondary tabular-nums">
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {str(v.note) && <p className="mt-2 text-sm text-tertiary">{str(v.note)}</p>}
        </div>
      );
    }

    case 'callout': {
      const tone = str(v.tone);
      const look = {
        info: ['bg-brand-primary_alt ring-secondary', InfoCircle, 'text-fg-brand-primary'],
        success: ['bg-success-primary ring-secondary', CheckCircle, 'text-fg-success-primary'],
        warning: ['bg-warning-primary ring-secondary', AlertTriangle, 'text-fg-warning-primary'],
        error: ['bg-error-primary ring-error_subtle', XCircle, 'text-fg-error-primary'],
      }[tone] ?? ['bg-secondary ring-secondary', InfoCircle, 'text-fg-quaternary'];
      const [surface, Icon, ink] = look as [string, FC<{ className?: string }>, string];
      return (
        <div className={cx('flex h-full gap-3 rounded-xl p-4 ring-1 ring-inset', surface)} role={tone === 'error' || tone === 'warning' ? 'alert' : 'note'}>
          <Icon className={cx('mt-0.5 size-5 shrink-0', ink)} />
          <div className="min-w-0 text-sm">
            {str(v.title) && <p className="font-semibold text-primary">{str(v.title)}</p>}
            <div className={cx('text-secondary', str(v.title) && 'mt-1')}>
              <Paragraphs text={str(v.text)} />
            </div>
          </div>
        </div>
      );
    }

    case 'list': {
      const items = Array.isArray(v.items) ? (v.items as Record<string, unknown>[]) : [];
      const cols = { '1': '', '2': 'sm:grid-cols-2', '3': 'sm:grid-cols-2 lg:grid-cols-3' }[str(v.columns)] ?? 'sm:grid-cols-2';
      return (
        <div>
          {str(v.title) && <h3 className="mb-3 text-md font-semibold text-primary">{str(v.title)}</h3>}
          <ul className={cx('grid gap-4', cols)}>
            {items.map((item, i) => (
              <li key={i} className="flex gap-3">
                <CheckCircle className="mt-0.5 size-5 shrink-0 text-fg-brand-primary" />
                <div>
                  <p className="text-sm font-semibold text-primary">{str(item.title)}</p>
                  {str(item.text) && <p className="mt-0.5 text-sm text-tertiary">{str(item.text)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case 'button':
      return (
        <div className={cx('flex', justifyClass[str(v.align)])}>
          <Button
            size="md"
            color={str(v.style) === 'secondary' ? 'secondary' : str(v.style) === 'link' ? 'link-color' : 'primary'}
            isDisabled={!can(v)}
            onPress={() => open(v, str(v.label))}
          >
            {str(v.label) || t('Open')}
          </Button>
        </div>
      );

    case 'links': {
      const items = (Array.isArray(v.items) ? (v.items as Record<string, unknown>[]) : []).filter((l) => str(l.label));
      return (
        <div>
          {str(v.title) && <h3 className="mb-3 text-md font-semibold text-primary">{str(v.title)}</h3>}
          {items.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((l, i) => (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!can(l)}
                    onClick={() => open(l, str(l.label))}
                    className="group flex h-full w-full items-start gap-3 rounded-xl bg-primary p-4 text-left shadow-xs ring-1 ring-secondary transition duration-100 ease-linear outline-focus-ring ring-inset hover:bg-primary_hover focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-primary">{str(l.label)}</span>
                      {str(l.description) && <span className="mt-0.5 block text-sm text-tertiary">{str(l.description)}</span>}
                    </span>
                    <ArrowUpRight className="size-5 shrink-0 text-fg-quaternary group-hover:text-fg-quaternary_hover" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Placeholder icon={Link01} text={t('Add links in the settings.')} />
          )}
        </div>
      );
    }

    case 'stat': {
      const trend = str(v.trend);
      const Trend = trend === 'up' ? TrendUp01 : trend === 'down' ? TrendDown01 : null;
      return (
        <div className="h-full rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
          <p className="text-sm font-medium text-tertiary">{str(v.label)}</p>
          <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
            <p className="text-display-sm font-semibold text-primary tabular-nums">{str(v.value)}</p>
            {str(v.change) && (
              <span className={cx('mb-1 inline-flex items-center gap-1 text-sm font-medium', trend === 'up' ? 'text-success-primary' : trend === 'down' ? 'text-error-primary' : 'text-tertiary')}>
                {Trend && <Trend className="size-4" />}
                {str(v.change)}
              </span>
            )}
          </div>
          {str(v.note) && <p className="mt-1 text-sm text-tertiary">{str(v.note)}</p>}
        </div>
      );
    }

    case 'chart':
      return Number(v.meta_id) > 0 ? (
        <ChartCard metaId={Number(v.meta_id)} title={str(v.title) || null} height={cardHeight({ small: 1, medium: 2, large: 3 }[str(v.height)] ?? 2)} />
      ) : (
        <Placeholder icon={BarChart01} text={t('Pick a chart in the settings.')} />
      );

    case 'meta':
      return Number(v.meta_id) > 0 ? <MetaView metaId={Number(v.meta_id)} depth={depth + 1} /> : <Placeholder icon={Table} text={t('Pick a {name} in the settings.', { name: widget.name.toLowerCase() })} />;

    case 'iframe':
      return /^https:\/\//i.test(str(v.url)) ? (
        <iframe
          src={str(v.url)}
          title={str(v.title) || t('Embedded page')}
          style={{ height: Math.max(100, Number(v.height) || 400) }}
          className="w-full rounded-xl bg-secondary ring-1 ring-secondary"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : (
        <Placeholder icon={Globe01} text={t('Set an https:// address in the settings.')} />
      );

    case 'carousel': {
      const slides = picturesOf(v.slides);
      if (!slides.length) return <Placeholder icon={Image03} text={t('Add slides with pictures in the settings.')} />;
      return (
        <div className="space-y-3">
          {str(v.title) && <h3 className="text-lg font-semibold text-primary">{str(v.title)}</h3>}
          <Carousel
            slides={slides}
            ratio={ratioOf(v.ratio)}
            label={str(v.title) || t('Pictures')}
            cls={{
              root: 'space-y-3',
              track: 'flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-xl [scrollbar-width:none]',
              slide: 'w-full shrink-0 snap-start',
              frame: 'overflow-hidden rounded-xl bg-secondary [&>img]:size-full [&>img]:object-cover',
              caption: 'mt-2 flex flex-col text-sm text-tertiary [&>strong]:font-semibold [&>strong]:text-primary',
              bar: 'flex items-center justify-between gap-3',
              button: 'rounded-lg px-3 py-1.5 text-sm font-semibold text-secondary ring-1 ring-primary hover:bg-primary_hover disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-focus-ring',
              dots: 'flex gap-2',
              dot: 'size-2.5 rounded-full bg-quaternary aria-[current]:bg-brand-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
            }}
          />
        </div>
      );
    }

    case 'gallery': {
      const pictures = picturesOf(v.images);
      if (!pictures.length) return <Placeholder icon={Grid01} text={t('Add pictures in the settings.')} />;
      return (
        <div className="space-y-3">
          {str(v.title) && <h3 className="text-lg font-semibold text-primary">{str(v.title)}</h3>}
          <Gallery
            pictures={pictures}
            columns={Math.min(4, Math.max(2, Number(v.columns) || 3))}
            cls={{
              grid: 'grid gap-3',
              item: 'space-y-1 text-sm text-tertiary',
              thumb: 'block aspect-[4/3] w-full overflow-hidden rounded-lg bg-secondary [&>img]:size-full [&>img]:object-cover focus-visible:outline-2 focus-visible:outline-focus-ring',
              dialog: 'm-auto max-h-[90vh] max-w-[min(64rem,92vw)] rounded-xl bg-primary p-4 shadow-xl backdrop:bg-black/70',
              big: 'max-h-[72vh] w-auto rounded-lg',
              caption: 'mt-2 text-sm text-tertiary',
              bar: 'mt-3 flex justify-center gap-2',
              button: 'rounded-lg px-3 py-1.5 text-sm font-semibold text-secondary ring-1 ring-primary hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-focus-ring',
            }}
          />
        </div>
      );
    }

    case 'accordion': {
      const items = rowsOf(v.items).filter((r) => str(r.title));
      if (!items.length) return <Placeholder icon={ChevronSelectorVertical} text={t('Add questions in the settings.')} />;
      return (
        <div className="space-y-3">
          {str(v.title) && <h3 className="text-lg font-semibold text-primary">{str(v.title)}</h3>}
          <div className="divide-y divide-secondary rounded-xl ring-1 ring-secondary">
            {items.map((item, i) => (
              <details key={i} name={v.many === true ? undefined : `accordion-${widget.code}-${depth}`} open={i === 0 && v.first_open === true} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-focus-ring">
                  {str(item.title)}
                  <ChevronDown className="size-4 shrink-0 text-quaternary group-open:rotate-180" aria-hidden />
                </summary>
                <div className="space-y-2 px-4 pb-4 text-sm text-tertiary">{str(item.text).split(/\n\s*\n/).filter((p) => p.trim()).map((p, j) => <p key={j}>{p.trim()}</p>)}</div>
              </details>
            ))}
          </div>
        </div>
      );
    }

    case 'collapse':
      return (
        <details open={v.open === true} className="group rounded-xl ring-1 ring-secondary">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-focus-ring">
            {str(v.label) || t('Show more')}
            <ChevronDown className="size-4 shrink-0 text-quaternary group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-2 px-4 pb-4 text-sm text-tertiary">{str(v.text).split(/\n\s*\n/).filter((p) => p.trim()).map((p, j) => <p key={j}>{p.trim()}</p>)}</div>
        </details>
      );

    case 'tabs': {
      const tabs = rowsOf(v.items).filter((r) => str(r.label));
      if (!tabs.length) return <Placeholder icon={Columns03} text={t('Add tabs in the settings.')} />;
      return (
        <div className="space-y-3">
          {str(v.title) && <h3 className="text-lg font-semibold text-primary">{str(v.title)}</h3>}
          <Tabs
            label={str(v.title)}
            tabs={tabs.map((r) => ({ label: str(r.label), body: <>{str(r.text).split(/\n\s*\n/).filter((p) => p.trim()).map((p, j) => <p key={j}>{p.trim()}</p>)}</> }))}
            cls={{
              root: 'space-y-3',
              list: 'flex gap-1 overflow-x-auto border-b border-secondary',
              tab: '-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-semibold whitespace-nowrap text-quaternary hover:text-secondary aria-selected:border-brand aria-selected:text-brand-secondary focus-visible:outline-2 focus-visible:outline-focus-ring',
              panel: 'space-y-2 text-sm text-tertiary focus-visible:outline-2 focus-visible:outline-focus-ring',
            }}
          />
        </div>
      );
    }

    case 'quote':
      if (!str(v.text)) return <Placeholder icon={MessageTextSquare01} text={t('Write the quote and who said it in the settings.')} />;
      return (
        <figure className="space-y-3 border-l-2 border-brand pl-4">
          <blockquote className="space-y-2 text-lg text-primary">{str(v.text).split(/\n\s*\n/).filter((p) => p.trim()).map((p, j) => <p key={j}>{p.trim()}</p>)}</blockquote>
          {str(v.name) && (
            <figcaption className="text-sm">
              <span className="font-semibold text-primary">{str(v.name)}</span>
              {str(v.role) && <span className="text-tertiary">, {str(v.role)}</span>}
            </figcaption>
          )}
        </figure>
      );

    case 'webform':
      return Number(v.meta_id) > 0 ? <MetaView metaId={Number(v.meta_id)} depth={depth + 1} /> : <Placeholder icon={Send01} text={t('Pick a public form in the settings.')} />;

    case 'composite':
      return <CompositeBlock widget={widget} values={v} depth={depth} />;

    case 'records':
      return <RecordsBlock values={v} />;

    case 'schedule':
      return <ScheduleBlock values={v} />;

    default:
      return <Alert>{t('"{name}" uses a renderer this version doesn\'t know ({renderer}).', { name: widget.name, renderer: widget.renderer })}</Alert>;
  }
}

// A composite's parts, loaded once per template. The page builder clears one after saving it.
const templates = new Map<number, Promise<Page>>();
export function clearTemplate(metaId: number) {
  templates.delete(metaId);
}
/** A website's published page brings its composites' parts along, as visitors may not read the templates. */
export function seedTemplates(parts: Record<string, PageItem[]>) {
  for (const [id, items] of Object.entries(parts)) {
    templates.set(Number(id), Promise.resolve({ meta: { id: Number(id) } as Page['meta'], items }));
  }
}
export function loadTemplate(metaId: number): Promise<Page> {
  let p = templates.get(metaId);
  if (!p) {
    p = pageApi.get(metaId);
    p.catch(() => templates.delete(metaId));
    templates.set(metaId, p);
  }
  return p;
}

/**
 * A composite's own settings put into its parts: a setting that is just "{{key}}" takes the
 * value as it is (a picked meta stays a number), and "{{key}}" inside text is replaced by it.
 */
export function fillSettings(value: unknown, values: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const whole = /^\{\{\s*(\w+)\s*\}\}$/.exec(value);
    if (whole) return values[whole[1]] ?? null;
    return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => str(values[key]));
  }
  if (Array.isArray(value)) return value.map((v) => fillSettings(v, values));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillSettings(v, values)]));
  return value;
}

export function fillItems(items: PageItem[], values: Record<string, unknown>): PageItem[] {
  return items.map((i) => ({ ...i, meta: { ...i.meta, json_config: fillSettings(i.meta.json_config, values) as Record<string, unknown> }, children: fillItems(i.children, values) }));
}

// A composite inside a composite inside… stops here, so one that (by mistake) contains itself can't loop.
const MAX_COMPOSITE_DEPTH = 4;

/** A widget made of other widgets: its template's parts, with its settings filled in. */
function CompositeBlock({ widget, values, depth }: { widget: Widget; values: Record<string, unknown>; depth: number }) {
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

  if (!templateId) return <Placeholder icon={LayersThree01} text={t('{name} has no parts yet. Lay them out from the widget library.', { name: widget.name })} />;
  if (depth > MAX_COMPOSITE_DEPTH) return <Alert>{t('These widgets are nested too deeply to show.')}</Alert>;
  if (error) return <Alert>{error}</Alert>;
  if (!page) return <div className="h-24 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />;
  if (!page.items.length) return <Placeholder icon={LayersThree01} text={t('{name} has no parts yet. Lay them out from the widget library.', { name: widget.name })} />;
  return <PageItems items={fillItems(page.items, values)} depth={depth + 1} />;
}

/** "id=id, supplier_id=supplier_id" -> the target's parameters, from the record's fields. */
export function openParams(spec: string, row: DataRow): Record<string, string> {
  return Object.fromEntries(
    spec
      .split(',')
      .map((pair) => pair.split('=').map((s) => s.trim()))
      .filter(([target, field]) => target && field)
      .map(([target, field]) => [target, field.startsWith("'") ? field.slice(1) : row[field] == null ? '' : String(row[field])]),
  );
}

/** A field of a record as the grid would show it: lookups by name, dates, amounts, yes/no. */
function shown(param: MetaParam | undefined, value: unknown, labels: Map<string, Map<string, string>>): string {
  if (value === null || value === undefined || value === '') return '';
  if (!param) return String(value);
  const label = labels.get(param.field_path)?.get(String(value));
  if (label) return label;
  if (param.data_type === 'date') return formatDate(String(value));
  if (param.data_type === 'datetime') return formatDateTime(String(value));
  if (param.data_type === 'boolean') return value === true || value === 1 || value === '1' ? t('Yes') : t('No');
  if (param.data_type === 'decimal') return formatNumber(value, 2);
  if (param.data_type === 'integer' && !param.is_select) return formatNumber(value, 0);
  return String(value);
}

type Line = { template?: string; style?: string; label?: string };

/**
 * Records from a grid (meta_id), drawn by lines with {field} placeholders: a list, cards or
 * a table. Up to limit records, ordered by sort/dir. A record opens open_meta_id, given the
 * parameters open_params names. The grid's own filters and permissions apply.
 */
function RecordsBlock({ values: v }: { values: Record<string, unknown> }) {
  const metaId = Number(v.meta_id) > 0 ? Number(v.meta_id) : null;
  const { def } = useMetaDef(metaId);
  const labels = useLookupLabels(def?.params ?? []);
  const drill = useDrilldown();
  const [result, setResult] = useState<RecordsPage<DataRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const limit = Math.min(Math.max(Number(v.limit) || 5, 1), 50);
  const sort = str(v.sort).trim();
  const dir = str(v.dir) === 'asc' ? 'asc' : 'desc';

  useEffect(() => {
    if (!metaId) return;
    let live = true;
    setError(null);
    dataApi.list(metaId, { per_page: limit, sort: sort || undefined, dir }).then(
      (r) => live && setResult(r),
      (err) => live && setError(err instanceof ApiError ? err.message : t('These records could not be loaded.')),
    );
    return () => {
      live = false;
    };
  }, [metaId, limit, sort, dir]);

  if (!metaId) return <Placeholder icon={List} text={t('Pick the grid the records come from.')} />;
  if (error) return <Alert>{error}</Alert>;
  if (!result) return <div className="h-32 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />;

  const lines = (Array.isArray(v.lines) ? (v.lines as Line[]) : []).filter((l) => str(l.template).trim());
  const byField = new Map((def?.params ?? []).map((p) => [p.field_path, p]));
  const fill = (template: string, row: DataRow) => template.replace(/\{\s*(\w+)\s*\}/g, (_, field: string) => shown(byField.get(field), row[field], labels));
  const openId = Number(v.open_meta_id) > 0 ? Number(v.open_meta_id) : null;
  const open = openId && drill ? (row: DataRow) => drill({ metaId: openId, params: openParams(str(v.open_params), row), label: fill(lines[0]?.template ?? '', row) }) : null;
  const layout = str(v.layout);
  const rows = result.data;

  const lineClass: Record<string, string> = {
    title: 'text-sm font-semibold text-primary',
    text: 'text-sm text-secondary',
    muted: 'text-sm text-tertiary',
    value: 'text-md font-semibold text-primary tabular-nums',
    badge: 'inline-flex w-fit rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary ring-1 ring-secondary ring-inset',
  };
  const body = (row: DataRow) => {
    const main = lines.filter((l) => l.style !== 'value');
    const value = lines.filter((l) => l.style === 'value');
    return (
      <>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {main.map((l, i) => (
            <span key={i} className={cx('truncate', lineClass[l.style ?? 'text'] ?? lineClass.text)}>
              {fill(str(l.template), row)}
            </span>
          ))}
        </span>
        {value.map((l, i) => (
          <span key={i} className={cx('shrink-0', lineClass.value)}>
            {fill(str(l.template), row)}
          </span>
        ))}
      </>
    );
  };
  const rowButton = 'flex w-full items-start gap-3 text-left outline-focus-ring focus-visible:outline-2 disabled:cursor-default';

  return (
    <div>
      {str(v.title) && <h3 className="mb-3 text-md font-semibold text-primary">{str(v.title)}</h3>}
      {result.missing_filters?.length ? (
        <p className="text-sm text-tertiary">{t('This grid needs {fields} before it shows records.', { fields: result.missing_filters.join(', ') })}</p>
      ) : !rows.length ? (
        <p className="rounded-xl bg-primary px-4 py-6 text-center text-sm text-tertiary ring-1 ring-secondary">{str(v.empty_text) || t('Nothing here yet.')}</p>
      ) : !lines.length ? (
        <Placeholder icon={List} text={t('Add lines to “Each record shows”, e.g. {name}.')} />
      ) : layout === 'table' ? (
        <div className="overflow-x-auto rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary text-xs text-tertiary">
              <tr>
                {lines.map((l, i) => (
                  <th key={i} className={cx('px-4 py-2 font-medium', l.style === 'value' && 'text-right')}>
                    {str(l.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary">
              {rows.map((row, r) => (
                <tr key={r} onClick={open ? () => open(row) : undefined} className={cx(open && 'cursor-pointer hover:bg-primary_hover')}>
                  {lines.map((l, i) => (
                    <td key={i} className={cx('px-4 py-2.5', i === 0 ? 'font-medium text-primary' : 'text-secondary', l.style === 'value' && 'text-right tabular-nums')}>
                      {i === 0 && open ? (
                        <button type="button" onClick={(e) => {
                            e.stopPropagation();
                            open(row);
                          }} className="rounded text-left outline-focus-ring hover:underline focus-visible:outline-2">
                          {fill(str(l.template), row)}
                        </button>
                      ) : (
                        fill(str(l.template), row)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : layout === 'cards' ? (
        <ul className={cx('grid gap-3', { '1': '', '2': '@xl:grid-cols-2', '3': '@xl:grid-cols-2 @4xl:grid-cols-3' }[str(v.columns)] ?? '@xl:grid-cols-2')}>
          {rows.map((row, r) => (
            <li key={r}>
              <button type="button" disabled={!open} onClick={() => open?.(row)} className={cx(rowButton, 'h-full rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset', open && 'hover:bg-primary_hover')}>
                {body(row)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {rows.map((row, r) => (
            <li key={r}>
              <button type="button" disabled={!open} onClick={() => open?.(row)} className={cx(rowButton, 'px-4 py-3', open && 'hover:bg-primary_hover')}>
                {body(row)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A wide photo's frame: "21:9" -> "21 / 9". */
export const photoRatio = (ratio: unknown) => (/^\d+:\d+$/.test(str(ratio)) ? str(ratio).replace(':', ' / ') : '21 / 9');

/** A typed table: one row per line, cells split by |, the first line the heading row. */
export function parseTable(text: string): { head: string[]; rows: string[][] } {
  const lines = text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|').map((c) => c.trim()));
  const width = Math.max(0, ...lines.map((l) => l.length));
  const pad = (l: string[]) => [...l, ...Array(width - l.length).fill('')];
  return { head: pad(lines[0] ?? []), rows: lines.slice(1).map(pad) };
}

export interface ScheduleSlot {
  row: DataRow;
  time: string;
  end: string;
  name: string;
  detail: string;
  /** null: the grid doesn't count spaces. */
  spaces: number | null;
}

/**
 * A schedule widget's times: the grid's records (meta_id) in the order of time_field, each
 * read through the field settings. book() opens book_meta_id for one, with book_params.
 */
export function useSchedule(v: Record<string, unknown>) {
  const metaId = Number(v.meta_id) > 0 ? Number(v.meta_id) : null;
  const drill = useDrilldown();
  const [slots, setSlots] = useState<ScheduleSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const limit = Math.min(Math.max(Number(v.limit) || 8, 1), 50);
  const field = (key: string) => str(v[key]).trim();
  const timeField = field('time_field');
  // A booking changes the spaces left: load again after any save.
  const [writes, setWrites] = useState(0);
  useEffect(() => {
    const off = onDataWrite(() => setWrites((n) => n + 1));
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    if (!metaId) return;
    let live = true;
    setError(null);
    dataApi.list(metaId, { per_page: limit, sort: timeField || undefined, dir: 'asc' }).then(
      (r) => live && setSlots(r.data.map((row) => toSlot(row, v))),
      (err) => live && setError(err instanceof ApiError ? err.message : t('These times could not be loaded.')),
    );
    return () => {
      live = false;
    };
  }, [metaId, limit, timeField, writes]); // eslint-disable-line react-hooks/exhaustive-deps

  const bookId = Number(v.book_meta_id) > 0 ? Number(v.book_meta_id) : null;
  const book = bookId && drill ? (slot: ScheduleSlot) => drill({ metaId: bookId, params: openParams(str(v.book_params), slot.row), label: [slot.time, slot.name].filter(Boolean).join(' ') }) : null;
  return { metaId, slots, error, book };
}

function toSlot(row: DataRow, v: Record<string, unknown>): ScheduleSlot {
  const get = (key: string) => {
    const name = str(v[key]).trim();
    return name && row[name] != null ? String(row[name]) : '';
  };
  const spaces = get('spaces_field');
  return { row, time: get('time_field'), end: get('end_field'), name: get('name_field'), detail: get('detail_field'), spaces: spaces === '' ? null : Number(spaces) };
}

/** Times from a grid in the app: a list with the spaces left and a Book button. */
function ScheduleBlock({ values: v }: { values: Record<string, unknown> }) {
  const { metaId, slots, error, book } = useSchedule(v);
  if (!metaId) return <Placeholder icon={Calendar} text={t('Pick the grid the times come from.')} />;
  if (error) return <Alert>{error}</Alert>;
  if (!slots) return <div className="h-32 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />;
  return (
    <div>
      {str(v.title) && <h3 className="mb-3 text-md font-semibold text-primary">{str(v.title)}</h3>}
      {slots.length === 0 ? (
        <p className="text-sm text-tertiary">{str(v.empty_text) || t('Nothing on today.')}</p>
      ) : (
        <ul className="divide-y divide-secondary rounded-xl bg-primary ring-1 ring-secondary">
          {slots.map((slot, i) => {
            const full = slot.spaces !== null && slot.spaces <= 0;
            return (
              <li key={i} className="flex items-center gap-4 px-4 py-3">
                <span className="w-24 shrink-0 text-sm font-semibold text-primary tabular-nums">
                  {slot.time}
                  {slot.end && <span className="block font-normal text-tertiary">{t('to {time}', { time: slot.end })}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-primary">{slot.name}</span>
                  {slot.detail && <span className="block truncate text-sm text-tertiary">{slot.detail}</span>}
                </span>
                {slot.spaces !== null && <span className={cx('shrink-0 text-sm tabular-nums', full ? 'text-error-primary' : 'text-secondary')}>{full ? t('Full') : t('{count} left', { count: slot.spaces })}</span>}
                {book && (
                  <Button size="sm" color="secondary" isDisabled={full} onPress={() => book(slot)}>
                    {str(v.book_label) || t('Book')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Placeholder({ icon: Icon, text }: { icon: FC<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-primary px-4 py-8 text-center">
      <Icon className="size-6 text-fg-quaternary" />
      <p className="text-sm text-tertiary">{text}</p>
    </div>
  );
}

/** Placed widgets in order, sections holding theirs. */
export function PageItems({ items, depth = 0 }: { items: PageItem[]; depth?: number }) {
  return (
    <PageGrid>
      {items.map((item) => (
        <div key={item.param_id} className={widthClass(item.w)}>
          <WidgetBlock widget={item.widget} config={item.meta.json_config} depth={depth}>
            {item.children.length ? <PageItems items={item.children} depth={depth + 1} /> : undefined}
          </WidgetBlock>
        </div>
      ))}
    </PageGrid>
  );
}

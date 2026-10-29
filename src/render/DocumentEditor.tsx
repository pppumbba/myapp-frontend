import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Edit05, File06, Printer } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { contentApi } from '../lib/contentApi';
import type { DataRow } from '../lib/dataApi';
import { documentApi, PAPER, type Band, type DocElement, type FilledDocument, type PageSettings, type Section, type Shown } from '../lib/documentApi';
import type { MetaParam } from '../lib/metaApi';
import { Modal } from '../components/Modal';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';
import { optionsOf } from './definitions';
import { filesOf } from './FileField';
import { useDocumentAsset } from './documentAssets';
import type { Values } from './formValues';
import { t } from '@/i18n';

const PT = 0.3528; // mm per point
const FONT_CSS = { sans: '"DejaVu Sans", Verdana, sans-serif', serif: '"DejaVu Serif", Georgia, serif', mono: '"DejaVu Sans Mono", Consolas, monospace' };

/** Typed straight into the page; the rest (lookups, dates, choices, files) open in the side panel. */
const typedIn = (f: MetaParam) => ['string', 'integer', 'decimal', 'text'].includes(f.data_type) && !(f.is_select && f.ref_meta_id) && !optionsOf(f);

type Picked = { field: string } | { detail: string } | null;

/** A form's document field in the form: the PDF its last save kept, and the way into the page. */
export function DocumentCard({ param, value, onOpen }: { param: MetaParam; value: string | boolean; onOpen: () => void }) {
  const [file] = filesOf(value);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl p-3 ring-1 ring-secondary">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
        <File06 className="size-5 text-fg-quaternary" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary">{param.label_name || param.param_name}</p>
        {file ? (
          <button type="button" className="max-w-full truncate text-left text-xs text-tertiary hover:underline" onClick={() => contentApi.open(file).catch(() => {})}>
            {t('Saved copy: {name}', { name: file.file_name })}
          </button>
        ) : (
          <p className="text-xs text-tertiary">{t('Fill it in on the page. Saving keeps a PDF of it.')}</p>
        )}
      </div>
      <Button size="sm" color="secondary" iconLeading={Edit05} onPress={onOpen}>
        {t('Fill in on the page')}
      </Button>
    </div>
  );
}

/**
 * A form's document field opened: its report's page, drawn as it prints and filled with the
 * form's values as they are now (the server fills it in, so names, totals and amounts in words
 * read as in the PDF). Only the fields the form lets you change can be changed: highlighted
 * spots on the page. Simple ones are typed into in place; lookups, dates, choices and a lines
 * table open beside the page. Everything else is the fixed template. The values are the
 * form's own, so the form's Save keeps them; Save and print saves and prints the document.
 */
export function DocumentEditor({
  formMetaId,
  param,
  recordId,
  payload,
  fields,
  values,
  errors,
  error,
  editable,
  onValue,
  renderField,
  renderLines,
  saving,
  onSaveAndPrint,
  onClose,
}: {
  formMetaId: number;
  param: MetaParam;
  recordId: string | null;
  /** The form's values as a save would send them. */
  payload: DataRow;
  fields: MetaParam[];
  values: Values;
  errors: Record<string, string[]>;
  error: string | null;
  editable: (f: MetaParam) => boolean;
  onValue: (field: string, value: string) => void;
  renderField: (f: MetaParam) => ReactNode;
  /** A detail's lines editor, or null when the form does not show that detail. */
  renderLines: (detail: string) => ReactNode | null;
  saving: boolean;
  onSaveAndPrint: () => void;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<FilledDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [picked, setPicked] = useState<Picked>(null);
  const [s, setS] = useState(3);
  const area = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(payload);

  // Filled again a moment after each change, so the page follows the typing.
  useEffect(() => {
    let live = true;
    setUpdating(true);
    const timer = setTimeout(() => {
      documentApi.fill(formMetaId, param.id, payload, recordId).then(
        (d) => {
          if (!live) return;
          setDoc(d);
          setLoadError(null);
          setUpdating(false);
        },
        (err) => {
          if (!live) return;
          setLoadError(err instanceof ApiError ? err.message : t('The document could not be filled in.'));
          setUpdating(false);
        },
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [formMetaId, param.id, recordId, key]);

  const page = doc?.layout.page;
  const [pw, ph] = page ? (page.orientation === 'landscape' ? [PAPER[page.size][1], PAPER[page.size][0]] : PAPER[page.size]) : [210, 297];

  // The page fills the width it has, up to 4 px a millimetre.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const fit = () => setS(Math.max(1.5, Math.min(4, (el.clientWidth - 32) / pw)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pw, doc !== null]);

  const byPath = new Map(fields.map((f) => [f.field_path, f]));
  const changeable = (path: string) => {
    const f = byPath.get(path);
    return f && editable(f) ? f : null;
  };
  const pickedField = picked && 'field' in picked ? byPath.get(picked.field) : undefined;
  const pickedLines = picked && 'detail' in picked ? renderLines(picked.detail) : null;
  const onPage = doc ? editableOnPage(doc, changeable) : [];

  const ctx: PageCtx | null = doc && page ? { s, page, shown: doc.shown, reportMetaId: doc.report_meta_id, values, errors, picked, changeable, setPicked, onValue, hasLines: (d) => renderLines(d) !== null } : null;

  return (
    <Modal title={param.label_name || param.param_name} description={t('Change the highlighted values; the rest is the template. Changes go into the form.')} onClose={onClose} size="xl">
      <div className="space-y-3">
        {(error || loadError) && <Alert>{error ?? loadError}</Alert>}
        <div className={cx('grid gap-4', !pickedLines && 'lg:grid-cols-[minmax(0,1fr)_16rem]')}>
          <div ref={area} className={cx('relative overflow-auto rounded-lg bg-secondary p-4', pickedLines ? 'max-h-[40vh]' : 'max-h-[70vh]')}>
            {updating && doc && <span className="absolute top-2 right-3 z-10 text-xs text-tertiary">{t('Updating…')}</span>}
            {ctx && page ? (
              <div
                className="relative mx-auto flex flex-col bg-white text-[#101828] shadow-lg ring-1 ring-black/5"
                style={{ width: pw * s, minHeight: ph * s, padding: `${page.margin.top * s}px ${page.margin.right * s}px ${page.margin.bottom * s}px ${page.margin.left * s}px`, fontFamily: FONT_CSS[page.font], fontSize: page.font_size * PT * s, lineHeight: 1.3 }}
              >
                <PageBand band={doc!.layout.header} ctx={ctx} />
                {doc!.layout.sections.map((x) =>
                  x.kind === 'free' ? <PageBand key={x.id} band={x} ctx={ctx} /> : x.kind === 'table' ? <PageTable key={x.id} section={x} ctx={ctx} /> : <PageText key={x.id} section={x} ctx={ctx} />,
                )}
                <div className="mt-auto">
                  <PageBand band={doc!.layout.footer} ctx={ctx} />
                </div>
              </div>
            ) : (
              !loadError && <div className="mx-auto h-[60vh] max-w-xl animate-pulse rounded bg-primary motion-reduce:animate-none" />
            )}
          </div>

          <aside className="space-y-3">
            {pickedField ? (
              <>
                {renderField(pickedField)}
                <p className="text-xs text-tertiary">{t('The page shows it as it prints.')}</p>
              </>
            ) : pickedLines ? (
              pickedLines
            ) : (
              <>
                <p className="text-sm text-secondary">{t('Highlighted spots are what you can change. Type into them, or click one to change it here.')}</p>
                {onPage.length > 0 && (
                  <ul className="space-y-1">
                    {onPage.map((f) => (
                      <li key={f.field_path}>
                        <button type="button" className={cx('w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-primary_hover', errors[f.field_path] ? 'text-error-primary' : 'text-secondary')} onClick={() => setPicked({ field: f.field_path })}>
                          {f.label_name || f.param_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {doc && onPage.length === 0 && <p className="text-sm text-tertiary">{t('This document has no fields you can change: the form fills it.')}</p>}
              </>
            )}
            {picked && (
              <Button size="sm" color="tertiary" onPress={() => setPicked(null)}>
                {t('Done')}
              </Button>
            )}
          </aside>
        </div>

        <div className="flex justify-end gap-3 border-t border-secondary pt-4">
          <Button size="lg" color="secondary" onPress={onClose}>
            {t('Back to the form')}
          </Button>
          <Button size="lg" iconLeading={Printer} isLoading={saving} showTextWhileLoading onPress={onSaveAndPrint}>
            {saving ? t('Saving…') : t('Save and print')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** The changeable fields placed on the page, in page order, each once. */
function editableOnPage(doc: FilledDocument, changeable: (path: string) => MetaParam | null): MetaParam[] {
  const bands = [doc.layout.header, ...doc.layout.sections.filter((x): x is Extract<Section, { kind: 'free' }> => x.kind === 'free'), doc.layout.footer];
  const seen = new Map<string, MetaParam>();
  for (const b of bands) {
    for (const el of [...b.elements].sort((a, z) => a.y - z.y || a.x - z.x)) {
      const f = el.type === 'field' ? changeable(el.field) : null;
      if (f && !seen.has(f.field_path)) seen.set(f.field_path, f);
    }
  }
  return [...seen.values()];
}

interface PageCtx {
  s: number;
  page: PageSettings;
  shown: Shown;
  reportMetaId: number;
  values: Values;
  errors: Record<string, string[]>;
  picked: Picked;
  changeable: (path: string) => MetaParam | null;
  setPicked: (p: Picked) => void;
  onValue: (field: string, value: string) => void;
  hasLines: (detail: string) => boolean;
}

const pageNumbers = (text: string) => text.replace(/\{page\}/g, '1').replace(/\{pages\}/g, '1');
const text = (shown: Shown, id: string) => (typeof shown[id] === 'string' ? (shown[id] as string) : '');

function PageBand({ band, ctx }: { band: Band; ctx: PageCtx }) {
  const bg = useDocumentAsset(ctx.reportMetaId, band.background?.print ? band.background.src : '');
  if (band.height === 0) return null;
  return (
    <div className="relative" style={{ height: band.height * ctx.s }}>
      {bg && <img src={bg} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain object-left-top select-none" />}
      {band.elements.map((el) => (
        <PageElement key={el.id} el={el} ctx={ctx} />
      ))}
    </div>
  );
}

function boxOf(el: DocElement, s: number, page: PageSettings): CSSProperties {
  const st = el.style;
  const box: CSSProperties = {
    left: el.x * s,
    top: el.y * s,
    width: el.w * s,
    height: el.type === 'line' && el.h <= el.w ? Math.max(1, st.border * PT * s) : el.h * s,
    fontSize: (st.font_size || page.font_size) * PT * s,
    fontWeight: st.bold ? 700 : undefined,
    fontStyle: st.italic ? 'italic' : undefined,
    textDecoration: st.underline ? 'underline' : undefined,
    textAlign: st.align,
    color: st.color,
    background: el.type === 'line' ? st.border_color : st.bg || undefined,
    border: el.type !== 'line' && st.border ? `${st.border * PT * s}px solid ${st.border_color}` : undefined,
    padding: st.padding * s,
  };
  if (el.type === 'line' && el.h > el.w) {
    box.width = Math.max(1, st.border * PT * s);
    box.height = el.h * s;
  }
  return box;
}

function PageElement({ el, ctx }: { el: DocElement; ctx: PageCtx }) {
  const { s, page, shown } = ctx;
  const img = useDocumentAsset(ctx.reportMetaId, el.type === 'image' || el.type === 'signature' ? el.src : '');
  const box = boxOf(el, s, page);
  const field = el.type === 'field' ? ctx.changeable(el.field) : null;
  if (field) return <EditableSpot el={el} param={field} box={box} ctx={ctx} />;

  let content: ReactNode = null;
  if (el.type === 'text') content = pageNumbers(text(shown, el.id));
  else if (el.type === 'field')
    content = (
      <>
        {el.label && <span className="font-normal text-[#667085]">{el.label} </span>}
        {text(shown, el.id)}
      </>
    );
  else if (el.type === 'page') content = pageNumbers(el.text || t('Page {page} of {pages}'));
  else if (el.type === 'image') content = img && <img src={img} alt="" className="size-full object-contain object-left-top" draggable={false} />;
  else if (el.type === 'signature') {
    const [role, name] = Array.isArray(shown[el.id]) ? (shown[el.id] as [string, string]) : ['', ''];
    content = (
      <div className="relative size-full">
        <span className="absolute top-[35%] left-0 w-[40%] whitespace-pre-wrap">{role}</span>
        {img && <img src={img} alt="" className="absolute top-0 left-[45%] h-[70%] w-[30%] object-contain" draggable={false} />}
        <span className="absolute top-[62%] right-0 left-[42%] border-t border-[#344054]" />
        <span className="absolute top-[66%] right-0 left-[42%] text-center text-[0.85em] text-[#475467]">{name}</span>
      </div>
    );
  }
  return (
    <div className="absolute overflow-hidden whitespace-pre-wrap" style={box}>
      {content}
    </div>
  );
}

/** A value the form lets you change: typed into in place, or picked to change beside the page. */
function EditableSpot({ el, param: f, box, ctx }: { el: DocElement; param: MetaParam; box: CSSProperties; ctx: PageCtx }) {
  const [focused, setFocused] = useState(false);
  const label = f.label_name || f.param_name;
  const shown = text(ctx.shown, el.id);
  const raw = String(ctx.values[f.field_path] ?? '');
  const error = ctx.errors[f.field_path]?.[0];
  const isPicked = !!ctx.picked && 'field' in ctx.picked && ctx.picked.field === f.field_path;
  const spot = cx(
    'absolute flex items-start overflow-hidden rounded-[2px] transition-colors',
    error ? 'bg-[#fef3f2] outline-[1.5px] outline-[#d92d20] outline-solid' : isPicked || focused ? 'bg-[#f4ebff] outline-[1.5px] outline-[#7f56d9] outline-solid' : 'bg-[#f9f5ff] outline-1 outline-[#d6bbfb] outline-dashed hover:bg-[#f4ebff]',
  );
  const caption = el.label ? <span className="shrink-0 font-normal whitespace-pre text-[#667085]">{el.label} </span> : null;
  const inputStyle: CSSProperties = { font: 'inherit', color: 'inherit', textAlign: box.textAlign, textDecoration: 'inherit' };

  if (typedIn(f)) {
    const common = {
      'aria-label': label,
      'aria-invalid': !!error,
      title: error ?? label,
      placeholder: label,
      value: focused ? raw : shown || raw,
      onFocus: () => {
        setFocused(true);
        ctx.setPicked({ field: f.field_path });
      },
      onBlur: () => setFocused(false),
      className: 'min-w-0 flex-1 resize-none bg-transparent outline-none placeholder:text-[#b692f6]',
      style: inputStyle,
    };
    return (
      <label className={spot} style={box}>
        {caption}
        {f.data_type === 'text' ? (
          <textarea {...common} className={cx(common.className, 'h-full')} onChange={(e) => ctx.onValue(f.field_path, e.target.value)} />
        ) : (
          <input
            {...common}
            inputMode={f.data_type === 'string' ? undefined : 'decimal'}
            onChange={(e) => ctx.onValue(f.field_path, f.data_type === 'string' ? e.target.value : e.target.value.replace(/[^\d.-]/g, ''))}
          />
        )}
      </label>
    );
  }
  return (
    <button type="button" className={cx(spot, 'text-left')} style={box} title={error ?? label} aria-label={`${label}: ${shown || 'empty'}`} onClick={() => ctx.setPicked({ field: f.field_path })}>
      {caption}
      <span className={cx('min-w-0 flex-1 whitespace-pre-wrap', !shown && 'text-[#b692f6]')}>{shown || label}</span>
    </button>
  );
}

function PageTable({ section, ctx }: { section: Extract<Section, { kind: 'table' }>; ctx: PageCtx }) {
  const { s } = ctx;
  const data = ctx.shown[section.id] as { rows: string[][]; totals: (string | null)[] | null } | undefined;
  const total = section.columns.reduce((a, c) => a + c.width, 0) || 1;
  const cell = section.border ? 'border border-[#98a2b3]' : 'border-b border-[#d0d5dd]';
  const pad = { padding: `${1.2 * s}px ${1.5 * s}px` };
  const editable = ctx.hasLines(section.detail);
  const isPicked = !!ctx.picked && 'detail' in ctx.picked && ctx.picked.detail === section.detail;
  if (!section.columns.length) return null;
  const table = (
    <table className="w-full border-collapse" style={{ fontSize: section.font_size ? section.font_size * PT * s : undefined }}>
      <thead>
        <tr style={{ background: section.header_bg || undefined }}>
          {section.numbered && (
            <th className={cx(cell, 'text-center')} style={{ ...pad, width: 7 * s }}>
              №
            </th>
          )}
          {section.columns.map((c) => (
            <th key={c.id} className={cell} style={{ ...pad, width: `${(c.width / total) * 100}%`, textAlign: c.align }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(data?.rows ?? []).map((row, n) => (
          <tr key={n}>
            {section.numbered && (
              <td className={cx(cell, 'text-center')} style={pad}>
                {n + 1}
              </td>
            )}
            {row.map((v, i) => (
              <td key={i} className={cx(cell, 'whitespace-pre-wrap')} style={{ ...pad, textAlign: section.columns[i]?.align }}>
                {v}
              </td>
            ))}
          </tr>
        ))}
        {data?.totals && (
          <tr className="font-bold">
            {section.numbered && <td className={cell} style={pad} />}
            {data.totals.map((v, i) => (
              <td key={i} className={cell} style={{ ...pad, textAlign: section.columns[i]?.align }}>
                {v ?? (i === 0 ? section.totals_label : '')}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
  if (!editable) return table;
  return (
    <button
      type="button"
      aria-label={t('Change the lines')}
      title={t('Change the lines')}
      onClick={() => ctx.setPicked({ detail: section.detail })}
      className={cx('block w-full rounded-[2px] text-left', isPicked ? 'outline-[1.5px] outline-[#7f56d9] outline-solid' : 'outline-1 outline-[#d6bbfb] outline-dashed hover:bg-[#f9f5ff]')}
    >
      {table}
    </button>
  );
}

function PageText({ section, ctx }: { section: Extract<Section, { kind: 'text' }>; ctx: PageCtx }) {
  const { s } = ctx;
  return (
    <div style={{ marginTop: section.space_before * s, textAlign: section.align, fontSize: section.font_size ? section.font_size * PT * s : undefined }}>
      {text(ctx.shown, section.id)
        .split(/\n\s*\n/)
        .map((p, i) => (
          <p key={i} className="whitespace-pre-wrap" style={{ marginBottom: 1.5 * s }}>
            {pageNumbers(p)}
          </p>
        ))}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold01,
  Copy01,
  Edit05,
  Eye,
  FilePlus01,
  FlipBackward,
  FlipForward,
  Hash02,
  Image01,
  Italic01,
  LayoutBottom,
  LayoutTop,
  Minus,
  Plus,
  Rows01,
  Square,
  Table,
  Trash01,
  Type01,
  Underline01,
  Upload01,
  ZoomIn,
  ZoomOut,
} from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaParam } from '../../lib/metaApi';
import {
  documentApi,
  PAPER,
  type Align,
  type Band,
  type DocElement,
  type ElementStyle,
  type ElementType,
  type Layout,
  type PageSettings,
  type Section,
  type TableColumn,
  type ValueFormat,
} from '../../lib/documentApi';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';
import { clearRenderCache, useMetaDef } from '../../render/definitions';
import { RecordPicker } from '../../render/ReportView';
import { PdfImportModal } from './PdfImportModal';
import { useDocumentAsset } from '../../render/documentAssets';
import { t, tLabels } from '@/i18n';

/** A band on the page: the header, the footer, or a free section by its id. */
type BandKey = 'header' | 'footer' | string;
type Selection = { band: BandKey; element?: string } | null;

const PT = 0.3528; // mm per point
const FONT_CSS = { sans: '"DejaVu Sans", Verdana, sans-serif', serif: '"DejaVu Serif", Georgia, serif', mono: '"DejaVu Sans Mono", Consolas, monospace' };
const FORMATS: { value: ValueFormat; label: string }[] = [
  { value: 'text', label: 'As it is' },
  { value: 'number', label: 'Number 1,234.50' },
  { value: 'integer', label: 'Whole number 1,235' },
  { value: 'money', label: 'Money 1,234.50 ₮' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date and time' },
  { value: 'words', label: 'Amount in words' },
];
const PALETTE: { type: ElementType; label: string; icon: typeof Type01; hint: string }[] = [
  { type: 'text', label: 'Text', icon: Type01, hint: 'Fixed text; {field} puts a value in it' },
  { type: 'field', label: 'Field', icon: Hash02, hint: 'One value of the record' },
  { type: 'image', label: 'Image', icon: Image01, hint: 'A logo or stamp' },
  { type: 'signature', label: 'Signature', icon: Edit05, hint: 'Who signs, a line and a name' },
  { type: 'line', label: 'Line', icon: Minus, hint: 'A rule across' },
  { type: 'box', label: 'Box', icon: Square, hint: 'A frame or shaded area' },
  { type: 'page', label: 'Page number', icon: Rows01, hint: 'Page 1 of 3' },
];
const DRAG_TYPE = 'application/x-document-element';

const uid = () => Math.random().toString(36).slice(2, 10);
const round = (v: number, step = 1) => Math.round(v / step) * step;
const STYLE: ElementStyle = { font_size: 0, bold: false, italic: false, underline: false, align: 'left', color: '#101828', bg: '', border: 0, border_color: '#344054', padding: 0 };

function newElement(type: ElementType, x: number, y: number, more: Partial<DocElement> = {}): DocElement {
  const size: Record<ElementType, [number, number]> = { text: [60, 6], field: [60, 6], image: [40, 20], signature: [85, 14], line: [80, 0], box: [60, 20], page: [40, 5] };
  const [w, h] = size[type];
  return {
    id: uid(),
    type,
    x,
    y,
    w,
    h,
    text: type === 'text' ? t("Text") : type === 'page' ? t("Page {page} of {pages}") : '',
    field: '',
    label: type === 'signature' ? t("Approved by") : '',
    format: 'text',
    src: '',
    style: { ...STYLE, border: type === 'line' || type === 'box' ? 0.5 : 0, align: type === 'page' ? 'right' : 'left' },
    ...more,
  };
}

const bandOf = (layout: Layout, key: BandKey): Band | null =>
  key === 'header' ? layout.header : key === 'footer' ? layout.footer : ((layout.sections.find((s) => s.id === key && s.kind === 'free') as Band | undefined) ?? null);

function withBand(layout: Layout, key: BandKey, fn: (b: Band) => Band): Layout {
  if (key === 'header') return { ...layout, header: fn(layout.header) };
  if (key === 'footer') return { ...layout, footer: fn(layout.footer) };
  return { ...layout, sections: layout.sections.map((s) => (s.id === key && s.kind === 'free' ? { ...s, ...fn(s) } : s)) };
}

const useAsset = useDocumentAsset;

interface FieldInfo {
  path: string;
  label: string;
  type: string;
  /** A lookup: shows a name, though it stores an id. */
  select?: boolean;
}

/**
 * A report meta's document layout, designed on a picture of the page: a header and footer on
 * every page, and sections down it — bands where text, fields, images, lines, boxes,
 * signatures and page numbers are dragged into place (millimetres, snapped to 1 mm; hold Alt
 * to place freely), tables of a detail's lines, and flowing text such as contract clauses.
 * The server makes the PDF from it (see App\Support\Documents), so Preview shows exactly what
 * prints.
 */
export function DocumentDesigner({ meta }: { meta: Meta }) {
  const [layout, setLayoutState] = useState<Layout | null>(null);
  const [saved, setSaved] = useState('');
  const [past, setPast] = useState<Layout[]>([]);
  const [future, setFuture] = useState<Layout[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [zoom, setZoom] = useState(3);
  const [params, setParams] = useState<MetaParam[]>([]);
  const [lineFields, setLineFields] = useState<Record<string, FieldInfo[]>>({});
  const [named, setNamed] = useState(() => ({
    title: typeof meta.json_config?.title === 'string' ? meta.json_config.title : '',
    number: typeof meta.json_config?.number_field === 'string' ? meta.json_config.number_field : '',
  }));
  const [title, setTitle] = useState(named.title);
  const [numberField, setNumberField] = useState(named.number);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const { def } = useMetaDef(meta.id);

  useEffect(() => {
    documentApi.layout(meta.id).then(
      (r) => {
        setLayoutState(r.layout);
        setSaved(r.saved ? JSON.stringify(r.layout) : '');
      },
      (err) => setError(err instanceof ApiError ? err.message : t("The layout could not be loaded.")),
    );
    metaApi.params(meta.id).then(async (ps) => {
      setParams(ps);
      const details = ps.filter((p) => p.data_type === 'detail' && p.ref_meta_id);
      const entries = await Promise.all(
        details.map(async (d) => {
          const lps = await metaApi.params(d.ref_meta_id!).catch(() => [] as MetaParam[]);
          const fields: FieldInfo[] = lps.filter((p) => p.data_type !== 'detail' && p.data_type !== 'subgrid').map((p) => ({ path: p.field_path, label: p.label_name || p.field_path, type: p.data_type, select: p.is_select }));
          if (d.json_config?.amount) fields.push({ path: 'amount', label: t("Amount"), type: 'decimal' });
          return [d.field_path, fields] as const;
        }),
      );
      setLineFields(Object.fromEntries(entries));
    });
  }, [meta.id]);

  const fields: FieldInfo[] = useMemo(
    () => params.filter((p) => p.data_type !== 'detail' && p.data_type !== 'subgrid' && p.data_type !== 'signature').map((p) => ({ path: p.field_path, label: p.label_name || p.field_path, type: p.data_type, select: p.is_select })),
    [params],
  );
  const details = useMemo(() => params.filter((p) => p.data_type === 'detail').map((p) => ({ path: p.field_path, label: p.label_name || p.field_path })), [params]);

  /** Changes the layout; `mark` false for the moves of one drag, whose start was already marked. */
  const change = useCallback(
    (fn: (l: Layout) => Layout, mark = true) => {
      setLayoutState((current) => {
        if (!current) return current;
        if (mark) {
          setPast((p) => [...p.slice(-80), current]);
          setFuture([]);
        }
        return fn(current);
      });
      setNotice(null);
    },
    [],
  );
  const markUndo = useCallback(() => {
    setLayoutState((current) => {
      if (current) {
        setPast((p) => [...p.slice(-80), current]);
        setFuture([]);
      }
      return current;
    });
  }, []);
  const undo = () => {
    if (!past.length || !layout) return;
    setFuture((f) => [layout, ...f]);
    setLayoutState(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };
  const redo = () => {
    if (!future.length || !layout) return;
    setPast((p) => [...p, layout]);
    setLayoutState(future[0]);
    setFuture((f) => f.slice(1));
  };

  const selected = layout && selection?.element ? (bandOf(layout, selection.band)?.elements.find((e) => e.id === selection.element) ?? null) : null;
  const setElement = (patch: Partial<DocElement>, mark = true) =>
    selection?.element && change((l) => withBand(l, selection.band, (b) => ({ ...b, elements: b.elements.map((e) => (e.id === selection.element ? { ...e, ...patch } : e)) })), mark);
  const removeElement = () => {
    if (!selection?.element) return;
    change((l) => withBand(l, selection.band, (b) => ({ ...b, elements: b.elements.filter((e) => e.id !== selection.element) })));
    setSelection({ band: selection.band });
  };
  const duplicate = () => {
    if (!selected || !selection) return;
    const copy = { ...selected, id: uid(), x: selected.x + 3, y: selected.y + 3, style: { ...selected.style } };
    change((l) => withBand(l, selection.band, (b) => ({ ...b, elements: [...b.elements, copy] })));
    setSelection({ band: selection.band, element: copy.id });
  };

  // Keys: Delete, arrows nudge (Shift: 5 mm), Ctrl+D duplicates, Ctrl+Z / Ctrl+Y undo and redo.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (!selected) {
      return;
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeElement();
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicate();
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 5 : e.altKey ? 0.5 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      setElement({ x: round(selected.x + dx, 0.5), y: round(selected.y + dy, 0.5) });
    } else if (e.key === 'Escape') {
      setSelection(null);
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  if (!layout) {
    return error ? <Alert>{error}</Alert> : <div className="h-96 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />;
  }

  const page = layout.page;
  const [pw, ph] = page.orientation === 'landscape' ? [PAPER[page.size][1], PAPER[page.size][0]] : PAPER[page.size];
  const contentWidth = pw - page.margin.left - page.margin.right;
  const changed = JSON.stringify(layout) !== saved || title !== named.title || numberField !== named.number;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await documentApi.save(meta.id, layout, { title: title || null, number_field: numberField || null });
      setLayoutState(r.layout);
      setSaved(JSON.stringify(r.layout));
      setNamed({ title, number: numberField });
      clearRenderCache();
      setNotice(t("Saved. Records print with this layout now."));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("The layout could not be saved."));
    } finally {
      setBusy(false);
    }
  };
  const showPreview = async () => {
    setPreviewing(true);
    setError(null);
    try {
      setPreview(await documentApi.preview(meta.id, layout, recordId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("The preview could not be made."));
    } finally {
      setPreviewing(false);
    }
  };

  const addSection = (kind: Section['kind']) => {
    const section: Section =
      kind === 'free'
        ? { id: uid(), kind, height: 20, elements: [] }
        : kind === 'table'
          ? {
              id: uid(),
              kind,
              detail: details[0]?.path ?? '',
              numbered: true,
              border: true,
              font_size: 0,
              header_bg: '#f2f4f7',
              totals_label: 'Total',
              columns: (lineFields[details[0]?.path ?? ''] ?? []).slice(0, 5).map((f) => columnOf(f)),
            }
          : { id: uid(), kind, text: t("Clause 1. …\n\nClause 2. …"), font_size: 0, align: 'justify', space_before: 2 };
    const at = selection ? layout.sections.findIndex((s) => s.id === selection.band) : -1;
    change((l) => ({ ...l, sections: at < 0 ? [...l.sections, section] : [...l.sections.slice(0, at + 1), section, ...l.sections.slice(at + 1)] }));
    setSelection({ band: section.id });
  };

  /** Adds an element to the selected band (else the first free one) when a palette item is clicked. */
  const addElement = (type: ElementType, more: Partial<DocElement> = {}) => {
    const key = selection && bandOf(layout, selection.band) ? selection.band : (layout.sections.find((s) => s.kind === 'free')?.id ?? 'header');
    const band = bandOf(layout, key)!;
    const y = Math.max(0, Math.min(band.height - 6, band.elements.reduce((m, e) => Math.max(m, e.y + e.h + 1), 0)));
    const el = newElement(type, 0, round(y), more);
    change((l) => withBand(l, key, (b) => ({ ...b, height: Math.max(b.height, el.y + el.h + 1), elements: [...b.elements, el] })));
    setSelection({ band: key, element: el.id });
  };

  const s = zoom; // px per mm
  const paper: CSSProperties = { width: pw * s, minHeight: ph * s, padding: `${page.margin.top * s}px ${page.margin.right * s}px ${page.margin.bottom * s}px ${page.margin.left * s}px`, fontFamily: FONT_CSS[page.font], fontSize: page.font_size * PT * s, lineHeight: 1.3 };
  const context: Ctx = { metaId: meta.id, s, page, fields, change, markUndo, selection, setSelection, contentWidth };
  const selectedSection = selection && !selection.element ? (layout.sections.find((x) => x.id === selection.band) ?? null) : null;

  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={t("Document designer")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-secondary px-4 py-3">
        <div className="mr-auto min-w-0">
          <h2 className="text-lg font-semibold text-primary">{t("Document")}</h2>
          <p className="text-sm text-tertiary">{t("Drag items onto the page. Every record prints as a PDF with this layout.")}</p>
        </div>
        <ToolButton label={t("Undo (Ctrl+Z)")} icon={FlipBackward} disabled={!past.length} onClick={undo} />
        <ToolButton label={t("Redo (Ctrl+Y)")} icon={FlipForward} disabled={!future.length} onClick={redo} />
        <ToolButton label={t("Zoom out")} icon={ZoomOut} disabled={zoom <= 1.5} onClick={() => setZoom((z) => Math.max(1.5, z - 0.5))} />
        <span className="w-10 text-center text-xs text-tertiary tabular-nums">{Math.round((zoom / 3.78) * 100)}%</span>
        <ToolButton label={t("Zoom in")} icon={ZoomIn} disabled={zoom >= 6} onClick={() => setZoom((z) => Math.min(6, z + 0.5))} />
        <Button size="sm" color="secondary" iconLeading={FilePlus01} onPress={() => setImporting(true)}>
          {t("Import PDF")}
        </Button>
        <Button size="sm" color="secondary" iconLeading={Eye} isLoading={previewing} showTextWhileLoading onPress={showPreview}>
          {t("Preview PDF")}
        </Button>
        <Button size="sm" isLoading={busy} showTextWhileLoading isDisabled={!changed && !!saved} onPress={save}>
          {saved ? t("Save layout") : t("Save this layout")}
        </Button>
      </div>
      {(error || notice || !saved) && (
        <div className="space-y-2 px-4 pt-3">
          {error && <Alert>{error}</Alert>}
          {notice && <p className="text-sm text-success-primary">{notice}</p>}
          {!saved && !notice && <p className="text-sm text-tertiary">{t("This is a starting layout made from the report's fields. Until it is saved, records print with it as it is.")}</p>}
        </div>
      )}

      <div className="grid min-h-[40rem] grid-cols-1 lg:grid-cols-[13rem_1fr_17rem]">
        {/* Left: things to add, the record's fields, and the sections down the page. */}
        <aside className="space-y-5 border-b border-secondary p-3 lg:border-r lg:border-b-0">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-tertiary uppercase">{t("Add")}</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {PALETTE.map((p) => (
                <button
                  key={p.type}
                  type="button"
                  draggable
                  title={`${t(p.hint)}. ${t('Drag onto the page, or click to add to the selected band.')}`}
                  onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ type: p.type }))}
                  onClick={() => addElement(p.type)}
                  className="flex cursor-grab items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-secondary ring-1 ring-secondary hover:bg-primary_hover active:cursor-grabbing"
                >
                  <p.icon className="size-4 shrink-0 text-fg-quaternary" aria-hidden />
                  {t(p.label)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-tertiary uppercase">{t("Fields")}</h3>
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {fields.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    draggable
                    title={t("Drag onto the page")}
                    onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ type: 'field', field: f.path, label: `${f.label}:`, format: formatFor(f.type) }))}
                    onClick={() => addElement('field', { field: f.path, label: `${f.label}:`, format: formatFor(f.type) })}
                    className="w-full cursor-grab truncate rounded-md px-2 py-1 text-left text-xs text-secondary hover:bg-primary_hover"
                  >
                    {f.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-tertiary uppercase">{t("Page")}</h3>
            <ul className="space-y-0.5 text-xs">
              <OutlineItem icon={LayoutTop} label={t('Header · {height} mm', { height: layout.header.height })} active={selection?.band === 'header' && !selection.element} onClick={() => setSelection({ band: 'header' })} />
              {layout.sections.map((x, i) => (
                <OutlineItem
                  key={x.id}
                  icon={x.kind === 'table' ? Table : x.kind === 'text' ? Type01 : Square}
                  label={x.kind === 'table' ? t('Lines: {name}', { name: details.find((d) => d.path === x.detail)?.label ?? x.detail }) : x.kind === 'text' ? t('Text: {text}', { text: x.text.slice(0, 20) }) : t('Band {n} · {height} mm', { n: i + 1, height: x.height })}
                  active={selection?.band === x.id && !selection.element}
                  onClick={() => setSelection({ band: x.id })}
                />
              ))}
              <OutlineItem icon={LayoutBottom} label={t('Footer · {height} mm', { height: layout.footer.height })} active={selection?.band === 'footer' && !selection.element} onClick={() => setSelection({ band: 'footer' })} />
            </ul>
            <div className="mt-2 flex flex-wrap gap-1">
              <SmallButton onClick={() => addSection('free')}>{t("+ Band")}</SmallButton>
              <SmallButton onClick={() => addSection('table')} disabled={!details.length}>
                {t("+ Lines table")}
              </SmallButton>
              <SmallButton onClick={() => addSection('text')}>{t("+ Text")}</SmallButton>
            </div>
          </div>
        </aside>

        {/* The page. */}
        <div className="overflow-auto bg-secondary p-4 sm:p-6" onPointerDown={(e) => e.target === e.currentTarget && setSelection(null)}>
          <div className="mx-auto bg-white text-[#101828] shadow-lg ring-1 ring-black/5" style={paper} onPointerDown={(e) => e.target === e.currentTarget && setSelection(null)}>
            <FreeBand ctx={context} bandKey="header" band={layout.header} label={t("Header · every page")} chrome />
            {layout.sections.map((x) =>
              x.kind === 'free' ? (
                <FreeBand key={x.id} ctx={context} bandKey={x.id} band={x} />
              ) : x.kind === 'table' ? (
                <TablePreview key={x.id} section={x} ctx={context} />
              ) : (
                <TextPreview key={x.id} section={x} ctx={context} />
              ),
            )}
            {!layout.sections.length && <p className="py-10 text-center text-sm text-gray-400">{t("Add a band, a lines table or text from the left.")}</p>}
            <FreeBand ctx={context} bandKey="footer" band={layout.footer} label={t("Footer · every page")} chrome />
          </div>
        </div>

        {/* Right: what is selected, or the page. */}
        <aside className="space-y-4 border-t border-secondary p-3 lg:border-t-0 lg:border-l">
          {selected && selection ? (
            <ElementInspector
              metaId={meta.id}
              el={selected}
              fields={fields}
              details={details}
              set={setElement}
              onDelete={removeElement}
              onDuplicate={duplicate}
            />
          ) : selectedSection ? (
            <SectionInspector
              metaId={meta.id}
              section={selectedSection}
              fields={fields}
              details={details}
              lineFields={lineFields}
              change={(patch) => change((l) => ({ ...l, sections: l.sections.map((x) => (x.id === selectedSection.id ? ({ ...x, ...patch } as Section) : x)) }))}
              onMove={(d) =>
                change((l) => {
                  const i = l.sections.findIndex((x) => x.id === selectedSection.id);
                  const j = i + d;
                  if (j < 0 || j >= l.sections.length) return l;
                  const next = [...l.sections];
                  [next[i], next[j]] = [next[j], next[i]];
                  return { ...l, sections: next };
                })
              }
              onDelete={() => {
                change((l) => ({ ...l, sections: l.sections.filter((x) => x.id !== selectedSection.id) }));
                setSelection(null);
              }}
            />
          ) : selection && (selection.band === 'header' || selection.band === 'footer') ? (
            <Group title={selection.band === 'header' ? t("Header") : t("Footer")}>
              <p className="text-xs text-tertiary">{selection.band === 'header' ? t('Prints on every page, above the sections. Height 0 leaves it out.') : t('Prints on every page, below the sections. Height 0 leaves it out.')}</p>
              <NumberInput
                label={t("Height (mm)")}
                value={layout[selection.band].height}
                min={0}
                max={120}
                onChange={(v) => change((l) => ({ ...l, [selection.band]: { ...l[selection.band as 'header'], height: v } }))}
              />
              <BackgroundEditor
                metaId={meta.id}
                value={layout[selection.band].background ?? null}
                onChange={(background) => change((l) => ({ ...l, [selection.band]: { ...l[selection.band as 'header'], background } }))}
              />
            </Group>
          ) : (
            <PageInspector page={page} fields={fields} title={title} numberField={numberField} setTitle={setTitle} setNumberField={setNumberField} change={(patch) => change((l) => ({ ...l, page: { ...l.page, ...patch } }))} />
          )}
          {def && (
            <Group title={t("Preview with")}>
              <RecordPicker def={def} value={recordId} onChange={setRecordId} label={t("Record (empty: sample values)")} />
            </Group>
          )}
          <p className="text-xs text-quaternary">{t("Keys: Delete removes, arrows move (Shift 5 mm), Ctrl+D duplicates, Ctrl+Z undoes. Hold Alt while dragging to place off the 1 mm grid.")}</p>
        </aside>
      </div>

      {importing && (
        <PdfImportModal
          metaId={meta.id}
          current={layout}
          onClose={() => setImporting(false)}
          onImport={(imported) => {
            change(() => imported);
            setSelection(null);
            setImporting(false);
            setNotice(t("Imported. Replace sample values with fields, and save when it looks right. Ctrl+Z puts the old layout back."));
          }}
        />
      )}
      {preview && (
        <Modal title={t("Preview")} description={recordId ? t("This record, as it prints.") : t("Sample values: each field shows its name.")} onClose={() => setPreview(null)} size="xl">
          <iframe title={t("PDF preview")} src={preview} className="h-[75vh] w-full rounded-lg ring-1 ring-secondary" />
        </Modal>
      )}
    </section>
  );
}

const formatFor = (type: string): ValueFormat => (type === 'date' ? 'date' : type === 'datetime' ? 'datetime' : type === 'decimal' ? 'number' : 'text');
const columnOf = (f: FieldInfo): TableColumn => {
  const numeric = (f.type === 'integer' || f.type === 'decimal') && !f.select;
  return { id: uid(), field: f.path, label: f.label, width: numeric ? 1 : 3, align: numeric ? 'right' : 'left', format: formatFor(f.type), total: f.path === 'amount' };
};

interface Ctx {
  metaId: number;
  s: number;
  page: PageSettings;
  fields: FieldInfo[];
  change: (fn: (l: Layout) => Layout, mark?: boolean) => void;
  markUndo: () => void;
  selection: Selection;
  setSelection: (s: Selection) => void;
  contentWidth: number;
}

/** Follows one pointer gesture until release, reporting the movement in millimetres. */
function track(e: ReactPointerEvent, s: number, onMove: (dx: number, dy: number, free: boolean) => void, onStart?: () => void) {
  e.preventDefault();
  e.stopPropagation();
  const sx = e.clientX;
  const sy = e.clientY;
  let started = false;
  const move = (ev: PointerEvent) => {
    if (!started) {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
      started = true;
      onStart?.();
    }
    onMove((ev.clientX - sx) / s, (ev.clientY - sy) / s, ev.altKey);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function FreeBand({ ctx, bandKey, band, label, chrome }: { ctx: Ctx; bandKey: BandKey; band: Band; label?: string; chrome?: boolean }) {
  const { s, change, selection, setSelection } = ctx;
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const active = selection?.band === bandKey;
  const hidden = chrome && band.height === 0;

  const drop = (e: DragEvent) => {
    const data = e.dataTransfer.getData(DRAG_TYPE);
    setOver(false);
    if (!data || !ref.current) return;
    e.preventDefault();
    const rect = ref.current.getBoundingClientRect();
    const item = JSON.parse(data) as Partial<DocElement> & { type: ElementType };
    const el = newElement(item.type, Math.max(0, round((e.clientX - rect.left) / s)), Math.max(0, round((e.clientY - rect.top) / s)), item);
    change((l) => withBand(l, bandKey, (b) => ({ ...b, height: Math.max(b.height, el.y + el.h), elements: [...b.elements, el] })));
    setSelection({ band: bandKey, element: el.id });
  };

  const resizeBand = (e: ReactPointerEvent) => {
    const start = band.height;
    track(e, s, (_, dy) => change((l) => withBand(l, bandKey, (b) => ({ ...b, height: Math.max(chrome ? 0 : 1, round(start + dy)) })), false), ctx.markUndo);
  };

  return (
    <div className="group/band relative" onDragOver={(e) => e.dataTransfer.types.includes(DRAG_TYPE) && (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={drop}>
      {label && <span className="pointer-events-none absolute -top-0.5 right-0 z-10 -translate-y-full text-[10px] text-gray-400">{label}</span>}
      <div
        ref={ref}
        onPointerDown={(e) => e.target === e.currentTarget && setSelection({ band: bandKey })}
        className={cx('relative', hidden ? 'h-2' : '', chrome && 'bg-gray-50/60')}
        style={{
          height: hidden ? undefined : band.height * s,
          outline: active ? '1.5px solid #7f56d9' : over ? '1.5px dashed #7f56d9' : '1px dashed #d0d5dd',
          backgroundImage: active || over ? `radial-gradient(circle, #d0d5dd 0.6px, transparent 0.6px)` : undefined,
          backgroundSize: `${s * 5}px ${s * 5}px`,
        }}
      >
        {band.background && <BandBackground metaId={ctx.metaId} src={band.background.src} printed={band.background.print} />}
        {band.elements.map((el) => (
          <PlacedElement key={el.id} el={el} ctx={ctx} bandKey={bandKey} selected={selection?.band === bandKey && selection.element === el.id} />
        ))}
      </div>
      <div
        role="separator"
        aria-label={t("Drag to change the band's height")}
        onPointerDown={resizeBand}
        className="absolute inset-x-0 -bottom-1 z-10 h-2 cursor-row-resize opacity-0 group-hover/band:opacity-100"
      >
        <div className="mx-auto mt-0.5 h-1 w-10 rounded-full bg-[#7f56d9]" />
      </div>
    </div>
  );
}

function PlacedElement({ el, ctx, bandKey, selected }: { el: DocElement; ctx: Ctx; bandKey: BandKey; selected: boolean }) {
  const { s, change, setSelection, page, fields, metaId } = ctx;
  const img = useAsset(metaId, el.type === 'image' || el.type === 'signature' ? el.src : '');
  const st = el.style;
  const update = (patch: Partial<DocElement>) => change((l) => withBand(l, bandKey, (b) => ({ ...b, elements: b.elements.map((e) => (e.id === el.id ? { ...e, ...patch } : e)) })), false);

  const startMove = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    setSelection({ band: bandKey, element: el.id });
    const { x, y } = el;
    track(e, s, (dx, dy, free) => update({ x: free ? Math.round((x + dx) * 10) / 10 : round(x + dx), y: Math.max(0, free ? Math.round((y + dy) * 10) / 10 : round(y + dy)) }), ctx.markUndo);
  };
  const startResize = (e: ReactPointerEvent) => {
    const { w, h } = el;
    track(e, s, (dx, dy, free) => update({ w: Math.max(el.type === 'line' ? 0 : 2, free ? w + dx : round(w + dx)), h: Math.max(0, free ? h + dy : round(h + dy)) }), ctx.markUndo);
  };

  const fontSize = (st.font_size || page.font_size) * PT * s;
  const box: CSSProperties = {
    left: el.x * s,
    top: el.y * s,
    width: Math.max(el.w * s, 2),
    height: el.type === 'line' && el.h <= el.w ? Math.max(1, st.border * PT * s) : Math.max(el.h * s, 2),
    fontSize,
    fontWeight: st.bold ? 700 : undefined,
    fontStyle: st.italic ? 'italic' : undefined,
    textDecoration: st.underline ? 'underline' : undefined,
    textAlign: st.align,
    color: st.color,
    background: el.type === 'line' ? st.border_color : st.bg || undefined,
    border: el.type !== 'line' && st.border ? `${st.border * PT * s}px solid ${st.border_color}` : undefined,
    padding: st.padding * s,
    outline: selected ? '1.5px solid #7f56d9' : undefined,
    outlineOffset: 1,
  };
  if (el.type === 'line' && el.h > el.w) {
    box.width = Math.max(1, st.border * PT * s);
    box.height = el.h * s;
  }
  const fieldLabel = (path: string) => fields.find((f) => f.path === path)?.label ?? path;
  const placeholders = (text: string) =>
    text.split(/(\{[A-Za-z0-9_.]+(?:\|[a-z]+)?\})/).map((part, i) =>
      /^\{.+\}$/.test(part) ? (
        <span key={i} className="rounded-sm bg-[#f4ebff] text-[#6941c6]">
          {part}
        </span>
      ) : (
        part
      ),
    );

  let content: ReactNode = null;
  if (el.type === 'text') content = <span className="whitespace-pre-wrap">{placeholders(el.text)}</span>;
  else if (el.type === 'field')
    content = (
      <span className="whitespace-pre-wrap">
        {el.label && <span className="font-normal text-[#667085]">{el.label} </span>}
        <span className="text-[#6941c6]">[{el.field ? fieldLabel(el.field) : t("choose a field")}]</span>
      </span>
    );
  else if (el.type === 'page') content = el.text.replace('{page}', '1').replace('{pages}', '2');
  else if (el.type === 'image')
    content = img ? (
      <img src={img} alt="" className="size-full object-contain object-left-top" draggable={false} />
    ) : (
      <span className="flex size-full items-center justify-center bg-gray-100 text-[10px] text-gray-400">{el.src ? '…' : t("Image: upload one on the right")}</span>
    );
  else if (el.type === 'signature')
    content = (
      <div className="relative size-full">
        <span className="absolute top-[35%] left-0 w-[40%] whitespace-pre-wrap">{placeholders(el.label)}</span>
        {img && <img src={img} alt="" className="absolute top-0 left-[45%] h-[70%] w-[30%] object-contain" draggable={false} />}
        <span className="absolute top-[62%] right-0 left-[42%] border-t border-[#344054]" />
        <span className="absolute top-[66%] right-0 left-[42%] text-center text-[0.85em] text-[#475467]">{placeholders(el.text) || ' '}</span>
      </div>
    );

  return (
    <div className="absolute cursor-move overflow-hidden select-none" style={box} onPointerDown={startMove}>
      {content}
      {selected && (
        <span
          role="separator"
          aria-label={t("Drag to resize")}
          onPointerDown={startResize}
          className="absolute right-0 bottom-0 size-2.5 cursor-nwse-resize rounded-sm bg-[#7f56d9] ring-1 ring-white"
        />
      )}
    </div>
  );
}

function TablePreview({ section, ctx }: { section: Extract<Section, { kind: 'table' }>; ctx: Ctx }) {
  const { selection, setSelection, s, page } = ctx;
  const active = selection?.band === section.id && !selection.element;
  const total = section.columns.reduce((a, c) => a + c.width, 0) || 1;
  const cell = section.border ? 'border border-[#98a2b3]' : 'border-b border-[#d0d5dd]';
  const pad = { padding: `${1.2 * s}px ${1.5 * s}px` };
  return (
    <div
      onPointerDown={() => setSelection({ band: section.id })}
      className="cursor-pointer"
      style={{ outline: active ? '1.5px solid #7f56d9' : '1px dashed transparent', fontSize: section.font_size ? section.font_size * PT * s : undefined }}
    >
      <table className="w-full border-collapse">
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
          {[1, 2].map((n) => (
            <tr key={n}>
              {section.numbered && (
                <td className={cx(cell, 'text-center')} style={pad}>
                  {n}
                </td>
              )}
              {section.columns.map((c) => (
                <td key={c.id} className={cx(cell, 'text-[#6941c6]')} style={{ ...pad, textAlign: c.align }}>
                  [{c.field}]
                </td>
              ))}
            </tr>
          ))}
          {section.columns.some((c) => c.total) && (
            <tr className="font-bold">
              {section.numbered && <td className={cell} style={pad} />}
              {section.columns.map((c, i) => (
                <td key={c.id} className={cell} style={{ ...pad, textAlign: c.align }}>
                  {c.total ? `Σ ${c.field}` : i === 0 ? section.totals_label : ''}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {!section.columns.length && <p className="py-3 text-center text-gray-400">{t("Lines table: pick its columns on the right.")}</p>}
      <span className="sr-only">{page.size}</span>
    </div>
  );
}

function TextPreview({ section, ctx }: { section: Extract<Section, { kind: 'text' }>; ctx: Ctx }) {
  const { selection, setSelection, s } = ctx;
  const active = selection?.band === section.id && !selection.element;
  return (
    <div
      onPointerDown={() => setSelection({ band: section.id })}
      className="cursor-pointer"
      style={{ marginTop: section.space_before * s, textAlign: section.align, fontSize: section.font_size ? section.font_size * PT * s : undefined, outline: active ? '1.5px solid #7f56d9' : '1px dashed #e4e7ec' }}
    >
      {section.text.split(/\n\s*\n/).map((p, i) => (
        <p key={i} className="whitespace-pre-wrap" style={{ marginBottom: 1.5 * s }}>
          {p.split(/(\{[A-Za-z0-9_.]+(?:\|[a-z]+)?\})/).map((part, j) =>
            /^\{.+\}$/.test(part) ? (
              <span key={j} className="rounded-sm bg-[#f4ebff] text-[#6941c6]">
                {part}
              </span>
            ) : (
              part
            ),
          )}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- inspectors

function ElementInspector({
  metaId,
  el,
  fields,
  details,
  set,
  onDelete,
  onDuplicate,
}: {
  metaId: number;
  el: DocElement;
  fields: FieldInfo[];
  details: { path: string; label: string }[];
  set: (patch: Partial<DocElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const style = (patch: Partial<ElementStyle>) => set({ style: { ...el.style, ...patch } });
  const name = t(PALETTE.find((p) => p.type === el.type)?.label ?? el.type);
  const textual = el.type !== 'line' && el.type !== 'box' && el.type !== 'image';
  return (
    <>
      <Group
        title={name}
        actions={
          <>
            <ToolButton label={t("Duplicate (Ctrl+D)")} icon={Copy01} onClick={onDuplicate} />
            <ToolButton label={t("Delete")} icon={Trash01} onClick={onDelete} />
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label={t("X (mm)")} value={el.x} onChange={(x) => set({ x })} step={0.5} />
          <NumberInput label={t("Y (mm)")} value={el.y} onChange={(y) => set({ y })} step={0.5} />
          <NumberInput label={t("Width")} value={el.w} onChange={(w) => set({ w })} step={0.5} min={0} />
          <NumberInput label={t("Height")} value={el.h} onChange={(h) => set({ h })} step={0.5} min={0} />
        </div>
      </Group>

      {el.type === 'text' && (
        <Group title={t("Text")}>
          <TextArea value={el.text} onChange={(text) => set({ text })} rows={3} />
          <InsertField fields={fields} details={details} onInsert={(p) => set({ text: `${el.text}${p}` })} />
        </Group>
      )}
      {el.type === 'field' && (
        <Group title={t("Value")}>
          <Select label={t("Field")} value={el.field} onChange={(field) => set({ field })} options={[{ value: '', label: t("Choose…") }, ...fields.map((f) => ({ value: f.path, label: f.label }))]} />
          <TextInput label={t("Caption before it")} value={el.label} onChange={(label) => set({ label })} />
          <Select label={t("Shown as")} value={el.format} onChange={(format) => set({ format: format as ValueFormat })} options={tLabels(FORMATS)} />
        </Group>
      )}
      {el.type === 'signature' && (
        <Group title={t("Signature")}>
          <TextInput label={t("Who signs")} value={el.label} onChange={(label) => set({ label })} />
          <TextInput label={t("Name under the line")} value={el.text} onChange={(text) => set({ text })} hint={t("e.g. {approved_by} or /Б. Бат/")} />
          <ImageUpload metaId={metaId} src={el.src} onChange={(src) => set({ src })} label={t("Signature image (optional)")} />
        </Group>
      )}
      {el.type === 'image' && (
        <Group title={t("Image")}>
          <ImageUpload metaId={metaId} src={el.src} onChange={(src) => set({ src })} label={t("PNG, JPG or GIF, up to 2 MB")} />
          <p className="text-xs text-tertiary">{t("It fits inside the box and keeps its shape.")}</p>
        </Group>
      )}
      {el.type === 'page' && (
        <Group title={t("Wording")}>
          <TextInput label={t("Text")} value={el.text} onChange={(text) => set({ text })} hint={t("{page} and {pages} become numbers.")} />
        </Group>
      )}

      <Group title={t("Style")}>
        {textual && (
          <>
            <div className="flex flex-wrap items-center gap-1">
              <NumberInput label={t("Size (pt, 0 = page)")} value={el.style.font_size} onChange={(font_size) => style({ font_size })} min={0} max={72} />
            </div>
            <div className="flex gap-1">
              <Toggle label={t("Bold")} icon={Bold01} on={el.style.bold} onClick={() => style({ bold: !el.style.bold })} />
              <Toggle label={t("Italic")} icon={Italic01} on={el.style.italic} onClick={() => style({ italic: !el.style.italic })} />
              <Toggle label={t("Underline")} icon={Underline01} on={el.style.underline} onClick={() => style({ underline: !el.style.underline })} />
              <span className="mx-1 w-px bg-border-secondary" />
              {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                <Toggle key={a} label={t(`Align ${a}`)} icon={Icon} on={el.style.align === a} onClick={() => style({ align: a as Align })} />
              ))}
            </div>
            <ColorInput label={t("Text colour")} value={el.style.color} onChange={(color) => style({ color })} />
          </>
        )}
        {el.type !== 'line' && el.type !== 'image' && <ColorInput label={t("Fill")} value={el.style.bg} onChange={(bg) => style({ bg })} clearable />}
        {el.type !== 'image' && el.type !== 'signature' && el.type !== 'page' && (
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label={el.type === 'line' ? t("Thickness (pt)") : t("Border (pt)")} value={el.style.border} onChange={(border) => style({ border })} min={0} max={5} step={0.25} />
            <ColorInput label={el.type === 'line' ? t("Colour") : t("Border colour")} value={el.style.border_color} onChange={(border_color) => style({ border_color })} />
          </div>
        )}
        {textual && <NumberInput label={t("Padding (mm)")} value={el.style.padding} onChange={(padding) => style({ padding })} min={0} max={20} step={0.5} />}
      </Group>
    </>
  );
}

function SectionInspector({
  metaId,
  section,
  fields,
  details,
  lineFields,
  change,
  onMove,
  onDelete,
}: {
  metaId: number;
  section: Section;
  fields: FieldInfo[];
  details: { path: string; label: string }[];
  lineFields: Record<string, FieldInfo[]>;
  change: (patch: Partial<Section>) => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
}) {
  const actions = (
    <>
      <ToolButton label={t("Move up")} icon={ArrowUp} onClick={() => onMove(-1)} />
      <ToolButton label={t("Move down")} icon={ArrowDown} onClick={() => onMove(1)} />
      <ToolButton label={t("Delete section")} icon={Trash01} onClick={onDelete} />
    </>
  );
  if (section.kind === 'free') {
    return (
      <Group title={t("Band")} actions={actions}>
        <p className="text-xs text-tertiary">{t("Its items stay where they are put. A band is never split over two pages.")}</p>
        <NumberInput label={t("Height (mm)")} value={section.height} min={1} max={600} onChange={(height) => change({ height })} />
        <BackgroundEditor metaId={metaId} value={section.background ?? null} onChange={(background) => change({ background })} />
      </Group>
    );
  }
  if (section.kind === 'text') {
    return (
      <Group title={t("Text")} actions={actions}>
        <p className="text-xs text-tertiary">{t("Flows over as many pages as it needs. An empty line starts a new paragraph.")}</p>
        <TextArea value={section.text} onChange={(text) => change({ text })} rows={10} />
        <InsertField fields={fields} details={details} onInsert={(p) => change({ text: `${section.text}${p}` })} />
        <div className="grid grid-cols-2 gap-2">
          <Select label={t("Align")} value={section.align} onChange={(align) => change({ align: align as Align })} options={['left', 'center', 'right', 'justify'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
          <NumberInput label={t("Size (pt, 0 = page)")} value={section.font_size} min={0} max={24} onChange={(font_size) => change({ font_size })} />
          <NumberInput label={t("Space above (mm)")} value={section.space_before} min={0} max={50} onChange={(space_before) => change({ space_before })} />
        </div>
      </Group>
    );
  }
  const available = lineFields[section.detail] ?? [];
  const setColumn = (id: string, patch: Partial<TableColumn>) => change({ columns: section.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const moveColumn = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= section.columns.length) return;
    const next = [...section.columns];
    [next[i], next[j]] = [next[j], next[i]];
    change({ columns: next });
  };
  return (
    <Group title={t("Lines table")} actions={actions}>
      <p className="text-xs text-tertiary">{t("One row per line. It runs on to the next page and repeats its heading there.")}</p>
      <Select
        label={t("Lines of")}
        value={section.detail}
        onChange={(detail) => change({ detail, columns: (lineFields[detail] ?? []).slice(0, 5).map(columnOf) })}
        options={details.map((d) => ({ value: d.path, label: d.label }))}
      />
      <div className="space-y-2">
        {section.columns.map((c, i) => (
          <div key={c.id} className="space-y-1.5 rounded-lg p-2 ring-1 ring-secondary">
            <div className="flex items-center gap-1">
              <input
                aria-label={t("Column heading")}
                value={c.label}
                onChange={(e) => setColumn(c.id, { label: e.target.value })}
                className="min-w-0 flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary ring-1 ring-primary outline-none ring-inset focus:ring-2 focus:ring-brand"
              />
              <ToolButton label={t("Move left")} icon={ArrowUp} onClick={() => moveColumn(i, -1)} />
              <ToolButton label={t("Move right")} icon={ArrowDown} onClick={() => moveColumn(i, 1)} />
              <ToolButton label={t("Remove column")} icon={Trash01} onClick={() => change({ columns: section.columns.filter((x) => x.id !== c.id) })} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Select small value={c.field} onChange={(field) => setColumn(c.id, { field })} options={available.map((f) => ({ value: f.path, label: f.label }))} label={t("Field")} />
              <Select small value={c.format} onChange={(format) => setColumn(c.id, { format: format as ValueFormat })} options={tLabels(FORMATS)} label={t("Shown as")} />
              <NumberInput small label={t("Width")} value={c.width} min={0.1} max={100} step={0.5} onChange={(width) => setColumn(c.id, { width })} />
              <Select small value={c.align} onChange={(align) => setColumn(c.id, { align: align as Align })} options={['left', 'center', 'right'].map((v) => ({ value: v, label: v }))} label={t("Align")} />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-secondary">
              <input type="checkbox" checked={c.total} onChange={(e) => setColumn(c.id, { total: e.target.checked })} /> {t("Total under the lines")}
            </label>
          </div>
        ))}
        <SmallButton onClick={() => available[0] && change({ columns: [...section.columns, columnOf(available.find((f) => !section.columns.some((c) => c.field === f.path)) ?? available[0])] })}>
          <Plus className="inline size-3" aria-hidden /> {t("Column")}
        </SmallButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextInput label={t("Totals label")} value={section.totals_label} onChange={(totals_label) => change({ totals_label })} />
        <NumberInput label={t("Size (pt, 0 = page)")} value={section.font_size} min={0} max={24} onChange={(font_size) => change({ font_size })} />
        <ColorInput label={t("Heading fill")} value={section.header_bg} onChange={(header_bg) => change({ header_bg })} clearable />
      </div>
      <label className="flex items-center gap-1.5 text-xs text-secondary">
        <input type="checkbox" checked={section.numbered} onChange={(e) => change({ numbered: e.target.checked })} /> {t("Number the lines (№)")}
      </label>
      <label className="flex items-center gap-1.5 text-xs text-secondary">
        <input type="checkbox" checked={section.border} onChange={(e) => change({ border: e.target.checked })} /> {t("Grid lines around every cell")}
      </label>
    </Group>
  );
}

function PageInspector({
  page,
  fields,
  title,
  numberField,
  setTitle,
  setNumberField,
  change,
}: {
  page: PageSettings;
  fields: FieldInfo[];
  title: string;
  numberField: string;
  setTitle: (v: string) => void;
  setNumberField: (v: string) => void;
  change: (patch: Partial<PageSettings>) => void;
}) {
  const margin = (side: keyof PageSettings['margin']) => (v: number) => change({ margin: { ...page.margin, [side]: v } });
  return (
    <>
      <Group title={t("Document")}>
        <TextInput label={t("Name")} value={title} onChange={setTitle} hint={t("The PDF's file name starts with it.")} />
        <Select label={t("Number in the file name")} value={numberField} onChange={setNumberField} options={[{ value: '', label: t("The record id") }, ...fields.map((f) => ({ value: f.path, label: f.label }))]} />
      </Group>
      <Group title={t("Paper")}>
        <div className="grid grid-cols-2 gap-2">
          <Select label={t("Size")} value={page.size} onChange={(size) => change({ size: size as PageSettings['size'] })} options={Object.keys(PAPER).map((k) => ({ value: k, label: k }))} />
          <Select label={t("Orientation")} value={page.orientation} onChange={(o) => change({ orientation: o as PageSettings['orientation'] })} options={[{ value: 'portrait', label: t("Portrait") }, { value: 'landscape', label: t("Landscape") }]} />
          <NumberInput label={t("Top margin")} value={page.margin.top} min={0} max={60} onChange={margin('top')} />
          <NumberInput label={t("Bottom")} value={page.margin.bottom} min={0} max={60} onChange={margin('bottom')} />
          <NumberInput label={t("Left")} value={page.margin.left} min={0} max={60} onChange={margin('left')} />
          <NumberInput label={t("Right")} value={page.margin.right} min={0} max={60} onChange={margin('right')} />
        </div>
      </Group>
      <Group title={t("Text")}>
        <div className="grid grid-cols-2 gap-2">
          <Select label={t("Font")} value={page.font} onChange={(font) => change({ font: font as PageSettings['font'] })} options={[{ value: 'sans', label: t("Sans") }, { value: 'serif', label: t("Serif") }, { value: 'mono', label: t("Monospace") }]} />
          <NumberInput label={t("Size (pt)")} value={page.font_size} min={5} max={24} step={0.5} onChange={(font_size) => change({ font_size })} />
        </div>
      </Group>
      <Group title={t("Numbers and dates")}>
        <div className="grid grid-cols-2 gap-2">
          <Select label={t("Dates")} value={page.date_format} onChange={(date_format) => change({ date_format })} options={['Y-m-d', 'Y.m.d', 'd.m.Y', 'd/m/Y', 'm/d/Y'].map((f) => ({ value: f, label: f.replace('Y', '2026').replace('m', '10').replace('d', '26') }))} />
          <NumberInput label={t("Decimals")} value={page.decimals} min={0} max={4} onChange={(decimals) => change({ decimals })} />
          <Select label={t("Thousands")} value={page.thousands} onChange={(thousands) => change({ thousands })} options={[{ value: ',', label: '1,000' }, { value: ' ', label: '1 000' }, { value: '.', label: '1.000' }, { value: "'", label: "1'000" }, { value: '', label: '1000' }]} />
          <Select label={t("Decimal point")} value={page.decimal_point} onChange={(decimal_point) => change({ decimal_point })} options={[{ value: '.', label: '0.50' }, { value: ',', label: '0,50' }]} />
          <TextInput label={t("Currency sign")} value={page.currency} onChange={(currency) => change({ currency })} />
        </div>
      </Group>
      <Group title={t("Amount in words")}>
        <div className="grid grid-cols-2 gap-2">
          <Select label={t("Language")} value={page.words_language} onChange={(v) => change({ words_language: v as 'mn' | 'en' })} options={[{ value: 'mn', label: 'Монгол' }, { value: 'en', label: t("English") }]} />
          <TextInput label={t("Currency")} value={page.currency_word} onChange={(currency_word) => change({ currency_word })} />
          <TextInput label={t("Cents")} value={page.subunit_word} onChange={(subunit_word) => change({ subunit_word })} />
        </div>
        <p className="text-xs text-tertiary">{t('Pick "Amount in words" as a field\'s format, or write {token} in text.', { token: '{total_amount|words}' })}</p>
      </Group>
    </>
  );
}

/** Adds a {placeholder} to text: a field, a line total or count, or today's date. */
function InsertField({ fields, details, onInsert }: { fields: FieldInfo[]; details: { path: string; label: string }[]; onInsert: (p: string) => void }) {
  const options = [
    { value: '', label: t("Insert a value…") },
    ...fields.map((f) => ({ value: `{${f.path}${f.type === 'date' ? '|date' : f.type === 'decimal' ? '|number' : ''}}`, label: f.label })),
    ...fields.filter((f) => f.type === 'decimal' || f.type === 'integer').map((f) => ({ value: `{${f.path}|words}`, label: t('{field} in words', { field: f.label }) })),
    ...details.flatMap((d) => [
      { value: `{${d.path}.count}`, label: t('{lines}: number of lines', { lines: d.label }) },
      { value: `{${d.path}.sum.amount|money}`, label: t('{lines}: total amount', { lines: d.label }) },
    ]),
    { value: '{today}', label: t("Today's date") },
  ];
  return <Select value="" onChange={(v) => v && onInsert(v)} options={options} label={t("Insert")} hideLabel />;
}

function ImageUpload({ metaId, src, onChange, label }: { metaId: number; src: string; onChange: (src: string) => void; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = useAsset(metaId, src);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange((await documentApi.upload(metaId, file)).src);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("The image could not be uploaded."));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="space-y-1.5">
      {url && <img src={url} alt="" className="max-h-20 rounded-md bg-white object-contain ring-1 ring-secondary" />}
      <div className="flex gap-1.5">
        <Button size="sm" color="secondary" iconLeading={Upload01} isLoading={busy} showTextWhileLoading onPress={() => input.current?.click()}>
          {src ? t("Replace") : t("Upload")}
        </Button>
        {src && (
          <Button size="sm" color="tertiary" onPress={() => onChange('')}>
            {t("Remove")}
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      <p className="text-xs text-tertiary">{label}</p>
      {error && <p className="text-xs text-error-primary">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- small controls

const field = 'w-full rounded-md bg-primary px-2 py-1 text-sm text-primary ring-1 ring-primary outline-none ring-inset focus:ring-2 focus:ring-brand';

function Group({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-tertiary uppercase">{title}</h3>
        {actions && <div className="flex gap-0.5">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function Labeled({ label, hint, hideLabel, children }: { label: string; hint?: string; hideLabel?: boolean; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={cx('mb-0.5 block text-xs text-secondary', hideLabel && 'sr-only')}>{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-tertiary">{hint}</span>}
    </label>
  );
}

function NumberInput({ label, value, onChange, min, max, step = 1, small }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; small?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Labeled label={label}>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
        }}
        className={cx(field, 'tabular-nums', small && 'text-xs')}
      />
    </Labeled>
  );
}

function TextInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <Labeled label={label} hint={hint}>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={field} />
    </Labeled>
  );
}

function TextArea({ value, onChange, rows }: { value: string; onChange: (v: string) => void; rows: number }) {
  return <textarea aria-label={t("Text")} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} className={cx(field, 'resize-y font-mono text-xs')} />;
}

function Select({ label, value, onChange, options, small, hideLabel }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; small?: boolean; hideLabel?: boolean }) {
  return (
    <Labeled label={label} hideLabel={hideLabel}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cx(field, small && 'text-xs')}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Labeled>
  );
}

function ColorInput({ label, value, onChange, clearable }: { label: string; value: string; onChange: (v: string) => void; clearable?: boolean }) {
  return (
    <Labeled label={label}>
      <span className="flex items-center gap-1.5">
        <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded-md bg-primary ring-1 ring-primary" />
        <span className="text-xs text-tertiary tabular-nums">{value || t("None")}</span>
        {clearable && value && (
          <button type="button" className="text-xs text-brand-secondary hover:underline" onClick={() => onChange('')}>
            {t("Clear")}
          </button>
        )}
      </span>
    </Labeled>
  );
}

function ToolButton({ label, icon: Icon, onClick, disabled }: { label: string; icon: typeof Type01; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="rounded-md p-1.5 text-fg-quaternary hover:bg-primary_hover hover:text-fg-secondary disabled:opacity-40">
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function Toggle({ label, icon: Icon, on, onClick }: { label: string; icon: typeof Type01; on: boolean; onClick: () => void }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={on} onClick={onClick} className={cx('rounded-md p-1.5', on ? 'bg-brand-secondary text-fg-brand-primary' : 'text-fg-quaternary hover:bg-primary_hover')}>
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function SmallButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-md px-2 py-1 text-xs font-medium text-secondary ring-1 ring-secondary hover:bg-primary_hover disabled:opacity-40">
      {children}
    </button>
  );
}

function OutlineItem({ icon: Icon, label, active, onClick }: { icon: typeof Type01; label: string; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={cx('flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1 text-left', active ? 'bg-brand-secondary text-brand-secondary' : 'text-secondary hover:bg-primary_hover')}>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </button>
    </li>
  );
}

/** A band's picture: shown faintly to place things over, or printed behind them (a fill-in form). */
function BandBackground({ metaId, src, printed }: { metaId: number; src: string; printed: boolean }) {
  const url = useAsset(metaId, src);
  if (!url) return null;
  return <img src={url} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain object-left-top select-none" style={{ opacity: printed ? 1 : 0.35 }} />;
}

function BackgroundEditor({ metaId, value, onChange }: { metaId: number; value: { src: string; print: boolean } | null; onChange: (v: { src: string; print: boolean } | null) => void }) {
  return (
    <div className="space-y-2 border-t border-secondary pt-3">
      <h4 className="text-xs font-semibold text-secondary">{t("Background picture")}</h4>
      <ImageUpload metaId={metaId} src={value?.src ?? ''} onChange={(src) => onChange(src ? { src, print: value?.print ?? false } : null)} label={t("A letterhead, a scanned form, or an imported PDF page.")} />
      {value && (
        <label className="flex items-start gap-1.5 text-xs text-secondary">
          <input type="checkbox" className="mt-0.5" checked={value.print} onChange={(e) => onChange({ ...value, print: e.target.checked })} />
          <span>
            {t("Print it behind the band")}
            <span className="block text-tertiary">{t("Off: it only shows here, faintly, to line things up with. On: the PDF prints it, as with a fill-in form.")}</span>
          </span>
        </label>
      )}
    </div>
  );
}

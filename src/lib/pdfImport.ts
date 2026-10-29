import type { DocElement, ElementStyle } from './documentApi';

/**
 * Reads a PDF in the browser (pdf.js) into things the document designer places: its text as
 * text elements where it stood, its straight lines and rectangles as line and box elements,
 * and each page as a picture to put behind. Positions are millimetres from the page's top left.
 *
 * A PDF only knows "these letters, here, this size", so tables come in as loose text and
 * scanned pages (pictures of paper) have no text at all; the picture still comes in.
 */

export interface ImportedPage {
  width: number;
  height: number;
  texts: DocElement[];
  shapes: DocElement[];
  /** The page drawn as a JPEG, when asked for. */
  image: Blob | null;
}

export interface ImportedPdf {
  pageCount: number;
  pages: ImportedPage[];
}

const MM = 25.4 / 72; // mm per point
const STYLE: ElementStyle = { font_size: 0, bold: false, italic: false, underline: false, align: 'left', color: '#101828', bg: '', border: 0, border_color: '#344054', padding: 0 };
const uid = () => Math.random().toString(36).slice(2, 10);
const mm = (pt: number) => Math.round(pt * MM * 10) / 10;
const hex = (rgb: unknown): string => {
  if (typeof rgb === 'string') return /^#[0-9a-f]{6}$/i.test(rgb) ? rgb.toLowerCase() : '#000000';
  // The worker sends colours as a Uint8ClampedArray, which is not an Array.
  if ((Array.isArray(rgb) || ArrayBuffer.isView(rgb)) && (rgb as ArrayLike<number>).length >= 3) return `#${Array.from(rgb as ArrayLike<number>).slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, '0')).join('')}`;
  return '#000000';
};
const isWhite = (c: string) => c === '#ffffff';

type Matrix = [number, number, number, number, number, number];

async function pdfjs() {
  const lib = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

/** The first `maxPages` pages of a PDF file; `pictures` also draws each page as a JPEG. */
export async function readPdf(file: File, { maxPages = 5, pictures = true }: { maxPages?: number; pictures?: boolean } = {}): Promise<ImportedPdf> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages: ImportedPage[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const ops = await page.getOperatorList();
      const content = await page.getTextContent();
      pages.push({
        width: mm(viewport.width),
        height: mm(viewport.height),
        texts: texts(lib, page, viewport.transform as Matrix, content.items),
        shapes: shapes(lib, viewport.transform as Matrix, ops.fnArray, ops.argsArray, viewport.width, viewport.height),
        image: pictures ? await picture(page, viewport.clone({ scale: 2 })) : null,
      });
      page.cleanup();
    }
    return { pageCount: doc.numPages, pages };
  } finally {
    await doc.destroy();
  }
}

interface Piece {
  text: string;
  x: number;
  baseline: number;
  size: number;
  width: number;
  bold: boolean;
  italic: boolean;
}

/** Text runs, joined into one element per run of words on a line (in points until the end). */
function texts(lib: typeof import('pdfjs-dist'), page: import('pdfjs-dist').PDFPageProxy, view: Matrix, items: unknown[]): DocElement[] {
  const pieces: Piece[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item)) continue;
    const t = item as { str: string; transform: number[]; width: number; fontName: string };
    if (!t.str.trim()) continue;
    const m = lib.Util.transform(view, t.transform) as Matrix;
    const size = Math.hypot(m[2], m[3]);
    if (size < 2) continue;
    let bold = false;
    let italic = false;
    try {
      const font = page.commonObjs.get(t.fontName) as { name?: string; bold?: boolean; italic?: boolean } | undefined;
      const name = font?.name ?? '';
      bold = !!font?.bold || /bold|black|heavy|semibold/i.test(name);
      italic = !!font?.italic || /italic|oblique/i.test(name);
    } catch {
      // The font's details are not loaded; the text still comes in, plain.
    }
    pieces.push({ text: t.str, x: m[4], baseline: m[5], size, width: t.width * Math.hypot(view[0], view[1]), bold, italic });
  }

  pieces.sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const runs: Piece[] = [];
  for (const p of pieces) {
    const last = runs[runs.length - 1];
    const sameLine = last && Math.abs(last.baseline - p.baseline) < p.size * 0.3 && Math.abs(last.size - p.size) < 0.6 && last.bold === p.bold;
    const gap = last ? p.x - (last.x + last.width) : Infinity;
    // Words close together join; a wide gap (another column, a value after a caption) starts a new element.
    if (sameLine && gap > -p.size * 0.5 && gap < p.size * 1.2) {
      const space = gap > p.size * 0.15 && !last.text.endsWith(' ') && !p.text.startsWith(' ') ? ' ' : '';
      last.text += space + p.text;
      last.width = p.x + p.width - last.x;
    } else {
      runs.push({ ...p });
    }
  }

  return runs.map((r) => ({
    id: uid(),
    type: 'text',
    x: mm(r.x),
    y: Math.max(0, mm(r.baseline - r.size * 0.95)),
    // Printed in DejaVu, which runs a little wider than most PDF fonts: some room to spare.
    w: Math.max(2, mm(r.width * 1.15 + r.size * 0.5)),
    h: mm(r.size * 1.3),
    text: r.text.trim(),
    field: '',
    label: '',
    format: 'text',
    src: '',
    style: { ...STYLE, font_size: Math.round(r.size * 2) / 2, bold: r.bold, italic: r.italic },
  }));
}

/** Straight lines and rectangles the page strokes or fills, as line and box elements. */
function shapes(lib: typeof import('pdfjs-dist'), view: Matrix, fns: number[], args: unknown[][], pageWidth: number, pageHeight: number): DocElement[] {
  const OPS = lib.OPS;
  const out: DocElement[] = [];
  const stack: { ctm: Matrix; width: number; stroke: string; fill: string }[] = [];
  let state = { ctm: view, width: 1, stroke: '#000000', fill: '#000000' };
  let rects: [number, number, number, number][] = [];
  let segments: [number, number, number, number][] = [];

  const point = (x: number, y: number) => lib.Util.applyTransform([x, y], state.ctm) as [number, number];
  const scale = () => Math.hypot(state.ctm[0], state.ctm[1]);
  const line = (x1: number, y1: number, x2: number, y2: number, thickness: number, color: string) => {
    const horizontal = Math.abs(y2 - y1) <= Math.abs(x2 - x1);
    out.push(element('line', Math.min(x1, x2), Math.min(y1, y2), horizontal ? Math.abs(x2 - x1) : 0, horizontal ? 0 : Math.abs(y2 - y1), { border: Math.max(0.25, Math.round(thickness * 4) / 4), border_color: color }));
  };

  for (let i = 0; i < fns.length && out.length < 400; i++) {
    const fn = fns[i];
    const a = args[i] ?? [];
    if (fn === OPS.save) stack.push({ ...state });
    else if (fn === OPS.restore) state = stack.pop() ?? state;
    else if (fn === OPS.transform) state = { ...state, ctm: lib.Util.transform(state.ctm, a) as Matrix };
    else if (fn === OPS.setLineWidth) state = { ...state, width: Number(a[0]) || 0 };
    else if (fn === OPS.setStrokeRGBColor) state = { ...state, stroke: hex(a.length === 1 ? a[0] : a) };
    else if (fn === OPS.setFillRGBColor) state = { ...state, fill: hex(a.length === 1 ? a[0] : a) };
    else if (fn === OPS.constructPath) {
      const [kinds, coords] = a as [number[], number[]];
      let j = 0;
      let at: [number, number] | null = null;
      let start: [number, number] | null = null;
      for (const kind of kinds) {
        if (kind === OPS.rectangle) {
          const [x, y, w, h] = coords.slice(j, j + 4);
          j += 4;
          const p1 = point(x, y);
          const p2 = point(x + w, y + h);
          rects.push([Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.abs(p2[0] - p1[0]), Math.abs(p2[1] - p1[1])]);
        } else if (kind === OPS.moveTo) {
          at = start = point(coords[j], coords[j + 1]);
          j += 2;
        } else if (kind === OPS.lineTo) {
          const to = point(coords[j], coords[j + 1]);
          j += 2;
          if (at) segments.push([at[0], at[1], to[0], to[1]]);
          at = to;
        } else if (kind === OPS.curveTo) {
          j += 6;
          at = null;
        } else if (kind === OPS.curveTo2 || kind === OPS.curveTo3) {
          j += 4;
          at = null;
        } else if (kind === OPS.closePath) {
          if (at && start) segments.push([at[0], at[1], start[0], start[1]]);
          at = start;
        }
      }
    } else if (fn >= OPS.stroke && fn <= OPS.endPath) {
      const strokes = fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke;
      const fills = fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke;
      const thickness = Math.max(0.25, state.width * scale());
      for (const [x, y, w, h] of rects) {
        if (fills && Math.min(w, h) < 2 && Math.max(w, h) > 2) {
          // A thin filled rectangle is how many PDFs draw a rule.
          if (w >= h) line(x, y + h / 2, x + w, y + h / 2, h, state.fill);
          else line(x + w / 2, y, x + w / 2, y + h, w, state.fill);
        } else if (w > 2 && h > 2 && (strokes || (fills && !isWhite(state.fill)))) {
          // A filled background as big as the page is paper, not a box.
          if (fills && !strokes && w > pageWidth * 0.9 && h > pageHeight * 0.9) continue;
          out.push(element('box', x, y, w, h, { bg: fills && !isWhite(state.fill) ? state.fill : '', border: strokes ? Math.round(thickness * 4) / 4 : 0, border_color: state.stroke }));
        } else if (strokes && (w <= 2 || h <= 2) && Math.max(w, h) > 2) {
          line(x, y, x + w, y + h, thickness, state.stroke);
        }
      }
      if (strokes) {
        for (const [x1, y1, x2, y2] of segments) {
          const straight = Math.abs(x2 - x1) < 0.5 || Math.abs(y2 - y1) < 0.5;
          if (straight && Math.hypot(x2 - x1, y2 - y1) > 2) line(x1, y1, x2, y2, thickness, state.stroke);
        }
      }
      rects = [];
      segments = [];
    }
  }
  return out;
}

function element(type: 'line' | 'box', x: number, y: number, w: number, h: number, style: Partial<ElementStyle>): DocElement {
  return { id: uid(), type, x: mm(x), y: mm(y), w: mm(w), h: mm(h), text: '', field: '', label: '', format: 'text', src: '', style: { ...STYLE, ...style } };
}

/** The page drawn on white as a JPEG (twice the PDF's size: about 144 dpi). */
async function picture(page: import('pdfjs-dist').PDFPageProxy, viewport: import('pdfjs-dist').PageViewport): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
}

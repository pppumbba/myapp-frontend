/**
 * Reads Excel, Word and PowerPoint files (xlsx, docx, pptx) in the browser for the file viewer:
 * their sheets as rows, their text as paragraphs and tables, their slides' text. No library:
 * these files are zip archives of XML, unzipped with the browser's DecompressionStream and read
 * with DOMParser. Only what a preview needs; formatting, pictures and formulas are left out.
 */

/** The files inside a zip archive, by path, read only when asked for. */
async function unzip(data: ArrayBuffer): Promise<Map<string, () => Promise<Uint8Array>>> {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  // The end-of-directory record sits in the last 64 KB (after an optional comment).
  let end = -1;
  for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip archive');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, () => Promise<Uint8Array>>();
  const names = new TextDecoder();
  for (let n = 0; n < count && view.getUint32(at, true) === 0x02014b50; n++) {
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const skip = nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    files.set(name, async () => {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const packed = bytes.subarray(start, start + size);
      if (method === 0) return packed;
      if (method !== 8) throw new Error('unsupported zip compression');
      const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    });
    at += 46 + skip;
  }
  return files;
}

type Zip = Awaited<ReturnType<typeof unzip>>;

async function xml(zip: Zip, path: string): Promise<Document | null> {
  const read = zip.get(path);
  if (!read) return null;
  return new DOMParser().parseFromString(new TextDecoder().decode(await read()), 'application/xml');
}

/** Elements by local name, whatever their namespace prefix. */
const all = (node: Element | Document, name: string) => [...node.getElementsByTagNameNS('*', name)];
const children = (node: Element, name: string) => [...node.children].filter((c) => c.localName === name);

/** A part's relationships: id → target path, resolved against the part's folder. */
async function rels(zip: Zip, part: string): Promise<Map<string, string>> {
  const folder = part.slice(0, part.lastIndexOf('/') + 1);
  const doc = await xml(zip, `${folder}_rels/${part.slice(folder.length)}.rels`);
  const out = new Map<string, string>();
  for (const r of doc ? all(doc, 'Relationship') : []) {
    const target = r.getAttribute('Target') ?? '';
    out.set(r.getAttribute('Id') ?? '', target.startsWith('/') ? target.slice(1) : normalise(folder + target));
  }
  return out;
}

function normalise(path: string) {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.') out.push(part);
  }
  return out.join('/');
}

export interface Sheet {
  name: string;
  rows: string[][];
  /** More rows than are shown. */
  cut: boolean;
}

/** The most rows a sheet shows; a preview, not the whole book. */
const MAX_ROWS = 500;

const columnIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

export async function readXlsx(data: ArrayBuffer): Promise<Sheet[]> {
  const zip = await unzip(data);
  const shared = (await xml(zip, 'xl/sharedStrings.xml'))?.documentElement;
  const strings = shared ? children(shared, 'si').map((si) => all(si, 't').map((t) => t.textContent).join('')) : [];
  const book = await xml(zip, 'xl/workbook.xml');
  const targets = await rels(zip, 'xl/workbook.xml');
  const sheets: Sheet[] = [];
  for (const s of book ? all(book, 'sheet') : []) {
    const id = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? s.getAttribute('r:id') ?? '';
    const doc = await xml(zip, targets.get(id) ?? '');
    if (!doc) continue;
    const rows: string[][] = [];
    const rowEls = all(doc, 'row');
    for (const row of rowEls.slice(0, MAX_ROWS)) {
      const cells: string[] = [];
      for (const c of children(row, 'c')) {
        const type = c.getAttribute('t');
        const v = children(c, 'v')[0]?.textContent ?? '';
        const text =
          type === 's' ? (strings[Number(v)] ?? '')
          : type === 'inlineStr' ? all(c, 't').map((t) => t.textContent).join('')
          : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE')
          : v;
        const at = c.getAttribute('r') ? columnIndex(c.getAttribute('r')!) : cells.length;
        while (cells.length < at) cells.push('');
        cells[at] = text;
      }
      // Empty rows keep their place, so row numbers match the sheet.
      const r = Number(row.getAttribute('r')) - 1;
      while (r > 0 && rows.length < r && rows.length < MAX_ROWS) rows.push([]);
      if (rows.length < MAX_ROWS) rows.push(cells);
    }
    sheets.push({ name: s.getAttribute('name') ?? `Sheet ${sheets.length + 1}`, rows, cut: rowEls.length > MAX_ROWS });
  }
  return sheets;
}

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type Block =
  | { kind: 'p' | 'h1' | 'h2' | 'h3' | 'li'; runs: Run[] }
  | { kind: 'table'; rows: string[][] };

function paragraph(p: Element): Block {
  const style = all(p, 'pStyle')[0]?.getAttribute('w:val') ?? '';
  const level = /^(Title|Heading1)$/i.test(style) ? 'h1' : /Heading2/i.test(style) ? 'h2' : /Heading[3-9]/i.test(style) ? 'h3' : null;
  const runs: Run[] = all(p, 'r').map((r) => {
    const props = children(r, 'rPr')[0];
    const on = (name: string) => {
      const el = props && children(props, name)[0];
      return !!el && el.getAttribute('w:val') !== '0' && el.getAttribute('w:val') !== 'false';
    };
    const text = [...r.children].map((c) => (c.localName === 't' ? c.textContent : c.localName === 'tab' ? '\t' : c.localName === 'br' ? '\n' : '')).join('');
    return { text, bold: on('b'), italic: on('i') };
  });
  return { kind: level ?? (all(p, 'numPr').length ? 'li' : 'p'), runs };
}

export async function readDocx(data: ArrayBuffer): Promise<Block[]> {
  const doc = await xml(await unzip(data), 'word/document.xml');
  const body = doc && all(doc, 'body')[0];
  if (!body) return [];
  const blocks: Block[] = [];
  for (const el of [...body.children]) {
    if (el.localName === 'p') blocks.push(paragraph(el));
    else if (el.localName === 'tbl')
      blocks.push({ kind: 'table', rows: children(el, 'tr').map((tr) => children(tr, 'tc').map((tc) => all(tc, 'p').map((p) => all(p, 't').map((t) => t.textContent).join('')).join('\n'))) });
  }
  return blocks;
}

/** Each slide's paragraphs of text, in slide order. */
export async function readPptx(data: ArrayBuffer): Promise<string[][]> {
  const zip = await unzip(data);
  const slides = [...zip.keys()]
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const out: string[][] = [];
  for (const path of slides) {
    const doc = await xml(zip, path);
    out.push(doc ? all(doc, 'p').map((p) => all(p, 't').map((t) => t.textContent).join('')).filter((s) => s.trim()) : []);
  }
  return out;
}

/** CSV or TSV text as rows; quoted fields may hold the separator, quotes and line breaks. */
export function readDelimited(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === separator) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length >= MAX_ROWS) return rows;
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

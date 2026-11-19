import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download01, File06, LinkExternal01, XClose } from '@untitledui/icons';
import { Dialog, Heading, Modal as AriaModal, ModalOverlay } from 'react-aria-components';
import { contentApi, fileSize, type FileInfo } from '../lib/contentApi';
import { readDelimited, readDocx, readPptx, readXlsx, type Block, type Sheet } from '../lib/officePreview';
import { IconAction } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

/** How each kind of file shows, by extension. */
const KINDS: Record<string, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
  pdf: ['pdf'],
  video: ['mp4', 'webm', 'mov'],
  audio: ['mp3', 'wav', 'ogg', 'm4a'],
  table: ['csv', 'tsv'],
  text: ['txt', 'log', 'md', 'json', 'xml', 'yml', 'yaml', 'sql', 'ini'],
  xlsx: ['xlsx'],
  docx: ['docx'],
  pptx: ['pptx'],
};
type Kind = keyof typeof KINDS;

const kindOf = (file: FileInfo): Kind | null => {
  const ext = (file.file_extension ?? '').toLowerCase();
  return (Object.keys(KINDS) as Kind[]).find((k) => KINDS[k].includes(ext)) ?? null;
};

/** Text past this is cut off: a preview, not an editor. */
const MAX_TEXT = 1_000_000;

let state: { files: FileInfo[]; index: number } | null = null;
const listeners = new Set<() => void>();
const set = (next: typeof state) => {
  state = next;
  listeners.forEach((l) => l());
};

/** Opens the viewer on these files at this one; the arrows step through the rest. */
export function viewFiles(files: FileInfo[], index = 0) {
  if (files.length) set({ files, index: Math.min(Math.max(index, 0), files.length - 1) });
}

/** The file viewer for the whole app (mounted once, next to the notices); viewFiles opens it. */
export function FileViewerHost() {
  const open = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  if (!open) return null;
  return <FileViewer files={open.files} index={open.index} onIndex={(index) => set({ ...open, index })} onClose={() => set(null)} />;
}

function FileViewer({ files, index, onIndex, onClose }: { files: FileInfo[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const file = files[index];
  const many = files.length > 1;
  const step = (by: number) => onIndex((index + by + files.length) % files.length);

  // Left and right step through the files, unless typing somewhere.
  useEffect(() => {
    if (!many) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(o) => !o && onClose()}
      className={({ isEntering, isExiting }) =>
        cx(
          'fixed inset-0 z-[70] flex items-center justify-center bg-overlay/70 p-2 outline-hidden backdrop-blur-[6px] sm:p-6',
          isEntering && 'duration-200 ease-out animate-in fade-in',
          isExiting && 'duration-150 ease-in animate-out fade-out',
        )
      }
    >
      <AriaModal className="modal-grow flex h-full max-h-[56rem] w-full max-w-6xl outline-hidden">
        <Dialog aria-label={file.file_name} className="flex min-h-0 w-full flex-col overflow-hidden rounded-xl bg-primary shadow-xl ring-1 ring-secondary outline-hidden">
          <header className="flex items-center gap-2 border-b border-secondary px-4 py-3">
            <div className="min-w-0 flex-1">
              <Heading slot="title" className="truncate text-md font-semibold text-primary">
                {file.file_name}
              </Heading>
              <p className="truncate text-xs text-tertiary">
                {[fileSize(file.file_size), many && t('{n} of {count}', { n: index + 1, count: files.length }), file.description].filter(Boolean).join(' · ')}
              </p>
            </div>
            {many && (
              <>
                <IconAction icon={ChevronLeft} label={t('Previous file')} onPress={() => step(-1)} />
                <IconAction icon={ChevronRight} label={t('Next file')} onPress={() => step(1)} />
              </>
            )}
            <IconAction icon={LinkExternal01} label={t('Open in a new tab')} onPress={() => void contentApi.open(file).catch(() => {})} />
            <IconAction icon={Download01} label={t('Download')} onPress={() => void contentApi.download(file)} />
            <IconAction icon={XClose} label={t('Close')} onPress={onClose} />
          </header>
          <div className="min-h-0 flex-1 overflow-auto bg-secondary">
            {/* Keyed on the file, so stepping starts each one fresh. */}
            <Preview key={file.id} file={file} />
          </div>
        </Dialog>
      </AriaModal>
    </ModalOverlay>
  );
}

type Loaded =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string; cut: boolean }
  | { kind: 'rows'; sheets: Sheet[] }
  | { kind: 'blocks'; blocks: Block[] }
  | { kind: 'slides'; slides: string[][] };

/** Fetches the file and reads it the way its kind shows. */
function useLoaded(file: FileInfo, kind: Kind | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!kind) return;
    let url: string | null = null;
    let live = true;
    (async (): Promise<Loaded> => {
      const blob = await contentApi.blob(file);
      if (kind === 'image' || kind === 'pdf' || kind === 'video' || kind === 'audio') {
        url = URL.createObjectURL(blob);
        return { kind: 'url', url };
      }
      if (kind === 'text' || kind === 'table') {
        let text = await blob.text();
        const cut = text.length > MAX_TEXT;
        if (cut) text = text.slice(0, MAX_TEXT);
        if (kind === 'table') return { kind: 'rows', sheets: [{ name: file.file_name, rows: readDelimited(text, file.file_extension === 'tsv' ? '\t' : guessSeparator(text)), cut }] };
        if (file.file_extension === 'json') {
          try {
            text = JSON.stringify(JSON.parse(text), null, 2);
          } catch {
            // Not valid JSON: shown as it is.
          }
        }
        return { kind: 'text', text, cut };
      }
      const data = await blob.arrayBuffer();
      if (kind === 'xlsx') return { kind: 'rows', sheets: await readXlsx(data) };
      if (kind === 'docx') return { kind: 'blocks', blocks: await readDocx(data) };
      return { kind: 'slides', slides: await readPptx(data) };
    })().then(
      (l) => live && setLoaded(l),
      (e: unknown) => live && setError(e instanceof Error && 'status' in e ? e.message : t('This file could not be read for a preview. Download it to open it.')),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, kind]);
  return { loaded, error };
}

/** Semicolons where a CSV was saved with them (as some locales do), else commas. */
const guessSeparator = (text: string) => {
  const line = text.slice(0, text.indexOf('\n') >>> 0);
  return (line.match(/;/g)?.length ?? 0) > (line.match(/,/g)?.length ?? 0) ? ';' : ',';
};

function Preview({ file }: { file: FileInfo }) {
  const kind = kindOf(file);
  const { loaded, error } = useLoaded(file, kind);

  if (!kind) return <NoPreview file={file} text={t('There is no preview for this kind of file.')} />;
  if (error) return <NoPreview file={file} text={error} />;
  if (!loaded) return <div className="m-6 h-64 animate-pulse rounded-xl bg-tertiary motion-reduce:animate-none" />;

  switch (loaded.kind) {
    case 'url':
      if (kind === 'image')
        return (
          <div className="flex min-h-full items-center justify-center p-4">
            <img src={loaded.url} alt={file.description || file.file_name} className="max-h-[calc(56rem-6rem)] max-w-full rounded-md object-contain shadow-sm" />
          </div>
        );
      if (kind === 'pdf') return <iframe src={loaded.url} title={file.file_name} className="size-full min-h-[70dvh] bg-white" />;
      if (kind === 'video')
        return (
          <div className="flex min-h-full items-center justify-center p-4">
            <video src={loaded.url} controls className="max-h-full max-w-full rounded-md" />
          </div>
        );
      return (
        <div className="flex min-h-full items-center justify-center p-6">
          <audio src={loaded.url} controls className="w-full max-w-md" />
        </div>
      );
    case 'text':
      return (
        <Page>
          <pre className="font-mono text-sm whitespace-pre-wrap break-words text-secondary">{loaded.text}</pre>
          {loaded.cut && <Cut />}
        </Page>
      );
    case 'rows':
      return <Sheets sheets={loaded.sheets} />;
    case 'blocks':
      return (
        <Page>
          <Blocks blocks={loaded.blocks} />
        </Page>
      );
    case 'slides':
      return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
          {loaded.slides.map((lines, i) => (
            <section key={i} aria-label={t('Slide {n}', { n: i + 1 })} className="aspect-video overflow-auto rounded-lg bg-primary p-6 shadow-xs ring-1 ring-secondary">
              <p className="mb-3 text-xs font-semibold text-quaternary">{t('Slide {n}', { n: i + 1 })}</p>
              {lines.map((line, j) => (
                <p key={j} className={j === 0 ? 'mb-2 text-lg font-semibold text-primary' : 'text-sm text-secondary'}>
                  {line}
                </p>
              ))}
            </section>
          ))}
          {!loaded.slides.length && <p className="text-sm text-tertiary">{t('This presentation has no text to show.')}</p>}
        </div>
      );
  }
}

/** A sheet of paper for text and Word files. */
function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto my-4 max-w-3xl rounded-lg bg-primary p-6 shadow-xs ring-1 ring-secondary sm:my-6 sm:p-10">{children}</div>;
}

function Cut() {
  return <p className="mt-4 text-xs text-tertiary">{t('Only the start is shown. Download the file to see all of it.')}</p>;
}

function Blocks({ blocks }: { blocks: Block[] }) {
  if (!blocks.length) return <p className="text-sm text-tertiary">{t('This document has no text to show.')}</p>;
  return (
    <div className="flex flex-col gap-3 text-sm text-secondary">
      {blocks.map((b, i) => {
        if (b.kind === 'table') return <Grid key={i} rows={b.rows} />;
        const runs = b.runs.map((r, j) => (
          <span key={j} className={cx('whitespace-pre-wrap', r.bold && 'font-semibold', r.italic && 'italic')}>
            {r.text}
          </span>
        ));
        if (b.kind === 'h1') return <h2 key={i} className="mt-2 text-xl font-semibold text-primary">{runs}</h2>;
        if (b.kind === 'h2') return <h3 key={i} className="mt-2 text-lg font-semibold text-primary">{runs}</h3>;
        if (b.kind === 'h3') return <h4 key={i} className="text-md font-semibold text-primary">{runs}</h4>;
        if (b.kind === 'li')
          return (
            <p key={i} className="flex gap-2 pl-4">
              <span aria-hidden="true">•</span>
              <span>{runs}</span>
            </p>
          );
        // Empty paragraphs are the document's blank lines.
        return <p key={i} className="min-h-5">{runs}</p>;
      })}
    </div>
  );
}

/** Sheets of rows (Excel, CSV): tabs for the sheets, and the rows with the sheet's letters and numbers. */
function Sheets({ sheets }: { sheets: Sheet[] }) {
  const [at, setAt] = useState(0);
  const sheet = sheets[at];
  if (!sheet) return <p className="p-6 text-sm text-tertiary">{t('This file has no sheets to show.')}</p>;
  return (
    <div className="flex min-h-full flex-col">
      {sheets.length > 1 && (
        <div role="tablist" aria-label={t('Sheets')} className="flex gap-1 overflow-x-auto border-b border-secondary bg-primary px-3 pt-2">
          {sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === at}
              onClick={() => setAt(i)}
              className={cx(
                'shrink-0 rounded-t-md px-3 py-1.5 text-sm font-medium outline-focus-ring focus-visible:outline-2',
                i === at ? 'bg-secondary text-primary' : 'text-tertiary hover:text-secondary',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-3">
        <Grid rows={sheet.rows} numbered />
        {sheet.cut && <Cut />}
      </div>
    </div>
  );
}

const letters = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letters(Math.floor(i / 26) - 1) + letters(i % 26));

function Grid({ rows, numbered }: { rows: string[][]; numbered?: boolean }) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (!rows.length || !width) return <p className="text-sm text-tertiary">{t('Empty.')}</p>;
  return (
    <table className="border-collapse bg-primary text-sm">
      {numbered && (
        <thead>
          <tr>
            <th className="sticky top-0 border border-secondary bg-secondary px-2 py-1" />
            {Array.from({ length: width }, (_, i) => (
              <th key={i} scope="col" className="sticky top-0 border border-secondary bg-secondary px-2 py-1 text-xs font-medium text-tertiary">
                {letters(i)}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {numbered && <th scope="row" className="border border-secondary bg-secondary px-2 py-1 text-right text-xs font-medium text-tertiary tabular-nums">{r + 1}</th>}
            {Array.from({ length: width }, (_, c) => (
              <td key={c} className="max-w-80 border border-secondary px-2 py-1 align-top whitespace-pre-wrap text-secondary">
                {row[c] ?? ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NoPreview({ file, text }: { file: FileInfo; text: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <File06 className="size-10 text-fg-quaternary" aria-hidden="true" />
      <p className="max-w-sm text-sm text-tertiary">{text}</p>
      <Button size="sm" color="secondary" iconLeading={Download01} onPress={() => void contentApi.download(file)}>
        {t('Download')}
      </Button>
    </div>
  );
}


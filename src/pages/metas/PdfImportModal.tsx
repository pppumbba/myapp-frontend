import { useRef, useState } from 'react';
import { FilePlus01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { documentApi, PAPER, type Layout, type PageSettings } from '../../lib/documentApi';
import { readPdf, type ImportedPdf } from '../../lib/pdfImport';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { t } from '@/i18n';

const MAX_PAGES = 5;
type Background = 'none' | 'guide' | 'print';

/** The paper size a page matches (within a few mm, either way round), or null. */
function paperOf(width: number, height: number): { size: PageSettings['size']; orientation: PageSettings['orientation'] } | null {
  for (const [size, [w, h]] of Object.entries(PAPER) as [PageSettings['size'], [number, number]][]) {
    if (Math.abs(w - width) < 4 && Math.abs(h - height) < 4) return { size, orientation: 'portrait' };
    if (Math.abs(h - width) < 4 && Math.abs(w - height) < 4) return { size, orientation: 'landscape' };
  }
  return null;
}

/**
 * Turns a PDF into a starting layout: each page becomes a band the size of the page, with
 * the PDF's text as text elements and its lines and boxes as line and box elements, where
 * they stood. Its pages can also go behind the bands as pictures, faintly to line things
 * up with, or printed (a fill-in form: only fields go on top).
 */
export function PdfImportModal({ metaId, current, onClose, onImport }: { metaId: number; current: Layout; onClose: () => void; onImport: (layout: Layout) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<ImportedPdf | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withText, setWithText] = useState(true);
  const [withShapes, setWithShapes] = useState(true);
  const [background, setBackground] = useState<Background>('guide');

  const read = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setPdf(null);
    setError(null);
    setReading(true);
    try {
      const read = await readPdf(f, { maxPages: MAX_PAGES });
      setPdf(read);
      // A scan has nothing but its picture: that is all there is to bring in.
      if (!read.pages.some((p) => p.texts.length)) {
        setWithText(false);
        setBackground((b) => (b === 'none' ? 'guide' : b));
      }
    } catch {
      setError(t("This file could not be read as a PDF. If it is protected with a password, save an unprotected copy first."));
    } finally {
      setReading(false);
    }
  };

  const texts = pdf?.pages.reduce((n, p) => n + p.texts.length, 0) ?? 0;
  const shapes = pdf?.pages.reduce((n, p) => n + p.shapes.length, 0) ?? 0;
  const first = pdf?.pages[0];
  const paper = first ? paperOf(first.width, first.height) : null;

  const build = async () => {
    if (!pdf) return;
    setBusy(true);
    setError(null);
    try {
      const sections: Layout['sections'] = [];
      for (const [i, page] of pdf.pages.entries()) {
        let src = '';
        if (background !== 'none' && page.image) {
          src = (await documentApi.upload(metaId, new File([page.image], `page-${i + 1}.jpg`, { type: 'image/jpeg' }))).src;
        }
        sections.push({
          id: Math.random().toString(36).slice(2, 10),
          kind: 'free',
          // A little short of the page, so a page's band never spills onto the next one.
          height: Math.min(600, Math.round((page.height - 0.5) * 10) / 10),
          elements: [...(withShapes ? page.shapes : []), ...(withText ? page.texts : [])],
          background: src ? { src, print: background === 'print' } : null,
        });
      }
      onImport({
        page: { ...current.page, ...(paper ?? { size: 'A4', orientation: first!.width > first!.height ? 'landscape' : 'portrait' }), margin: { top: 0, right: 0, bottom: 0, left: 0 } },
        header: { height: 0, elements: [] },
        footer: { height: 0, elements: [] },
        sections,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("The page pictures could not be uploaded."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("Import a PDF")} description={t("Brings in its text, lines and boxes where they are on the page. You then put fields in place of the sample values.")} onClose={onClose} size="md">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <Button color="secondary" iconLeading={FilePlus01} isLoading={reading} showTextWhileLoading onPress={() => input.current?.click()}>
            {file ? t("Choose another PDF") : t("Choose a PDF")}
          </Button>
          {file && <span className="min-w-0 truncate text-sm text-secondary">{file.name}</span>}
          <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
        </div>

        {pdf && first && (
          <>
            <div className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary">
              <p>
                {t('{count} pages', { count: pdf.pageCount })}
                {pdf.pageCount > MAX_PAGES && ` ${t('(the first {count} come in)', { count: MAX_PAGES })}`}, {Math.round(first.width)} × {Math.round(first.height)} mm
                {paper ? ` · ${paper.size} ${paper.orientation}` : t(" · not a standard size: it goes on A4")}.
              </p>
              <p>
                {t('Found {texts} pieces of text and {shapes} lines and boxes.', { texts, shapes })}
              </p>
              {!texts && <p className="mt-1 font-medium text-warning-primary">{t("No text: this looks like a scan. Only its picture can come in; place fields over it.")}</p>}
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-secondary">{t("Bring in")}</legend>
              <label className="flex items-center gap-2 text-sm text-secondary">
                <input type="checkbox" checked={withText} disabled={!texts} onChange={(e) => setWithText(e.target.checked)} /> {t("Text, as text you can edit")}
              </label>
              <label className="flex items-center gap-2 text-sm text-secondary">
                <input type="checkbox" checked={withShapes} disabled={!shapes} onChange={(e) => setWithShapes(e.target.checked)} /> {t("Lines and boxes")}
              </label>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-secondary">{t("The page as a picture behind")}</legend>
              {(
                [
                  ['guide', t("As a guide"), t("Shown faintly in the designer to line things up with; not printed.")],
                  ['print', t("Printed (a fill-in form)"), t("The PDF prints the original page and the fields on top. Best for official forms that must look exactly the same; then leave text out.")],
                  ['none', t("No picture"), ''],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="flex items-start gap-2 text-sm text-secondary">
                  <input type="radio" name="pdf-background" className="mt-1" checked={background === value} onChange={() => setBackground(value)} />
                  <span>
                    {label}
                    {hint && <span className="block text-xs text-tertiary">{hint}</span>}
                  </span>
                </label>
              ))}
            </fieldset>

            <p className="text-xs text-tertiary">
              {t("This replaces the current layout (Ctrl+Z puts it back until you leave). Pages come in at no margins, each as one band. Tables come in as loose text: delete their rows and add a lines table in their place.")}
            </p>
          </>
        )}

        <div className="flex justify-end gap-3 border-t border-secondary pt-4">
          <Button color="secondary" onPress={onClose}>
            {t("Cancel")}
          </Button>
          <Button isDisabled={!pdf || (!withText && !withShapes && background === 'none')} isLoading={busy} showTextWhileLoading onPress={build}>
            {t("Import")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

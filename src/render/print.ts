/**
 * Prints one element on its own. A copy of it goes into a container at the page root and
 * everything else is hidden while printing (see index.css), so neither the sidebar nor an
 * open modal ends up on paper. Parts marked .no-print stay off the page.
 */
export function printElement(el: HTMLElement | null, title?: string) {
  if (!el) return;
  const root = document.createElement('div');
  root.id = 'print-root';
  root.appendChild(el.cloneNode(true));
  document.body.appendChild(root);
  document.body.classList.add('printing');
  const pageTitle = document.title;
  // Browsers suggest the page title as the PDF's file name.
  if (title) document.title = title;

  const done = () => {
    root.remove();
    document.body.classList.remove('printing');
    document.title = pageTitle;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

/** Rows as a CSV file Excel opens directly (UTF-8 with a byte-order mark). */
export function downloadCsv(fileName: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const text = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

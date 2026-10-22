import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '@/utils/cx';

const KEYWORDS = new Set(
  'async await break case catch const continue default delete do else false for function if in instanceof let new null of return switch this throw true try typeof undefined var void while'.split(
    ' ',
  ),
);

type Token = { text: string; cls?: string };

// Comments, strings, numbers and words, in that order; anything else is left plain.
const TOKENS = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?|`(?:\\.|[^`\\])*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

/** JavaScript split into coloured pieces. `names` (e.g. the helpers a script gets) stand out. */
function tokenize(code: string, names: Set<string>): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of code.matchAll(TOKENS)) {
    if (m.index > last) out.push({ text: code.slice(last, m.index) });
    const [text, comment, string, number, word] = m;
    const cls = comment
      ? 'text-quaternary italic'
      : string
        ? 'text-success-primary'
        : number
          ? 'text-warning-primary'
          : word && KEYWORDS.has(word)
            ? 'text-brand-secondary font-semibold'
            : word && names.has(word)
              ? 'text-error-primary'
              : undefined;
    out.push({ text, cls });
    last = m.index + text.length;
  }
  if (last < code.length) out.push({ text: code.slice(last) });
  return out;
}

/** Inserts text at the cursor, keeping the browser's undo history where it can. */
function insert(el: HTMLTextAreaElement, text: string) {
  el.focus();
  if (!document.execCommand?.('insertText', false, text)) el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
}

/**
 * A small code editor: line numbers, JavaScript colouring, Tab to indent (Shift+Tab to
 * outdent the selected lines) and Enter keeping the indent. It is a plain textarea over a
 * coloured copy of the text, so typing, selecting, undo and screen readers work as usual.
 */
export function CodeEditor({
  label,
  value,
  onChange,
  names = [],
  rows = 12,
  placeholder,
  hint,
  isInvalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Words to colour as known names, e.g. the helpers a script can call. */
  names?: string[];
  /** Height in lines before it grows. */
  rows?: number;
  placeholder?: string;
  hint?: ReactNode;
  isInvalid?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const lineCount = Math.max(value.split('\n').length, rows);
  const known = new Set(names);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;

    if (e.key === 'Tab') {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      if (!e.shiftKey && start === end) return insert(el, '  ');
      // Indent or outdent every selected line.
      const block = value.slice(lineStart, end);
      const changed = block
        .split('\n')
        .map((l) => (e.shiftKey ? l.replace(/^ {1,2}/, '') : `  ${l}`))
        .join('\n');
      el.setSelectionRange(lineStart, end);
      insert(el, changed);
      el.setSelectionRange(lineStart, lineStart + changed.length);
      return;
    }

    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const indent = /^\s*/.exec(value.slice(lineStart, start))?.[0] ?? '';
      const opens = /[{([]\s*$/.test(value.slice(lineStart, start));
      insert(el, `\n${indent}${opens ? '  ' : ''}`);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-secondary">
        {label}
      </label>
      <div
        className={cx(
          'flex max-h-[28rem] overflow-auto rounded-lg bg-primary font-mono text-[13px] leading-5 shadow-xs ring-1 ring-primary ring-inset focus-within:ring-2 focus-within:ring-brand',
          isInvalid && 'ring-error_subtle focus-within:ring-error',
        )}
      >
        <div aria-hidden="true" className="sticky left-0 z-10 shrink-0 border-r border-secondary bg-secondary px-2 py-2.5 text-right text-quaternary select-none">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div className="relative grid min-w-0 flex-1">
          <pre aria-hidden="true" className="col-start-1 row-start-1 m-0 min-h-full px-3 py-2.5 whitespace-pre text-primary">
            {value ? tokenize(value, known).map((t, i) => (t.cls ? <span key={i} className={t.cls}>{t.text}</span> : t.text)) : <span className="text-placeholder">{placeholder}</span>}
            {'\n '}
          </pre>
          <textarea
            id={id}
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            wrap="off"
            aria-invalid={isInvalid || undefined}
            className="col-start-1 row-start-1 resize-none overflow-hidden bg-transparent px-3 py-2.5 whitespace-pre text-transparent caret-fg-primary outline-hidden selection:bg-brand-solid/25"
          />
        </div>
      </div>
      {hint && <div className={cx('text-sm', isInvalid ? 'text-error-primary' : 'text-tertiary')}>{hint}</div>}
    </div>
  );
}

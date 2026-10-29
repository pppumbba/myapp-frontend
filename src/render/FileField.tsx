import { useId, useRef, useState, type DragEvent } from 'react';
import { File06, Image01, Paperclip, Trash01, UploadCloud02 } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { contentApi, fileSize, type FileInfo } from '../lib/contentApi';
import type { MetaParam } from '../lib/metaApi';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

const PICTURES = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

/** A file field's value as the form keeps it: its files as JSON (form values are strings). */
export function filesOf(value: unknown): FileInfo[] {
  if (Array.isArray(value)) return value as FileInfo[];
  if (value && typeof value === 'object') return [value as FileInfo];
  if (typeof value !== 'string' || !value) return [];
  try {
    return filesOf(JSON.parse(value));
  } catch {
    return [];
  }
}

interface Uploading {
  key: string;
  name: string;
  share: number;
  error?: string;
}

/**
 * A singlefile or multifile param in a form: drop files on it or click to choose. Each one
 * uploads straight away and joins the field; the form's save puts them on the record (and
 * takes off any removed). A multifile field gives each file a description.
 */
export function FileField({ param: f, value, error, required, onChange }: { param: MetaParam; value: string; error?: string; required?: boolean; onChange: (value: string) => void }) {
  const multi = f.data_type === 'multifile';
  const config = (f.json_config ?? {}) as { accept?: string[]; max_size?: number; max_files?: number };
  const accept = (config.accept ?? []).map((e) => e.replace(/^\./, '').toLowerCase());
  const maxFiles = multi ? (config.max_files ?? 20) : 1;
  const files = filesOf(value);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const label = f.label_name || f.param_name;
  // The latest files, for uploads finishing one after another.
  const current = useRef(files);
  current.current = files;

  const set = (next: FileInfo[]) => {
    current.current = next;
    onChange(next.length ? JSON.stringify(multi ? next : next[0]) : '');
  };

  const add = (list: FileList | File[]) => {
    const chosen = Array.from(list);
    if (!chosen.length) return;
    const room = multi ? Math.max(0, maxFiles - current.current.length) : 1;
    const taken = chosen.slice(0, room);
    const refused: Uploading[] = chosen.slice(room).map((file) => ({ key: `${file.name}-${Math.random()}`, name: file.name, share: 0, error: t('{field} takes at most {count} files.', { field: label, count: maxFiles }) }));
    for (const file of taken) {
      const key = `${file.name}-${Math.random()}`;
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (accept.length && !accept.includes(ext)) {
        refused.push({ key, name: file.name, share: 0, error: `Only ${accept.join(', ')} files.` });
        continue;
      }
      if (config.max_size && file.size > config.max_size * 1024) {
        refused.push({ key, name: file.name, share: 0, error: `Larger than ${fileSize(config.max_size * 1024)}.` });
        continue;
      }
      setUploading((u) => [...u, { key, name: file.name, share: 0 }]);
      contentApi
        .upload(f.main_meta_id, f.id, file, (share) => setUploading((u) => u.map((x) => (x.key === key ? { ...x, share } : x))))
        .then(
          (info) => {
            setUploading((u) => u.filter((x) => x.key !== key));
            set(multi ? [...current.current, info] : [info]);
          },
          (err) => setUploading((u) => u.map((x) => (x.key === key ? { ...x, error: err instanceof ApiError ? err.message : t("Not uploaded.") } : x))),
        );
    }
    if (refused.length) setUploading((u) => [...u, ...refused]);
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };

  const full = files.length >= maxFiles;
  const hint = [accept.length ? accept.map((e) => e.toUpperCase()).join(', ') : null, config.max_size ? `up to ${fileSize(config.max_size * 1024)}` : null, multi ? `at most ${maxFiles} files` : null].filter(Boolean).join(' · ');

  return (
    <div className="space-y-1.5">
      <span id={`${id}-label`} className="block text-sm font-medium text-secondary">
        {label}
        {required && <span className="text-brand-tertiary"> *</span>}
      </span>

      {files.length > 0 && (
        <ul className="divide-y divide-secondary rounded-lg ring-1 ring-secondary" aria-labelledby={`${id}-label`}>
          {files.map((file, i) => {
            const Icon = PICTURES.includes(file.file_extension ?? '') ? Image01 : File06;
            return (
              <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                <Icon className="size-5 shrink-0 text-fg-quaternary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <button type="button" className="block max-w-full truncate text-left text-sm font-medium text-primary hover:underline" onClick={() => contentApi.open(file).catch(() => {})}>
                    {file.file_name}
                  </button>
                  {multi ? (
                    <input
                      aria-label={t('Description of {name}', { name: file.file_name })}
                      placeholder={`${fileSize(file.file_size)} · ${t('add a description…')}`}
                      value={file.description ?? ''}
                      onChange={(e) => set(files.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                      className="mt-0.5 w-full bg-transparent text-xs text-tertiary outline-none placeholder:text-quaternary focus:text-secondary"
                    />
                  ) : (
                    <span className="text-xs text-tertiary">{fileSize(file.file_size)}</span>
                  )}
                </div>
                <button type="button" aria-label={t('Remove {name}', { name: file.file_name })} title={t("Remove")} onClick={() => set(files.filter((x) => x.id !== file.id))} className="rounded-md p-1.5 text-fg-quaternary hover:bg-primary_hover hover:text-fg-error-primary">
                  <Trash01 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {uploading.length > 0 && (
        <ul className="space-y-1">
          {uploading.map((u) => (
            <li key={u.key} className="rounded-lg px-3 py-2 text-xs ring-1 ring-secondary">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-secondary">{u.name}</span>
                {u.error ? (
                  <button type="button" className="shrink-0 text-tertiary hover:underline" onClick={() => setUploading((x) => x.filter((y) => y.key !== u.key))}>
                    {t("Dismiss")}
                  </button>
                ) : (
                  <span className="text-tertiary tabular-nums">{Math.round(u.share * 100)}%</span>
                )}
              </div>
              {u.error ? (
                <p className="mt-0.5 text-error-primary">{u.error}</p>
              ) : (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-brand-solid transition-[width]" style={{ width: `${u.share * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {(!full || !multi) && (
        <div
          role="button"
          tabIndex={0}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.current?.click())}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={cx(
            'flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-4 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand',
            over ? 'border-brand bg-brand-primary' : error ? 'border-error bg-primary' : 'border-primary bg-primary hover:bg-primary_hover',
          )}
        >
          <span className="flex size-9 items-center justify-center rounded-lg ring-1 ring-secondary">
            {files.length && !multi ? <Paperclip className="size-4 text-fg-quaternary" aria-hidden /> : <UploadCloud02 className="size-4 text-fg-quaternary" aria-hidden />}
          </span>
          <span className="text-sm">
            <span className="font-semibold text-brand-secondary">{files.length && !multi ? t("Replace the file") : t("Click to upload")}</span>
            <span className="text-tertiary"> {t("or drag and drop")}</span>
          </span>
          {hint && (
            <span id={`${id}-hint`} className="text-xs text-tertiary">
              {hint}
            </span>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        multiple={multi}
        accept={accept.length ? accept.map((e) => `.${e}`).join(',') : undefined}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) add(e.target.files);
          e.target.value = '';
        }}
      />
      {error && <p className="text-sm text-error-primary">{error}</p>}
    </div>
  );
}

/** A file field in a grid or report: its files' names, each opening the file. */
export function FileNames({ value }: { value: unknown }) {
  const files = filesOf(value);
  if (!files.length) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <Paperclip className="size-3.5 shrink-0 text-fg-quaternary" aria-hidden />
      <button
        type="button"
        className="truncate text-left hover:underline"
        title={files.map((x) => x.file_name).join('\n')}
        onClick={(e) => {
          e.stopPropagation();
          contentApi.open(files[0]).catch(() => {});
        }}
      >
        {files[0].file_name}
      </button>
      {files.length > 1 && <span className="shrink-0 text-xs text-tertiary">+{files.length - 1}</span>}
    </span>
  );
}

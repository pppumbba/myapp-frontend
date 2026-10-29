import { useEffect, useMemo, useRef, useState } from 'react';
import { Download01, Printer } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { dataApi, type DataRow } from '../lib/dataApi';
import { documentApi } from '../lib/documentApi';
import { ComboField } from '../components/ComboField';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { useDebounced } from '@/hooks/use-debounced';
import { primaryKey, rowLabel, title, type MetaDef } from './definitions';
import { t } from '@/i18n';

/**
 * A report meta: one record of its table as a PDF document, made by the server from the
 * report's designed layout (see DocumentDesigner), shown here to print or download.
 *
 * Without recordId (opened from a menu) it first asks which record.
 * autoPrint: opens the print dialog once the PDF has loaded, e.g. after a form's Save and print.
 */
export function ReportView({ def, recordId: given, autoPrint }: { def: MetaDef; recordId?: string | null; autoPrint?: boolean }) {
  const { meta } = def;
  const config = meta.json_config ?? {};
  const [picked, setPicked] = useState<string | null>(given ?? null);
  const recordId = given ?? picked;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const printed = useRef(false);
  const heading = typeof config.title === 'string' && config.title ? config.title : title(meta);

  useEffect(() => {
    if (!recordId) return;
    let live = true;
    let made: string | null = null;
    setUrl(null);
    setError(null);
    documentApi.record(meta.id, recordId).then(
      (u) => {
        made = u;
        if (live) setUrl(u);
        else URL.revokeObjectURL(u);
      },
      (err) => live && setError(err instanceof ApiError ? err.message : t('This document could not be made.')),
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [meta.id, recordId]);

  const print = () => frame.current?.contentWindow?.print();
  const download = () => recordId && documentApi.download(meta.id, recordId).catch((err) => setError(err instanceof ApiError ? err.message : t('The PDF could not be downloaded.')));

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        {!given ? <RecordPicker def={def} value={picked} onChange={setPicked} /> : <span />}
        <div className="flex gap-2">
          <Button color="secondary" iconLeading={Download01} isDisabled={!url} onPress={download}>
            {t('Download PDF')}
          </Button>
          <Button iconLeading={Printer} isDisabled={!url} onPress={print}>
            {t('Print')}
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {!recordId ? (
        <div className="rounded-xl bg-primary px-6 py-14 text-center shadow-xs ring-1 ring-secondary">
          <p className="text-md font-semibold text-primary">{t('Pick a record to print')}</p>
          <p className="mt-1 text-sm text-tertiary">{t('{name} shows here once you choose which one.', { name: heading })}</p>
        </div>
      ) : !url ? (
        !error && <div className="mx-auto h-[28rem] max-w-[52rem] animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : (
        <iframe
          ref={frame}
          title={heading}
          src={url}
          className="h-[80vh] min-h-[28rem] w-full rounded-xl bg-primary ring-1 ring-secondary"
          onLoad={() => {
            if (!autoPrint || printed.current) return;
            printed.current = true;
            // The PDF viewer needs a moment after load before it can print.
            setTimeout(print, 300);
          }}
        />
      )}
    </div>
  );
}

/** Which record to print: typing searches the report's table. */
export function RecordPicker({
  def,
  value,
  onChange,
  labelField: given,
  label = t('Record'),
}: {
  def: MetaDef;
  value: string | null;
  onChange: (id: string | null) => void;
  /** The field a record is shown by; a report's json_config.number_field by default. */
  labelField?: string;
  label?: string;
}) {
  const config = def.meta.json_config ?? {};
  const labelField = given ?? (typeof config.number_field === 'string' ? config.number_field : def.params.find((p) => p.is_label)?.field_path);
  const key = primaryKey(def.params);
  const [text, setText] = useState('');
  const search = useDebounced(text);
  const [rows, setRows] = useState<DataRow[] | null>(null);
  const [known, setKnown] = useState<DataRow[]>([]);

  useEffect(() => {
    let live = true;
    dataApi.list(def.meta.id, { search, per_page: 50 }).then(
      (page) => live && setRows(page.data),
      () => live && setRows([]),
    );
    return () => {
      live = false;
    };
  }, [def.meta.id, search]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    return [...known, ...(rows ?? [])]
      .filter((r) => !seen.has(String(r[key])) && seen.add(String(r[key])))
      .map((r) => ({ id: String(r[key]), label: rowLabel(r, labelField) }));
  }, [rows, known, key, labelField]);

  return (
    <div className="w-full max-w-sm">
      <ComboField
        label={label}
        placeholder={t('Search…')}
        items={items}
        value={value ?? ''}
        isLoading={!rows}
        onSearch={setText}
        onChange={(id) => {
          const row = rows?.find((r) => String(r[key]) === id);
          if (row) setKnown((k) => [row, ...k]);
          onChange(id || null);
        }}
      />
    </div>
  );
}

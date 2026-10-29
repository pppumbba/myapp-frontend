import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { dataApi, type DataRow } from '../../lib/dataApi';
import { isFileParam } from '../../lib/contentApi';
import type { MetaParam } from '../../lib/metaApi';
import { optionsOf, title, useLookup, useMetaDef, visibleParams } from '../../render/definitions';
import { startValues, toPayload, type Values } from '../../render/formValues';
import { MetaView } from '../../render/MetaView';
import { SiteCombo, SiteDateField } from './SiteInputs';
import { t } from '@/i18n';

// A form meta drawn in the website's own look: its visible fields as plain inputs, sent as a
// new record (guests may create records on public forms, never read them). A form this can't
// draw (files, a document field) is shown as the app's own form instead.

const isTrue = (v: unknown) => v === true || v === 'true';

export interface SiteFormProps {
  formId: number;
  /** Values fields start with, e.g. the session a Book button was pressed on. */
  defaults?: DataRow;
  heading?: string;
  intro?: string;
  submitLabel?: string;
  doneText?: string;
  /** Heading level for the title; nested forms use h3. */
  level?: 2 | 3;
  /** False leaves the title out (a dialog names it already) but keeps the intro line. */
  titled?: boolean;
  /** Fields already decided (e.g. the session a Book button was on): sent, not shown, unless they come back with an error. */
  fixed?: string[];
  /** Called after a record was sent, e.g. to close a dialog. */
  onSent?: () => void;
}

export function SiteForm({ formId, defaults, heading, intro, submitLabel, doneText, level = 2, titled = true, fixed, onSent }: SiteFormProps) {
  const { def, error: loadError } = useMetaDef(formId);
  const fields = useMemo(() => (def ? visibleParams(def.params) : []), [def]);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const defaultsKey = JSON.stringify(defaults ?? {});

  useEffect(() => {
    if (fields.length) setValues(startValues(fields, null, defaults));
    // defaults compared by value.
  }, [fields, defaultsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!def) return <div className="hm-form__wait" aria-busy="true" />;
  if (fields.some((f) => isFileParam(f) || f.data_type === 'document')) {
    return (
      <div className="hm-embed">
        <MetaView metaId={formId} depth={1} />
      </div>
    );
  }

  const Title = level === 3 ? 'h3' : 'h2';
  const name = heading || title(def.meta);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      await dataApi.create(formId, toPayload(fields, values));
      setSent(true);
      onSent?.();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      else setError(err instanceof ApiError ? err.message : t('It could not be sent. Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="hm-form hm-form--done" role="status">
        <Title>{t('Sent')}</Title>
        <p>{doneText || t('Thank you. We have it and will be in touch.')}</p>
        <div className="hm-actions">
          <button
            type="button"
            className="hm-btn"
            onClick={() => {
              setValues(startValues(fields, null, defaults));
              setSent(false);
            }}
          >
            {t('Send another')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="hm-form" onSubmit={submit} noValidate aria-label={name}>
      {!titled ? (
        (intro || def.meta.description) && <p className="hm-section__line">{intro || def.meta.description}</p>
      ) : (heading !== '' || intro) && (
        <div className="hm-section__head">
          <Title>{name}</Title>
          {(intro || def.meta.description) && <p className="hm-section__line">{intro || def.meta.description}</p>}
        </div>
      )}
      <div className="hm-form__fields">
        {fields.filter((f) => !fixed?.includes(f.field_path) || errors[f.field_path]).map((f) => (
          <SiteField key={f.id} param={f} value={values[f.field_path] ?? ''} error={errors[f.field_path]?.[0]} onChange={(v) => setValues((s) => ({ ...s, [f.field_path]: v }))} />
        ))}
      </div>
      {error && (
        <p className="hm-form__error" role="alert">
          {error}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <p className="hm-form__error" role="alert">
          {t('Some answers need another look.')}
        </p>
      )}
      <div className="hm-actions">
        <button type="submit" className="hm-btn hm-btn--primary" disabled={busy} aria-busy={busy || undefined}>
          {busy ? t('Sending…') : submitLabel || t('Send')}
        </button>
      </div>
    </form>
  );
}

/** One field as a plain input: a list or lookup as a select, yes/no as a checkbox, long text as a textarea. */
function SiteField({ param: f, value, error, onChange }: { param: MetaParam; value: string | boolean; error?: string; onChange: (v: string | boolean) => void }) {
  const id = useId();
  const lookup = useLookup(f.is_select && f.ref_meta_id ? f : undefined);
  const options = optionsOf(f);
  const label = f.label_name || f.param_name;
  const wide = f.render_type === 'textarea' || f.data_type === 'text' || f.data_type === 'boolean';
  const described = error ? `${id}-error` : undefined;
  const common = { id, name: f.field_path, required: f.is_required, 'aria-invalid': error ? true : undefined, 'aria-describedby': described } as const;

  if (f.data_type === 'boolean') {
    return (
      <div className="hm-field hm-field--check hm-field--wide">
        <input {...common} type="checkbox" checked={isTrue(value)} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id}>{label}</label>
        {error && <p id={`${id}-error`} className="hm-field__error">{error}</p>}
      </div>
    );
  }

  const labelText = (
    <>
      {label}
      {!f.is_required && <span className="hm-field__optional">{t('optional')}</span>}
    </>
  );
  const errorLine = error && <p id={`${id}-error`} className="hm-field__error">{error}</p>;
  const custom = { label: labelText, value: String(value), onChange, isRequired: f.is_required, isInvalid: !!error, describedBy: described, after: errorLine };

  if (f.is_select && f.ref_meta_id) {
    const items = lookup?.map((o) => ({ id: String(o.value), label: o.label })) ?? [];
    return <SiteCombo {...custom} items={items} isDisabled={!lookup} placeholder={lookup ? undefined : t('Loading…')} />;
  }
  if (options) return <SiteCombo {...custom} items={options.map((o) => ({ id: String(o.id), label: o.label }))} />;
  if (f.data_type === 'date' || f.data_type === 'datetime') {
    return <SiteDateField {...custom} withTime={f.data_type === 'datetime'} min={f.min_value} max={f.max_value} />;
  }

  let control;
  if (wide) {
    control = <textarea {...common} rows={5} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  } else {
    const type =
      f.data_type === 'integer' || f.data_type === 'decimal' ? 'number'
      : f.render_type === 'email' || /email/i.test(f.field_path) ? 'email'
      : /phone|mobile/i.test(f.field_path) ? 'tel'
      : 'text';
    control = (
      <input
        {...common}
        type={type}
        value={String(value)}
        min={f.min_value ?? undefined}
        max={f.max_value ?? undefined}
        step={f.data_type === 'decimal' ? 'any' : undefined}
        autoComplete={type === 'email' ? 'email' : /^name$|full_name/i.test(f.field_path) ? 'name' : type === 'tel' ? 'tel' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className={wide ? 'hm-field hm-field--wide' : 'hm-field'}>
      <label htmlFor={id}>{labelText}</label>
      {control}
      {errorLine}
    </div>
  );
}

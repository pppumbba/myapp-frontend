import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell01, Mail01, Plus, Send01, Trash01 } from '@untitledui/icons';
import { ApiError, api } from '../../lib/api';
import { accessApi, type Role, type UserWithRoles } from '../../lib/accessApi';
import { metaApi, type Meta, type MetaOption, type MetaParam } from '../../lib/metaApi';
import { workflowApi, type WfmStatus } from '../../lib/workflowApi';
import { ComboField } from '../../components/ComboField';
import { ConfirmDialog } from '../../components/Modal';
import { Alert, IconAction } from '../../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { cx } from '@/utils/cx';
import { useMetaDef } from '../../render/definitions';
import { t, tLabels } from '@/i18n';

type Event = 'created' | 'updated' | 'deleted' | 'status_changed' | 'manual';
type Kind = 'info' | 'success' | 'alert' | 'danger';
type Condition = { field: string; op: string; value: string };
type RecipientKind = 'role' | 'user' | 'field' | 'actor' | 'everyone';
type Recipient = { kind: RecipientKind; value: string };

/** A notification meta's json_config (backend: Notifier). */
interface Config {
  event: Event;
  source_meta_id: number | null;
  workflow_meta_id: number | null;
  status_id: number | null;
  changed_field: string;
  conditions: Condition[];
  kind: Kind;
  title: string;
  body: string;
  link_meta_id: number | null;
  link_record: boolean;
  link_url: string;
  exclude_actor: boolean;
  email: boolean;
}

interface Preview {
  record_id: number | null;
  matches: boolean | null;
  type: Kind;
  title: string;
  body: string | null;
  link: string | null;
  email: boolean;
  recipient_count: number;
  recipients: { id: number; name: string; email: string }[];
}

interface LogEntry {
  id: number;
  title: string;
  user_name: string;
  read_at: string | null;
  email_status: 'queued' | 'sent' | 'failed' | null;
  email_error: string | null;
  created_at: string;
}

const EVENTS: { value: Event; label: string }[] = [
  { value: 'created', label: 'A record is added' },
  { value: 'updated', label: 'A record is changed' },
  { value: 'deleted', label: 'A record is deleted' },
  { value: 'status_changed', label: 'A record moves to a status' },
  { value: 'manual', label: 'Only when sent from here' },
];
const KINDS: { value: Kind; label: string; dot: string }[] = [
  { value: 'info', label: 'Information', dot: 'bg-fg-brand-primary' },
  { value: 'success', label: 'Good news', dot: 'bg-fg-success-primary' },
  { value: 'alert', label: 'Needs attention', dot: 'bg-fg-warning-primary' },
  { value: 'danger', label: 'Something went wrong', dot: 'bg-fg-error-primary' },
];
const OPERATORS = [
  { value: '=', label: 'is' },
  { value: '!=', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: '>', label: 'is more than' },
  { value: '<', label: 'is less than' },
  { value: '>=', label: 'is at least' },
  { value: '<=', label: 'is at most' },
  { value: 'empty', label: 'is empty' },
  { value: 'not_empty', label: 'is filled in' },
];
const RECIPIENT_KINDS: { value: RecipientKind; label: string }[] = [
  { value: 'role', label: 'Everyone with a role' },
  { value: 'user', label: 'One person' },
  { value: 'field', label: 'The person named in a field' },
  { value: 'actor', label: 'Whoever made the change' },
  { value: 'everyone', label: 'Everyone' },
];
const DATA_TYPES = ['form', 'datagrid', 'statement', 'calendar', 'gantt'];

const num = (v: unknown) => (Number(v) > 0 ? Number(v) : null);

function toConfig(c: Record<string, unknown> | null): Config {
  return {
    event: (EVENTS.find((e) => e.value === c?.event)?.value ?? 'created') as Event,
    source_meta_id: num(c?.source_meta_id),
    workflow_meta_id: num(c?.workflow_meta_id),
    status_id: num(c?.status_id),
    changed_field: typeof c?.changed_field === 'string' ? c.changed_field : '',
    conditions: Array.isArray(c?.conditions) ? (c.conditions as Condition[]).map((x) => ({ field: x.field ?? '', op: x.op ?? '=', value: String(x.value ?? '') })) : [],
    kind: (KINDS.find((k) => k.value === c?.kind)?.value ?? 'info') as Kind,
    title: typeof c?.title === 'string' ? c.title : '',
    body: typeof c?.body === 'string' ? c.body : '',
    link_meta_id: num(c?.link_meta_id),
    link_record: c?.link_record === true,
    link_url: typeof c?.link_url === 'string' ? c.link_url : '',
    exclude_actor: c?.exclude_actor !== false,
    email: c?.email === true,
  };
}

const toRecipients = (params: MetaParam[]): Recipient[] =>
  params.filter((p) => RECIPIENT_KINDS.some((k) => k.value === p.data_type)).map((p) => ({ kind: p.data_type as RecipientKind, value: p.field_path === '-' ? '' : p.field_path }));

const notificationApi = {
  preview: (metaId: number, recordId?: string) => api<Preview>(`/metas/${metaId}/notification/preview${recordId ? `?record_id=${encodeURIComponent(recordId)}` : ''}`),
  send: (metaId: number, input: { test: boolean; record_id?: number }) => api<{ sent: number }>(`/metas/${metaId}/notification/send`, { method: 'POST', body: JSON.stringify(input) }),
  log: (metaId: number) => api<LogEntry[]>(`/metas/${metaId}/notification/log`),
};

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={title}>
      <div className="border-b border-secondary px-4 py-3 sm:px-5">
        <h3 className="text-md font-semibold text-primary">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-tertiary">{description}</p>}
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

/**
 * Builds a notification meta: when it is sent (a record added, changed or deleted, a
 * workflow move, or only by hand), the conditions it needs, what it says (with {field}
 * placeholders), where it links, and who gets it (its params). The preview and test show
 * the saved version, on a real record.
 */
export function NotificationDesigner({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const [config, setConfig] = useState(() => toConfig(meta.json_config));
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [savedParams, setSavedParams] = useState<MetaParam[]>([]);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [statuses, setStatuses] = useState<WfmStatus[]>([]);
  const [focus, setFocus] = useState<'title' | 'body' | 'link_url'>('body');
  const [version, setVersion] = useState(0);

  const set = <K extends keyof Config>(k: K, v: Config[K]) => setConfig((c) => ({ ...c, [k]: v }));

  useEffect(() => {
    metaApi.params(meta.id).then((p) => {
      setSavedParams(p);
      const r = toRecipients(p);
      setRecipients(r);
      setSaved(JSON.stringify([toConfig(meta.json_config), r]));
    });
    accessApi.roles().then(setRoles, () => setRoles([]));
    accessApi.users().then((r) => setUsers(r.data), () => setUsers([]));
  }, [meta.id, meta.json_config]);

  useEffect(() => {
    if (!config.workflow_meta_id) return setStatuses([]);
    workflowApi.get(config.workflow_meta_id).then((w) => setStatuses(w.statuses), () => setStatuses([]));
  }, [config.workflow_meta_id]);

  const { def: source } = useMetaDef(config.source_meta_id);
  const fields = useMemo(
    () => (source?.params ?? []).filter((p) => !['detail', 'subgrid', 'signature'].includes(p.data_type)).map((p) => ({ id: p.field_path, label: `${p.label_name || p.field_path}` })),
    [source],
  );
  const dirty = recipients !== null && JSON.stringify([config, recipients]) !== saved;
  const metaItems = (types?: string[]) => options.filter((o) => o.id !== meta.id && (!types || types.includes(o.type ?? ''))).map((o) => ({ id: String(o.id), label: types?.length === 1 ? o.name : `${o.name} (${o.type ?? 'no type'})` }));

  const tokens = [
    ...fields.map((f) => ({ token: `{${f.id}}`, label: f.label })),
    ...(config.event === 'updated' ? fields.slice(0, 6).map((f) => ({ token: `{old.${f.id}}`, label: t('{field} before', { field: f.label }) })) : []),
    { token: '{actor}', label: t('Who did it') },
    { token: '{id}', label: t('Record number') },
    { token: '{meta}', label: t('Screen name') },
    ...(config.event === 'status_changed' ? [{ token: '{status}', label: t('New status') }] : []),
    { token: '{today}', label: t('Today') },
  ].filter((item, i, all) => all.findIndex((x) => x.token === item.token) === i);
  const insert = (token: string) => setConfig((c) => ({ ...c, [focus]: `${c[focus]}${c[focus] && !c[focus].endsWith(' ') ? ' ' : ''}${token}` }));

  async function save() {
    if (!recipients) return;
    setBusy(true);
    setError(null);
    try {
      const { changed_field, link_url, ...rest } = config;
      await metaApi.update(meta.id, {
        json_config: {
          ...(meta.json_config ?? {}),
          ...rest,
          changed_field: changed_field || null,
          link_url: link_url.trim() || null,
          conditions: config.conditions.filter((c) => c.field),
        },
      });
      // Recipients are the meta's params: replaced as a whole.
      await Promise.all(savedParams.map((p) => metaApi.removeParam(p.id)));
      const created = [];
      for (const [i, r] of recipients.entries()) {
        const value = r.kind === 'actor' || r.kind === 'everyone' ? '-' : r.value.trim();
        if (!value) continue;
        created.push(await metaApi.createParam(meta.id, { field_path: value, param_name: value, data_type: r.kind, order_number: i + 1, is_show: true }));
      }
      setSavedParams(created);
      setSaved(JSON.stringify([config, recipients]));
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The notification could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="notification-designer-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="notification-designer-title" className="text-lg font-semibold text-primary">
            {t('Notification')}
          </h2>
          <p className="text-sm text-tertiary">{meta.is_active ? t('Active: it goes out whenever its moment comes.') : t('Inactive: it sends nothing until it is made active (Edit, above).')}</p>
        </div>
        <Button size="sm" isDisabled={!dirty} isLoading={busy} showTextWhileLoading onPress={save}>
          {dirty ? t('Save notification') : t('Saved')}
        </Button>
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Panel title={t('When it is sent')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <NativeSelect label={t('Send when')} value={config.event} onChange={(e) => set('event', e.target.value as Event)} options={tLabels(EVENTS)} />
              <ComboField
                label={config.event === 'status_changed' ? t('Its fields come from') : t('Records of')}
                placeholder={t('Choose a form or grid…')}
                items={metaItems(DATA_TYPES)}
                value={config.source_meta_id ? String(config.source_meta_id) : ''}
                onChange={(v) => set('source_meta_id', num(v))}
                hint={
                  config.event === 'status_changed'
                    ? t('Optional: a grid of the same table, for {field} names and who may see it.')
                    : t('Any change to this screen’s table counts, whichever form makes it. Only people who may open this screen are told.')
                }
              />
              {config.event === 'status_changed' && (
                <>
                  <ComboField label={t('Workflow')} placeholder={t('Choose a workflow…')} items={metaItems(['workflow'])} value={config.workflow_meta_id ? String(config.workflow_meta_id) : ''} onChange={(v) => set('workflow_meta_id', num(v))} />
                  <NativeSelect
                    label={t('Into status')}
                    value={config.status_id ? String(config.status_id) : ''}
                    onChange={(e) => set('status_id', num(e.target.value))}
                    options={[{ value: '', label: t('Any status') }, ...statuses.map((s) => ({ value: String(s.id), label: s.label_name || s.name }))]}
                  />
                </>
              )}
              {config.event === 'updated' && (
                <NativeSelect
                  label={t('Only when this changes')}
                  value={config.changed_field}
                  onChange={(e) => set('changed_field', e.target.value)}
                  options={[{ value: '', label: t('Any change') }, ...fields.map((f) => ({ value: f.id, label: f.label }))]}
                />
              )}
            </div>

            {config.event !== 'manual' && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-secondary">{t('Only if')}</legend>
                {config.conditions.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <div className="min-w-40 flex-1">
                      <ComboField aria-label={t('Condition {n} field', { n: i + 1 })} size="sm" items={fields} value={c.field} onChange={(field) => set('conditions', config.conditions.map((x, j) => (j === i ? { ...x, field } : x)))} />
                    </div>
                    <NativeSelect aria-label={t('Condition {n} test', { n: i + 1 })} size="sm" value={c.op} onChange={(e) => set('conditions', config.conditions.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))} options={tLabels(OPERATORS)} />
                    {!['empty', 'not_empty'].includes(c.op) && (
                      <div className="w-36">
                        <Input aria-label={t('Condition {n} value', { n: i + 1 })} size="sm" value={c.value} onChange={(value) => set('conditions', config.conditions.map((x, j) => (j === i ? { ...x, value } : x)))} />
                      </div>
                    )}
                    <IconAction icon={Trash01} danger label={t('Remove condition {n}', { n: i + 1 })} onPress={() => set('conditions', config.conditions.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button size="sm" color="link-color" iconLeading={Plus} isDisabled={!fields.length} onPress={() => set('conditions', [...config.conditions, { field: '', op: '=', value: '' }])}>
                  {config.conditions.length ? t('Add another condition') : t('Add a condition')}
                </Button>
                {!fields.length && <p className="text-xs text-tertiary">{t('Pick the records first; conditions test their fields.')}</p>}
              </fieldset>
            )}
          </Panel>

          <Panel title={t('What it says')} description={t('Click a field below to put it where you are typing; it is filled in from the record.')}>
            <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <NativeSelect label={t('Kind')} value={config.kind} onChange={(e) => set('kind', e.target.value as Kind)} options={tLabels(KINDS)} />
              <Input label={t('Title')} value={config.title} onChange={(v) => set('title', v)} onFocus={() => setFocus('title')} placeholder={meta.label_name || meta.name} />
            </div>
            <TextArea label={t('Message')} rows={3} value={config.body} onChange={(v) => set('body', v)} onFocus={() => setFocus('body')} placeholder={t('{actor} added {title}.')} />
            <div className="flex flex-wrap gap-1.5" aria-label={t('Fields to insert')}>
              {tokens.map((item) => (
                <button
                  key={item.token}
                  type="button"
                  onClick={() => insert(item.token)}
                  title={t('Insert {token} into the {field}', { token: item.token, field: t(focus === 'link_url' ? 'link' : focus) })}
                  className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary ring-1 ring-secondary outline-focus-ring ring-inset hover:bg-secondary_hover focus-visible:outline-2"
                >
                  <span className="font-mono">{item.token}</span> <span className="text-quaternary">{item.label}</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title={t('Where it leads')} description={t('Clicking the notification opens this.')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <ComboField label={t('Opens screen')} placeholder={t('Nothing')} items={metaItems()} value={config.link_meta_id ? String(config.link_meta_id) : ''} onChange={(v) => set('link_meta_id', num(v))} />
              <div className="self-end pb-1.5">
                <Toggle label={t('On the record')} hint={t('A form or report opens that record; a workflow grid, its status.')} isSelected={config.link_record} isDisabled={!config.link_meta_id} onChange={(v) => set('link_record', v)} />
              </div>
            </div>
            <Input label={t('Or a web address')} value={config.link_url} onChange={(v) => set('link_url', v)} onFocus={() => setFocus('link_url')} placeholder="/run/12?record={id}  or  https://…" hint={t('Used instead of the screen when filled in. Fields work here too.')} />
          </Panel>

          <Panel title={t('Who gets it')}>
            {recipients === null ? (
              <div className="h-16 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
            ) : (
              <>
                {recipients.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <NativeSelect
                      aria-label={t('Recipient {n} kind', { n: i + 1 })}
                      size="sm"
                      value={r.kind}
                      onChange={(e) => setRecipients(recipients.map((x, j) => (j === i ? { kind: e.target.value as RecipientKind, value: '' } : x)))}
                      options={tLabels(RECIPIENT_KINDS)}
                    />
                    <div className="min-w-48 flex-1">
                      {r.kind === 'role' ? (
                        <NativeSelect
                          aria-label={t('Recipient {n} role', { n: i + 1 })}
                          size="sm"
                          value={r.value}
                          onChange={(e) => setRecipients(recipients.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                          options={[{ value: '', label: t('Choose a role…') }, ...roles.map((role) => ({ value: role.code, label: role.name }))]}
                        />
                      ) : r.kind === 'user' ? (
                        <ComboField
                          aria-label={t('Recipient {n} person', { n: i + 1 })}
                          size="sm"
                          placeholder={t('Choose a person…')}
                          items={users.map((u) => ({ id: u.email, label: `${u.name} (${u.email})` }))}
                          value={r.value}
                          onChange={(value) => setRecipients(recipients.map((x, j) => (j === i ? { ...x, value } : x)))}
                        />
                      ) : r.kind === 'field' ? (
                        <ComboField
                          aria-label={t('Recipient {n} field', { n: i + 1 })}
                          size="sm"
                          placeholder={t('Field holding a person…')}
                          items={fields}
                          value={r.value}
                          onChange={(value) => setRecipients(recipients.map((x, j) => (j === i ? { ...x, value } : x)))}
                          hint={t('Its value may be a person’s id, email or name.')}
                        />
                      ) : (
                        <p className="text-sm text-tertiary">{r.kind === 'actor' ? t('The person who added, changed or moved it.') : t('Every user of the app.')}</p>
                      )}
                    </div>
                    <IconAction icon={Trash01} danger label={t('Remove recipient {n}', { n: i + 1 })} onPress={() => setRecipients(recipients.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => setRecipients([...recipients, { kind: 'role', value: '' }])}>
                  {t('Add who gets it')}
                </Button>
                <Toggle label={t('Not the person who did it')} hint={t('Whoever made the change isn’t told about it.')} isSelected={config.exclude_actor} onChange={(v) => set('exclude_actor', v)} />
                <Toggle
                  label={t('Also send by email')}
                  hint={t('Each of them also gets it at their email address, with a button that opens the link.')}
                  isSelected={config.email}
                  onChange={(v) => set('email', v)}
                />
              </>
            )}
          </Panel>
        </div>

        <TryPanel key={version} meta={meta} dirty={dirty} manual={config.event === 'manual'} />
      </div>
    </section>
  );
}

/** The saved notification on a real record: how it looks, who gets it, a test, and its log. */
function TryPanel({ meta, dirty, manual }: { meta: Meta; dirty: boolean; manual: boolean }) {
  const [recordId, setRecordId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState<'test' | 'all' | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(
    async (id = recordId) => {
      setError(null);
      try {
        const [p, l] = await Promise.all([notificationApi.preview(meta.id, id.trim() || undefined), notificationApi.log(meta.id)]);
        setPreview(p);
        setLog(l);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('The preview could not be made.'));
      }
    },
    [meta.id, recordId],
  );

  useEffect(() => {
    load('');
    // Loads once per saved version (the panel is keyed on it).
  }, []);

  async function send(test: boolean) {
    setSending(test ? 'test' : 'all');
    setNotice(null);
    setError(null);
    try {
      const r = await notificationApi.send(meta.id, { test, record_id: preview?.record_id ?? undefined });
      setNotice(
        test
          ? preview?.email
            ? t('Sent to you. Open the bell to see it; the email follows.')
            : t('Sent to you. Open the bell to see it.')
          : t('Sent to {count} people.', { count: r.sent }),
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('It could not be sent.'));
    } finally {
      setSending(null);
      setConfirming(false);
    }
  }

  const kind = KINDS.find((k) => k.value === preview?.type) ?? KINDS[0];

  return (
    <aside className="space-y-4" aria-label={t('Try it')}>
      <Panel title={t('Preview')} description={dirty ? t('Save to see your changes here.') : t('As it would arrive, about a real record.')}>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label={t('About record #')} size="sm" type="number" placeholder={t('The newest')} value={recordId} onChange={setRecordId} />
          </div>
          <Button size="sm" color="secondary" onPress={() => load()}>
            {t('Show')}
          </Button>
        </div>
        {error && <Alert>{error}</Alert>}
        {preview && (
          <>
            <div className="flex gap-3 rounded-xl bg-primary p-3 shadow-xs ring-1 ring-secondary">
              <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Bell01 className="size-4 text-fg-secondary" />
                <span className={cx('absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-bg-primary', kind.dot)} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">{preview.title}</p>
                {preview.body && <p className="mt-0.5 text-sm whitespace-pre-line text-tertiary">{preview.body}</p>}
                {preview.link && <p className="mt-1 truncate font-mono text-xs text-brand-secondary">{preview.link}</p>}
              </div>
            </div>
            {preview.record_id ? (
              preview.matches === false && (
                <Badge type="color" size="sm" color="warning">
                  {t('Record #{id} doesn’t meet the conditions; it wouldn’t be sent.', { id: preview.record_id })}
                </Badge>
              )
            ) : (
              <p className="text-xs text-tertiary">{t('No record to show it with; fields stay as written.')}</p>
            )}
            <div>
              <p className="text-sm font-medium text-secondary">
                {preview.recipient_count === 0 ? t('Nobody would get it') : t('{count} people would get it', { count: preview.recipient_count })}
              </p>
              {preview.recipients.length > 0 && (
                <p className="mt-0.5 text-sm text-tertiary">
                  {preview.recipients.map((r) => r.name).join(', ')}
                  {preview.recipient_count > preview.recipients.length ? t(' and {count} more', { count: preview.recipient_count - preview.recipients.length }) : ''}
                </p>
              )}
              <p className="mt-1 text-xs text-quaternary">{t('When you make the change yourself, you are left out if “Not the person who did it” is on.')}</p>
            </div>
          </>
        )}
        {notice && <p className="text-sm text-success-primary">{notice}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" color="secondary" iconLeading={Send01} isDisabled={dirty} isLoading={sending === 'test'} onPress={() => send(true)}>
            {t('Send me a test')}
          </Button>
          <Button size="sm" iconLeading={Send01} isDisabled={dirty || !preview?.recipient_count} isLoading={sending === 'all'} onPress={() => setConfirming(true)}>
            {manual ? t('Send now') : t('Send now to them')}
          </Button>
        </div>
      </Panel>

      <Panel title={t('Sent lately')}>
        {!log ? (
          <div className="h-16 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
        ) : log.length ? (
          <ul className="divide-y divide-secondary">
            {log.map((l) => (
              <li key={l.id} className="py-2 text-sm">
                <p className="truncate font-medium text-primary">{l.title}</p>
                <p className="text-xs text-tertiary">
                  {t('To {name}', { name: l.user_name })} · {new Date(l.created_at).toLocaleString()} · {l.read_at ? t('read') : t('unread')}
                </p>
                {l.email_status && (
                  <p className={cx('mt-0.5 flex items-center gap-1 text-xs', l.email_status === 'failed' ? 'text-error-primary' : 'text-tertiary')} title={l.email_error ?? undefined}>
                    <Mail01 className="size-3.5 shrink-0" />
                    {l.email_status === 'sent' ? t('Emailed') : l.email_status === 'queued' ? t('Email waiting to go') : t('Email failed: {error}', { error: l.email_error ?? '' })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-tertiary">{t('Nothing sent yet.')}</p>
        )}
      </Panel>

      {confirming && preview && (
        <ConfirmDialog
          title={t('Send to {count} people?', { count: preview.recipient_count })}
          message={t("“{title}” goes to their notifications now. It can't be taken back.", { title: preview.title })}
          confirmLabel={t('Send')}
          busy={sending === 'all'}
          onConfirm={() => send(false)}
          onCancel={() => setConfirming(false)}
        />
      )}
    </aside>
  );
}

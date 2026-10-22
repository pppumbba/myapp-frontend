import { useEffect, useState, type FormEvent } from 'react';
import { Edit01, Play, Plus, Trash01, UserSquare } from '@untitledui/icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { sessionApi, type SessionValue } from '../lib/sessionApi';
import { AppShell, PageHeader } from '../components/AppShell';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Alert, IconAction } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { TextArea } from '@/components/base/textarea/textarea';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const shown = (v: unknown) => (v === null || v === undefined ? 'empty' : String(v));

/**
 * Custom session values: each is worked out per user at login (a SELECT whose first column of
 * the first row is the value, given param such as userid) and kept until the next login. Any
 * query uses one as :path, and default values and presets as {path}.
 */
export default function SessionValuesPage() {
  const { refreshSession } = useAuth();
  const [rows, setRows] = useState<SessionValue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // undefined: closed; null: new.
  const [editing, setEditing] = useState<SessionValue | null | undefined>();
  const [deleting, setDeleting] = useState<SessionValue | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function load() {
    try {
      setRows(await sessionApi.list());
    } catch (err) {
      setError(message(err, 'The session values could not be loaded.'));
    }
  }

  useEffect(() => {
    load();
  }, []);

  // A change means everyone's values are worked out again; the admin's own at once.
  async function changed() {
    await Promise.all([load(), refreshSession().catch(() => undefined)]);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await sessionApi.remove(deleting.id);
      await changed();
    } catch (err) {
      setError(message(err, 'The session value could not be removed.'));
    } finally {
      setDeleting(null);
      setDeleteBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Session values"
        subtitle="Values worked out for each user when they sign in, such as their employee or department. Queries use them as :name; default values and presets as {name}."
        actions={
          <Button size="sm" iconLeading={Plus} onPress={() => setEditing(null)}>
            New session value
          </Button>
        }
      />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}
      {!rows ? (
        <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-primary p-8 text-center ring-1 ring-secondary">
          <UserSquare className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-primary">No session values yet</p>
          <p className="mt-1 text-sm text-tertiary">
            For example sessionemployeeid: <code className="text-xs">SELECT id FROM employees WHERE user_id = :userid</code> with param userid.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-mono text-sm font-semibold text-primary">{r.path}</p>
                  {r.param && (
                    <Badge type="color" size="sm" color="gray">
                      from {r.param}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 truncate font-mono text-xs text-tertiary" title={r.query}>
                  {r.query}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-quaternary">Yours now</p>
                <p className="font-mono text-sm font-medium text-primary tabular-nums">{shown(r.value)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconAction icon={Edit01} label={`Edit ${r.path}`} onPress={() => setEditing(r)} />
                <IconAction icon={Trash01} danger label={`Remove ${r.path}`} onPress={() => setDeleting(r)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== undefined && (
        <SessionValueModal
          row={editing}
          earlier={(rows ?? []).filter((r) => !editing || r.id < editing.id).map((r) => r.path)}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await changed();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Remove ${deleting.path}?`}
          message="Queries and defaults that use it will get an empty value."
          confirmLabel="Remove"
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </AppShell>
  );
}

function SessionValueModal({
  row,
  earlier,
  onClose,
  onSaved,
}: {
  row: SessionValue | null;
  /** Paths of the values worked out before this one, usable as its param. */
  earlier: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [path, setPath] = useState(row?.path ?? 'session');
  const [query, setQuery] = useState(row?.query ?? '');
  const [param, setParam] = useState(row?.param ?? 'userid');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<{ value: unknown; error: string | null } | null>(null);
  const fe = (k: string) => fieldErrors[k]?.[0];

  async function test() {
    setTesting(true);
    setTested(null);
    try {
      setTested(await sessionApi.test(query, param.trim() || null));
    } catch (err) {
      setTested({ value: null, error: message(err, 'The query could not be tested.') });
    } finally {
      setTesting(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    const input = { path: path.trim(), query, param: param.trim() || null };
    try {
      if (row) await sessionApi.update(row.id, input);
      else await sessionApi.create(input);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      else setError(message(err, 'The session value could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={row ? `Edit ${row.path}` : 'New session value'} description="Worked out for each user when they sign in." onClose={onClose} size="lg">
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Path"
            isRequired
            value={path}
            onChange={setPath}
            placeholder="sessionemployeeid"
            inputClassName="font-mono"
            isInvalid={!!fe('path')}
            hint={fe('path') ?? `Queries use :${path || 'path'}; defaults {${path || 'path'}}.`}
          />
          <Input
            label="Param"
            value={param}
            onChange={setParam}
            placeholder="userid"
            inputClassName="font-mono"
            isInvalid={!!fe('param')}
            hint={fe('param') ?? `The value the query gets as :${param || 'param'}: userid, email${earlier.length ? `, or ${earlier.join(', ')}` : ''}.`}
          />
        </div>
        <TextArea
          label="Query"
          isRequired
          rows={5}
          value={query}
          onChange={setQuery}
          placeholder={'SELECT id FROM employees WHERE user_id = :userid'}
          textAreaClassName="font-mono text-sm"
          isInvalid={!!fe('query')}
          hint={fe('query') ?? 'A SELECT; the first column of the first row is the value. No row gives an empty value.'}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" color="secondary" iconLeading={Play} isDisabled={!query.trim()} isLoading={testing} showTextWhileLoading onPress={test}>
            Test as me
          </Button>
          {tested &&
            (tested.error ? (
              <p className="min-w-0 flex-1 text-sm text-error-primary">{tested.error}</p>
            ) : (
              <p className="text-sm text-secondary">
                Your value: <span className="font-mono font-semibold text-primary">{shown(tested.value)}</span>
              </p>
            ))}
        </div>
        <div className="modal-footer flex justify-end gap-3 border-t border-secondary pt-5">
          <Button size="md" color="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button size="md" type="submit" isLoading={saving} showTextWhileLoading>
            {row ? 'Save changes' : 'Add session value'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

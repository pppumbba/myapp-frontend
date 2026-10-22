import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle, Lock01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { accessApi, type Ability, type MetaPermission, type Role, type StatusPermission } from '../../lib/accessApi';
import type { Meta } from '../../lib/metaApi';
import { workflowApi, type WfmStatus } from '../../lib/workflowApi';
import { Alert } from '../../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';

const ABILITIES: { key: Ability; label: string }[] = [
  { key: 'view', label: 'Open' },
  { key: 'create', label: 'Add' },
  { key: 'edit', label: 'Change' },
  { key: 'delete', label: 'Delete' },
];

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function Panel({ title, description, footer, children }: { title: string; description: string; footer: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={title}>
      <div className="flex items-start gap-3 border-b border-secondary px-4 py-3.5 sm:px-5">
        <Lock01 className="mt-0.5 size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
        <div>
          <h2 className="text-md font-semibold text-primary">{title}</h2>
          <p className="max-w-prose text-sm text-tertiary">{description}</p>
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
      <div className="flex items-center justify-end gap-3 border-t border-secondary px-4 py-3 sm:px-5">{footer}</div>
    </section>
  );
}

function useRoles() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  useEffect(() => {
    accessApi.roles().then(
      (r) => setRoles(r.filter((role) => role.code !== 'admin')),
      () => setRoles([]),
    );
  }, []);
  return roles;
}

function SaveRow({ busy, done, dirty, error, onSave }: { busy: boolean; done: boolean; dirty: boolean; error: string | null; onSave: () => void }) {
  return (
    <>
      {error && <p className="mr-auto text-sm font-medium text-error-primary">{error}</p>}
      {done && !dirty && (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success-primary">
          <CheckCircle className="size-4" aria-hidden="true" />
          Saved
        </p>
      )}
      <Button size="sm" isLoading={busy} showTextWhileLoading isDisabled={!dirty} onPress={onSave}>
        Save permissions
      </Button>
    </>
  );
}

const noRoles = (
  <p className="px-4 py-6 text-sm text-tertiary sm:px-5">
    There are no roles besides Administrator yet. Add some on the Users &amp; roles page first.
  </p>
);

/**
 * Which roles may open this meta and add, change or delete its records. With no role
 * ticked, it's open to everyone; administrators can always do everything.
 */
export function MetaPermissionsPanel({ meta }: { meta: Meta }) {
  const roles = useRoles();
  const [rows, setRows] = useState<Record<number, MetaPermission>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    accessApi.metaPermissions(meta.id).then(
      (list) => setRows(Object.fromEntries(list.map((p) => [p.role_id, p]))),
      (err) => setLoadError(message(err, 'Permissions could not be loaded.')),
    );
  }, [meta.id]);

  function set(roleId: number, ability: Ability, on: boolean) {
    setRows((current) => {
      const row = current[roleId] ?? { role_id: roleId, can_view: false, can_create: false, can_edit: false, can_delete: false };
      const next = { ...row, [`can_${ability}`]: on };
      // Changing records needs seeing them, so ticking one also ticks Open.
      if (on && ability !== 'view') next.can_view = true;
      return { ...current, [roleId]: next };
    });
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const kept = Object.values(rows).filter((r) => r.can_view || r.can_create || r.can_edit || r.can_delete);
      const saved = await accessApi.saveMetaPermissions(meta.id, kept);
      setRows(Object.fromEntries(saved.map((p) => [p.role_id, p])));
      setDirty(false);
      setDone(true);
    } catch (err) {
      setError(message(err, 'Permissions could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  const restricted = Object.values(rows).some((r) => r.can_view || r.can_create || r.can_edit || r.can_delete);

  return (
    <Panel
      title="Who can use it"
      description={
        restricted
          ? 'Only the ticked roles (and administrators) can use this meta.'
          : 'Nothing is ticked, so everyone who is signed in can open this meta and change its records.'
      }
      footer={<SaveRow busy={busy} done={done} dirty={dirty} error={error} onSave={save} />}
    >
      {loadError && (
        <div className="p-4 sm:px-5">
          <Alert>{loadError}</Alert>
        </div>
      )}
      {roles?.length === 0 && noRoles}
      {roles && roles.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-secondary text-left text-xs font-medium text-tertiary">
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                Role
              </th>
              {ABILITIES.map((a) => (
                <th key={a.key} scope="col" className="px-3 py-2.5 font-medium">
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {roles.map((role) => (
              <tr key={role.id}>
                <th scope="row" className="px-4 py-3 text-left font-semibold text-primary sm:px-5">
                  {role.name}
                </th>
                {ABILITIES.map((a) => (
                  <td key={a.key} className="px-3 py-3">
                    <Checkbox
                      aria-label={`${role.name}: ${a.label}`}
                      isSelected={!!rows[role.id]?.[`can_${a.key}`]}
                      onChange={(on) => set(role.id, a.key, on)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

const pairKey = (statusId: number, roleId: number) => `${statusId}:${roleId}`;

/**
 * Per status of a workflow: which roles may move records into it, and which may see records
 * while they sit in it. A status with nothing ticked in a column is open to everyone for that.
 */
export function StatusPermissionsPanel({ meta }: { meta: Meta }) {
  const roles = useRoles();
  const [statuses, setStatuses] = useState<WfmStatus[]>([]);
  const [rows, setRows] = useState<Record<string, StatusPermission>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [done, setDone] = useState(false);

  const keyed = (list: StatusPermission[]) => Object.fromEntries(list.map((p) => [pairKey(p.status_id, p.role_id), p]));

  useEffect(() => {
    Promise.all([workflowApi.get(meta.id), accessApi.statusPermissions(meta.id)]).then(
      ([def, list]) => {
        setStatuses(def.statuses);
        setRows(keyed(list));
      },
      (err) => setLoadError(message(err, 'Permissions could not be loaded.')),
    );
  }, [meta.id]);

  function set(statusId: number, roleId: number, field: 'can_enter' | 'can_see', on: boolean) {
    const k = pairKey(statusId, roleId);
    setRows((current) => ({ ...current, [k]: { ...(current[k] ?? { status_id: statusId, role_id: roleId, can_enter: false, can_see: false }), [field]: on } }));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const saved = await accessApi.saveStatusPermissions(meta.id, Object.values(rows).filter((r) => r.can_enter || r.can_see));
      setRows(keyed(saved));
      setDirty(false);
      setDone(true);
    } catch (err) {
      setError(message(err, 'Permissions could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Who can move and see records"
      description="Move in: who may move a record into the status. See: who may see records while they're in it. A status with nothing ticked is open to everyone. People who can take the next step get a notification when a record arrives."
      footer={<SaveRow busy={busy} done={done} dirty={dirty} error={error} onSave={save} />}
    >
      {loadError && (
        <div className="p-4 sm:px-5">
          <Alert>{loadError}</Alert>
        </div>
      )}
      {roles?.length === 0 && noRoles}
      {roles && roles.length > 0 && statuses.length === 0 && !loadError && (
        <p className="px-4 py-6 text-sm text-tertiary sm:px-5">Add statuses in the designer below first.</p>
      )}
      {roles && roles.length > 0 && statuses.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-secondary text-left text-xs font-medium text-tertiary">
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                Status
              </th>
              {roles.map((r) => (
                <th key={r.id} scope="col" className="px-3 py-2.5 font-medium whitespace-nowrap">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {statuses.map((s) => (
              <tr key={s.id}>
                <th scope="row" className="px-4 py-3 text-left font-semibold whitespace-nowrap text-primary sm:px-5">
                  {s.label_name || s.name}
                </th>
                {roles.map((r) => {
                  const row = rows[pairKey(s.id, r.id)];
                  return (
                    <td key={r.id} className="px-3 py-3">
                      <div className="flex flex-col gap-1.5 whitespace-nowrap">
                        <Checkbox label="Move in" isSelected={!!row?.can_enter} onChange={(on) => set(s.id, r.id, 'can_enter', on)} aria-label={`${r.name} may move records into ${s.name}`} />
                        <Checkbox label="See" isSelected={!!row?.can_see} onChange={(on) => set(s.id, r.id, 'can_see', on)} aria-label={`${r.name} may see records in ${s.name}`} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

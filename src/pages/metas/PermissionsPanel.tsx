import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle, Lock01, Plus, SearchLg, Trash01 } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { accessApi, type Ability, type MetaPermission, type Role, type StatusPermission } from '../../lib/accessApi';
import type { Meta } from '../../lib/metaApi';
import { workflowApi, type WfmStatus } from '../../lib/workflowApi';
import { Alert, IconAction } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { PaginationCardMinimal } from '@/components/application/pagination/pagination';
import { Button } from '@/components/base/buttons/button';
import { Checkbox, CheckboxBase } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { t } from '@/i18n';

const ABILITIES: { key: Ability; label: string }[] = [
  { key: 'view', label: 'Open' },
  { key: 'create', label: 'Add' },
  { key: 'edit', label: 'Change' },
  { key: 'delete', label: 'Delete' },
];

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function Panel({ title, description, actions, footer, children }: { title: string; description: string; actions?: ReactNode; footer: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={title}>
      <div className="flex items-start gap-3 border-b border-secondary px-4 py-3.5 sm:px-5">
        <Lock01 className="mt-0.5 size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-md font-semibold text-primary">{title}</h2>
          <p className="max-w-prose text-sm text-tertiary">{description}</p>
        </div>
        {actions}
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
          {t("Saved")}
        </p>
      )}
      <Button size="sm" isLoading={busy} showTextWhileLoading isDisabled={!dirty} onPress={onSave}>
        {t("Save permissions")}
      </Button>
    </>
  );
}

const noRoles = (
  <p className="px-4 py-6 text-sm text-tertiary sm:px-5">
    {t("There are no roles besides Administrator yet. Add some on the Users &amp; roles page first.")}
  </p>
);

const ROLE_PAGE = 10;

/**
 * The roles not on the list yet, as a grid to tick several in at once: a search, a tick
 * column with select all (of the rows found), and paging as under a datagrid.
 */
function AddRolesDialog({ roles, onAdd, onClose }: { roles: Role[]; onAdd: (ids: number[]) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(ROLE_PAGE);
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? roles.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)) : roles;
  }, [roles, query]);
  const pages = Math.max(1, Math.ceil(found.length / perPage));
  const current = Math.min(page, pages);
  const rows = found.slice((current - 1) * perPage, current * perPage);
  const allPicked = found.length > 0 && found.every((r) => picked.has(r.id));
  const somePicked = found.some((r) => picked.has(r.id));

  const toggle = (id: number) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setPicked((s) => {
      const next = new Set(s);
      for (const r of found) {
        if (allPicked) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });

  return (
    <Modal title={t('Add roles')} description={t('Tick the roles to give access to. They start with Open; tick what else each may do after.')} onClose={onClose} size="lg">
      <div className="space-y-4">
        <Input
          aria-label={t('Search roles')}
          icon={SearchLg}
          placeholder={t('Search')}
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          autoFocus
        />
        <div className="overflow-hidden rounded-xl ring-1 ring-secondary">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs font-medium text-tertiary">
              <tr>
                <th scope="col" className="w-10 py-2.5 pl-4">
                  <button type="button" onClick={toggleAll} disabled={!found.length} aria-label={allPicked ? t('Untick all') : t('Tick all')} className="flex rounded outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2">
                    <CheckboxBase isSelected={allPicked} isIndeterminate={somePicked && !allPicked} isDisabled={!found.length} />
                  </button>
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('Role')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('Description')}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">{t('People')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary">
              {rows.map((r) => {
                const on = picked.has(r.id);
                return (
                  <tr key={r.id} onClick={() => toggle(r.id)} className={`cursor-pointer transition duration-100 ease-linear ${on ? 'bg-brand-primary_alt' : 'hover:bg-primary_hover'}`}>
                    <td className="py-3 pl-4">
                      <CheckboxBase isSelected={on} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(r.id);
                        }}
                        className="rounded text-left font-medium text-primary outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {r.name}
                      </button>
                      <span className="block font-mono text-xs text-quaternary">{r.code}</span>
                    </td>
                    <td className="px-4 py-3 text-tertiary">{r.description || '—'}</td>
                    <td className="px-4 py-3 text-right text-tertiary tabular-nums">{r.users_count ?? '—'}</td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-tertiary">
                    {roles.length === 0 ? t('Every role is on the list already.') : t('Nothing matches “{search}”.', { search: query })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <PaginationCardMinimal page={current} total={pages} pageSize={perPage} onPageChange={(p) => setPage(Math.max(1, p))} onPageSizeChange={(n) => { setPerPage(n); setPage(1); }} />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button size="sm" iconLeading={Plus} isDisabled={picked.size === 0} onPress={() => onAdd([...picked])}>
            {picked.size === 1 ? t('Add 1 role') : t('Add {count} roles', { count: picked.size })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Which roles may open this meta and add, change or delete its records. Only the roles given
 * something are listed; more are added from a grid of the rest, and a role taken off the list
 * loses its access here. With no role on it, only administrators can use the meta; they can
 * always do everything.
 */
export function MetaPermissionsPanel({ meta }: { meta: Meta }) {
  const roles = useRoles();
  const [rows, setRows] = useState<Record<number, MetaPermission>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [done, setDone] = useState(false);
  // Roles on the list: those with a permission row, and those just added.
  const [listed, setListed] = useState<Set<number>>(() => new Set());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    accessApi.metaPermissions(meta.id).then(
      (list) => {
        setRows(Object.fromEntries(list.map((p) => [p.role_id, p])));
        setListed(new Set(list.map((p) => p.role_id)));
      },
      (err) => setLoadError(message(err, t("Permissions could not be loaded."))),
    );
  }, [meta.id]);

  /** Puts roles on the list, each able to open the meta to start with. */
  function add(ids: number[]) {
    setRows((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, { ...(current[id] ?? { role_id: id, can_create: false, can_edit: false, can_delete: false }), can_view: true }])) }));
    setListed((s) => new Set([...s, ...ids]));
    setAdding(false);
    setDirty(true);
  }

  /** Takes a role off the list: it loses every permission on this meta when saved. */
  function remove(roleId: number) {
    setRows(({ [roleId]: _, ...rest }) => rest);
    setListed((s) => new Set([...s].filter((id) => id !== roleId)));
    setDirty(true);
  }

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
      // A role left with nothing ticked drops off the list.
      setListed(new Set(saved.map((p) => p.role_id)));
      setDirty(false);
      setDone(true);
    } catch (err) {
      setError(message(err, t("Permissions could not be saved.")));
    } finally {
      setBusy(false);
    }
  }

  const restricted = Object.values(rows).some((r) => r.can_view || r.can_create || r.can_edit || r.can_delete);
  const shown = (roles ?? []).filter((r) => listed.has(r.id));
  const others = (roles ?? []).filter((r) => !listed.has(r.id));

  return (
    <Panel
      title={t("Who can use it")}
      description={
        restricted
          ? t("Only the ticked roles (and administrators) can use this meta.")
          : t("No role is given access, so only administrators can open this meta.")
      }
      actions={
        roles && roles.length > 0 ? (
          <Button size="sm" color="secondary" iconLeading={Plus} isDisabled={others.length === 0} onPress={() => setAdding(true)}>
            {t("Add roles")}
          </Button>
        ) : undefined
      }
      footer={<SaveRow busy={busy} done={done} dirty={dirty} error={error} onSave={save} />}
    >
      {loadError && (
        <div className="p-4 sm:px-5">
          <Alert>{loadError}</Alert>
        </div>
      )}
      {roles?.length === 0 && noRoles}
      {roles && roles.length > 0 && shown.length === 0 && !loadError && (
        <div className="flex flex-col items-center gap-3 px-4 py-8 text-center sm:px-5">
          <p className="text-sm text-tertiary">{t("No role has access yet. Add the roles that may use this meta.")}</p>
          <Button size="sm" iconLeading={Plus} onPress={() => setAdding(true)}>
            {t("Add roles")}
          </Button>
        </div>
      )}
      {adding && <AddRolesDialog roles={others} onAdd={add} onClose={() => setAdding(false)} />}
      {shown.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-secondary text-left text-xs font-medium text-tertiary">
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                {t("Role")}
              </th>
              {ABILITIES.map((a) => (
                <th key={a.key} scope="col" className="px-3 py-2.5 font-medium">
                  {t(a.label)}
                </th>
              ))}
              <th scope="col" className="w-12">
                <span className="sr-only">{t("Remove")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {shown.map((role) => (
              <tr key={role.id}>
                <th scope="row" className="px-4 py-3 text-left font-semibold text-primary sm:px-5">
                  {role.name}
                </th>
                {ABILITIES.map((a) => (
                  <td key={a.key} className="px-3 py-3">
                    <Checkbox
                      aria-label={`${role.name}: ${t(a.label)}`}
                      isSelected={!!rows[role.id]?.[`can_${a.key}`]}
                      onChange={(on) => set(role.id, a.key, on)}
                    />
                  </td>
                ))}
                <td className="py-2 pr-3">
                  <IconAction icon={Trash01} danger label={t("Take {role} off the list", { role: role.name })} onPress={() => remove(role.id)} />
                </td>
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
      (err) => setLoadError(message(err, t("Permissions could not be loaded."))),
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
      setError(message(err, t("Permissions could not be saved.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={t("Who can move and see records")}
      description={t("Move in: who may move a record into the status. See: who may see records while they're in it. A status with nothing ticked is open to everyone. People who can take the next step get a notification when a record arrives.")}
      footer={<SaveRow busy={busy} done={done} dirty={dirty} error={error} onSave={save} />}
    >
      {loadError && (
        <div className="p-4 sm:px-5">
          <Alert>{loadError}</Alert>
        </div>
      )}
      {roles?.length === 0 && noRoles}
      {roles && roles.length > 0 && statuses.length === 0 && !loadError && (
        <p className="px-4 py-6 text-sm text-tertiary sm:px-5">{t("Add statuses in the designer below first.")}</p>
      )}
      {roles && roles.length > 0 && statuses.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-secondary text-left text-xs font-medium text-tertiary">
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                {t("Status")}
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
                        <Checkbox label={t("Move in")} isSelected={!!row?.can_enter} onChange={(on) => set(s.id, r.id, 'can_enter', on)} aria-label={t('{role} may move records into {status}', { role: r.name, status: s.name })} />
                        <Checkbox label={t("See")} isSelected={!!row?.can_see} onChange={(on) => set(s.id, r.id, 'can_see', on)} aria-label={t('{role} may see records in {status}', { role: r.name, status: s.name })} />
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

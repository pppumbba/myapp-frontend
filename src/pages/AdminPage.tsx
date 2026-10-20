import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Edit01, Plus, SearchLg, Trash01 } from '@untitledui/icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { accessApi, type Role, type UserWithRoles } from '../lib/accessApi';
import { AppShell, PageHeader } from '../components/AppShell';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Alert, IconAction } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { TextArea } from '@/components/base/textarea/textarea';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/**
 * Roles and who has them. What each role may do is set on each meta (and on a workflow's
 * statuses) in the builder.
 */
export default function AdminPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadRoles() {
    try {
      setRoles(await accessApi.roles());
    } catch (err) {
      setError(message(err, 'Roles could not be loaded.'));
    }
  }

  useEffect(() => {
    loadRoles();
  }, []);

  return (
    <AppShell>
      <PageHeader title="Users & roles" subtitle="Give people roles here. What a role may open, change or move is set on each meta in the builder." />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[2fr_3fr]">
        <RolesCard roles={roles} onChanged={loadRoles} />
        <UsersCard roles={roles} onChanged={loadRoles} />
      </div>
    </AppShell>
  );
}

function Card({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="self-start rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={title}>
      <div className="flex items-start justify-between gap-3 border-b border-secondary px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="text-md font-semibold text-primary">{title}</h2>
          <p className="text-sm text-tertiary">{description}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function RolesCard({ roles, onChanged }: { roles: Role[]; onChanged: () => void }) {
  // undefined: closed, null: adding, otherwise the role being edited.
  const [editing, setEditing] = useState<Role | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await accessApi.removeRole(deleting.id);
      onChanged();
    } catch (err) {
      setError(message(err, 'The role could not be deleted.'));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  return (
    <Card
      title="Roles"
      description="Administrators may do everything."
      actions={
        <Button size="sm" color="secondary" iconLeading={Plus} onPress={() => setEditing(null)}>
          New role
        </Button>
      }
    >
      {error && (
        <div className="px-4 pt-4 sm:px-5">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul className="divide-y divide-secondary">
        {roles.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-primary">{r.name}</p>
              <p className="truncate text-xs text-tertiary">
                {r.code} · {r.users_count ?? 0} {r.users_count === 1 ? 'person' : 'people'}
              </p>
            </div>
            <IconAction icon={Edit01} label={`Edit ${r.name}`} onPress={() => setEditing(r)} />
            {r.code !== 'admin' && <IconAction icon={Trash01} danger label={`Delete ${r.name}`} onPress={() => setDeleting(r)} />}
          </li>
        ))}
      </ul>

      {editing !== undefined && (
        <RoleModal
          role={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            onChanged();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="People lose this role, and its permissions on metas and statuses are removed. A meta left with no permissions is open to everyone."
          confirmLabel="Delete role"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Card>
  );
}

function RoleModal({ role, onClose, onSaved }: { role: Role | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(role?.code ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fe = (k: string) => fieldErrors[k]?.[0];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const input = { code, name, description: description || null };
      if (role) await accessApi.updateRole(role.id, input);
      else await accessApi.createRole(input);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      else setError(message(err, 'The role could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={role ? `Edit ${role.name}` : 'New role'} onClose={onClose} size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Input label="Name" isRequired value={name} onChange={setName} isInvalid={!!fe('name')} hint={fe('name')} />
        <Input
          label="Code"
          isRequired
          value={code}
          onChange={setCode}
          isDisabled={role?.code === 'admin'}
          isInvalid={!!fe('code')}
          hint={fe('code') ?? 'Lowercase letters, numbers, - and _.'}
        />
        <TextArea label="Description" value={description} onChange={setDescription} rows={3} />
        <div className="flex justify-end gap-3 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button size="sm" type="submit" isLoading={busy} showTextWhileLoading>
            Save role
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function UsersCard({ roles, onChanged }: { roles: Role[]; onChanged: () => void }) {
  const { user: me, refreshAccess } = useAuth();
  const [users, setUsers] = useState<UserWithRoles[] | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<UserWithRoles | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      accessApi.users(search).then(
        (r) => live && setUsers(r.data),
        (err) => live && setError(message(err, 'People could not be loaded.')),
      );
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  function saved(updated: UserWithRoles) {
    setUsers((list) => list?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
    setEditing(null);
    onChanged();
    if (updated.id === me?.id) refreshAccess();
  }

  return (
    <Card title="People" description="Everyone with an account, and their roles.">
      <div className="px-4 pt-4 sm:px-5">
        <Input aria-label="Search people" placeholder="Search by name or email" icon={SearchLg} value={search} onChange={setSearch} />
      </div>
      {error && (
        <div className="px-4 pt-4 sm:px-5">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul className="mt-2 divide-y divide-secondary">
        {users?.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-primary">
                {u.name}
                {u.id === me?.id && <span className="font-normal text-tertiary"> (you)</span>}
              </p>
              <p className="truncate text-xs text-tertiary">{u.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {u.roles.length === 0 && <span className="text-xs text-quaternary">No roles</span>}
                {u.roles.map((r) => (
                  <Badge key={r.id} type="pill-color" size="sm" color={r.code === 'admin' ? 'brand' : 'gray'}>
                    {r.name}
                  </Badge>
                ))}
              </div>
            </div>
            <Button size="sm" color="secondary" onPress={() => setEditing(u)}>
              Roles
            </Button>
          </li>
        ))}
        {users?.length === 0 && <li className="px-4 py-6 text-center text-sm text-tertiary sm:px-5">No one matches.</li>}
      </ul>

      {editing && <UserRolesModal user={editing} roles={roles} onClose={() => setEditing(null)} onSaved={saved} />}
    </Card>
  );
}

function UserRolesModal({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: UserWithRoles;
  roles: Role[];
  onClose: () => void;
  onSaved: (u: UserWithRoles) => void;
}) {
  const [picked, setPicked] = useState(() => new Set(user.roles.map((r) => r.id)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: number, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await accessApi.setUserRoles(user.id, [...picked]));
    } catch (err) {
      setError(message(err, 'The roles could not be saved.'));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Roles for ${user.name}`} description={user.email} onClose={onClose} size="sm">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="space-y-3">
          {roles.map((r) => (
            <Checkbox key={r.id} label={r.name} hint={r.description || undefined} isSelected={picked.has(r.id)} onChange={(on) => toggle(r.id, on)} />
          ))}
        </div>
        <div className="flex justify-end gap-3 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button size="sm" isLoading={busy} showTextWhileLoading onPress={save}>
            Save roles
          </Button>
        </div>
      </div>
    </Modal>
  );
}

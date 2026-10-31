import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Edit01, Plus, SearchLg, Trash01, X } from '@untitledui/icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { accessApi, type Ability, type MetaTreeData, type RoleLogEntry, type RoleMeta, type RoleStatus, type RoleWorkspace, type UserWithRoles } from '../lib/accessApi';
import { PageHeader } from '../components/AppShell';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Alert, IconAction } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { cx } from '@/utils/cx';
import { RoleModal } from './AdminPage';
import { MetaTreePicker } from './MetaTreePicker';
import { t } from '@/i18n';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const ABILITIES: { key: Ability; label: string }[] = [
  { key: 'view', label: 'Open' },
  { key: 'create', label: 'Add' },
  { key: 'edit', label: 'Change' },
  { key: 'delete', label: 'Delete' },
];
const STATUS_ABILITIES = [
  { key: 'enter', label: 'Move in' },
  { key: 'see', label: 'See' },
] as const;

type Tab = 'people' | 'metas' | 'statuses' | 'log';

/**
 * /admin/roles/:id — one role on one screen: who has it, the metas it may use and what it
 * may do with each, the workflow statuses it may move records into and see, and the log of its changes
 * (wherever they were made). The same permissions as each meta's panel, from the role's side.
 */
export default function RoleWorkspacePage() {
  const roleId = Number(useParams().id);
  const { user: me, refreshAccess } = useAuth();
  const [ws, setWs] = useState<RoleWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('people');
  const [editing, setEditing] = useState(false);
  // Bumped after each save, so the log shows it when opened.
  const [saves, setSaves] = useState(0);

  const load = useCallback(() => {
    accessApi.workspace(roleId).then(setWs, (err) => setError(message(err, t('The role could not be loaded.'))));
  }, [roleId]);
  useEffect(load, [load]);

  const saved = (next: RoleWorkspace) => {
    setWs(next);
    setSaves((n) => n + 1);
    refreshAccess();
  };

  const granted = ws?.metas.filter(metaHas).length ?? 0;
  const statusCount = ws?.workflows.flatMap((w) => w.statuses).filter(statusHas).length ?? 0;

  return (
    <>
      <Link to="/admin" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-tertiary hover:text-tertiary_hover">
        <ArrowLeft className="size-4 text-fg-quaternary" aria-hidden="true" />
        {t('Users & roles')}
      </Link>
      <PageHeader
        title={ws?.role.name ?? (error ? t('Not available') : t('Loading…'))}
        subtitle={ws ? ws.role.description || ws.role.code : undefined}
        actions={
          ws && (
            <Button size="sm" color="secondary" iconLeading={Edit01} onPress={() => setEditing(true)}>
              {t('Edit role')}
            </Button>
          )
        }
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {ws && (
        <>
          <ButtonGroup
            size="sm"
            aria-label={t('Role workspace')}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[tab]}
            onSelectionChange={(keys) => setTab(([...keys][0] as Tab) ?? 'people')}
            className="mb-4"
          >
            <ButtonGroupItem id="people">{t('People ({n})', { n: ws.users.length })}</ButtonGroupItem>
            <ButtonGroupItem id="metas">{t('Metas ({n})', { n: ws.is_admin_role ? ws.metas.length : granted })}</ButtonGroupItem>
            <ButtonGroupItem id="statuses">{t('Statuses ({n})', { n: statusCount })}</ButtonGroupItem>
            <ButtonGroupItem id="log">{t('Log')}</ButtonGroupItem>
          </ButtonGroup>

          {tab === 'people' && (
            <PeopleTab
              ws={ws}
              onSaved={(users) => {
                setWs({ ...ws, users, role: { ...ws.role, users_count: users.length } });
                setSaves((n) => n + 1);
                if (me && (users.some((u) => u.id === me.id) || ws.users.some((u) => u.id === me.id))) refreshAccess();
              }}
            />
          )}
          {tab === 'metas' && <MetasTab ws={ws} onSaved={saved} />}
          {tab === 'statuses' && <StatusesTab ws={ws} onSaved={saved} />}
          {tab === 'log' && <LogTab key={saves} roleId={roleId} />}
        </>
      )}

      {editing && ws && (
        <RoleModal
          role={ws.role}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSaves((n) => n + 1);
            load();
          }}
        />
      )}
    </>
  );
}

function Card({ title, description, actions, footer, children }: { title: string; description: string; actions?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={title}>
      <div className="flex items-start justify-between gap-3 border-b border-secondary px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="text-md font-semibold text-primary">{title}</h2>
          <p className="max-w-prose text-sm text-tertiary">{description}</p>
        </div>
        {actions}
      </div>
      {children}
      {footer && <div className="flex items-center justify-end gap-3 border-t border-secondary px-4 py-3 sm:px-5">{footer}</div>}
    </section>
  );
}

function SaveRow({ busy, done, dirty, error, onSave }: { busy: boolean; done: boolean; dirty: number; error: string | null; onSave: () => void }) {
  return (
    <>
      {error && <p className="mr-auto text-sm font-medium text-error-primary">{error}</p>}
      {done && !dirty && (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success-primary">
          <CheckCircle className="size-4" aria-hidden="true" />
          {t('Saved')}
        </p>
      )}
      {dirty > 0 && <p className="text-sm text-tertiary">{t('{n} changed', { n: dirty })}</p>}
      <Button size="sm" isLoading={busy} showTextWhileLoading isDisabled={!dirty} onPress={onSave}>
        {t('Save permissions')}
      </Button>
    </>
  );
}

const adminNote = (
  <div className="p-4 sm:px-5">
    <Alert>{t('Administrators may do everything, so there is nothing to tick for this role.')}</Alert>
  </div>
);

/** Who has the role: search people to add, remove them one by one. Each change saves at once. */
function PeopleTab({ ws, onSaved }: { ws: RoleWorkspace; onSaved: (users: RoleWorkspace['users']) => void }) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<UserWithRoles[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useMemo(() => new Set(ws.users.map((u) => u.id)), [ws.users]);

  useEffect(() => {
    if (!search.trim()) {
      setFound([]);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      accessApi.users(search).then(
        (r) => live && setFound(r.data.filter((u) => !ids.has(u.id)).slice(0, 8)),
        () => live && setFound([]),
      );
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [search, ids]);

  async function save(userIds: number[]) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await accessApi.setRoleUsers(ws.role.id, userIds));
      setSearch('');
    } catch (err) {
      setError(message(err, t('The people could not be saved.')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('People')} description={t('Everyone with this role. Adding or removing someone saves at once.')}>
      <div className="relative px-4 pt-4 sm:px-5">
        <Input aria-label={t('Add someone')} placeholder={t('Search people to add, by name or email')} icon={SearchLg} value={search} onChange={setSearch} />
        {found.length > 0 && (
          <ul className="mt-2 divide-y divide-secondary rounded-lg ring-1 ring-secondary">
            {found.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-primary">{u.name}</p>
                  <p className="truncate text-xs text-tertiary">{u.email}</p>
                </div>
                <Button size="sm" color="secondary" iconLeading={Plus} isDisabled={busy} onPress={() => save([...ids, u.id])}>
                  {t('Add')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <div className="px-4 pt-4 sm:px-5">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul className="mt-3 divide-y divide-secondary border-t border-secondary">
        {ws.users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-primary">{u.name}</p>
              <p className="truncate text-xs text-tertiary">{u.email}</p>
            </div>
            <IconAction icon={X} label={t('Remove {name} from the role', { name: u.name })} onPress={() => !busy && save([...ids].filter((id) => id !== u.id))} />
          </li>
        ))}
        {ws.users.length === 0 && <li className="px-4 py-6 text-center text-sm text-tertiary sm:px-5">{t('No one has this role yet.')}</li>}
      </ul>
    </Card>
  );
}

type MetaEdits = Record<number, Partial<Record<`can_${Ability}`, boolean>>>;

const metaHas = (m: RoleMeta) => ABILITIES.some((a) => m[`can_${a.key}`]);
const noMetaAbilities = Object.fromEntries(ABILITIES.map((a) => [`can_${a.key}`, false]));

/**
 * The metas the role has permissions on. Ticks are kept until saved, and only changed metas
 * are sent; adding and removing a meta save at once. A meta left with nothing ticked goes.
 */
function MetasTab({ ws, onSaved }: { ws: RoleWorkspace; onSaved: (ws: RoleWorkspace) => void }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [edits, setEdits] = useState<MetaEdits>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RoleMeta | null>(null);

  const listed = ws.metas.filter(metaHas);
  const value = (m: RoleMeta, a: Ability) => edits[m.id]?.[`can_${a}`] ?? m[`can_${a}`];
  const types = useMemo(() => [...new Map(listed.filter((m) => m.type).map((m) => [m.type!.code, m.type!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [listed]);
  const q = search.trim().toLowerCase();
  const shown = listed.filter((m) => (!q || m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)) && (!type || m.type?.code === type));
  const changed = listed.filter((m) => edits[m.id] && ABILITIES.some((a) => value(m, a.key) !== m[`can_${a.key}`]));

  function set(m: RoleMeta, a: Ability, on: boolean) {
    setDone(false);
    // Opening is needed for anything else: ticking another ticks Open, unticking Open unticks the rest.
    const next = { ...edits[m.id], [`can_${a}`]: on };
    if (on && a !== 'view') next.can_view = true;
    if (!on && a === 'view') for (const b of ABILITIES) next[`can_${b.key}`] = false;
    setEdits({ ...edits, [m.id]: next });
  }

  async function send(rows: Parameters<typeof accessApi.setRoleMetas>[1], after: () => void) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await accessApi.setRoleMetas(ws.role.id, rows));
      after();
    } catch (err) {
      setError(message(err, t('The permissions could not be saved.')));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    send(
      changed.map((m) => ({ meta_id: m.id, ...Object.fromEntries(ABILITIES.map((a) => [`can_${a.key}`, value(m, a.key)])) })),
      () => {
        setEdits({});
        setDone(true);
      },
    );

  function remove(m: RoleMeta) {
    send([{ meta_id: m.id, ...noMetaAbilities }], () => {
      const { [m.id]: _gone, ...rest } = edits;
      setEdits(rest);
      setRemoving(null);
    });
  }

  return (
    <Card
      title={t('Metas')}
      description={t('What people with this role may do with each meta. A meta no role may use is for administrators only, unless it is public.')}
      actions={
        !ws.is_admin_role && (
          <Button size="sm" color="secondary" iconLeading={Plus} onPress={() => setAdding(true)}>
            {t('Add metas')}
          </Button>
        )
      }
      footer={!ws.is_admin_role && listed.length > 0 && <SaveRow busy={busy} done={done} dirty={changed.length} error={error} onSave={save} />}
    >
      {ws.is_admin_role ? (
        adminNote
      ) : listed.length === 0 ? (
        <Empty text={t('This role may not use any meta yet. Add the metas its people work with.')} />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 px-4 pt-4 sm:px-5">
            <div className="min-w-48 flex-1">
              <Input aria-label={t('Search metas')} placeholder={t('Search by name or code')} icon={SearchLg} value={search} onChange={setSearch} />
            </div>
            <div className="w-48">
              <NativeSelect
                aria-label={t('Type')}
                value={type}
                onChange={(e) => setType(e.target.value)}
                options={[{ label: t('All types'), value: '' }, ...types.map(([code, name]) => ({ label: name, value: code }))]}
              />
            </div>
          </div>
          <div className="mt-3 max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-primary">
                <tr className="border-y border-secondary text-left text-xs font-medium text-tertiary">
                  <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                    {t('Meta')}
                  </th>
                  {ABILITIES.map((a) => (
                    <th key={a.key} scope="col" className="px-3 py-2.5 font-medium">
                      {t(a.label)}
                    </th>
                  ))}
                  <th scope="col" className="w-12 px-3 py-2.5">
                    <span className="sr-only">{t('Remove')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {shown.map((m) => (
                  <tr key={m.id} className={edits[m.id] ? 'bg-secondary_subtle' : undefined}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal sm:px-5">
                      <Link to={`/metas/${m.id}`} className="font-semibold text-primary hover:underline">
                        {m.name}
                      </Link>
                      <MetaBadges meta={m} />
                    </th>
                    {ABILITIES.map((a) => (
                      <td key={a.key} className="px-3 py-2.5">
                        <Checkbox aria-label={`${m.name}: ${t(a.label)}`} isSelected={value(m, a.key)} onChange={(on) => set(m, a.key, on)} />
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      <IconAction icon={Trash01} danger label={t('Remove {name} from the role', { name: m.name })} onPress={() => setRemoving(m)} />
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-tertiary sm:px-5">
                      {t('No metas match.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {adding && (
        <AddMetasModal
          metas={ws.metas}
          granted={new Set(listed.map((m) => m.id))}
          onClose={() => setAdding(false)}
          onAdd={(rows) => send(rows, () => setAdding(false))}
          busy={busy}
          error={error}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={t('Remove {name}?', { name: removing.name })}
          message={
            removing.is_public
              ? t('People with this role keep what anyone may do with it, as it is public, and lose the rest.')
              : t('People with this role can no longer use it. If no other role may, it is for administrators only.')
          }
          confirmLabel={t('Remove')}
          busy={busy}
          onConfirm={() => remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </Card>
  );
}

function MetaBadges({ meta }: { meta: RoleMeta }) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-tertiary">
      <span>{meta.code}</span>
      {meta.type && (
        <Badge type="pill-color" size="sm" color="gray">
          {meta.type.name}
        </Badge>
      )}
      {meta.is_public && (
        <Badge type="pill-color" size="sm" color="success">
          {t('Public')}
        </Badge>
      )}
      {!meta.is_active && (
        <Badge type="pill-color" size="sm" color="warning">
          {t('Inactive')}
        </Badge>
      )}
    </div>
  );
}

/** Picks metas the role has nothing on yet, and what it may do with all of them. */
function AddMetasModal({
  metas,
  granted,
  onClose,
  onAdd,
  busy,
  error,
}: {
  metas: RoleMeta[];
  granted: Set<number>;
  onClose: () => void;
  onAdd: (rows: Parameters<typeof accessApi.setRoleMetas>[1]) => void;
  busy: boolean;
  error: string | null;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const [tree, setTree] = useState<MetaTreeData | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [abilities, setAbilities] = useState<Record<Ability, boolean>>({ view: true, create: false, edit: false, delete: false });

  useEffect(() => {
    accessApi.metaTree().then(setTree, (err) => setTreeError(message(err, t('The metas could not be loaded.'))));
  }, []);

  function tick(a: Ability, on: boolean) {
    const next = { ...abilities, [a]: on };
    if (on && a !== 'view') next.view = true;
    if (!on && a === 'view') for (const b of ABILITIES) next[b.key] = false;
    setAbilities(next);
  }

  return (
    <Modal size="lg" title={t('Add metas')} description={t('The metas people with this role may use, and what they may do with them. It can be changed per meta afterwards.')} onClose={onClose}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {treeError && <Alert>{treeError}</Alert>}
        {tree ? (
          <MetaTreePicker metas={metas} tree={tree} granted={granted} picked={picked} onChange={setPicked} />
        ) : (
          !treeError && <div className="h-72 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-secondary">{t('People with this role may')}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {ABILITIES.map((a) => (
              <Checkbox key={a.key} label={t(a.label)} isSelected={abilities[a.key]} onChange={(on) => tick(a.key, on)} />
            ))}
          </div>
        </fieldset>
        <div className="modal-footer flex justify-end gap-3 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            size="sm"
            isLoading={busy}
            showTextWhileLoading
            isDisabled={!picked.length || !abilities.view}
            onPress={() => onAdd(picked.map((id) => ({ meta_id: id, ...Object.fromEntries(ABILITIES.map((a) => [`can_${a.key}`, abilities[a.key]])) })))}
          >
            {picked.length ? t('Add {n} metas', { n: picked.length }) : t('Add metas')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

type StatusRow = { status_id: number; can_enter: boolean; can_see: boolean };
type StatusEdits = Record<number, { can_enter: boolean; can_see: boolean }>;

const statusHas = (s: RoleStatus) => s.can_enter || s.can_see;

/** The workflow statuses the role has permissions on: may it move records in, and see records in them. */
function StatusesTab({ ws, onSaved }: { ws: RoleWorkspace; onSaved: (ws: RoleWorkspace) => void }) {
  const [edits, setEdits] = useState<StatusEdits>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RoleStatus | null>(null);

  const workflows = ws.workflows.map((w) => ({ ...w, statuses: w.statuses.filter(statusHas) })).filter((w) => w.statuses.length);
  const listed = workflows.flatMap((w) => w.statuses);
  const changed = listed.filter((s) => edits[s.id] && (edits[s.id].can_enter !== s.can_enter || edits[s.id].can_see !== s.can_see));

  async function send(rows: StatusRow[], after: () => void) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await accessApi.setRoleStatuses(ws.role.id, rows));
      after();
    } catch (err) {
      setError(message(err, t('The permissions could not be saved.')));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    send(
      changed.map((s) => ({ status_id: s.id, ...edits[s.id] })),
      () => {
        setEdits({});
        setDone(true);
      },
    );

  return (
    <Card
      title={t('Workflow statuses')}
      description={t('A status nobody is ticked on is open to everyone. Ticking the first role on one closes it to every other role, for moving in or for seeing.')}
      actions={
        !ws.is_admin_role && (
          <Button size="sm" color="secondary" iconLeading={Plus} onPress={() => setAdding(true)}>
            {t('Add statuses')}
          </Button>
        )
      }
      footer={!ws.is_admin_role && listed.length > 0 && <SaveRow busy={busy} done={done} dirty={changed.length} error={error} onSave={save} />}
    >
      {ws.is_admin_role ? (
        adminNote
      ) : listed.length === 0 ? (
        <Empty text={t('This role has no status permissions, so it goes by the statuses open to everyone.')} />
      ) : (
        <div className="divide-y divide-secondary">
          {workflows.map((w) => (
            <div key={w.id} className="px-4 py-3 sm:px-5">
              <h3 className="mb-2 text-sm font-semibold text-primary">{w.name}</h3>
              <ul className="space-y-2">
                {w.statuses.map((s) => {
                  const now = edits[s.id] ?? { can_enter: s.can_enter, can_see: s.can_see };
                  return (
                    <li key={s.id} className={cx('flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md', edits[s.id] && 'bg-secondary_subtle')}>
                      <StatusName status={s} />
                      {STATUS_ABILITIES.map((a) => (
                        <Checkbox
                          key={a.key}
                          label={t(a.label)}
                          isSelected={now[`can_${a.key}`]}
                          onChange={(on) => {
                            setDone(false);
                            setEdits({ ...edits, [s.id]: { ...now, [`can_${a.key}`]: on } });
                          }}
                        />
                      ))}
                      <span className="ml-auto">
                        <IconAction icon={Trash01} danger label={t('Remove {name} from the role', { name: s.name })} onPress={() => setRemoving(s)} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddStatusesModal
          workflows={ws.workflows.map((w) => ({ ...w, statuses: w.statuses.filter((s) => !statusHas(s)) })).filter((w) => w.statuses.length)}
          onClose={() => setAdding(false)}
          onAdd={(rows) => send(rows, () => setAdding(false))}
          busy={busy}
          error={error}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={t('Remove {name}?', { name: removing.name })}
          message={t('People with this role lose what was ticked for it. If no other role is ticked on it, it opens to everyone again.')}
          confirmLabel={t('Remove')}
          busy={busy}
          onConfirm={() => send([{ status_id: removing.id, can_enter: false, can_see: false }], () => setRemoving(null))}
          onCancel={() => setRemoving(null)}
        />
      )}
    </Card>
  );
}

function StatusName({ status }: { status: RoleStatus }) {
  return (
    <span className="flex min-w-40 items-center gap-2 text-sm text-secondary">
      <span className="size-2.5 shrink-0 rounded-full bg-fg-quaternary" style={status.color ? { background: status.color } : undefined} aria-hidden="true" />
      {status.name}
    </span>
  );
}

/** Picks statuses the role has nothing on yet, and what it may do in all of them. */
function AddStatusesModal({
  workflows,
  onClose,
  onAdd,
  busy,
  error,
}: {
  workflows: RoleWorkspace['workflows'];
  onClose: () => void;
  onAdd: (rows: StatusRow[]) => void;
  busy: boolean;
  error: string | null;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const [abilities, setAbilities] = useState({ can_enter: true, can_see: true });
  const toggle = (id: number, on: boolean) => setPicked((list) => (on ? [...list, id] : list.filter((x) => x !== id)));
  // Ticking the first role of a kind on a status closes it to everyone else.
  const closing = workflows
    .flatMap((w) => w.statuses)
    .filter((s) => picked.includes(s.id) && ((abilities.can_enter && s.enter_open) || (abilities.can_see && s.see_open)));

  return (
    <Modal title={t('Add statuses')} description={t('The statuses people with this role may move records into, or see records in.')} onClose={onClose}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {workflows.length === 0 ? (
          <p className="text-sm text-tertiary">{t('This role is already on every status.')}</p>
        ) : (
          <div className="max-h-72 space-y-3 overflow-auto rounded-lg p-3 ring-1 ring-secondary">
            {workflows.map((w) => (
              <fieldset key={w.id}>
                <legend className="mb-1.5 text-sm font-semibold text-primary">{w.name}</legend>
                <div className="space-y-1.5">
                  {w.statuses.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <Checkbox aria-label={s.name} isSelected={picked.includes(s.id)} onChange={(on) => toggle(s.id, on)} />
                      <StatusName status={s} />
                      {(s.enter_open || s.see_open) && (
                        <Badge type="pill-color" size="sm" color="gray">
                          {t('open to all')}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-secondary">{t('People with this role may')}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {STATUS_ABILITIES.map((a) => (
              <Checkbox key={a.key} label={t(a.label)} isSelected={abilities[`can_${a.key}`]} onChange={(on) => setAbilities({ ...abilities, [`can_${a.key}`]: on })} />
            ))}
          </div>
        </fieldset>
        {closing.length > 0 && (
          <Alert>{t('{names} will close to every other role for what is ticked here, as no role is ticked on them yet.', { names: closing.map((s) => s.name).join(', ') })}</Alert>
        )}
        <div className="modal-footer flex justify-end gap-3 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            size="sm"
            isLoading={busy}
            showTextWhileLoading
            isDisabled={!picked.length || (!abilities.can_enter && !abilities.can_see)}
            onPress={() => onAdd(picked.map((id) => ({ status_id: id, ...abilities })))}
          >
            {picked.length ? t('Add {n} statuses', { n: picked.length }) : t('Add statuses')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm text-tertiary sm:px-5">{text}</p>;
}

/** The abilities a log entry gave (+) and took (−). */
function abilityDiff(before: Record<string, boolean>, after: Record<string, boolean>, labels: Record<string, string>) {
  return Object.keys(after)
    .filter((k) => before[k] !== after[k])
    .map((k) => `${after[k] ? '+' : '−'}${t(labels[k] ?? k)}`)
    .join(' ');
}

const META_LABELS = Object.fromEntries(ABILITIES.map((a) => [a.key, a.label]));
const STATUS_LABELS = Object.fromEntries(STATUS_ABILITIES.map((a) => [a.key, a.label]));
const FIELD_LABELS: Record<string, string> = { code: 'Code', name: 'Name', description: 'Description' };

function LogTab({ roleId }: { roleId: number }) {
  const [entries, setEntries] = useState<RoleLogEntry[] | null>(null);
  const [page, setPage] = useState({ current: 0, last: 1 });
  const [error, setError] = useState<string | null>(null);

  const more = useCallback(
    (next: number) =>
      accessApi.roleLog(roleId, next).then(
        (r) => {
          setEntries((list) => [...(next === 1 ? [] : (list ?? [])), ...r.data]);
          setPage({ current: r.current_page, last: r.last_page });
        },
        (err) => setError(message(err, t('The log could not be loaded.'))),
      ),
    [roleId],
  );
  useEffect(() => {
    more(1);
  }, [more]);

  return (
    <Card title={t('Log')} description={t('Every change to this role, wherever it was made: here, on a person, or in a meta’s permissions.')}>
      {error && (
        <div className="p-4 sm:px-5">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul className="divide-y divide-secondary">
        {entries?.map((e) => (
          <li key={e.id} className="px-4 py-3 sm:px-5">
            <p className="text-xs text-tertiary">
              {when(e.created_at)} · {e.user_name ?? t('someone')}
            </p>
            <div className="mt-1 space-y-0.5 text-sm text-secondary">
              {e.action === 'role' &&
                Object.entries(e.changes).map(([field, [from, to]]) => (
                  <p key={field}>{t('{field}: {from} → {to}', { field: t(FIELD_LABELS[field] ?? field), from: from || '—', to: to || '—' })}</p>
                ))}
              {e.action === 'users' && (
                <>
                  {e.changes.added.length > 0 && <p>{t('Given to {names}', { names: e.changes.added.map((u) => u.name ?? `#${u.id}`).join(', ') })}</p>}
                  {e.changes.removed.length > 0 && <p>{t('Taken from {names}', { names: e.changes.removed.map((u) => u.name ?? `#${u.id}`).join(', ') })}</p>}
                </>
              )}
              {e.action === 'metas' &&
                e.changes.map((c) => (
                  <p key={c.meta_id}>
                    <span className="font-medium text-primary">{c.name ?? c.code ?? `#${c.meta_id}`}</span> {abilityDiff(c.before, c.after, META_LABELS)}
                  </p>
                ))}
              {e.action === 'statuses' &&
                e.changes.map((c) => (
                  <p key={c.status_id}>
                    <span className="font-medium text-primary">
                      {c.workflow ? `${c.workflow} · ` : ''}
                      {c.name ?? `#${c.status_id}`}
                    </span>{' '}
                    {abilityDiff(c.before, c.after, STATUS_LABELS)}
                  </p>
                ))}
            </div>
          </li>
        ))}
        {entries?.length === 0 && <li className="px-4 py-6 text-center text-sm text-tertiary sm:px-5">{t('Nothing has changed yet.')}</li>}
      </ul>
      {page.current < page.last && (
        <div className="border-t border-secondary px-4 py-3 text-center sm:px-5">
          <Button size="sm" color="secondary" onPress={() => more(page.current + 1)}>
            {t('Load more')}
          </Button>
        </div>
      )}
    </Card>
  );
}

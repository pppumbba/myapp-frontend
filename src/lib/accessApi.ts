import { api } from './api';

export type Ability = 'view' | 'create' | 'edit' | 'delete';

export interface Role {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  users_count?: number;
}

/**
 * What the signed-in user may do. metas lists only metas with permission rows; any meta
 * not in it is closed. An admin may do everything.
 */
export interface Access {
  is_admin: boolean;
  roles: Role[];
  metas: Record<string, Record<Ability, boolean>>;
}

export interface UserWithRoles {
  id: number;
  name: string;
  email: string;
  roles: Role[];
}

/** One role's abilities on one meta. */
export interface MetaPermission {
  role_id: number;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

/** One role on one workflow status: may move records into it, may see records in it. */
export interface StatusPermission {
  status_id: number;
  role_id: number;
  can_enter: boolean;
  can_see: boolean;
}

export interface AppNotification {
  id: number;
  /** info, success, alert or danger. */
  type: string;
  title: string;
  body: string | null;
  /** An app path such as /run/12?record=5. */
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPage {
  data: AppNotification[];
  current_page: number;
  last_page: number;
  total: number;
  unread: number;
}

type Abilities = Record<`can_${Ability}`, boolean>;

/** A meta as seen from one role: what the role may do with it. */
export type RoleMeta = Abilities & {
  id: number;
  code: string;
  name: string;
  type: { code: string; name: string } | null;
  is_active: boolean;
  is_public: boolean;
  /** Some role has permissions on it; without any it is for admins only (unless public). */
  guarded: boolean;
};

/** A workflow status as seen from one role. *_open: no role has rows of that kind, so it is open to everyone. */
export interface RoleStatus {
  id: number;
  code: string;
  name: string;
  color: string | null;
  enter_open: boolean;
  see_open: boolean;
  can_enter: boolean;
  can_see: boolean;
}

/** One role on one screen (backend: RoleWorkspaceController). */
export interface RoleWorkspace {
  role: Role;
  is_admin_role: boolean;
  users: { id: number; name: string; email: string }[];
  metas: RoleMeta[];
  workflows: { id: number; code: string; name: string; statuses: RoleStatus[] }[];
}

/** An app's menu item: a screen (meta_id) or a group of items. */
export interface MetaMenuItem {
  label: string;
  meta_id: number | null;
  children: MetaMenuItem[];
}

/** Metas as parents and children (backend: MetaTree): what each uses, and each app's menu. */
export interface MetaTreeData {
  children: Record<string, number[]>;
  menus: Record<string, MetaMenuItem[]>;
}

type AbilityChange = { before: Record<string, boolean>; after: Record<string, boolean> };

/** One save that changed a role, wherever it was made. */
export type RoleLogEntry = { id: number; created_at: string; user_id: number | null; user_name: string | null } & (
  | { action: 'role'; changes: Record<string, [string | null, string | null]> }
  | { action: 'users'; changes: { added: { id: number; name: string | null }[]; removed: { id: number; name: string | null }[] } }
  | { action: 'metas'; changes: ({ meta_id: number; code: string | null; name: string | null } & AbilityChange)[] }
  | { action: 'statuses'; changes: ({ status_id: number; name: string | null; workflow: string | null } & AbilityChange)[] }
);

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

/** Roles, permissions and notifications (backend: AccessController and friends). */
export const accessApi = {
  mine: () => api<Access>('/user/access'),

  notifications: (page = 1, unread = false) => api<NotificationPage>(`/notifications?page=${page}${unread ? '&unread=1' : ''}`),
  read: (id: number) => api<AppNotification>(`/notifications/${id}/read`, { method: 'POST' }),
  readAll: () => api<{ unread: number }>('/notifications/read-all', { method: 'POST' }),
  removeNotification: (id: number) => api<null>(`/notifications/${id}`, { method: 'DELETE' }),

  roles: () => api<Role[]>('/roles'),
  createRole: (input: Partial<Role>) => api<Role>('/roles', json('POST', input)),
  updateRole: (id: number, input: Partial<Role>) => api<Role>(`/roles/${id}`, json('PUT', input)),
  removeRole: (id: number) => api<null>(`/roles/${id}`, { method: 'DELETE' }),

  users: (search = '') => api<{ data: UserWithRoles[] }>(`/users?search=${encodeURIComponent(search)}`),
  setUserRoles: (id: number, roleIds: number[]) => api<UserWithRoles>(`/users/${id}/roles`, json('PUT', { role_ids: roleIds })),

  workspace: (roleId: number) => api<RoleWorkspace>(`/roles/${roleId}/workspace`),
  setRoleUsers: (roleId: number, userIds: number[]) => api<RoleWorkspace['users']>(`/roles/${roleId}/users`, json('PUT', { user_ids: userIds })),
  /** Only the metas sent change; a row with nothing ticked is removed. */
  setRoleMetas: (roleId: number, rows: (Partial<Abilities> & { meta_id: number })[]) => api<RoleWorkspace>(`/roles/${roleId}/metas`, json('PUT', { rows })),
  setRoleStatuses: (roleId: number, rows: { status_id: number; can_enter: boolean; can_see: boolean }[]) =>
    api<RoleWorkspace>(`/roles/${roleId}/statuses`, json('PUT', { rows })),
  metaTree: () => api<MetaTreeData>('/meta-tree'),
  roleLog: (roleId: number, page = 1) => api<{ data: RoleLogEntry[]; current_page: number; last_page: number }>(`/roles/${roleId}/log?page=${page}`),

  metaPermissions: (metaId: number) => api<MetaPermission[]>(`/metas/${metaId}/permissions`),
  saveMetaPermissions: (metaId: number, rows: MetaPermission[]) => api<MetaPermission[]>(`/metas/${metaId}/permissions`, json('PUT', { rows })),
  statusPermissions: (workflowId: number) => api<StatusPermission[]>(`/workflows/${workflowId}/permissions`),
  saveStatusPermissions: (workflowId: number, rows: StatusPermission[]) =>
    api<StatusPermission[]>(`/workflows/${workflowId}/permissions`, json('PUT', { rows })),
};

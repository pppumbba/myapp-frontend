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
 * not in it is open. An admin may do everything.
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

  metaPermissions: (metaId: number) => api<MetaPermission[]>(`/metas/${metaId}/permissions`),
  saveMetaPermissions: (metaId: number, rows: MetaPermission[]) => api<MetaPermission[]>(`/metas/${metaId}/permissions`, json('PUT', { rows })),
  statusPermissions: (workflowId: number) => api<StatusPermission[]>(`/workflows/${workflowId}/permissions`),
  saveStatusPermissions: (workflowId: number, rows: StatusPermission[]) =>
    api<StatusPermission[]>(`/workflows/${workflowId}/permissions`, json('PUT', { rows })),
};

import { api } from './api';

/** A customer: one company's own metas and data, in a schema of its own. */
export interface Customer {
  id: number;
  code: string;
  name: string;
}

/** One of the signed-in person's customers. */
export interface MyCustomer extends Customer {
  is_admin: boolean;
}

/** The answer when a customer is opened: it, and a token that works in it (the old one is gone). */
export interface OpenedCustomer {
  customer: Customer;
  token: string;
}

export interface CustomerInvite {
  id: number;
  code: string;
  roles: { id: number; name: string }[];
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  revoked_at: string | null;
  created_by_name: string | null;
}

export interface InviteInput {
  role_ids: number[];
  expires_at?: string | null;
  max_uses?: number | null;
}

export interface PlatformCustomer extends Customer {
  members: number;
  created_at: string | null;
}

const json = (body: unknown) => JSON.stringify(body);

export const customerApi = {
  /** Makes a new, empty customer with the person as its admin, and opens it. */
  create: (name: string) => api<OpenedCustomer>('/customers', { method: 'POST', body: json({ name }) }),
  /** Joins the customer an invite code belongs to, with the code's roles, and opens it. */
  join: (code: string) => api<OpenedCustomer>('/customers/join', { method: 'POST', body: json({ code }) }),
  /** Works in another of the person's customers. */
  open: (id: number) => api<OpenedCustomer>(`/customers/${id}/use`, { method: 'POST', notify: false }),
  mine: () => api<MyCustomer[]>('/me/customers'),
  leave: (id: number) => api<{ customers: MyCustomer[] }>(`/me/customers/${id}`, { method: 'DELETE' }),
  /** An admin takes someone out of the current customer. */
  removeMember: (userId: number) => api<{ message: string }>(`/customer/members/${userId}`, { method: 'DELETE' }),
  invites: () => api<CustomerInvite[]>('/customer/invites'),
  createInvite: (input: InviteInput) => api<CustomerInvite>('/customer/invites', { method: 'POST', body: json(input) }),
  revokeInvite: (id: number) => api<CustomerInvite>(`/customer/invites/${id}/revoke`, { method: 'POST' }),
  /** Every customer on the platform: for platform owners only. */
  platform: () => api<PlatformCustomer[]>('/platform/customers'),
};

/** Where guests open a customer's public page: /c/{code}/… */
export const publicPath = (customer: Customer | null | undefined, path: string) => (customer ? `/c/${encodeURIComponent(customer.code)}${path}` : path);

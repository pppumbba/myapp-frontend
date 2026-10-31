import { api, downloadFile } from './api';

/** A company on the market, as ХУР describes it. */
export interface MarketCompany {
  id: number;
  name: string;
  registry_number: string;
  status: 'active' | 'liquidated';
  /** ХУР says it is gone: no one can act for it. */
  frozen: boolean;
}

export interface Rights {
  can_bid: boolean;
  can_sign: boolean;
  can_manage: boolean;
}

export interface Membership extends Rights {
  company: MarketCompany;
}

export type RepresentationMethod = 'director' | 'attorney';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface MyRequest {
  id: number;
  company: { id: number; name: string };
  method: RepresentationMethod;
  status: RequestStatus;
  reason: string | null;
  created_at: string;
}

/** What the market knows about the signed-in user. */
export interface MarketMe {
  verified: { name: string; registry_number: string; verified_at: string } | null;
  memberships: Membership[];
  requests: MyRequest[];
}

export interface Member extends Rights {
  id: number;
  user: { id: number; verified_name: string | null };
}

export interface Approval {
  company: { name: string; registry_number: string };
  requester: { verified_name: string | null };
  method: RepresentationMethod;
  created_at: string;
}

/** A power of attorney request in the staff queue. */
export interface Review {
  id: number;
  company: { id: number; name: string; registry_number: string };
  user: { id: number; name: string; verified_name: string | null; registry_number: string | null };
  method: RepresentationMethod;
  status: RequestStatus;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  file: { name: string; size: number } | null;
}

export interface ReviewPage {
  data: Review[];
  current_page: number;
  last_page: number;
  total: number;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const marketApi = {
  me: () => api<MarketMe>('/market/me'),
  startDan: () => api<{ url: string }>('/market/dan/start', json('POST')),
  registerCompany: (registry_number: string) =>
    api<{ company: MarketCompany; member: (Rights & { id: number }) | null }>('/market/companies', json('POST', { registry_number })),
  requestRepresentation: (companyId: number, method: RepresentationMethod, file?: File) => {
    const body = new FormData();
    body.append('method', method);
    if (file) body.append('file', file);
    return api<{ request: { id: number }; approve_url: string | null }>(`/market/companies/${companyId}/representations`, { method: 'POST', body });
  },
  approval: (token: string) => api<Approval>(`/market/approvals/${token}`),
  decideApproval: (token: string, decision: 'approve' | 'reject') => api(`/market/approvals/${token}`, json('POST', { decision })),
  members: (companyId: number) => api<Member[]>(`/market/companies/${companyId}/members`),
  updateMember: (companyId: number, memberId: number, rights: Rights) => api(`/market/companies/${companyId}/members/${memberId}`, json('PATCH', rights)),
  removeMember: (companyId: number, memberId: number) => api(`/market/companies/${companyId}/members/${memberId}`, json('DELETE')),
  invite: (companyId: number, rights: Rights) => api<{ url: string }>(`/market/companies/${companyId}/invites`, json('POST', rights)),
  acceptInvite: (token: string) => api(`/market/invites/${token}/accept`, json('POST')),
  reviews: (status: RequestStatus, page = 1) => api<ReviewPage>(`/market/reviews?status=${status}&page=${page}`),
  downloadReviewFile: (review: Review) => downloadFile(`/market/reviews/${review.id}/file`, review.file?.name ?? 'attorney'),
  decideReview: (id: number, decision: 'approve' | 'reject', reason?: string) => api(`/market/reviews/${id}/decide`, json('POST', { decision, reason })),
};

// ---------------------------------------------------------------- contracts, payments, fees

export type ContractStatus = 'draft' | 'signing' | 'awaiting_payment' | 'active' | 'in_progress' | 'delivered' | 'completed' | 'cancelled';
export type Middleman = 'off' | 'on' | 'escrow';
export type Side = 'buyer' | 'vendor';

export interface Party {
  type: 'company' | 'person';
  id: number;
  name: string | null;
  registry_number: string | null;
  rating: { average: number | null; count: number };
}

export interface MarketPayment {
  id: number;
  kind: 'posting' | 'bidding' | 'contract' | 'middleman' | 'escrow' | 'security';
  amount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  qr_text: string | null;
  qr_image: string | null;
  pay_url: string | null;
  receipt_number: string | null;
  paid_at: string | null;
  created_at: string;
  /** A bid's payment points at its tender: bids have no page of their own. */
  subject: { type: 'contract' | 'tender' | 'bid'; id: number; number: string; title: string } | null;
}

export interface ContractStep {
  id: number;
  label: string;
  percent: number;
  amount: number;
  status: 'pending' | 'funded' | 'requested' | 'released' | 'refunded' | 'frozen';
  requested_at: string | null;
  auto_release_at: string | null;
  released_at: string | null;
  note: string | null;
  payment: MarketPayment | null;
  can: { fund: boolean; request: boolean; release: boolean; reject: boolean };
}

export interface ContractItem {
  id?: number;
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  amount?: number;
}

export interface Contract {
  id: number;
  number: string;
  title: string;
  source: string;
  status: ContractStatus;
  version: number;
  side: Side | null;
  buyer: Party;
  vendor: Party;
  items: ContractItem[];
  subtotal: number;
  discount: number;
  total: number;
  delivery_date: string | null;
  payment_terms: string | null;
  pledge: string | null;
  pledge_amount: number | null;
  middleman: Middleman;
  steps: ContractStep[];
  signatures: { side: Side; verified_name: string; signed_at: string }[];
  fees: { contract: number; middleman: number; total: number };
  payment: MarketPayment | null;
  events: { type: string; by: string | null; from: string | null; to: string | null; note: string | null; at: string }[];
  disputes: { id: number; side: Side; reason: string; status: 'open' | 'decided'; resolution: string | null; decision: string | null; created_at: string; decided_at: string | null }[];
  ratings: { side: Side; stars: number; comment: string | null; created_at: string }[];
  has_pdf: boolean;
  signed_at: string | null;
  completed_at: string | null;
  can: { edit: boolean; cancel: boolean; sign: boolean; start: boolean; deliver: boolean; confirm: boolean; rate: boolean; dispute: boolean };
}

export interface ContractSummary {
  id: number;
  number: string;
  title: string;
  status: ContractStatus;
  side: Side | null;
  other: Party | null;
  total: number;
  updated_at: string;
}

/** The terms either side writes. */
export interface ContractTerms {
  title: string;
  items: ContractItem[];
  discount: number;
  delivery_date: string | null;
  payment_terms: string | null;
  pledge: string | null;
  pledge_amount: number | null;
  middleman: Middleman;
  steps: { label: string; percent: number }[];
}

export interface Page<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

export interface Fee {
  kind: 'posting' | 'bidding' | 'contract' | 'middleman';
  mode: 'fixed' | 'percent';
  amount: number;
}

export interface Dispute {
  id: number;
  side: Side;
  opened_by: string;
  reason: string;
  status: 'open' | 'decided';
  resolution: 'release' | 'refund' | 'continue' | null;
  decision: string | null;
  created_at: string;
  decided_at: string | null;
  contract: Contract;
}

export type ContractAction = 'start' | 'deliver' | 'confirm' | 'reject' | 'rate' | 'cancel';
export type StepAction = 'request' | 'release' | 'reject-release';

export const contractApi = {
  list: (page = 1) => api<Page<ContractSummary>>(`/market/contracts?page=${page}`),
  get: (id: number) => api<Contract>(`/market/contracts/${id}`),
  create: (body: ContractTerms & { buyer_company_id: number | null; vendor_registry_number: string }) =>
    api<Contract>('/market/contracts', json('POST', body)),
  update: (id: number, body: Partial<ContractTerms>) => api<Contract>(`/market/contracts/${id}`, json('PUT', body)),
  act: (id: number, action: ContractAction, body: Record<string, unknown> = {}) => api<Contract>(`/market/contracts/${id}/${action}`, json('POST', body)),
  sign: (id: number) => api<{ url: string }>(`/market/contracts/${id}/sign`, json('POST')),
  pdf: (contract: Contract) => downloadFile(`/market/contracts/${contract.id}/pdf`, `${contract.number}.pdf`),
  dispute: (id: number, reason: string) => api<Contract>(`/market/contracts/${id}/disputes`, json('POST', { reason })),
  fundStep: (stepId: number) => api<MarketPayment>(`/market/contract-steps/${stepId}/fund`, json('POST')),
  step: (stepId: number, action: StepAction, body: Record<string, unknown> = {}) => api<Contract>(`/market/contract-steps/${stepId}/${action}`, json('POST', body)),
};

export const paymentApi = {
  list: (page = 1) => api<Page<MarketPayment>>(`/market/payments?page=${page}`),
  /** Asks the provider again, then returns the payment. */
  check: (id: number) => api<MarketPayment>(`/market/payments/${id}`),
  receipt: (p: MarketPayment) => downloadFile(`/market/payments/${p.id}/receipt`, `${p.receipt_number ?? 'receipt'}.pdf`),
  fees: () => api<Fee[]>('/market/fees'),
  saveFees: (fees: Fee[]) => api<Fee[]>('/market/fees', json('PUT', { fees })),
  disputes: (status: 'open' | 'decided', page = 1) => api<Page<Dispute>>(`/market/disputes?status=${status}&page=${page}`),
  decide: (id: number, resolution: 'release' | 'refund' | 'continue', decision: string) =>
    api(`/market/disputes/${id}/decide`, json('POST', { resolution, decision })),
};

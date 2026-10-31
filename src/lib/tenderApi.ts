import { api, downloadFile } from './api';
import type { MarketPayment, Page } from './marketApi';

export type TenderType = 'goods' | 'services' | 'works';
export type TenderStatus = 'draft' | 'open' | 'closed' | 'evaluating' | 'negotiating' | 'awarded' | 'contracted' | 'cancelled';
export type Award = 'lowest_price' | 'fastest' | 'highest_quality' | 'best_value';
export type Split = 'none' | 'item' | 'quantity';
export type Claim = 'meets' | 'exceeds' | 'fails';
export type Operator = 'gte' | 'lte' | 'eq';
export type BidStatus = 'draft' | 'pending_fee' | 'submitted' | 'withdrawn' | 'superseded' | 'ruled_out';

/** How the tender is run: what wins, what bidders see, and what the poster asks of them. */
export interface TenderRule {
  award: Award;
  weights: { price: number; lead: number; quality: number };
  visibility: 'sealed' | 'open';
  partial: boolean;
  split: Split;
  irrevocable: boolean;
  valid_until: string | null;
  security: number;
  procedure: 'single' | 'negotiated';
  prequalification: boolean;
  middleman: 'off' | 'on' | 'escrow';
}

export interface SpecInput {
  label: string;
  kind: 'text' | 'number';
  operator: Operator | null;
  value: string | null;
  unit: string | null;
  must: boolean;
}

export interface ItemInput {
  name: string;
  quantity: number | null;
  unit: string | null;
  category_id: number | null;
  description: string | null;
  budget: number | null;
  show_budget: boolean;
  specs: SpecInput[];
}

/** What a poster writes; the server fills the rest of the rule with defaults. */
export interface TenderInput {
  title: string;
  type: TenderType;
  description: string | null;
  company_id?: number | null;
  category_id: number | null;
  incoterm: string | null;
  starts_at: string;
  closes_at: string;
  rule: Partial<TenderRule>;
  items: ItemInput[];
}

export interface FileRef {
  id: number;
  name: string;
  size: number;
}

export interface Party {
  type: 'company' | 'person';
  id: number;
  name: string | null;
  registry_number: string | null;
}

export interface TenderItem extends Omit<ItemInput, 'specs'> {
  id: number;
  /** With open visibility: the lowest price offered so far, without who offered it. */
  best: number | null;
  specs: (SpecInput & { id: number })[];
  files: FileRef[];
}

export interface Tender {
  id: number;
  code: string;
  title: string;
  type: TenderType;
  description: string | null;
  status: TenderStatus;
  organizer: Party;
  category: { id: number; name: string } | null;
  incoterm: string | null;
  starts_at: string;
  closes_at: string;
  final_round_closes_at: string | null;
  round: number;
  rule: TenderRule;
  role: 'poster' | 'bidder' | 'visitor';
  bid_count: number | null;
  my_application: { id: number; status: 'pending' | 'approved' | 'refused'; reason: string | null; company_id: number | null } | null;
  my_bid: { id: number; status: BidStatus; total: number; round: number; submitted_at: string | null; shortlisted: boolean } | null;
  items: TenderItem[];
  files: FileRef[];
  cancel_reason: string | null;
  published_at: string | null;
  can: { edit: boolean; publish: boolean; cancel: boolean };
  awards?: AwardRow[];
}

export interface TenderSummary {
  id: number;
  code: string;
  title: string;
  type: TenderType;
  status: TenderStatus;
  organizer: Party;
  category: string | null;
  items_count: number;
  visibility: 'sealed' | 'open';
  closes_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  followed: boolean;
  specs: { label: string; kind: 'text' | 'number'; operator: Operator | null; value: string | null; unit: string | null; must: boolean }[];
}

export interface Application {
  id: number;
  status: 'pending' | 'approved' | 'refused';
  party: Party;
  note: string | null;
  reason: string | null;
  files: FileRef[];
  created_at: string;
  decided_at: string | null;
}

export interface BidLineInput {
  item_id: number;
  price: number;
  quantity?: number | null;
  lead_time_days?: number | null;
}

export interface BidSpecInput {
  spec_id: number;
  value: string | null;
  claim: Claim;
}

export interface BidInput {
  company_id?: number | null;
  lead_time_days: number | null;
  lines: BidLineInput[];
  specs: BidSpecInput[];
}

export interface Bid {
  id: number;
  tender_id: number;
  status: BidStatus;
  round: number;
  party: 'company' | 'person';
  company: { id: number; name: string; registry_number: string } | null;
  person: { id: number; name: string | null } | null;
  total: number;
  lead_time_days: number | null;
  valid_until: string | null;
  quality_score: number | null;
  ruled_out_reason: string | null;
  submitted_at: string | null;
  lines: { item_id: number; name: string | null; price: number; quantity: number; lead_time_days: number | null; amount: number }[];
  specs: { spec_id: number; label: string | null; required: string | null; must: boolean; value: string | null; claim: Claim; bidder_claim: Claim; override_note: string | null; file: { id: number; name: string } | null }[];
  payments: MarketPayment[];
}

export interface BidSummary {
  id: number;
  status: BidStatus;
  total: number;
  round: number;
  company: string | null;
  submitted_at: string | null;
  tender: { id: number; code: string; title: string; status: TenderStatus; closes_at: string };
}

export interface EvaluationRow {
  id: number;
  party: Party;
  total: number;
  lead_time_days: number;
  quality_score: number;
  failed_musts: string[];
  overturned: boolean;
  compliant: boolean;
  in: boolean;
  shortlisted: boolean;
  rank: number | null;
  score: number;
  scores: { price: number; lead: number; quality: number };
  lines: { item_id: number; price: number; quantity: number; amount: number }[];
  specs: { id: number; spec_id: number; label: string | null; required: string | null; must: boolean; value: string | null; bidder_claim: Claim; claim: Claim; override_note: string | null; overridden: boolean; file_id: number | null }[];
}

export interface EvaluationResult {
  rule: TenderRule;
  bids: EvaluationRow[];
  items: { id: number; name: string; best_bid_id: number | null; best_price: number | null }[];
}

export interface AwardRow {
  bid_id: number;
  party: { type: 'company' | 'person'; name: string | null; registry_number: string | null };
  lines: { item_id: number; name: string | null; quantity: number; amount: number }[];
  total: number;
  contract: { id: number; number: string; status: string } | null;
}

export interface Message {
  id: number;
  side: 'poster' | 'bidder';
  body: string;
  user: string | null;
  created_at: string;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

const upload = (file: File, extra: Record<string, string> = {}) => {
  const form = new FormData();
  form.append('file', file);
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  return form;
};

export const tenderApi = {
  list: (filters: { q?: string; category_id?: number | null; type?: TenderType | '' }, page = 1) => {
    const params = new URLSearchParams({ page: String(page) });
    if (filters.q) params.set('q', filters.q);
    if (filters.category_id) params.set('category_id', String(filters.category_id));
    if (filters.type) params.set('type', filters.type);
    return api<Page<TenderSummary>>(`/market/tenders?${params}`);
  },
  mine: (page = 1) => api<Page<TenderSummary>>(`/market/tenders/mine?page=${page}`),
  get: (id: number) => api<Tender>(`/market/tenders/${id}`),
  create: (body: TenderInput) => api<Tender>('/market/tenders', json('POST', body)),
  update: (id: number, body: Partial<TenderInput>) => api<Tender>(`/market/tenders/${id}`, json('PUT', body)),
  publish: (id: number) => api<{ tender: Tender; payment: MarketPayment }>(`/market/tenders/${id}/publish`, json('POST')),
  cancel: (id: number, reason: string | null) => api<Tender>(`/market/tenders/${id}/cancel`, json('POST', { reason })),
  addFile: (id: number, file: File, itemId: number | null) =>
    api<FileRef>(`/market/tenders/${id}/files`, { method: 'POST', body: upload(file, itemId ? { item_id: String(itemId) } : {}) }),
  removeFile: (fileId: number) => api(`/market/tender-files/${fileId}`, { method: 'DELETE' }),
  download: (file: FileRef) => downloadFile(`/market/tender-files/${file.id}`, file.name),
  categories: () => api<Category[]>('/market/categories'),
  follow: (categoryId: number, on: boolean) => api(`/market/categories/${categoryId}/follow`, { method: on ? 'POST' : 'DELETE' }),

  applications: (id: number) => api<Application[]>(`/market/tenders/${id}/applications`),
  apply: (id: number, companyId: number | null, note: string, files: File[]) => {
    const form = new FormData();
    if (companyId) form.append('company_id', String(companyId));
    if (note) form.append('note', note);
    files.forEach((f) => form.append('files[]', f));
    return api<Application>(`/market/tenders/${id}/applications`, { method: 'POST', body: form });
  },
  decide: (applicationId: number, approve: boolean, reason: string | null) =>
    api<Application>(`/market/tender-applications/${applicationId}/decide`, json('POST', { approve, reason })),
  applicationFile: (applicationId: number, file: FileRef) => downloadFile(`/market/tender-applications/${applicationId}/files/${file.id}`, file.name),

  bid: (id: number, body: BidInput) => api<{ bid: Bid; payments: MarketPayment[] }>(`/market/tenders/${id}/bids`, json('POST', body)),
  myBids: (page = 1) => api<Page<BidSummary>>(`/market/bids?page=${page}`),
  getBid: (bidId: number) => api<Bid>(`/market/bids/${bidId}`),
  withdraw: (bidId: number) => api<Bid>(`/market/bids/${bidId}/withdraw`, json('POST')),
  revise: (bidId: number, body: Omit<BidInput, 'company_id'>) => api<Bid>(`/market/bids/${bidId}/revise`, json('POST', body)),
  bidFile: (bidId: number, file: { id: number; name: string }) => downloadFile(`/market/bids/${bidId}/files/${file.id}`, file.name),

  evaluation: (id: number) => api<EvaluationResult>(`/market/tenders/${id}/evaluation`),
  startEvaluation: (id: number) => api<Tender>(`/market/tenders/${id}/evaluation/start`, json('POST')),
  override: (bidSpecId: number, claim: Claim, note: string | null) => api<EvaluationResult>(`/market/bid-specs/${bidSpecId}/override`, json('POST', { claim, note })),
  overturn: (bidId: number, overturn: boolean, note: string | null) => api<EvaluationResult>(`/market/bids/${bidId}/overturn`, json('POST', { overturn, note })),
  shortlist: (id: number, bidIds: number[]) => api<Tender>(`/market/tenders/${id}/shortlist`, json('POST', { bid_ids: bidIds })),
  finalRound: (id: number, closesAt: string | null) => api<Tender>(`/market/tenders/${id}/final-round`, json('POST', { closes_at: closesAt })),
  finishNegotiation: (id: number) => api<Tender>(`/market/tenders/${id}/finish-negotiation`, json('POST')),
  messages: (bidId: number) => api<Message[]>(`/market/bids/${bidId}/messages`),
  send: (bidId: number, body: string) => api<Message>(`/market/bids/${bidId}/messages`, json('POST', { body })),
  award: (id: number, lines: { bid_id: number; item_id?: number; quantity?: number }[]) => api<Tender>(`/market/tenders/${id}/award`, json('POST', { lines })),
};

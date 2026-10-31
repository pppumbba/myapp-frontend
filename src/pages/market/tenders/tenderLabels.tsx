import { Badge } from '@/components/base/badges/badges';
import type { Award, BidStatus, Claim, Operator, Split, TenderStatus, TenderType } from '../../../lib/tenderApi';
import { t } from '@/i18n';

export const tenderStatusLabel = (s: TenderStatus) =>
  ({
    draft: t('Draft'),
    open: t('Open for bids'),
    closed: t('Closed'),
    evaluating: t('Evaluating'),
    negotiating: t('Negotiating'),
    awarded: t('Awarded'),
    contracted: t('Contracted'),
    cancelled: t('Cancelled'),
  })[s];

const tenderStatusColor = {
  draft: 'gray',
  open: 'success',
  closed: 'warning',
  evaluating: 'blue',
  negotiating: 'blue',
  awarded: 'brand',
  contracted: 'brand',
  cancelled: 'gray',
} as const;

export function TenderStatusBadge({ status }: { status: TenderStatus }) {
  return (
    <Badge size="sm" type="pill-color" color={tenderStatusColor[status]}>
      {tenderStatusLabel(status)}
    </Badge>
  );
}

export const bidStatusLabel = (s: BidStatus) =>
  ({
    draft: t('Draft'),
    pending_fee: t('Fee due'),
    submitted: t('Sent'),
    withdrawn: t('Withdrawn'),
    superseded: t('Replaced'),
    ruled_out: t('Ruled out'),
  })[s];

const bidStatusColor = { draft: 'gray', pending_fee: 'warning', submitted: 'success', withdrawn: 'gray', superseded: 'gray', ruled_out: 'error' } as const;

export function BidStatusBadge({ status }: { status: BidStatus }) {
  return (
    <Badge size="sm" type="pill-color" color={bidStatusColor[status]}>
      {bidStatusLabel(status)}
    </Badge>
  );
}

export const typeLabel = (k: TenderType) => ({ goods: t('Goods'), services: t('Services'), works: t('Works') })[k];

export const awardLabel = (a: Award) =>
  ({ lowest_price: t('Lowest price'), fastest: t('Fastest delivery'), highest_quality: t('Highest quality'), best_value: t('Best value') })[a];

export const splitLabel = (s: Split) =>
  ({ none: t('One winner for everything'), item: t('A winner per item'), quantity: t('Split quantities between bidders') })[s];

export const claimLabel = (c: Claim) => ({ meets: t('Meets'), exceeds: t('Exceeds'), fails: t('Does not meet') })[c];

export const operatorSign = (o: Operator | null) => (o ? { gte: '≥', lte: '≤', eq: '=' }[o] : '');

/** A spec as one line: "Memory ≥ 8 GB". */
export const specText = (s: { label: string; operator: Operator | null; value: string | null; unit: string | null }) =>
  [s.label, s.operator ? operatorSign(s.operator) : s.value ? ':' : '', s.value ?? '', s.unit ?? ''].filter(Boolean).join(' ').replace(' :', ':');

/** A tender timeline event, in words. */
export const tenderEventLabel = (type: string) =>
  ({
    created: t('Drafted'),
    edited: t('Changed'),
    published: t('Published'),
    cancelled: t('Cancelled'),
    applied: t('Application received'),
    application_approved: t('Application approved'),
    application_refused: t('Application refused'),
    bid_sent: t('Bid sent'),
    bid_withdrawn: t('Bid withdrawn'),
    closed: t('Closed'),
    evaluation_started: t('Evaluation started'),
    claim_overridden: t('Claim corrected'),
    bid_overturned: t('Bid kept in'),
    shortlisted: t('Shortlist made'),
    bid_revised: t('Offer revised'),
    final_round: t('Final offers asked'),
    final_round_closed: t('Final round closed'),
    negotiation_finished: t('Negotiation finished'),
    awarded: t('Awarded'),
    contracted: t('Contracted'),
  })[type] ?? type;

/** A date and time in the user's way of writing them. */
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** "in 3 days", "in 5 hours", or "closed". */
export function closesIn(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t('closed');
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return t('in {n} days', { n: Math.floor(hours / 24) });
  if (hours >= 1) return t('in {n} hours', { n: hours });
  return t('in {n} minutes', { n: Math.max(1, Math.floor(ms / 60_000)) });
}

import { Badge } from '@/components/base/badges/badges';
import type { ContractStatus, ContractStep, MarketPayment, Middleman, Side } from '../../lib/marketApi';
import { t } from '@/i18n';

/** An amount in ₮, without needless decimals. */
export const money = (n: number) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n)}₮`;

export const statusLabel = (s: ContractStatus) =>
  ({
    draft: t('Draft'),
    signing: t('Being signed'),
    awaiting_payment: t('Fees due'),
    active: t('In force'),
    in_progress: t('In progress'),
    delivered: t('Delivered'),
    completed: t('Completed'),
    cancelled: t('Cancelled'),
  })[s];

const statusColor = {
  draft: 'gray',
  signing: 'blue',
  awaiting_payment: 'warning',
  active: 'brand',
  in_progress: 'brand',
  delivered: 'blue',
  completed: 'success',
  cancelled: 'gray',
} as const;

export function StatusBadge({ status }: { status: ContractStatus }) {
  return (
    <Badge size="sm" type="pill-color" color={statusColor[status]}>
      {statusLabel(status)}
    </Badge>
  );
}

export const sideLabel = (s: Side | null) => (s === 'buyer' ? t('Buyer') : s === 'vendor' ? t('Vendor') : '');

export const middlemanLabel = (m: Middleman) =>
  ({ off: t('No middleman'), on: t('Market as middleman'), escrow: t('Market as middleman, holding the money') })[m];

export const kindLabel = (k: MarketPayment['kind']) =>
  ({
    posting: t('Posting fee'),
    bidding: t('Bidding fee'),
    contract: t('Contract fee'),
    middleman: t('Middleman fee'),
    escrow: t('Payment held by the market'),
    security: t('Bid security'),
  })[k];

export const paymentStatusLabel = (s: MarketPayment['status']) =>
  ({ pending: t('Waiting'), paid: t('Paid'), cancelled: t('Cancelled'), refunded: t('Refunded') })[s];

export const stepStatusLabel = (s: ContractStep['status']) =>
  ({
    pending: t('Not paid in'),
    funded: t('Held by the market'),
    requested: t('Vendor asked for it'),
    released: t('Paid out'),
    refunded: t('Refunded'),
    frozen: t('Frozen by a dispute'),
  })[s];

/** A timeline event, in words. */
export const eventLabel = (type: string) =>
  ({
    created: t('Drafted'),
    edited: t('Terms changed'),
    signed: t('Signed'),
    cancelled: t('Cancelled'),
    fees_paid: t('Fees paid'),
    started: t('Work started'),
    delivered: t('Delivered'),
    rejected: t('Delivery not accepted'),
    completed: t('Completed'),
    step_funded: t('Payment held'),
    step_requested: t('Payment asked for'),
    step_refused: t('Payment not released'),
    step_released: t('Payment paid out'),
    dispute_opened: t('Dispute opened'),
    dispute_decided: t('Dispute decided'),
  })[type] ?? type;

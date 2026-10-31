import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download01, Edit01, Paperclip, Trash01, Upload01 } from '@untitledui/icons';
import { PageHeader } from '../../../components/AppShell';
import { Modal } from '../../../components/Modal';
import { Alert, IconAction } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { marketApi, type MarketMe, type MarketPayment } from '../../../lib/marketApi';
import { tenderApi, type Application, type FileRef, type Tender } from '../../../lib/tenderApi';
import { Button } from '@/components/base/buttons/button';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { middlemanLabel, money } from '../labels';
import { PayModal } from '../PayModal';
import { Card, Pulse, Success } from '../parts';
import { awardLabel, BidStatusBadge, closesIn, specText, splitLabel, TenderStatusBadge, typeLabel, when } from './tenderLabels';
import { BidderTalk, TenderWork } from './TenderWork';
import { t } from '@/i18n';

/**
 * One tender. Everyone signed in reads what is asked; the poster edits the draft, publishes,
 * adds documents, decides applications and (after the close) evaluates and awards; a bidder
 * applies, bids, pays and withdraws.
 */
export default function TenderPage() {
  const { id } = useParams();
  const tenderId = Number(id);
  const navigate = useNavigate();
  const [tender, setTender] = useState<Tender | null>(null);
  const [me, setMe] = useState<MarketMe | null>(null);
  const [paying, setPaying] = useState<MarketPayment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (err: unknown) => {
    setBusy(null);
    setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
  };

  const load = () => tenderApi.get(tenderId).then(setTender, fail);

  useEffect(() => {
    void load();
    marketApi.me().then(setMe, () => setMe(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId]);

  if (!tender) {
    return (
      <>
        <PageHeader title={t('Tender')} />
        {error ? <Alert>{error}</Alert> : <Pulse className="h-64" />}
      </>
    );
  }

  const poster = tender.role === 'poster';
  const rule = tender.rule;
  const open = tender.status === 'open' && new Date(tender.closes_at).getTime() > Date.now();
  const needsApproval = rule.prequalification && tender.my_application?.status !== 'approved';
  const canBid = !poster && open && !needsApproval && (!tender.my_bid || ['withdrawn', 'superseded'].includes(tender.my_bid.status));

  const publish = () => {
    setBusy('publish');
    setError(null);
    tenderApi.publish(tender.id).then(({ tender: tn, payment }) => {
      setBusy(null);
      setTender(tn);
      if (payment.status === 'pending') setPaying(payment);
      else void load();
    }, fail);
  };

  const payBid = () => {
    if (!tender.my_bid) return;
    setBusy('pay');
    tenderApi.getBid(tender.my_bid.id).then((bid) => {
      setBusy(null);
      if (bid.payments[0]) setPaying(bid.payments[0]);
      else void load();
    }, fail);
  };

  const withdraw = () => {
    if (!tender.my_bid) return;
    setBusy('withdraw');
    tenderApi.withdraw(tender.my_bid.id).then(() => {
      setBusy(null);
      setNotice(t('Your bid was withdrawn.'));
      void load();
    }, fail);
  };

  return (
    <>
      <PageHeader
        title={tender.title}
        subtitle={`${tender.code} · ${tender.organizer.name ?? '—'} · ${typeLabel(tender.type)}${tender.category ? ` · ${tender.category.name}` : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TenderStatusBadge status={tender.status} />
            {tender.can.edit && (
              <Button size="sm" color="secondary" iconLeading={Edit01} onPress={() => navigate(`/market/tenders/${tender.id}/edit`)}>
                {t('Edit')}
              </Button>
            )}
            {tender.can.publish && (
              <Button size="sm" isLoading={busy === 'publish'} onPress={publish}>
                {t('Publish')}
              </Button>
            )}
            {tender.can.cancel && (
              <Button size="sm" color="secondary-destructive" onPress={() => setCancelling(true)}>
                {t('Cancel the tender')}
              </Button>
            )}
            {canBid && (
              <Button size="sm" onPress={() => navigate(`/market/tenders/${tender.id}/bid`)}>
                {t('Bid')}
              </Button>
            )}
          </div>
        }
      />
      <div className="max-w-5xl space-y-5">
        {error && <Alert>{error}</Alert>}
        {notice && <Success>{notice}</Success>}
        {tender.status === 'cancelled' && <Alert>{t('This tender was cancelled.') + (tender.cancel_reason ? ` ${tender.cancel_reason}` : '')}</Alert>}

        <Card title={t('At a glance')}>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Fact label={t('Bids open')} value={when(tender.starts_at)} />
            <Fact label={t('Bids close')} value={`${when(tender.closes_at)}${tender.status === 'open' ? ` (${closesIn(tender.closes_at)})` : ''}`} />
            {tender.final_round_closes_at && <Fact label={t('Final offers due')} value={when(tender.final_round_closes_at)} />}
            <Fact label={t('The winner is')} value={awardLabel(rule.award) + (rule.award === 'best_value' ? ` (${rule.weights.price}/${rule.weights.lead}/${rule.weights.quality})` : '')} />
            <Fact label={t('Bids are')} value={rule.visibility === 'sealed' ? t('Sealed until the close') : t('Open: lowest prices shown')} />
            <Fact label={t('Winners')} value={splitLabel(rule.split)} />
            <Fact label={t('Procedure')} value={rule.procedure === 'negotiated' ? t('Negotiated') : t('One round')} />
            {rule.prequalification && <Fact label={t('Prequalification')} value={t('Approved bidders only')} />}
            {rule.security > 0 && <Fact label={t('Bid security')} value={money(rule.security)} />}
            <Fact label={t('Withdrawing')} value={rule.irrevocable ? t('Not while valid') : t('Allowed while open')} />
            {tender.incoterm && <Fact label={t('Incoterm')} value={tender.incoterm} />}
            <Fact label={t('Middleman')} value={middlemanLabel(rule.middleman)} />
            {poster && tender.bid_count !== null && <Fact label={t('Bids received')} value={String(tender.bid_count)} />}
          </dl>
          {tender.description && <p className="mt-4 text-sm whitespace-pre-line text-secondary">{tender.description}</p>}
        </Card>

        {!poster && (
          <BidderPanel
            tender={tender}
            me={me}
            busy={busy}
            onPay={payBid}
            onWithdraw={withdraw}
            onApplied={() => {
              setNotice(t('Your application was sent. The organizer will decide.'));
              void load();
            }}
            onError={fail}
          />
        )}

        {poster && rule.prequalification && tender.status !== 'draft' && <Applications tender={tender} onError={fail} />}

        {poster && !['draft', 'open', 'cancelled'].includes(tender.status) && <TenderWork tender={tender} onChange={setTender} onError={fail} />}

        <Card title={t('Items')}>
          <ul className="divide-y divide-secondary">
            {tender.items.map((it) => (
              <li key={it.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-primary">
                    {it.name}{' '}
                    <span className="font-normal text-tertiary">
                      · {it.quantity ?? 1} {it.unit ?? ''}
                    </span>
                  </p>
                  <p className="text-sm text-tertiary">
                    {it.budget !== null && t('Budget {amount}', { amount: money(it.budget) })}
                    {it.budget !== null && poster && !it.show_budget && ` (${t('hidden from bidders')})`}
                    {it.best !== null && ` · ${t('Lowest so far {price}', { price: money(it.best) })}`}
                  </p>
                </div>
                {it.description && <p className="text-sm text-secondary">{it.description}</p>}
                {it.specs.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {it.specs.map((s) => (
                      <li key={s.id} className={`rounded-md px-2 py-0.5 text-xs ring-1 ring-inset ${s.must ? 'font-semibold text-primary ring-primary' : 'text-tertiary ring-secondary'}`}>
                        {specText(s)}
                        {s.must && ` · ${t('must')}`}
                      </li>
                    ))}
                  </ul>
                )}
                <Files tender={tender} files={it.files} itemId={it.id} onChange={load} onError={fail} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title={t('Documents')}>
          <Files tender={tender} files={tender.files} itemId={null} onChange={load} onError={fail} />
          {tender.files.length === 0 && !(poster && ['draft', 'open'].includes(tender.status)) && <p className="text-sm text-tertiary">{t('No documents.')}</p>}
        </Card>
      </div>

      {paying && (
        <PayModal
          payment={paying}
          onClose={() => {
            setPaying(null);
            void load();
          }}
          onPaid={() => {
            setPaying(null);
            setNotice(paying.kind === 'posting' ? t('Paid. The tender is open for bids.') : t('Paid. Your bid is in.'));
            void load();
          }}
        />
      )}
      {cancelling && (
        <CancelModal
          tender={tender}
          onClose={() => setCancelling(false)}
          onDone={(tn) => {
            setCancelling(false);
            setTender(tn);
          }}
        />
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-tertiary">{label}</dt>
      <dd className="font-medium text-primary">{value}</dd>
    </div>
  );
}

/** The tender's (or an item's) documents; the poster adds and removes while it is a draft or open. */
function Files({ tender, files, itemId, onChange, onError }: { tender: Tender; files: FileRef[]; itemId: number | null; onChange: () => void; onError: (e: unknown) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const editable = tender.role === 'poster' && ['draft', 'open'].includes(tender.status);
  if (files.length === 0 && !editable) return null;

  const upload = (file: File) => {
    setUploading(true);
    tenderApi.addFile(tender.id, file, itemId).then(
      () => {
        setUploading(false);
        onChange();
      },
      (err) => {
        setUploading(false);
        onError(err);
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {files.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-1 rounded-lg bg-secondary py-1 pr-1 pl-2 text-sm text-secondary">
          <Paperclip className="size-4 text-fg-quaternary" aria-hidden="true" />
          <button type="button" className="hover:underline" onClick={() => void tenderApi.download(f)}>
            {f.name}
          </button>
          <IconAction icon={Download01} label={t('Download')} onPress={() => void tenderApi.download(f)} />
          {editable && <IconAction icon={Trash01} danger label={t('Remove this document')} onPress={() => tenderApi.removeFile(f.id).then(onChange, onError)} />}
        </span>
      ))}
      {editable && (
        <>
          <input
            ref={input}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) upload(file);
            }}
          />
          <Button size="sm" color="link-gray" iconLeading={Upload01} isLoading={uploading} onPress={() => input.current?.click()}>
            {itemId ? t('Add a document for this item') : t('Add a document')}
          </Button>
        </>
      )}
    </div>
  );
}

/** What a bidder sees: their application, their bid and what they may do with it. */
function BidderPanel({
  tender,
  me,
  busy,
  onPay,
  onWithdraw,
  onApplied,
  onError,
}: {
  tender: Tender;
  me: MarketMe | null;
  busy: string | null;
  onPay: () => void;
  onWithdraw: () => void;
  onApplied: () => void;
  onError: (e: unknown) => void;
}) {
  const [companyId, setCompanyId] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const rule = tender.rule;
  const app = tender.my_application;
  const bid = tender.my_bid;
  const open = tender.status === 'open';

  if (!me?.verified) {
    return (
      <Card title={t('Bid on this tender')}>
        <p className="text-sm text-tertiary">
          {t('Bidding needs you to be verified through DAN.')}{' '}
          <Link to="/market/account" className="font-semibold text-brand-secondary hover:underline">
            {t('Verify with DAN')}
          </Link>
        </p>
      </Card>
    );
  }

  const apply = () => {
    setSending(true);
    tenderApi.apply(tender.id, companyId ? Number(companyId) : null, note.trim(), files).then(
      () => {
        setSending(false);
        onApplied();
      },
      (err) => {
        setSending(false);
        onError(err);
      },
    );
  };

  const bidders = me.memberships.filter((m) => m.can_bid && !m.company.frozen);
  const showApply = rule.prequalification && open && (!app || app.status === 'refused');

  if (!bid && !app && !showApply) return null;

  return (
    <Card title={t('Your part')}>
      <div className="space-y-4">
        {app && (
          <p className="text-sm text-secondary">
            {app.status === 'pending' && t('Your application is waiting for the organizer.')}
            {app.status === 'approved' && t('You are approved to bid.')}
            {app.status === 'refused' && t('Your application was refused.') + (app.reason ? ` ${app.reason}` : '')}
          </p>
        )}
        {showApply && (
          <div className="space-y-3">
            <p className="text-sm text-tertiary">{t('Only approved bidders may bid. Tell the organizer who you are and attach your papers.')}</p>
            <NativeSelect
              aria-label={t('You apply as')}
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              options={[{ value: '', label: `${me.verified.name} (${t('yourself')})` }, ...bidders.map((m) => ({ value: String(m.company.id), label: m.company.name }))]}
            />
            <TextArea aria-label={t('Note')} placeholder={t('Experience, licences, references')} value={note} onChange={setNote} rows={3} />
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="text-sm text-secondary" />
            <div>
              <Button size="sm" isLoading={sending} onPress={apply}>
                {t('Apply')}
              </Button>
            </div>
          </div>
        )}
        {bid && (
          <div className="flex flex-wrap items-center gap-3">
            <BidStatusBadge status={bid.status} />
            <p className="text-sm font-medium text-primary tabular-nums">{money(bid.total)}</p>
            {bid.round > 1 && <p className="text-sm text-tertiary">{t('Round {n}', { n: bid.round })}</p>}
            {bid.status === 'pending_fee' && (
              <Button size="sm" isLoading={busy === 'pay'} onPress={onPay}>
                {t('Pay to send the bid')}
              </Button>
            )}
            {open && ['pending_fee', 'submitted'].includes(bid.status) && (!rule.irrevocable || bid.status === 'pending_fee') && (
              <Button size="sm" color="secondary" isLoading={busy === 'withdraw'} onPress={onWithdraw}>
                {t('Withdraw')}
              </Button>
            )}
            {open && bid.status === 'submitted' && (
              <Link to={`/market/tenders/${tender.id}/bid`} className="text-sm font-semibold text-brand-secondary hover:underline">
                {t('Send a new bid instead')}
              </Link>
            )}
          </div>
        )}
        {bid && tender.status === 'negotiating' && <BidderTalk tender={tender} bidId={bid.id} onError={onError} />}
      </div>
    </Card>
  );
}

/** The poster's list of prequalification applications, to approve or refuse. */
function Applications({ tender, onError }: { tender: Tender; onError: (e: unknown) => void }) {
  const [list, setList] = useState<Application[] | null>(null);
  const [refusing, setRefusing] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const load = () => tenderApi.applications(tender.id).then(setList, onError);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tender.id]);

  const decide = (a: Application, approve: boolean) => {
    tenderApi.decide(a.id, approve, approve ? null : reason.trim() || null).then(() => {
      setRefusing(null);
      setReason('');
      void load();
    }, onError);
  };

  return (
    <Card title={t('Applications')} description={t('Approve who may bid.')}>
      {!list ? (
        <Pulse className="h-16" />
      ) : list.length === 0 ? (
        <p className="text-sm text-tertiary">{t('No applications yet.')}</p>
      ) : (
        <ul className="divide-y divide-secondary">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-primary">
                  {a.party.name ?? '—'} {a.party.registry_number && <span className="font-normal text-tertiary">· {a.party.registry_number}</span>}
                </p>
                {a.note && <p className="text-sm text-secondary">{a.note}</p>}
                <div className="flex flex-wrap gap-2">
                  {a.files.map((f) => (
                    <button key={f.id} type="button" className="text-sm text-brand-secondary hover:underline" onClick={() => void tenderApi.applicationFile(a.id, f)}>
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
              {a.status === 'pending' && refusing === a.id ? (
                <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                  <TextArea aria-label={t('Why is it refused?')} placeholder={t('Why is it refused?')} value={reason} onChange={setReason} rows={1} />
                  <Button size="sm" color="secondary" onPress={() => setRefusing(null)}>
                    {t('Back')}
                  </Button>
                  <Button size="sm" color="primary-destructive" onPress={() => decide(a, false)}>
                    {t('Refuse')}
                  </Button>
                </div>
              ) : a.status === 'pending' ? (
                <div className="flex gap-2">
                  <Button size="sm" color="secondary" onPress={() => setRefusing(a.id)}>
                    {t('Refuse')}
                  </Button>
                  <Button size="sm" onPress={() => decide(a, true)}>
                    {t('Approve')}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-tertiary">{a.status === 'approved' ? t('Approved') : t('Refused')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CancelModal({ tender, onClose, onDone }: { tender: Tender; onClose: () => void; onDone: (t: Tender) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={t('Cancel the tender?')} description={t('Bidders are told, their bids are withdrawn and securities refunded. Fees paid are not refunded.')} onClose={onClose} size="sm">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <TextArea label={t('Reason')} value={reason} onChange={setReason} rows={3} />
        <div className="modal-footer flex justify-end gap-2 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t('Keep it')}
          </Button>
          <Button
            size="sm"
            color="primary-destructive"
            isLoading={busy}
            onPress={() => {
              setBusy(true);
              tenderApi.cancel(tender.id, reason.trim() || null).then(onDone, (err) => {
                setBusy(false);
                setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
              });
            }}
          >
            {t('Cancel the tender')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

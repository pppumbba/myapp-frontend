import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Edit05, FileDownload02, PenTool02, Scale02, Star01 } from '@untitledui/icons';
import { PageHeader } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { contractApi, type Contract, type ContractAction, type ContractStep, type ContractTerms, type MarketPayment, type Party, type StepAction } from '../../lib/marketApi';
import { Button } from '@/components/base/buttons/button';
import { TextArea } from '@/components/base/textarea/textarea';
import { cx } from '@/utils/cx';
import { ContractEditor, termsOf } from './ContractEditor';
import { eventLabel, middlemanLabel, money, sideLabel, StatusBadge, statusLabel, stepStatusLabel } from './labels';
import { Card, Pulse, Success } from './parts';
import { PayModal } from './PayModal';
import { t } from '@/i18n';

const message = (err: unknown) => (err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));

/** A note the user writes before an action goes through (a reason, a delivery note). */
interface Prompt {
  title: string;
  label: string;
  required: boolean;
  confirm: string;
  danger?: boolean;
  run: (text: string) => Promise<unknown>;
}

/**
 * One contract, as the user's side sees it: the terms (editable until both sign), signing with
 * DAN, fees, the work's progress, payment steps held by the market, disputes, ratings and the
 * timeline. What the user may do comes from the server.
 */
export default function ContractPage() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContractTerms | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState<MarketPayment | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  const load = () => contractApi.get(id).then(setContract, (err) => setError(message(err)));

  useEffect(() => {
    // Back from signing with DAN.
    if (params.has('signed')) setNotice(t('Your signature is in.'));
    if (params.has('sign_error')) setError(params.get('sign_error'));
    if (params.has('signed') || params.has('sign_error')) setParams({}, { replace: true });
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /** Runs an action that answers with the contract. */
  const run = (key: string, action: () => Promise<Contract | unknown>, done?: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    return action().then(
      (result) => {
        setBusy(null);
        if (result && typeof result === 'object' && 'number' in result) setContract(result as Contract);
        else void load();
        if (done) setNotice(done);
      },
      (err) => {
        setBusy(null);
        setError(message(err));
        throw err;
      },
    );
  };

  const act = (action: ContractAction, body: Record<string, unknown> = {}, done?: string) =>
    run(action, () => contractApi.act(id, action, body), done);
  const stepAct = (step: ContractStep, action: StepAction, body: Record<string, unknown> = {}) =>
    run(`${action}-${step.id}`, () => contractApi.step(step.id, action, body));

  const sign = () => {
    setBusy('sign');
    setError(null);
    contractApi.sign(id).then(
      ({ url }) => (window.location.href = url),
      (err) => {
        setBusy(null);
        setError(message(err));
      },
    );
  };

  const fund = (step: ContractStep) => {
    if (step.payment) return setPaying(step.payment);
    setBusy(`fund-${step.id}`);
    contractApi.fundStep(step.id).then(
      (p) => {
        setBusy(null);
        setPaying(p);
      },
      (err) => {
        setBusy(null);
        setError(message(err));
      },
    );
  };

  if (!contract) {
    return (
      <>
        <PageHeader title={t('Contract')} />
        {error ? <Alert>{error}</Alert> : <Pulse className="h-64" />}
      </>
    );
  }

  const c = contract;
  const can = c.can;

  return (
    <>
      <PageHeader
        title={c.title}
        subtitle={`${c.number} · ${t('You are the {side}', { side: sideLabel(c.side).toLowerCase() })} · ${t('version {n}', { n: c.version })}`}
        actions={
          <>
            <StatusBadge status={c.status} />
            {c.has_pdf && (
              <Button size="sm" color="secondary" iconLeading={FileDownload02} onPress={() => void contractApi.pdf(c).catch((err) => setError(message(err)))}>
                PDF
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-5">
        {notice && <Success>{notice}</Success>}
        {error && <Alert>{error}</Alert>}

        {editing ? (
          <>
            <ContractEditor value={editing} onChange={setEditing} />
            <div className="flex justify-end gap-2">
              <Button size="sm" color="secondary" onPress={() => setEditing(null)}>
                {t('Cancel')}
              </Button>
              <Button
                size="sm"
                isLoading={busy === 'save'}
                onPress={() => void run('save', () => contractApi.update(id, editing), t('Saved. Both sides sign again.')).then(() => setEditing(null), () => undefined)}
              >
                {t('Save the terms')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <NextStep contract={c}>
              {can.sign && (
                <Button size="sm" iconLeading={PenTool02} isLoading={busy === 'sign'} onPress={sign}>
                  {t('Sign with DAN')}
                </Button>
              )}
              {can.edit && (
                <Button size="sm" color="secondary" iconLeading={Edit05} onPress={() => setEditing(termsOf(c))}>
                  {t('Change the terms')}
                </Button>
              )}
              {c.payment && (
                <Button size="sm" onPress={() => setPaying(c.payment)}>
                  {t('Pay {amount}', { amount: money(c.payment.amount) })}
                </Button>
              )}
              {can.start && (
                <Button size="sm" isLoading={busy === 'start'} onPress={() => void act('start').catch(() => undefined)}>
                  {t('Start the work')}
                </Button>
              )}
              {can.deliver && (
                <Button
                  size="sm"
                  color={can.start ? 'secondary' : 'primary'}
                  onPress={() =>
                    setPrompt({ title: t('Mark as delivered'), label: t('Note for the buyer'), required: false, confirm: t('Delivered'), run: (note) => act('deliver', { note }) })
                  }
                >
                  {t('Mark as delivered')}
                </Button>
              )}
              {can.confirm && (
                <>
                  <Button size="sm" isLoading={busy === 'confirm'} onPress={() => void act('confirm', {}, t('Completed.')).catch(() => undefined)}>
                    {t('Confirm the delivery')}
                  </Button>
                  <Button
                    size="sm"
                    color="secondary-destructive"
                    onPress={() => setPrompt({ title: t('Not accepted'), label: t('What is wrong'), required: true, confirm: t('Send back'), danger: true, run: (reason) => act('reject', { reason }) })}
                  >
                    {t('Not accepted')}
                  </Button>
                </>
              )}
              {can.dispute && (
                <Button
                  size="sm"
                  color="secondary"
                  iconLeading={Scale02}
                  onPress={() =>
                    setPrompt({
                      title: t('Open a dispute'),
                      label: t('What happened'),
                      required: true,
                      confirm: t('Open the dispute'),
                      danger: true,
                      run: (reason) => run('dispute', () => contractApi.dispute(id, reason), t('The dispute is open. Our team will look at it.')),
                    })
                  }
                >
                  {t('Open a dispute')}
                </Button>
              )}
              {can.cancel && (
                <Button
                  size="sm"
                  color="tertiary"
                  onPress={() => setPrompt({ title: t('Cancel the contract'), label: t('Why (the other side sees this)'), required: false, confirm: t('Cancel the contract'), danger: true, run: (reason) => act('cancel', { reason }) })}
                >
                  {t('Cancel the contract')}
                </Button>
              )}
            </NextStep>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-5">
                <ItemsCard contract={c} />
                <StepsCard contract={c} busy={busy} onFund={fund} onAct={stepAct} onPrompt={setPrompt} />
                <TermsCard contract={c} />
              </div>
              <div className="min-w-0 space-y-5">
                <PartiesCard contract={c} />
                {can.rate && <RateCard onRate={(stars, comment) => act('rate', { stars, comment }, t('Thank you for the rating.'))} />}
                {c.disputes.length > 0 && <DisputesCard contract={c} />}
                <TimelineCard contract={c} />
              </div>
            </div>
          </>
        )}
      </div>

      {paying && (
        <PayModal
          payment={paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            void load();
            setNotice(t('Payment received.'));
          }}
        />
      )}
      {prompt && <PromptModal prompt={prompt} onClose={() => setPrompt(null)} />}
    </>
  );
}

/** What happens next, in a sentence, with the actions this user has. */
function NextStep({ contract: c, children }: { contract: Contract; children: ReactNode }) {
  const mine = c.signatures.some((s) => s.side === c.side);
  const text = {
    draft: t('Check the terms. When both sides have signed with DAN, the contract is made.'),
    signing: mine ? t('You have signed. Waiting for the other side.') : t('The other side has signed. Check the terms and sign with DAN.'),
    awaiting_payment: c.payment ? t('Both sides signed. Pay the market fees to put the contract in force.') : t('Both sides signed. Waiting for the buyer to pay the market fees.'),
    active: c.side === 'vendor' ? t('The contract is in force. Start the work when you are ready.') : t('The contract is in force. The vendor starts the work.'),
    in_progress: c.side === 'vendor' ? t('Mark the contract as delivered once it is done.') : t('The vendor is working on it.'),
    delivered: c.side === 'buyer' ? t('The vendor says it is delivered. Confirm it, or say what is wrong.') : t('Waiting for the buyer to confirm the delivery.'),
    completed: t('The contract is complete.'),
    cancelled: t('The contract was cancelled.'),
  }[c.status];

  return (
    <section aria-label={statusLabel(c.status)} className="flex flex-wrap items-center gap-3 rounded-xl bg-primary px-4 py-3.5 shadow-xs ring-1 ring-secondary sm:px-5">
      <p className="min-w-0 flex-1 text-sm text-secondary">{text}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function ItemsCard({ contract: c }: { contract: Contract }) {
  return (
    <Card title={t('Items')}>
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-tertiary">
              <th className="px-4 pb-2 sm:px-5">{t('Item')}</th>
              <th className="px-2 pb-2 text-right">{t('Quantity')}</th>
              <th className="px-2 pb-2 text-right">{t('Unit price')}</th>
              <th className="px-4 pb-2 text-right sm:px-5">{t('Amount')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {c.items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-2 text-primary sm:px-5">
                  {it.name}
                  {it.description && <p className="text-tertiary">{it.description}</p>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-secondary">
                  {it.quantity} {it.unit}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-secondary">{money(it.unit_price)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-primary sm:px-5">{money(it.amount ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-3 space-y-1 border-t border-secondary pt-3 text-sm">
        {c.discount > 0 && (
          <div className="flex justify-between text-tertiary">
            <dt>{t('Discount')}</dt>
            <dd className="tabular-nums">−{money(c.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between text-md font-semibold text-primary">
          <dt>{t('Total')}</dt>
          <dd className="tabular-nums">{money(c.total)}</dd>
        </div>
      </dl>
    </Card>
  );
}

function StepsCard({
  contract: c,
  busy,
  onFund,
  onAct,
  onPrompt,
}: {
  contract: Contract;
  busy: string | null;
  onFund: (step: ContractStep) => void;
  onAct: (step: ContractStep, action: StepAction, body?: Record<string, unknown>) => Promise<unknown>;
  onPrompt: (prompt: Prompt) => void;
}) {
  const escrow = c.middleman === 'escrow';
  return (
    <Card
      title={t('Payment steps')}
      description={escrow ? t('The market holds each payment until the buyer releases it. A requested payment is released by itself after 7 days.') : t('Paid between the two sides directly.')}
    >
      <ul className="divide-y divide-secondary">
        {c.steps.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary">
                {s.label} <span className="font-normal text-tertiary">· {s.percent}%</span>
              </p>
              {escrow && (
                <p className="text-sm text-tertiary">
                  {stepStatusLabel(s.status)}
                  {s.status === 'requested' && s.auto_release_at && ` · ${t('released by itself on {date}', { date: new Date(s.auto_release_at).toLocaleDateString() })}`}
                  {s.note && ` · ${s.note}`}
                </p>
              )}
            </div>
            <p className="text-sm font-medium tabular-nums text-primary">{money(s.amount)}</p>
            <div className="flex gap-2">
              {s.can.fund && (
                <Button size="sm" isLoading={busy === `fund-${s.id}`} onPress={() => onFund(s)}>
                  {s.payment ? t('Pay') : t('Pay in')}
                </Button>
              )}
              {s.can.request && (
                <Button size="sm" isLoading={busy === `request-${s.id}`} onPress={() => void onAct(s, 'request').catch(() => undefined)}>
                  {t('Ask for payment')}
                </Button>
              )}
              {s.can.reject && (
                <Button
                  size="sm"
                  color="secondary-destructive"
                  onPress={() => onPrompt({ title: t('Not yet'), label: t('Why not'), required: true, confirm: t('Send'), danger: true, run: (reason) => onAct(s, 'reject-release', { reason }) })}
                >
                  {t('Not yet')}
                </Button>
              )}
              {s.can.release && (
                <Button size="sm" color={s.status === 'requested' ? 'primary' : 'secondary'} isLoading={busy === `release-${s.id}`} onPress={() => void onAct(s, 'release').catch(() => undefined)}>
                  {t('Release')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TermsCard({ contract: c }: { contract: Contract }) {
  const rows: [string, ReactNode][] = [
    [t('Delivery date'), c.delivery_date ? new Date(c.delivery_date).toLocaleDateString() : '—'],
    [t('Payment terms'), c.payment_terms || '—'],
    [t('Pledge'), c.pledge || c.pledge_amount ? `${c.pledge ?? ''}${c.pledge_amount ? ` (${money(c.pledge_amount)})` : ''}` : '—'],
    [t('Middleman'), middlemanLabel(c.middleman)],
    [t('Market fees (buyer pays)'), money(c.fees.total)],
  ];
  return (
    <Card title={t('Terms')}>
      <dl className="space-y-2.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 sm:grid-cols-[12rem_1fr]">
            <dt className="text-tertiary">{label}</dt>
            <dd className="whitespace-pre-line text-primary">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function PartiesCard({ contract: c }: { contract: Contract }) {
  return (
    <Card title={t('Parties')}>
      <div className="space-y-4">
        {(['buyer', 'vendor'] as const).map((side) => {
          const signature = c.signatures.find((s) => s.side === side);
          return (
            <div key={side}>
              <p className="text-xs font-medium tracking-wide text-tertiary uppercase">{sideLabel(side)}</p>
              <PartyLine party={c[side]} />
              <p className={cx('mt-0.5 text-sm', signature ? 'text-success-primary' : 'text-quaternary')}>
                {signature
                  ? t('Signed by {name}, {date}', { name: signature.verified_name, date: new Date(signature.signed_at).toLocaleDateString() })
                  : t('Not signed')}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PartyLine({ party }: { party: Party }) {
  return (
    <p className="text-sm font-semibold text-primary">
      {party.name}
      <span className="font-normal text-tertiary"> · {party.registry_number}</span>
      {party.rating.count > 0 && (
        <span className="ml-1.5 inline-flex items-center gap-0.5 font-normal text-tertiary">
          <Star01 className="size-3.5 fill-current text-warning-primary" aria-hidden="true" />
          {party.rating.average} ({party.rating.count})
        </span>
      )}
    </p>
  );
}

function RateCard({ onRate }: { onRate: (stars: number, comment: string) => Promise<unknown> }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card title={t('Rate the other side')}>
      <div className="space-y-3">
        <div className="flex gap-1" role="radiogroup" aria-label={t('Stars')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n}`} onClick={() => setStars(n)} className="rounded p-0.5 outline-focus-ring focus-visible:outline-2">
              <Star01 className={cx('size-6', n <= stars ? 'fill-current text-warning-primary' : 'text-fg-quaternary')} aria-hidden="true" />
            </button>
          ))}
        </div>
        <TextArea aria-label={t('Comment')} placeholder={t('How did it go? (optional)')} value={comment} onChange={setComment} rows={2} />
        <Button
          size="sm"
          isDisabled={!stars}
          isLoading={busy}
          onPress={() => {
            setBusy(true);
            onRate(stars, comment.trim())
              .catch(() => undefined)
              .finally(() => setBusy(false));
          }}
        >
          {t('Send the rating')}
        </Button>
      </div>
    </Card>
  );
}

function DisputesCard({ contract: c }: { contract: Contract }) {
  return (
    <Card title={t('Disputes')}>
      <ul className="space-y-3">
        {c.disputes.map((d) => (
          <li key={d.id} className="text-sm">
            <p className="font-medium text-primary">
              {d.status === 'open' ? t('Open') : t('Decided')} · {t('raised by the {side}', { side: sideLabel(d.side).toLowerCase() })}
            </p>
            <p className="text-secondary">{d.reason}</p>
            {d.decision && <p className="mt-1 text-tertiary">{t('Decision: {text}', { text: d.decision })}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TimelineCard({ contract: c }: { contract: Contract }) {
  return (
    <Card title={t('History')}>
      <ol className="space-y-2.5">
        {[...c.events].reverse().map((e, i) => (
          <li key={i} className="text-sm">
            <p className="text-primary">
              {eventLabel(e.type)}
              {e.by && <span className="text-tertiary"> · {e.by}</span>}
            </p>
            {e.note && <p className="text-secondary">{e.note}</p>}
            <p className="text-xs text-quaternary">{new Date(e.at).toLocaleString()}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function PromptModal({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={prompt.title} onClose={onClose} size="sm">
      <div className="space-y-4">
        <TextArea label={prompt.label} value={text} onChange={setText} rows={3} isRequired={prompt.required} />
        <div className="modal-footer flex justify-end gap-2 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t('Back')}
          </Button>
          <Button
            size="sm"
            color={prompt.danger ? 'primary-destructive' : 'primary'}
            isLoading={busy}
            isDisabled={prompt.required && !text.trim()}
            onPress={() => {
              setBusy(true);
              prompt.run(text.trim()).then(onClose, () => setBusy(false));
            }}
          >
            {prompt.confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

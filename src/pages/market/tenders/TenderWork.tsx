import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Send01 } from '@untitledui/icons';
import { tenderApi, type Claim, type EvaluationResult, type EvaluationRow, type Message, type Tender } from '../../../lib/tenderApi';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { money, statusLabel } from '../labels';
import { Card, Pulse } from '../parts';
import { awardLabel, claimLabel, when } from './tenderLabels';
import type { ContractStatus } from '../../../lib/marketApi';
import { t } from '@/i18n';

/**
 * The poster's work after the close: start the evaluation, read every bid against the specs,
 * correct claims and keep bids in, shortlist and negotiate, then award. After the award: who won
 * and their contracts.
 */
export function TenderWork({ tender, onChange, onError }: { tender: Tender; onChange: (t: Tender) => void; onError: (e: unknown) => void }) {
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const evaluating = ['evaluating', 'negotiating'].includes(tender.status);

  const load = () => tenderApi.evaluation(tender.id).then(setResult, onError);
  useEffect(() => {
    if (evaluating) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tender.id, tender.status, tender.round]);

  const run = (name: string, request: Promise<Tender>) => {
    setBusy(name);
    request.then(
      (tn) => {
        setBusy(null);
        onChange(tn);
      },
      (err) => {
        setBusy(null);
        onError(err);
      },
    );
  };

  if (tender.status === 'closed') {
    return (
      <Card title={t('Bids are in')} description={t('Bids received: {n}. Open them to check each against your specs.', { n: tender.bid_count ?? 0 })}>
        <Button size="sm" isLoading={busy === 'start'} onPress={() => run('start', tenderApi.startEvaluation(tender.id))}>
          {t('Open the bids')}
        </Button>
      </Card>
    );
  }

  if (tender.status === 'awarded' || tender.status === 'contracted') {
    return (
      <Card title={tender.status === 'contracted' ? t('Contracted') : t('Awarded')} description={tender.status === 'awarded' ? t('The tender is contracted once every winner’s contract is in force.') : undefined}>
        <ul className="divide-y divide-secondary">
          {(tender.awards ?? []).map((a) => (
            <li key={a.bid_id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">{a.party.name ?? '—'}</p>
                <p className="text-sm text-tertiary">{a.lines.map((l) => `${l.name} × ${l.quantity}`).join(', ')}</p>
              </div>
              <p className="text-sm font-medium text-primary tabular-nums">{money(a.total)}</p>
              {a.contract && (
                <Link to={`/market/contracts/${a.contract.id}`} className="text-sm font-semibold text-brand-secondary hover:underline">
                  {a.contract.number} · {statusLabel(a.contract.status as ContractStatus)}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  if (!evaluating) return null;
  if (!result) return <Pulse className="h-48" />;

  return (
    <>
      <Ranking tender={tender} result={result} setResult={setResult} onError={onError} />
      {tender.status === 'negotiating' ? (
        <Negotiating tender={tender} result={result} busy={busy} run={run} onError={onError} />
      ) : (
        <>
          {tender.rule.procedure === 'negotiated' && <Shortlist tender={tender} result={result} busy={busy} run={run} />}
          <AwardForm tender={tender} result={result} busy={busy} run={run} />
        </>
      )}
    </>
  );
}

/** Every bid, ranked by the rule; a row opens to its spec answers. */
function Ranking({ tender, result, setResult, onError }: { tender: Tender; result: EvaluationResult; setResult: (r: EvaluationResult) => void; onError: (e: unknown) => void }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const rows = [...result.bids].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const bestValue = result.rule.award === 'best_value';

  return (
    <Card title={t('Bids')} description={t('Ranked by {rule}. Click a bid to check its answers.', { rule: awardLabel(result.rule.award).toLowerCase() })}>
      {rows.length === 0 ? (
        <p className="text-sm text-tertiary">{t('No bids came in.')}</p>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-tertiary">
              <tr className="border-b border-secondary">
                <th className="px-4 py-2 sm:pl-5">#</th>
                <th className="px-2 py-2">{t('Bidder')}</th>
                <th className="px-2 py-2 text-right">{t('Total')}</th>
                <th className="px-2 py-2 text-right">{t('Days')}</th>
                <th className="px-2 py-2 text-right">{t('Quality')}</th>
                {bestValue && <th className="px-2 py-2 text-right">{t('Score')}</th>}
                <th className="px-4 py-2 sm:pr-5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className={`cursor-pointer border-b border-secondary hover:bg-primary_hover ${row.in ? '' : 'text-tertiary'}`} onClick={() => setOpenId(openId === row.id ? null : row.id)}>
                    <td className="px-4 py-2.5 tabular-nums sm:pl-5">{row.rank ?? '—'}</td>
                    <td className="px-2 py-2.5">
                      <span className="font-medium text-primary">{row.party.name ?? '—'}</span>
                      {row.shortlisted && (
                        <Badge size="sm" type="pill-color" color="brand" className="ml-2">
                          {t('Shortlisted')}
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{money(row.total)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{row.lead_time_days}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{row.quality_score}</td>
                    {bestValue && <td className="px-2 py-2.5 text-right font-medium tabular-nums">{row.score}</td>}
                    <td className="px-4 py-2.5 text-right sm:pr-5">
                      <span className="inline-flex items-center gap-1">
                        {!row.compliant && (
                          <Badge size="sm" type="pill-color" color={row.overturned ? 'warning' : 'error'}>
                            {row.overturned ? t('Kept in') : t('Ruled out')}
                          </Badge>
                        )}
                        {openId === row.id ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
                      </span>
                    </td>
                  </tr>
                  {openId === row.id && (
                    <tr className="border-b border-secondary bg-secondary">
                      <td colSpan={bestValue ? 7 : 6} className="px-4 py-3 sm:px-5">
                        <BidDetail tender={tender} row={row} setResult={setResult} onError={onError} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.items.length > 1 && (
        <p className="mt-3 text-sm text-tertiary">
          {t('Lowest per item:')}{' '}
          {result.items.map((it) => `${it.name} ${it.best_price !== null ? money(it.best_price) : '—'}`).join(' · ')}
        </p>
      )}
    </Card>
  );
}

/** One bid's prices and spec answers, with the poster's corrections. */
function BidDetail({ tender, row, setResult, onError }: { tender: Tender; row: EvaluationRow; setResult: (r: EvaluationResult) => void; onError: (e: unknown) => void }) {
  const [note, setNote] = useState('');
  const itemName = (id: number) => tender.items.find((it) => it.id === id)?.name ?? '';
  const editable = ['evaluating', 'negotiating'].includes(tender.status);

  return (
    <div className="space-y-3">
      <p className="text-secondary">{row.lines.map((l) => `${itemName(l.item_id)}: ${money(l.price)} × ${l.quantity}`).join(' · ')}</p>
      {row.specs.length > 0 && (
        <ul className="space-y-1.5">
          {row.specs.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <span className={`min-w-40 ${s.must ? 'font-medium text-primary' : 'text-secondary'}`}>
                {s.label} {s.required && <span className="text-tertiary">({s.required})</span>}
              </span>
              <span className="text-primary">{s.value || '—'}</span>
              {s.file_id && (
                <button type="button" className="text-brand-secondary hover:underline" onClick={() => void tenderApi.bidFile(row.id, { id: s.file_id!, name: `${s.label ?? 'datasheet'}` })}>
                  {t('Datasheet')}
                </button>
              )}
              {editable ? (
                <NativeSelect
                  aria-label={t('Claim')}
                  className="w-40"
                  value={s.claim}
                  onChange={(e) => tenderApi.override(s.id, e.target.value as Claim, note.trim() || null).then(setResult, onError)}
                  options={(['meets', 'exceeds', 'fails'] as const).map((c) => ({ value: c, label: claimLabel(c) }))}
                />
              ) : (
                <span>{claimLabel(s.claim)}</span>
              )}
              {s.overridden && <span className="text-xs text-tertiary">{t('Corrected; the bidder said {claim}', { claim: claimLabel(s.bidder_claim).toLowerCase() })}</span>}
            </li>
          ))}
        </ul>
      )}
      {editable && <Input aria-label={t('Note for a correction')} placeholder={t('Note for a correction (optional)')} value={note} onChange={setNote} wrapperClassName="max-w-md" />}
      {editable && !row.compliant && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-error-primary">{t('Fails: {specs}', { specs: row.failed_musts.join(', ') })}</p>
          <Button size="sm" color="secondary" onPress={() => tenderApi.overturn(row.id, !row.overturned, note.trim() || null).then(setResult, onError)}>
            {row.overturned ? t('Rule it out again') : t('Keep it in anyway')}
          </Button>
        </div>
      )}
    </div>
  );
}

type Run = (name: string, request: Promise<Tender>) => void;

/** Negotiated tenders: pick the bids to talk to. */
function Shortlist({ tender, result, busy, run }: { tender: Tender; result: EvaluationResult; busy: string | null; run: Run }) {
  const [picked, setPicked] = useState<number[]>([]);
  const inBids = result.bids.filter((b) => b.in);
  return (
    <Card title={t('Shortlist')} description={t('Pick the bidders to negotiate with. They may improve their offers without a new fee.')}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {inBids.map((b) => (
            <Checkbox key={b.id} label={`${b.party.name ?? '—'} · ${money(b.total)}`} isSelected={picked.includes(b.id)} onChange={(on) => setPicked(on ? [...picked, b.id] : picked.filter((x) => x !== b.id))} />
          ))}
        </div>
        <Button size="sm" isDisabled={picked.length === 0} isLoading={busy === 'shortlist'} onPress={() => run('shortlist', tenderApi.shortlist(tender.id, picked))}>
          {t('Start negotiating')}
        </Button>
      </div>
    </Card>
  );
}

/** Talking with each shortlisted bidder, the final round and its end. */
function Negotiating({ tender, result, busy, run, onError }: { tender: Tender; result: EvaluationResult; busy: string | null; run: Run; onError: (e: unknown) => void }) {
  const [until, setUntil] = useState('');
  const shortlisted = result.bids.filter((b) => b.shortlisted);
  const [talking, setTalking] = useState<number | null>(shortlisted[0]?.id ?? null);
  return (
    <Card
      title={t('Negotiation · round {n}', { n: tender.round })}
      description={tender.final_round_closes_at ? t('Final offers are due {when}.', { when: when(tender.final_round_closes_at) }) : t('Talk with each shortlisted bidder privately.')}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {shortlisted.map((b) => (
            <Button key={b.id} size="sm" color={talking === b.id ? 'primary' : 'secondary'} onPress={() => setTalking(b.id)}>
              {b.party.name ?? '—'} · {money(b.total)}
            </Button>
          ))}
        </div>
        {talking && <Thread key={talking} bidId={talking} side="poster" onError={onError} />}
        <div className="flex flex-wrap items-end gap-2 border-t border-secondary pt-4">
          {!tender.final_round_closes_at && (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-secondary">
                {t('Final offers by')}
                <input
                  type="datetime-local"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  className="h-9 rounded-lg bg-primary px-3 text-sm text-primary shadow-xs ring-1 ring-primary outline-none ring-inset focus:ring-2 focus:ring-brand"
                />
              </label>
              <Button size="sm" color="secondary" isLoading={busy === 'final'} onPress={() => run('final', tenderApi.finalRound(tender.id, until ? new Date(until).toISOString() : null))}>
                {t('Ask for final offers')}
              </Button>
            </>
          )}
          <Button size="sm" isLoading={busy === 'finish'} onPress={() => run('finish', tenderApi.finishNegotiation(tender.id))}>
            {t('Finish negotiating')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** The bidder's side of the talk, with a way to send a better offer. */
export function BidderTalk({ tender, bidId, onError }: { tender: Tender; bidId: number; onError: (e: unknown) => void }) {
  if (!tender.my_bid?.shortlisted) return null;
  return (
    <div className="space-y-3 border-t border-secondary pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-primary">
          {t('You are shortlisted.')}{' '}
          {tender.final_round_closes_at && <span className="font-normal text-tertiary">{t('Final offers are due {when}.', { when: when(tender.final_round_closes_at) })}</span>}
        </p>
        <Link to={`/market/tenders/${tender.id}/bid?revise=${bidId}`} className="text-sm font-semibold text-brand-secondary hover:underline">
          {t('Revise your offer')}
        </Link>
      </div>
      <Thread bidId={bidId} side="bidder" onError={onError} />
    </div>
  );
}

/** A private message thread between the poster and one bidder. */
function Thread({ bidId, side, onError }: { bidId: number; side: 'poster' | 'bidder'; onError: (e: unknown) => void }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    tenderApi.messages(bidId).then(setMessages, onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  const send = () => {
    if (!body.trim()) return;
    setSending(true);
    tenderApi.send(bidId, body.trim()).then(
      (m) => {
        setSending(false);
        setBody('');
        setMessages([...(messages ?? []), { ...m, user: null }]);
      },
      (err) => {
        setSending(false);
        onError(err);
      },
    );
  };

  return (
    <div className="space-y-2">
      {!messages ? (
        <Pulse className="h-16" />
      ) : messages.length === 0 ? (
        <p className="text-sm text-tertiary">{t('No messages yet.')}</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {messages.map((m) => (
            <li key={m.id} className={`flex ${m.side === side ? 'justify-end' : 'justify-start'}`}>
              <p className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-line ${m.side === side ? 'bg-brand-solid text-white' : 'bg-secondary text-primary'}`}>{m.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Input aria-label={t('Message')} placeholder={t('Write a message')} value={body} onChange={setBody} wrapperClassName="flex-1" />
        <Button type="submit" size="sm" iconLeading={Send01} isLoading={sending} isDisabled={!body.trim()}>
          {t('Send')}
        </Button>
      </form>
    </div>
  );
}

/** Picking the winners as the rule's split allows. */
function AwardForm({ tender, result, busy, run }: { tender: Tender; result: EvaluationResult; busy: string | null; run: Run }) {
  const split = tender.rule.split;
  const inBids = result.bids.filter((b) => b.in).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const [whole, setWhole] = useState<number | null>(inBids[0]?.id ?? null);
  const [perItem, setPerItem] = useState<Record<number, number | null>>(() => Object.fromEntries(result.items.map((it) => [it.id, it.best_bid_id])));
  const [qty, setQty] = useState<Record<string, string>>({});
  const name = (id: number) => result.bids.find((b) => b.id === id)?.party.name ?? '—';
  const offered = (bid: EvaluationRow, itemId: number) => bid.lines.find((l) => l.item_id === itemId);

  let lines: { bid_id: number; item_id?: number; quantity?: number }[] = [];
  if (split === 'none' && whole) lines = [{ bid_id: whole }];
  if (split === 'item') lines = Object.entries(perItem).filter(([, b]) => b).map(([item, b]) => ({ bid_id: b as number, item_id: Number(item) }));
  if (split === 'quantity') {
    lines = Object.entries(qty)
      .filter(([, v]) => Number(v) > 0)
      .map(([key, v]) => {
        const [bid, item] = key.split(':').map(Number);
        return { bid_id: bid, item_id: item, quantity: Number(v) };
      });
  }

  return (
    <Card title={t('Award')} description={t('Each winner gets a contract draft to sign. Everyone else is told.')}>
      <div className="space-y-3">
        {inBids.length === 0 ? (
          <p className="text-sm text-tertiary">{t('No bid is in. Keep one in, or cancel the tender.')}</p>
        ) : split === 'none' ? (
          <NativeSelect aria-label={t('Winner')} value={whole ? String(whole) : ''} onChange={(e) => setWhole(Number(e.target.value))} options={inBids.map((b) => ({ value: String(b.id), label: `${b.party.name ?? '—'} · ${money(b.total)}` }))} />
        ) : split === 'item' ? (
          result.items.map((it) => (
            <div key={it.id} className="grid items-center gap-2 sm:grid-cols-[12rem_1fr]">
              <p className="text-sm font-medium text-primary">{it.name}</p>
              <NativeSelect
                aria-label={it.name}
                value={perItem[it.id] ? String(perItem[it.id]) : ''}
                onChange={(e) => setPerItem({ ...perItem, [it.id]: e.target.value ? Number(e.target.value) : null })}
                options={[
                  { value: '', label: t('No one') },
                  ...inBids.filter((b) => offered(b, it.id)).map((b) => ({ value: String(b.id), label: `${name(b.id)} · ${money(offered(b, it.id)!.price)}` })),
                ]}
              />
            </div>
          ))
        ) : (
          result.items.map((it) => (
            <div key={it.id} className="space-y-1">
              <p className="text-sm font-medium text-primary">
                {it.name} <span className="font-normal text-tertiary">· {t('{n} asked', { n: tender.items.find((x) => x.id === it.id)?.quantity ?? 1 })}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {inBids
                  .filter((b) => offered(b, it.id))
                  .map((b) => (
                    <Input
                      key={b.id}
                      label={`${name(b.id)} · ${money(offered(b, it.id)!.price)} (${t('up to {n}', { n: offered(b, it.id)!.quantity })})`}
                      type="number"
                      value={qty[`${b.id}:${it.id}`] ?? ''}
                      onChange={(v) => setQty({ ...qty, [`${b.id}:${it.id}`]: v })}
                      wrapperClassName="w-60"
                    />
                  ))}
              </div>
            </div>
          ))
        )}
        <Button size="sm" isDisabled={lines.length === 0} isLoading={busy === 'award'} onPress={() => run('award', tenderApi.award(tender.id, lines))}>
          {t('Award and draft contracts')}
        </Button>
      </div>
    </Card>
  );
}

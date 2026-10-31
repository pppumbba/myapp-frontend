import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { paymentApi, type Dispute, type Page } from '../../lib/marketApi';
import { PaginationCardMinimal } from '@/components/application/pagination/pagination';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Button } from '@/components/base/buttons/button';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { money, sideLabel, StatusBadge, stepStatusLabel } from './labels';
import { Pulse } from './parts';
import { t } from '@/i18n';

const message = (err: unknown) => (err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
type Resolution = 'release' | 'refund' | 'continue';

const resolutionLabel = (r: Resolution) =>
  ({
    release: t('Pay the held money to the vendor'),
    refund: t('Refund the held money to the buyer'),
    continue: t('Unfreeze and let the contract go on'),
  })[r];

/** Staff decide disputes: what was raised, the contract and its held money, and the ruling. */
export default function MarketDisputesPage() {
  const [status, setStatus] = useState<'open' | 'decided'>('open');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<Dispute> | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<Dispute | null>(null);

  const load = () => {
    setFetching(true);
    return paymentApi
      .disputes(status, page)
      .then(setResult, (err) => setError(message(err)))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page]);

  return (
    <>
      <PageHeader title={t('Market disputes')} subtitle={t('Disputes raised on contracts. The held money stays frozen until you decide.')} />
      <div className="space-y-4">
        <ButtonGroup
          size="sm"
          aria-label={t('Status')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[status]}
          onSelectionChange={(keys) => {
            const next = [...keys][0] as 'open' | 'decided' | undefined;
            if (next) {
              setStatus(next);
              setPage(1);
            }
          }}
        >
          <ButtonGroupItem id="open">{t('Open')}</ButtonGroupItem>
          <ButtonGroupItem id="decided">{t('Decided')}</ButtonGroupItem>
        </ButtonGroup>
        {error && <Alert>{error}</Alert>}

        {!result ? (
          !error && <Pulse className="h-48" />
        ) : (
          <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            {result.data.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-tertiary">{t('Nothing here.')}</p>
            ) : (
              <ul className={`divide-y divide-secondary transition-opacity duration-150 ${fetching ? 'opacity-50' : ''}`} aria-busy={fetching}>
                {result.data.map((d) => {
                  const c = d.contract;
                  const held = c.steps.filter((s) => s.status === 'frozen').reduce((sum, s) => sum + s.amount, 0);
                  return (
                    <li key={d.id} className="space-y-3 px-4 py-4 sm:px-6">
                      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-primary">
                            {c.title} <span className="font-normal text-tertiary">· {c.number}</span>
                          </p>
                          <p className="text-sm text-tertiary">
                            {t('Buyer')}: {c.buyer.name} · {t('Vendor')}: {c.vendor.name} · {money(c.total)}
                          </p>
                        </div>
                        <StatusBadge status={c.status} />
                        {d.status === 'open' && (
                          <Button size="sm" onPress={() => setDeciding(d)}>
                            {t('Decide')}
                          </Button>
                        )}
                      </div>
                      <div className="rounded-lg bg-secondary px-3 py-2.5 text-sm">
                        <p className="font-medium text-primary">
                          {t('{name} ({side}) says:', { name: d.opened_by, side: sideLabel(d.side).toLowerCase() })}
                        </p>
                        <p className="whitespace-pre-line text-secondary">{d.reason}</p>
                        {d.decision && (
                          <p className="mt-2 text-tertiary">
                            {d.resolution && `${resolutionLabel(d.resolution)} · `}
                            {d.decision}
                          </p>
                        )}
                      </div>
                      <ul className="space-y-1 text-sm">
                        {c.steps.map((s) => (
                          <li key={s.id} className="flex justify-between gap-4">
                            <span className="text-secondary">
                              {s.label} · {stepStatusLabel(s.status)}
                            </span>
                            <span className="tabular-nums text-primary">{money(s.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      {held > 0 && <p className="text-sm font-medium text-primary">{t('Frozen: {amount}', { amount: money(held) })}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
            <PaginationCardMinimal
              page={result.current_page}
              total={Math.max(1, result.last_page)}
              onPageChange={(p) => setPage(Math.max(1, p))}
              onRefresh={() => void load()}
              refreshing={fetching}
            />
          </div>
        )}
      </div>
      {deciding && (
        <DecideModal
          dispute={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function DecideModal({ dispute, onClose, onDone }: { dispute: Dispute; onClose: () => void; onDone: () => void }) {
  const [resolution, setResolution] = useState<Resolution>('continue');
  const [decision, setDecision] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = () => {
    setBusy(true);
    setError(null);
    paymentApi.decide(dispute.id, resolution, decision.trim()).then(onDone, (err) => {
      setBusy(false);
      setError(message(err));
    });
  };

  return (
    <Modal title={t('Decide the dispute')} description={`${dispute.contract.number} · ${dispute.contract.title}`} onClose={onClose}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <NativeSelect
          label={t('Held money')}
          value={resolution}
          onChange={(e) => setResolution(e.target.value as Resolution)}
          options={(['continue', 'release', 'refund'] as const).map((r) => ({ value: r, label: resolutionLabel(r) }))}
        />
        <TextArea label={t('Decision (both sides see this)')} value={decision} onChange={setDecision} rows={4} isRequired />
        <div className="modal-footer flex justify-end gap-2 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button size="sm" isLoading={busy} isDisabled={!decision.trim()} onPress={decide}>
            {t('Decide')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

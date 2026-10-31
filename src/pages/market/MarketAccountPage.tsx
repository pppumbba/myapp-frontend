import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building07, ChevronRight, ShieldTick, Upload01 } from '@untitledui/icons';
import { PageHeader } from '../../components/AppShell';
import { Alert } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { marketApi, type MarketCompany, type MarketMe, type Membership, type MyRequest } from '../../lib/marketApi';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Card, Pulse, ShareLink, Success } from './parts';
import { t } from '@/i18n';

const message = (err: unknown) => (err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));

/**
 * The signed-in user's market account: who they are (verified through DAN), the companies they
 * act for, registering a company, and asking to act for one.
 */
export default function MarketAccountPage() {
  const [me, setMe] = useState<MarketMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  const load = () =>
    marketApi.me().then(
      (m) => setMe(m),
      (err) => setError(message(err)),
    );

  useEffect(() => {
    // Back from DAN: say how it went, then tidy the address.
    if (params.has('dan') || params.has('dan_error')) {
      if (params.get('dan') === 'ok') setNotice(t('You are verified.'));
      else setError(params.get('dan_error'));
      setParams({}, { replace: true });
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader title={t('Market account')} subtitle={t('Who you are, and the companies you act for.')} />
      <div className="max-w-3xl space-y-5">
        {notice && <Success>{notice}</Success>}
        {error && <Alert>{error}</Alert>}
        {!me ? (
          <>
            <Pulse />
            <Pulse className="h-48" />
          </>
        ) : (
          <>
            <VerificationCard me={me} onError={setError} />
            {me.verified && <CompaniesCard me={me} onChanged={load} />}
            {me.requests.length > 0 && <RequestsCard requests={me.requests} />}
          </>
        )}
      </div>
    </>
  );
}

function VerificationCard({ me, onError }: { me: MarketMe; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const start = () => {
    setBusy(true);
    marketApi.startDan().then(
      ({ url }) => (window.location.href = url),
      (err) => {
        setBusy(false);
        onError(message(err));
      },
    );
  };

  return (
    <Card title={t('Verification')} description={t('Posting, bidding and signing need you to be verified through DAN.')}>
      {me.verified ? (
        <div className="flex items-center gap-3">
          <ShieldTick className="size-6 shrink-0 text-fg-success-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-primary">{me.verified.name}</p>
            <p className="text-sm text-tertiary">
              {me.verified.registry_number} · {t('Verified through DAN')}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-secondary">{t('You are not verified yet.')}</p>
          <Button size="sm" iconLeading={ShieldTick} isLoading={busy} onPress={start}>
            {t('Verify with DAN')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function CompaniesCard({ me, onChanged }: { me: MarketMe; onChanged: () => void }) {
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A company the user registered but doesn't act for yet: they choose how to ask.
  const [asking, setAsking] = useState<MarketCompany | null>(null);

  const register = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    marketApi.registerCompany(number).then(
      ({ company, member }) => {
        setBusy(false);
        setNumber('');
        setAsking(member ? null : company);
        onChanged();
      },
      (err) => {
        setBusy(false);
        setError(message(err));
      },
    );
  };

  return (
    <Card title={t('My companies')} description={t('Companies you act for, and the rights you have in each.')}>
      <div className="space-y-4">
        {me.memberships.length === 0 ? (
          <p className="text-sm text-tertiary">{t('You do not act for any company yet.')}</p>
        ) : (
          <ul className="divide-y divide-secondary rounded-lg ring-1 ring-secondary">
            {me.memberships.map((m) => (
              <MembershipRow key={m.company.id} membership={m} />
            ))}
          </ul>
        )}

        <form onSubmit={register} className="flex flex-wrap items-end gap-2">
          <Input
            label={t('Add a company by its registry number')}
            placeholder="5123456"
            value={number}
            onChange={setNumber}
            inputMode="numeric"
            wrapperClassName="w-48"
          />
          <Button size="sm" type="submit" color="secondary" iconLeading={Building07} isLoading={busy} isDisabled={!number.trim()}>
            {t('Look up in ХУР')}
          </Button>
        </form>
        {error && <Alert>{error}</Alert>}
        {asking && <AskToAct company={asking} onSent={onChanged} />}
      </div>
    </Card>
  );
}

function MembershipRow({ membership: m }: { membership: Membership }) {
  const rights = [m.can_bid && t('Bid'), m.can_sign && t('Sign'), m.can_manage && t('Manage')].filter(Boolean) as string[];
  return (
    <li>
      <Link to={`/market/companies/${m.company.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-primary_hover">
        <Building07 className="size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-primary">{m.company.name}</p>
          <p className="text-sm text-tertiary">
            {m.company.registry_number} · {rights.length ? rights.join(', ') : t('Browse only')}
          </p>
        </div>
        {m.company.frozen && (
          <Badge size="sm" type="pill-color" color="error">
            {t('Frozen')}
          </Badge>
        )}
        <ChevronRight className="size-4 text-fg-quaternary" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** The two ways to become a company's representative: the director approves, or staff check a power of attorney. */
function AskToAct({ company, onSent }: { company: MarketCompany; onSent: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [sentAttorney, setSentAttorney] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'director' | 'attorney' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = (method: 'director' | 'attorney') => {
    setBusy(method);
    setError(null);
    marketApi.requestRepresentation(company.id, method, method === 'attorney' ? (file ?? undefined) : undefined).then(
      ({ approve_url }) => {
        setBusy(null);
        if (method === 'director') setLink(approve_url);
        else setSentAttorney(true);
        onSent();
      },
      (err) => {
        setBusy(null);
        setError(message(err));
      },
    );
  };

  return (
    <div className="space-y-4 rounded-lg bg-secondary p-4">
      <div>
        <p className="text-sm font-semibold text-primary">{t('Act for {company}', { company: company.name })}</p>
        <p className="text-sm text-tertiary">{t('You are not its director in ХУР. Ask the director to approve you, or send a power of attorney.')}</p>
      </div>
      {error && <Alert>{error}</Alert>}

      {link ? (
        <ShareLink url={link} hint={t('Send this link to the director. They sign in with DAN and approve. It works once, for 14 days.')} />
      ) : sentAttorney ? (
        <Success>{t('Sent. Our team will check the power of attorney and let you know.')}</Success>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium text-secondary">{t('Ask the director')}</p>
            <Button size="sm" color="secondary" isLoading={busy === 'director'} onPress={() => ask('director')}>
              {t('Get an approval link')}
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-secondary">{t('Send a power of attorney')}</p>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              aria-label={t('Power of attorney (PDF, JPG or PNG)')}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-tertiary file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-secondary file:ring-1 file:ring-primary"
            />
            <Button size="sm" color="secondary" iconLeading={Upload01} isLoading={busy === 'attorney'} isDisabled={!file} onPress={() => ask('attorney')}>
              {t('Send for review')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RequestsCard({ requests }: { requests: MyRequest[] }) {
  const status = { pending: t('Waiting'), approved: t('Approved'), rejected: t('Declined') };
  const color = { pending: 'warning', approved: 'success', rejected: 'error' } as const;
  return (
    <Card title={t('My requests')} description={t('Your requests to act for companies.')}>
      <ul className="divide-y divide-secondary">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-primary">{r.company.name}</p>
              <p className="text-sm text-tertiary">
                {r.method === 'director' ? t('Director approval') : t('Power of attorney')} · {new Date(r.created_at).toLocaleDateString()}
                {r.reason && ` · ${r.reason}`}
              </p>
            </div>
            <Badge size="sm" type="pill-color" color={color[r.status]}>
              {status[r.status]}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Trash01, UserPlus01 } from '@untitledui/icons';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Alert, IconAction } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { marketApi, type Member, type Membership, type Rights } from '../../lib/marketApi';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Card, Pulse, ShareLink } from './parts';
import { t } from '@/i18n';

const message = (err: unknown) => (err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
const RIGHTS: { key: keyof Rights; label: () => string }[] = [
  { key: 'can_bid', label: () => t('Bid') },
  { key: 'can_sign', label: () => t('Sign') },
  { key: 'can_manage', label: () => t('Manage') },
];

/** A company the user acts for: its members and their rights; managers change them and invite colleagues. */
export default function CompanyPage() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const [mine, setMine] = useState<Membership | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const load = () =>
    Promise.all([marketApi.me(), marketApi.members(id)]).then(
      ([me, list]) => {
        setMine(me.memberships.find((m) => m.company.id === id) ?? null);
        setMembers(list);
      },
      (err) => setError(message(err)),
    );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const manages = !!mine?.can_manage && !mine.company.frozen;
  const change = (member: Member, rights: Rights) => {
    setError(null);
    setMembers((list) => list?.map((m) => (m.id === member.id ? { ...m, ...rights } : m)) ?? null);
    marketApi.updateMember(id, member.id, rights).catch((err) => {
      setError(message(err));
      void load();
    });
  };
  const remove = (member: Member) => {
    setError(null);
    marketApi.removeMember(id, member.id).then(load, (err) => setError(message(err)));
  };

  return (
    <>
      <PageHeader
        title={mine?.company.name ?? t('Company')}
        subtitle={mine ? `${mine.company.registry_number}${mine.company.frozen ? ` · ${t('Frozen: ХУР says it is no longer active.')}` : ''}` : undefined}
        actions={
          manages && (
            <Button size="sm" iconLeading={UserPlus01} onPress={() => setInviting(true)}>
              {t('Invite a colleague')}
            </Button>
          )
        }
      />
      <div className="max-w-3xl space-y-5">
        {error && <Alert>{error}</Alert>}
        {!members ? (
          !error && <Pulse className="h-48" />
        ) : (
          <Card title={t('Members')} description={t('Everyone browses. Bid, sign and manage are rights a manager gives.')}>
            <ul className="divide-y divide-secondary">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3 first:pt-0 last:pb-0">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
                    {m.user.verified_name ?? '—'}
                    {m.user.id === user?.id && <span className="text-tertiary"> ({t('you')})</span>}
                  </p>
                  {RIGHTS.map((r) => (
                    <Checkbox
                      key={r.key}
                      label={r.label()}
                      isSelected={m[r.key]}
                      isDisabled={!manages}
                      onChange={(on) => change(m, { can_bid: m.can_bid, can_sign: m.can_sign, can_manage: m.can_manage, [r.key]: on })}
                    />
                  ))}
                  {(manages || m.user.id === user?.id) && (
                    <IconAction icon={Trash01} label={m.user.id === user?.id ? t('Leave the company') : t('Remove')} onPress={() => remove(m)} />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      {inviting && <InviteModal companyId={id} onClose={() => setInviting(false)} />}
    </>
  );
}

function InviteModal({ companyId, onClose }: { companyId: number; onClose: () => void }) {
  const [rights, setRights] = useState<Rights>({ can_bid: true, can_sign: false, can_manage: false });
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = () => {
    setBusy(true);
    setError(null);
    marketApi.invite(companyId, rights).then(
      (r) => {
        setBusy(false);
        setUrl(r.url);
      },
      (err) => {
        setBusy(false);
        setError(message(err));
      },
    );
  };

  return (
    <Modal title={t('Invite a colleague')} description={t('They open the link, verify with DAN, and join with these rights.')} onClose={onClose} size="sm">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {url ? (
          <ShareLink url={url} hint={t('Send this link to your colleague. It works once, for 7 days.')} />
        ) : (
          <>
            <div className="space-y-3">
              {RIGHTS.map((r) => (
                <Checkbox key={r.key} label={r.label()} isSelected={rights[r.key]} onChange={(on) => setRights({ ...rights, [r.key]: on })} />
              ))}
            </div>
            <div className="modal-footer flex justify-end gap-2 border-t border-secondary pt-4">
              <Button size="sm" color="secondary" onPress={onClose}>
                {t('Cancel')}
              </Button>
              <Button size="sm" isLoading={busy} onPress={make}>
                {t('Make the link')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

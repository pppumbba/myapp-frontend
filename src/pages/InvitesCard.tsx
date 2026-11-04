import { useEffect, useState, type ReactNode } from 'react';
import { Copy01, Plus } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import type { Role } from '../lib/accessApi';
import { customerApi, type CustomerInvite } from '../lib/customerApi';
import { Modal } from '../components/Modal';
import { Alert } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { t } from '@/i18n';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Shows a code as people type it: ABCD-2345. */
const shown = (code: string) => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

function state(invite: CustomerInvite): { label: string; color: 'success' | 'gray' } {
  if (invite.revoked_at) return { label: t('Revoked'), color: 'gray' };
  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) return { label: t('Expired'), color: 'gray' };
  if (invite.max_uses !== null && invite.uses >= invite.max_uses) return { label: t('Used up'), color: 'gray' };
  return { label: t('Open'), color: 'success' };
}

/**
 * Invite codes of the current customer: someone who signs up (or is signed in) types one to join,
 * and gets the roles picked here. Only admins see this.
 */
export function InvitesCard({ roles, card }: { roles: Role[]; card: (props: { title: string; description: string; actions?: ReactNode; children: ReactNode }) => ReactNode }) {
  const [invites, setInvites] = useState<CustomerInvite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  useEffect(() => {
    customerApi.invites().then(setInvites, (err) => setError(message(err, t('Invite codes could not be loaded.'))));
  }, []);

  async function revoke(id: number) {
    try {
      const updated = await customerApi.revokeInvite(id);
      setInvites((list) => list?.map((i) => (i.id === id ? updated : i)) ?? null);
    } catch {
      // The error dialog has told them.
    }
  }

  return card({
    title: t('Invite codes'),
    description: t('Give a code to someone to let them join this customer, with the roles it gives.'),
    actions: (
      <Button size="sm" iconLeading={Plus} onPress={() => setMaking(true)}>
        {t('New code')}
      </Button>
    ),
    children: (
      <>
        {error && (
          <div className="px-4 pt-4 sm:px-5">
            <Alert>{error}</Alert>
          </div>
        )}
        <ul className="divide-y divide-secondary">
          {invites?.map((invite) => {
            const s = state(invite);
            return (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-primary">{shown(invite.code)}</span>
                    <Badge type="pill-color" size="sm" color={s.color}>
                      {s.label}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-tertiary">
                    {invite.roles.length ? invite.roles.map((r) => r.name).join(', ') : t('No roles')}
                    {' · '}
                    {invite.max_uses !== null ? t('{uses} of {max} used', { uses: invite.uses, max: invite.max_uses }) : t('{uses} used', { uses: invite.uses })}
                    {invite.expires_at && ` · ${t('until {date}', { date: new Date(invite.expires_at).toLocaleDateString() })}`}
                  </p>
                </div>
                {s.color === 'success' && (
                  <>
                    <Button size="sm" color="tertiary" iconLeading={Copy01} aria-label={t('Copy code')} onPress={() => navigator.clipboard?.writeText(shown(invite.code))} />
                    <Button size="sm" color="secondary-destructive" onPress={() => revoke(invite.id)}>
                      {t('Revoke')}
                    </Button>
                  </>
                )}
              </li>
            );
          })}
          {invites?.length === 0 && <li className="px-4 py-6 text-center text-sm text-tertiary sm:px-5">{t('No invite codes yet.')}</li>}
        </ul>
        {making && (
          <InviteModal
            roles={roles}
            onClose={() => setMaking(false)}
            onMade={(invite) => {
              setInvites((list) => [invite, ...(list ?? [])]);
              setMaking(false);
            }}
          />
        )}
      </>
    ),
  });
}

function InviteModal({ roles, onClose, onMade }: { roles: Role[]; onClose: () => void; onMade: (invite: CustomerInvite) => void }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [maxUses, setMaxUses] = useState('');
  const [days, setDays] = useState('7');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: number, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function make() {
    setBusy(true);
    setError(null);
    const dayCount = Number(days);
    try {
      onMade(
        await customerApi.createInvite({
          role_ids: [...picked],
          max_uses: maxUses ? Number(maxUses) : null,
          expires_at: dayCount > 0 ? new Date(Date.now() + dayCount * 86_400_000).toISOString() : null,
        }),
      );
    } catch (err) {
      setError(message(err, t('The code could not be made.')));
      setBusy(false);
    }
  }

  return (
    <Modal title={t('New invite code')} description={t('Whoever joins with it gets these roles.')} onClose={onClose} size="sm">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="space-y-3">
          {roles.map((r) => (
            <Checkbox key={r.id} label={r.name} hint={r.description || undefined} isSelected={picked.has(r.id)} onChange={(on) => toggle(r.id, on)} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('Works for (days)')} type="number" inputMode="numeric" value={days} onChange={setDays} hint={t('Empty: no end')} />
          <Input label={t('Times it can be used')} type="number" inputMode="numeric" value={maxUses} onChange={setMaxUses} hint={t('Empty: any number')} />
        </div>
        <div className="modal-footer flex justify-end gap-3 border-t border-secondary pt-4">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button size="sm" isLoading={busy} showTextWhileLoading onPress={make}>
            {t('Make the code')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

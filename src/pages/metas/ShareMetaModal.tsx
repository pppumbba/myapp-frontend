import { useEffect, useMemo, useState } from 'react';
import { SearchLg } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import type { Meta } from '../../lib/metaApi';
import { libraryApi, type MetaShares } from '../../lib/libraryApi';
import { avatarUrl } from '../../lib/avatarApi';
import { initials } from '../../lib/initials';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { Avatar } from '@/components/base/avatar/avatar';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { t } from '@/i18n';

/**
 * Who a meta is shared with: tick admins and builders of this workspace. It shows in their
 * Shared with me, they get a notification, and builders may change it as if they had made it.
 */
export function ShareMetaModal({ meta, onClose, onShared }: { meta: Meta; onClose: () => void; onShared?: (notice: string) => void }) {
  const [shares, setShares] = useState<MetaShares | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    libraryApi.shares(meta.id).then(
      (s) => {
        setShares(s);
        setPicked(new Set(s.shared.map((p) => p.id)));
      },
      (err) => setError(err instanceof ApiError ? err.message : t('Who it is shared with could not be loaded.')),
    );
  }, [meta.id]);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (shares?.people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [shares, query]);
  const sharedAt = useMemo(() => new Map(shares?.shared.map((p) => [p.id, p]) ?? []), [shares]);

  const toggle = (id: number, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await libraryApi.share(meta.id, [...picked]);
      onShared?.(picked.size ? t('{name} is shared with {count} people.', { name: meta.name, count: picked.size }) : t('{name} is no longer shared.', { name: meta.name }));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Sharing could not be saved.'));
      setBusy(false);
    }
  }

  return (
    <Modal title={t('Share {name}', { name: meta.name })} description={t('People you tick see it in Shared with me and can change it as if they had made it.')} onClose={onClose}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {!shares ? (
          !error && <div className="h-40 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" aria-busy="true" />
        ) : shares.people.length === 0 ? (
          <p className="text-sm text-tertiary">{t('There is nobody to share with yet. Give someone a builder role in User management first.')}</p>
        ) : (
          <>
            {shares.people.length > 6 && <Input aria-label={t('Search people')} type="search" size="sm" icon={SearchLg} value={query} onChange={setQuery} placeholder={t('Name or email')} />}
            <ul className="max-h-80 divide-y divide-secondary overflow-y-auto rounded-lg ring-1 ring-secondary">
              {people.map((p) => {
                const had = sharedAt.get(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Checkbox aria-label={t('Share with {name}', { name: p.name })} isSelected={picked.has(p.id)} onChange={(on) => toggle(p.id, on)} />
                    <Avatar size="sm" src={avatarUrl(p)} initials={initials(p.name)} alt={p.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-primary">{p.name}</p>
                      <p className="truncate text-xs text-tertiary">{had?.by ? t('{email} · shared by {name}', { email: p.email, name: had.by }) : p.email}</p>
                    </div>
                    {p.is_admin && (
                      <Badge type="pill-color" size="sm" color="gray">
                        {t('Admin')}
                      </Badge>
                    )}
                  </li>
                );
              })}
              {people.length === 0 && <li className="px-3 py-6 text-center text-sm text-tertiary">{t('Nobody matches.')}</li>}
            </ul>
          </>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button size="sm" isLoading={busy} showTextWhileLoading isDisabled={!shares || shares.people.length === 0} onPress={save}>
            {t('Save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

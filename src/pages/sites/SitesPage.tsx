import { useEffect, useState, type FormEvent } from 'react';
import { Globe01, Plus } from '@untitledui/icons';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { siteApi, type SiteSummary } from '../../lib/siteApi';
import { AppShell, PageHeader } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { Alert } from '../../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { t } from '@/i18n';

/** /sites — every website: where it answers, how many pages are live, and its visits this week. */
export default function SitesPage() {
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    siteApi.list().then(setSites, (err) => setError(err instanceof ApiError ? err.message : t('The websites could not be loaded.')));
  }, []);

  return (
    <AppShell>
      <PageHeader
        title={t('Websites')}
        subtitle={t('Public sites built from pages: their addresses, menu, domains, publishing and visits.')}
        actions={
          <Button size="sm" iconLeading={Plus} onPress={() => setCreating(true)}>
            {t('New website')}
          </Button>
        }
      />
      {error && <Alert>{error}</Alert>}
      {!sites ? (
        !error && <div className="h-40 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : sites.length === 0 ? (
        <div className="rounded-xl bg-primary p-8 text-center ring-1 ring-secondary">
          <Globe01 className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-primary">{t('No websites yet')}</p>
          <p className="mt-1 text-sm text-tertiary">{t('Make one; it starts with an empty home page to design.')}</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {sites.map((s) => (
            <li key={s.id}>
              <Link to={`/sites/${s.id}`} className="block h-full rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <Globe01 className="size-5 text-fg-secondary" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-md font-semibold text-primary">{s.title || s.name}</p>
                    <p className="truncate font-mono text-sm text-tertiary">{s.host ?? `/site/${s.code}`}</p>
                  </div>
                  {!s.is_active && (
                    <Badge type="color" size="sm" color="gray">
                      {t('Off')}
                    </Badge>
                  )}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-tertiary">{t('Pages live')}</dt>
                    <dd className="font-semibold text-primary tabular-nums">
                      {s.live} / {s.pages}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-tertiary">{t('Views, last 7 days')}</dt>
                    <dd className="font-semibold text-primary tabular-nums">{s.views_7_days.toLocaleString()}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <NewSiteModal onClose={() => setCreating(false)} />}
    </AppShell>
  );
}

function NewSiteModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const site = await siteApi.create(name.trim());
      navigate(`/sites/${site.meta.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The website could not be made.'));
      setBusy(false);
    }
  }

  return (
    <Modal title={t('New website')} onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Input label={t('Name')} isRequired autoFocus value={name} onChange={setName} placeholder={t('Company website')} />
        <div className="modal-footer flex justify-end gap-2">
          <Button color="secondary" onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" isLoading={busy} isDisabled={!name.trim()}>
            {t('Make it')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

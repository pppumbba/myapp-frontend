import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { customerApi, type PlatformCustomer } from '../lib/customerApi';
import { PageHeader } from '../components/AppShell';
import { Alert } from '../components/ui';
import { t } from '@/i18n';

/** /platform/customers — every customer on the platform, for its owners. Pricing and limits come later. */
export default function PlatformCustomersPage() {
  const [rows, setRows] = useState<PlatformCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    customerApi.platform().then(setRows, (err) => setError(err instanceof ApiError ? err.message : t('Customers could not be loaded.')));
  }, []);

  return (
    <>
      <PageHeader title={t('Customers')} subtitle={t('Every customer on the platform, with how many people are in it.')} />
      {error && <Alert>{error}</Alert>}
      {rows && (
        <div className="overflow-x-auto rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-secondary text-xs font-semibold text-tertiary">
              <tr>
                <th className="px-5 py-3">{t('Name')}</th>
                <th className="px-5 py-3">{t('Code')}</th>
                <th className="px-5 py-3 text-right">{t('People')}</th>
                <th className="px-5 py-3">{t('Made')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3 font-semibold text-primary">{c.name}</td>
                  <td className="px-5 py-3 font-mono text-tertiary">{c.code}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-secondary">{c.members}</td>
                  <td className="px-5 py-3 text-tertiary">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-tertiary">
                    {t('No customers yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

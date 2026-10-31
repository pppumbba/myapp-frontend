import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Database01, LinkExternal01, Plus } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { metaApi, type Meta } from '../lib/metaApi';
import { PageHeader } from '../components/AppShell';
import { Modal } from '../components/Modal';
import { Alert } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { QueryDesigner } from './metas/QueryDesigner';
import { t } from '@/i18n';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const codeFrom = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'new'}_query`;

/**
 * The query builder on a page of its own: every query meta, a new one in two fields, and the
 * designer full width. The same designer shows on a query meta's page under Metas.
 */
export default function QueryBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [queries, setQueries] = useState<Meta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const current = queries?.find((q) => String(q.id) === id) ?? null;

  useEffect(() => {
    metaApi.list().then(
      (metas) => setQueries(metas.filter((m) => m.type?.code === 'query').sort((a, b) => a.name.localeCompare(b.name))),
      (err) => setError(message(err, t("The queries could not be loaded."))),
    );
  }, []);

  return (
    <>
      <PageHeader
        title={current ? current.name : t("Query builder")}
        subtitle={
          current
            ? t('Query meta {code}. Grids, charts and other queries read it by this meta.', { code: current.code })
            : t("Draw SELECT queries from tables, views and other queries. Each is kept as a query meta that grids and charts read, and other queries use as a sub-query.")
        }
        actions={
          <>
            {queries && queries.length > 0 && (
              <select
                aria-label={t("Open a query")}
                className="rounded-lg bg-primary px-3 py-2 text-sm text-primary shadow-xs ring-1 ring-primary ring-inset outline-none focus:ring-2 focus:ring-brand"
                value={current?.id ?? ''}
                onChange={(e) => navigate(e.target.value ? `/query-builder/${e.target.value}` : '/query-builder')}
              >
                <option value="">{t("All queries")}</option>
                {queries.map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            )}
            {current && (
              <Button size="sm" color="secondary" iconLeading={LinkExternal01} href={`/metas/${current.id}`}>
                {t("Meta settings")}
              </Button>
            )}
            <Button size="sm" iconLeading={Plus} onPress={() => setCreating(true)}>
              {t("New query")}
            </Button>
          </>
        }
      />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}

      {!queries ? (
        <div className="h-96 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : current ? (
        <QueryDesigner key={current.id} meta={current} tall />
      ) : id ? (
        <Alert>{t("There's no query meta {id}. Pick one from the list.", { id })}</Alert>
      ) : queries.length === 0 ? (
        <div className="rounded-xl bg-primary p-8 text-center ring-1 ring-secondary">
          <Database01 className="mx-auto size-8 text-fg-quaternary" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-primary">{t("No queries yet")}</p>
          <p className="mt-1 text-sm text-tertiary">{t("Make one, then drag tables onto its canvas.")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {queries.map((q) => (
            <li key={q.id}>
              <Link to={`/query-builder/${q.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-primary_hover">
                <Database01 className="size-5 shrink-0 text-fg-brand-secondary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary">{q.name}</p>
                  <p className="truncate font-mono text-xs text-tertiary" title={q.query_string ?? ''}>
                    {q.query_string ? q.query_string.replace(/\s+/g, ' ') : t("No design yet")}
                  </p>
                </div>
                <Badge type="color" size="sm" color="gray">
                  {q.code}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <NewQueryModal
          onClose={() => setCreating(false)}
          onCreated={(meta) => {
            setQueries((list) => [...(list ?? []), meta].sort((a, b) => a.name.localeCompare(b.name)));
            setCreating(false);
            navigate(`/query-builder/${meta.id}`);
          }}
        />
      )}
    </>
  );
}

function NewQueryModal({ onClose, onCreated }: { onClose: () => void; onCreated: (meta: Meta) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const fe = (key: string) => fieldErrors[key]?.[0];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const type = (await metaApi.types()).find((item) => item.code === 'query');
      if (!type) throw new Error(t("There is no query meta type."));
      const meta = await metaApi.create({ name: name.trim(), code: code.trim(), type_id: type.id, is_active: true });
      onCreated({ ...meta, type });
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      else setError(err instanceof Error ? err.message : t("The query could not be made."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t("New query")} description={t("A query meta; its design is drawn on the next page.")} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <Input
          label={t("Name")}
          isRequired
          value={name}
          onChange={(v) => {
            setName(v);
            if (!codeTouched) setCode(codeFrom(v));
          }}
          placeholder={t("Late deliveries")}
          isInvalid={!!fe('name')}
          hint={fe('name')}
        />
        <Input
          label={t("Code")}
          isRequired
          value={code}
          onChange={(v) => {
            setCode(v);
            setCodeTouched(true);
          }}
          inputClassName="font-mono"
          isInvalid={!!fe('code')}
          hint={fe('code') ?? t("Unique; other metas find it by this.")}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" color="secondary" onPress={onClose}>
            {t("Cancel")}
          </Button>
          <Button size="sm" type="submit" isLoading={saving} showTextWhileLoading isDisabled={!name.trim() || !code.trim()}>
            {t("Make it")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

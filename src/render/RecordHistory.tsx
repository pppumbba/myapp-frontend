import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { dataApi, type LineChanges, type RecordChanges, type RecordLogEntry } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import { Modal } from '../components/Modal';
import { Alert } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import type { DetailNode } from './definitions';
import { t } from '@/i18n';

/** Field labels of one level: the form's or a detail's line form, with the details below it. */
interface Labels {
  fields: Map<string, string>;
  details: Map<string, { label: string; labels: Labels }>;
}

const labelsOf = (params: MetaParam[], nodes: DetailNode[]): Labels => {
  const fields = new Map<string, string>();
  const walk = (ps: MetaParam[]) =>
    ps.forEach((p) => {
      fields.set(p.field_path, p.label_name || p.param_name || p.field_path);
      if (p.children?.length) walk(p.children);
    });
  walk(params);
  return {
    fields,
    details: new Map(nodes.map((n) => [n.detail.field_path, { label: n.detail.label_name || n.detail.param_name || n.detail.field_path, labels: labelsOf(n.def.params, n.children) }])),
  };
};

const ACTION = { created: ['Created', 'success'], updated: ['Changed', 'brand'], deleted: ['Deleted', 'error'] } as const;
const SOURCE: Record<RecordLogEntry['source'], string | null> = { form: null, process_flow: 'by a process flow', schedule: 'by a schedule', import: 'by an Excel import', matrix: 'in a matrix' };

/** A value as one short line: empty shows as a dash, long text is cut. */
function shown(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

/**
 * A record's change log: each logged save, newest first, with who made it, how, and what
 * changed: fields from what to what, and lines added, removed or changed (with theirs).
 */
export function RecordHistory({ metaId, recordId, params, tree, onClose }: { metaId: number; recordId: string; params: MetaParam[]; tree: DetailNode[]; onClose: () => void }) {
  const [entries, setEntries] = useState<RecordLogEntry[] | null>(null);
  const [page, setPage] = useState(1);
  const [last, setLast] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const labels = labelsOf(params, tree);

  useEffect(() => {
    dataApi.log(metaId, recordId, page).then(
      (r) => {
        setEntries((e) => (page === 1 ? r.data : [...(e ?? []), ...r.data]));
        setLast(r.last_page);
      },
      (err) => setError(err instanceof ApiError ? err.message : t('The history could not be loaded.')),
    );
  }, [metaId, recordId, page]);

  return (
    <Modal title={t('History')} description={t('Every save of this record, newest first.')} onClose={onClose} size="lg">
      {error && <Alert>{error}</Alert>}
      {!entries ? (
        <div className="h-32 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
      ) : !entries.length ? (
        <p className="py-6 text-center text-sm text-tertiary">{t('No changes have been logged for this record yet. The log starts when it is turned on for the form.')}</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((e) => {
            const [english, color] = ACTION[e.action];
            const action = t(english);
            return (
              <li key={e.id} className="rounded-xl p-3 ring-1 ring-secondary">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <Badge size="sm" type="pill-color" color={color}>
                    {action}
                  </Badge>
                  <span className="font-medium text-primary">{e.user_name ?? t('Someone')}</span>
                  {SOURCE[e.source] && <span className="text-tertiary">{SOURCE[e.source]}</span>}
                  <time className="ml-auto text-tertiary" dateTime={e.created_at}>
                    {new Date(e.created_at.replace(' ', 'T')).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </time>
                </div>
                {e.action === 'deleted' ? (
                  <p className="text-sm text-tertiary">{t('The record was deleted. Its values and lines as they were are kept in the log.')}</p>
                ) : (
                  <Changes changes={e.changes ?? {}} labels={labels} created={e.action === 'created'} />
                )}
              </li>
            );
          })}
        </ol>
      )}
      {entries && page < last && (
        <div className="mt-4 flex justify-center">
          <Button size="sm" color="secondary" onPress={() => setPage((p) => p + 1)}>
            {t('Show older')}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function Changes({ changes, labels, created }: { changes: RecordChanges; labels: Labels; created?: boolean }) {
  const fields = Object.entries(changes.fields ?? {}).filter(([name, [, to]]) => !created || (to !== null && to !== ''));
  return (
    <div className="space-y-1.5 text-sm">
      {fields.length > 0 && (
        <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1">
          {fields.map(([name, [from, to]]) => (
            <div key={name} className="contents">
              <dt className="text-tertiary">{labels.fields.get(name) ?? name}</dt>
              <dd className="min-w-0 break-words text-primary">
                {created ? (
                  shown(to)
                ) : (
                  <>
                    <span className="text-tertiary line-through decoration-fg-quaternary">{shown(from)}</span> → {shown(to)}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {Object.entries(changes.lines ?? {}).map(([field, lines]) => (
        <LinesChanged key={field} lines={lines} detail={labels.details.get(field) ?? { label: field, labels: { fields: new Map(), details: new Map() } }} />
      ))}
    </div>
  );
}

function LinesChanged({ lines, detail }: { lines: LineChanges; detail: { label: string; labels: Labels } }) {
  const counts = [
    lines.added?.length && `${lines.added.length} added`,
    lines.removed?.length && `${lines.removed.length} removed`,
    lines.changed?.length && `${lines.changed.length} changed`,
  ].filter(Boolean);
  return (
    <div className="rounded-lg bg-secondary px-3 py-2">
      <p className="font-medium text-secondary">
        {detail.label}: {counts.join(', ')}
      </p>
      {lines.changed?.map((c) => (
        <div key={String(c.id)} className="mt-1.5 border-l-2 border-secondary pl-3">
          <p className="text-xs text-tertiary">{t('Line #{id}', { id: String(c.id) })}</p>
          <Changes changes={c} labels={detail.labels} />
        </div>
      ))}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FilterLines, Plus } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { GridFilters, type Filters } from './GridFilters';
import { dataApi, type DataRow } from '../lib/dataApi';
import { Alert } from '../components/ui';
import { Modal } from '../components/Modal';
import { Button } from '@/components/base/buttons/button';
import { FormView } from './FormView';
import { primaryKey, title, useLookup, type MetaDef } from './definitions';
import { addDays, parseLocal, swatchFor, ymd, type Swatch } from './palette';
import { t } from '@/i18n';

const WEEKS = 12;
const DAYS = WEEKS * 7;
const DAY_MS = 86_400_000;

interface Task {
  key: string;
  name: string;
  detail: string;
  start: Date;
  /** Inclusive: a task from Mon to Mon lasts one day. */
  end: Date;
  progress: number | null;
  swatch: Swatch;
}

interface Group {
  label: string;
  tasks: Task[];
}

const short = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const dayIndex = (from: Date, d: Date) => Math.round((d.getTime() - from.getTime()) / DAY_MS);

/** Where a span sits on the timeline, as percentages; null when it's outside the window. */
function place(from: Date, start: Date, end: Date) {
  const a = Math.max(0, dayIndex(from, start));
  const b = Math.min(DAYS, dayIndex(from, end) + 1);
  return b <= a ? null : { left: `${(a / DAYS) * 100}%`, width: `${((b - a) / DAYS) * 100}%` };
}

/**
 * A gantt meta as a timeline of bars, WEEKS wide. json_config names the start_field,
 * end_field, title_field, and optionally progress_field (0-100), group_field (rows are
 * grouped by it, through its lookup if it has one), detail_field (shown under the title)
 * and color_field with colors. The meta's ref_meta is the form used to add and edit tasks.
 */
/** scope: exact values every record has and new ones get; initialFilters: what the filters start at. */
export function GanttView({ def, scope, initialFilters }: { def: MetaDef; scope?: Filters; initialFilters?: Filters }) {
  const { meta, params } = def;
  const config = meta.json_config ?? {};
  const field = (name: string, fallback?: string) => (typeof config[name] === 'string' ? (config[name] as string) : fallback);
  const dates = params.filter((p) => p.data_type === 'date' || p.data_type === 'datetime');
  const startField = field('start_field', dates[0]?.field_path);
  const endField = field('end_field', dates[1]?.field_path ?? startField);
  const titleField = field('title_field', params.find((p) => p.is_show && !p.is_primary && p.data_type === 'string')?.field_path);
  const progressField = field('progress_field');
  const groupField = field('group_field');
  const detailField = field('detail_field');
  const colorField = field('color_field');
  const key = primaryKey(params);
  const formId = meta.ref_meta_id;
  // json_config.item_label names one bar, e.g. "course".
  const item = field('item_label', t('task'))!;

  const groupParam = params.find((p) => p.field_path === groupField);
  const groupOptions = useLookup(groupParam);

  const today = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0)), []);
  // The window opens on the Monday of last week, so a little history shows.
  const thisMonday = useMemo(() => addDays(today, -((today.getDay() + 6) % 7)), [today]);
  const [from, setFrom] = useState(() => addDays(thisMonday, -7));
  const [rows, setRows] = useState<DataRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // undefined: closed, null: adding, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  // Filters: the params marked is_criteria, picked the way the form picks them.
  const filterParams = useMemo(() => params.filter((p) => p.is_criteria && p.data_type !== 'detail' && p.data_type !== 'subgrid'), [params]);
  const [filters, setFilters] = useState<Filters>(() => initialFilters ?? {});
  const [showFilters, setShowFilters] = useState(() => !!initialFilters);
  const filterKey = JSON.stringify([filters, scope]);

  useEffect(() => {
    if (!startField) return;
    let live = true;
    dataApi.list(meta.id, { from: ymd(from), to: ymd(addDays(from, DAYS)), per_page: 100, sort: startField, dir: 'asc', filter: filters, scope }).then(
      (r) => {
        if (!live) return;
        setRows(r.data);
        setError(null);
      },
      (err) => live && setError(err instanceof ApiError ? err.message : t("Tasks could not be loaded.")),
    );
    return () => {
      live = false;
    };
  }, [meta.id, startField, from, reload, filterKey]);

  const groups = useMemo(() => {
    const labels = new Map(groupOptions?.map((o) => [o.value, o.label]));
    const map = new Map<string, Group>();
    for (const row of rows ?? []) {
      const start = parseLocal(row[startField!]);
      if (!start) continue;
      const end = parseLocal(endField ? row[endField] : null) ?? start;
      const raw = progressField ? Number(row[progressField]) : NaN;
      const groupValue = groupField ? String(row[groupField] ?? '') : '';
      const group = map.get(groupValue) ?? { label: labels.get(groupValue) ?? (groupValue || t("No group")), tasks: [] };
      group.tasks.push({
        key: String(row[key]),
        name: String(row[titleField!] ?? t('Untitled')),
        detail: detailField && row[detailField] != null ? String(row[detailField]) : '',
        start,
        end: end < start ? start : end,
        progress: Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : null,
        swatch: swatchFor(config.colors, colorField ? row[colorField] : null),
      });
      map.set(groupValue, group);
    }
    return [...map.values()];
  }, [rows, groupOptions, startField, endField, progressField, groupField, titleField, detailField, colorField, config.colors, key]);

  if (!startField) return <Alert>{t('"{name}" doesn\'t say which field holds the start date. Set start_field in its config.', { name: meta.name })}</Alert>;

  const to = addDays(from, DAYS - 1);
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(from, i * 7));
  const todayAt = dayIndex(from, today);
  const shift = (w: number) => setFrom((f) => addDays(f, w * 7));

  return (
    <>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        <div className="flex flex-col gap-4 border-b border-secondary px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-primary">
              {short(from)} – {to.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </h2>
            <p className="mt-0.5 truncate text-sm text-tertiary">
              {title(meta)}
              {meta.description ? ` · ${meta.description}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" color="secondary" iconLeading={ChevronLeft} aria-label={t("Earlier weeks")} onPress={() => shift(-4)} />
            <Button size="sm" color="secondary" onPress={() => setFrom(addDays(thisMonday, -7))}>
              {t("Today")}
            </Button>
            <Button size="sm" color="secondary" iconLeading={ChevronRight} aria-label={t("Later weeks")} onPress={() => shift(4)} />
            {filterParams.length > 0 && (
              <Button size="sm" color={showFilters || Object.keys(filters).length ? 'primary' : 'secondary'} iconLeading={FilterLines} aria-expanded={showFilters} onPress={() => setShowFilters((s) => !s)}>
                {Object.keys(filters).length ? t('Filters ({count})', { count: Object.keys(filters).length }) : t("Filters")}
              </Button>
            )}
            {formId && (
              <Button size="sm" iconLeading={Plus} onPress={() => setEditing(null)} className="ml-auto sm:ml-2">
                {t('Add {item}', { item })}
              </Button>
            )}
          </div>
        </div>

        {showFilters && <GridFilters params={filterParams} applied={filters} onApply={setFilters} />}

        {/* The timeline keeps a readable width and scrolls sideways on small screens. */}
        <div className="overflow-x-auto">
          <div className="relative min-w-[56rem]">
            <div className="flex border-b border-secondary text-xs font-medium text-tertiary">
              <div className="sticky left-0 z-20 w-48 shrink-0 border-r border-secondary bg-primary px-4 py-2 sm:w-60">{t("Task")}</div>
              <div className="flex flex-1">
                {weeks.map((w) => (
                  <div key={ymd(w)} className="flex-1 truncate border-l border-secondary px-1.5 py-2 first:border-l-0">
                    {short(w)}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              {/* Weekends and today, drawn once behind every row. */}
              <div className="pointer-events-none absolute inset-y-0 right-0 left-48 sm:left-60" aria-hidden="true">
                {Array.from({ length: DAYS }, (_, i) => addDays(from, i)).map((d, i) =>
                  d.getDay() === 0 || d.getDay() === 6 ? (
                    <div key={i} className="absolute inset-y-0 bg-secondary_alt" style={{ left: `${(i / DAYS) * 100}%`, width: `${100 / DAYS}%` }} />
                  ) : null,
                )}
                {weeks.slice(1).map((w, i) => (
                  <div key={ymd(w)} className="absolute inset-y-0 border-l border-secondary" style={{ left: `${((i + 1) / WEEKS) * 100}%` }} />
                ))}
                {todayAt >= 0 && todayAt < DAYS && (
                  <div className="absolute inset-y-0 w-0.5 bg-brand-solid" style={{ left: `${((todayAt + 0.5) / DAYS) * 100}%` }} />
                )}
              </div>

              {groups.map((g) => (
                <GroupRows key={g.label} group={g} from={from} showHeader={!!groupField} onOpen={formId ? setEditing : undefined} />
              ))}

              {!groups.length && (
                <div className="relative flex">
                  <div className="sticky left-0 w-48 shrink-0 border-r border-secondary bg-primary sm:w-60" />
                  <p className="flex-1 px-6 py-12 text-center text-sm text-tertiary">{rows ? t("Nothing scheduled in these weeks.") : t("Loading…")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editing !== undefined && formId && (
        <Modal title={editing ? t('Edit {item}', { item }) : t('New {item}', { item })} onClose={() => setEditing(undefined)} size="lg">
          <FormView
            metaId={formId}
            recordId={editing}
            fixed={scope}
            defaults={editing ? undefined : { [startField]: ymd(today), ...(endField && endField !== startField ? { [endField]: ymd(addDays(today, 4)) } : {}) }}
            embedded
            onCancel={() => setEditing(undefined)}
            onSaved={() => {
              setEditing(undefined);
              setReload((n) => n + 1);
            }}
          />
        </Modal>
      )}
    </>
  );
}

/** One group: a header with a summary bar over all its tasks, then a row per task. */
function GroupRows({ group, from, showHeader, onOpen }: { group: Group; from: Date; showHeader: boolean; onOpen?: (key: string) => void }) {
  const first = new Date(Math.min(...group.tasks.map((entry) => entry.start.getTime())));
  const last = new Date(Math.max(...group.tasks.map((entry) => entry.end.getTime())));
  const summary = place(from, first, last);

  return (
    <div className="border-b border-secondary last:border-b-0">
      {showHeader && (
        <div className="relative flex h-10 items-center">
          <div className="sticky left-0 z-20 flex h-full w-48 shrink-0 items-center border-r border-secondary bg-primary px-4 sm:w-60">
            <p className="truncate text-sm font-semibold text-primary">{group.label}</p>
          </div>
          <div className="relative h-full flex-1">
            {summary && <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-fg-quaternary" style={summary} aria-hidden="true" />}
          </div>
        </div>
      )}

      {group.tasks.map((entry) => {
        const at = place(from, entry.start, entry.end);
        const when = `${short(entry.start)} – ${short(entry.end)}`;
        const done = entry.progress === null ? '' : `, ${entry.progress}% done`;
        return (
          <div key={entry.key} className="relative flex h-11 items-center">
            <div className="sticky left-0 z-20 flex h-full w-48 shrink-0 items-center border-r border-secondary bg-primary px-4 sm:w-60">
              <button
                type="button"
                disabled={!onOpen}
                onClick={() => onOpen?.(entry.key)}
                className="min-w-0 flex-1 rounded-md text-left outline-focus-ring focus-visible:outline-2 enabled:hover:text-brand-secondary"
              >
                <span className={`block truncate text-sm font-medium text-primary ${showHeader ? 'pl-3' : ''}`}>{entry.name}</span>
                <span className={`block truncate text-xs text-tertiary ${showHeader ? 'pl-3' : ''}`}>
                  {[entry.detail, entry.progress === null ? null : `${entry.progress}%`].filter(Boolean).join(' · ') || when}
                </span>
              </button>
            </div>
            <div className="relative h-full flex-1">
              {at && (
                <button
                  type="button"
                  disabled={!onOpen}
                  onClick={() => onOpen?.(entry.key)}
                  title={`${entry.name}: ${when}${done}`}
                  aria-label={`${entry.name}, ${when}${done}`}
                  className={`absolute top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-md ring-1 ring-inset outline-focus-ring focus-visible:outline-2 ${entry.swatch.track}`}
                  style={at}
                >
                  {entry.progress !== null && <span className={`absolute inset-y-0 left-0 opacity-40 ${entry.swatch.dot}`} style={{ width: `${entry.progress}%` }} />}
                  {/* Shown in full on long bars, clipped on short ones; the tooltip always has it. */}
                  <span className="relative block truncate px-2 text-left text-xs leading-6 font-medium text-primary" aria-hidden="true">
                    {entry.name}
                  </span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

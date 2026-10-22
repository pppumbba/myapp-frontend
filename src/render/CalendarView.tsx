import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FilterLines, Plus } from '@untitledui/icons';
import { ApiError } from '../lib/api';
import { GridFilters, type Filters } from './GridFilters';
import { dataApi, type DataRow } from '../lib/dataApi';
import { Alert } from '../components/ui';
import { Modal } from '../components/Modal';
import { Button } from '@/components/base/buttons/button';
import { FormView } from './FormView';
import { primaryKey, title, type MetaDef } from './definitions';
import { addDays, parseLocal as parse, swatchFor, ymd, type Swatch } from './palette';

const MAX_CHIPS = 3;

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

interface CalEvent {
  key: string;
  title: string;
  start: Date;
  end: Date | null;
  swatch: Swatch;
}

/** A timed event shows its start time; one starting at midnight counts as all day. */
const label = (e: CalEvent, day: Date) =>
  ymd(e.start) === ymd(day) && (e.start.getHours() || e.start.getMinutes()) ? `${time(e.start)} ${e.title}` : e.title;

/**
 * A calendar meta as a month view. json_config names the start_field, end_field, title_field
 * and color_field (with colors: value -> palette name). The meta's ref_meta is the form used
 * to add and edit events; without one the calendar is read-only.
 */
/** scope: exact values every record has and new ones get; initialFilters: what the filters start at. */
export function CalendarView({ def, scope, initialFilters }: { def: MetaDef; scope?: Filters; initialFilters?: Filters }) {
  const { meta, params } = def;
  const config = meta.json_config ?? {};
  const field = (name: string, fallback?: string) => (typeof config[name] === 'string' ? (config[name] as string) : fallback);
  const startField = field('start_field', params.find((p) => p.data_type === 'datetime' || p.data_type === 'date')?.field_path);
  const endField = field('end_field');
  const titleField = field('title_field', params.find((p) => p.is_show && !p.is_primary && p.data_type === 'string')?.field_path);
  const colorField = field('color_field');
  const colors = config.colors;
  const key = primaryKey(params);
  const formId = meta.ref_meta_id;
  // json_config.item_label names one entry, e.g. "class".
  const item = field('item_label', 'event')!;

  const today = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0)), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today);
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

  // Six Monday-first weeks covering the month.
  const days = useMemo(() => {
    const first = addDays(month, -((month.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [month]);

  useEffect(() => {
    if (!startField) return;
    let live = true;
    dataApi
      .list(meta.id, { from: ymd(days[0]), to: ymd(addDays(days[41], 1)), per_page: 100, sort: startField, dir: 'asc', filter: filters, scope })
      .then(
        (r) => {
          if (!live) return;
          setRows(r.data);
          setError(null);
        },
        (err) => live && setError(err instanceof ApiError ? err.message : 'Events could not be loaded.'),
      );
    return () => {
      live = false;
    };
  }, [meta.id, startField, days, reload, filterKey]);

  // Each event is filed under every day it covers.
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const row of rows ?? []) {
      const start = parse(row[startField!]);
      if (!start) continue;
      const end = endField ? parse(row[endField]) : null;
      const event: CalEvent = {
        key: String(row[key]),
        title: String(row[titleField!] ?? 'Untitled'),
        start,
        end,
        swatch: swatchFor(colors, colorField ? row[colorField] : null),
      };
      const last = end && end > start ? end : start;
      for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= last; d = addDays(d, 1)) {
        const list = map.get(ymd(d)) ?? [];
        list.push(event);
        map.set(ymd(d), list);
      }
    }
    return map;
  }, [rows, startField, endField, titleField, colorField, colors, key]);

  if (!startField) return <Alert>{`"${meta.name}" doesn't say which field holds the event date. Set start_field in its config.`}</Alert>;

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const goToday = () => {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(today);
  };
  const agenda = byDay.get(ymd(selected)) ?? [];
  const weekdays = days.slice(0, 7).map((d) => d.toLocaleDateString(undefined, { weekday: 'short' }));

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
            <h2 className="text-lg font-semibold text-primary">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            <p className="mt-0.5 truncate text-sm text-tertiary">
              {title(meta)}
              {meta.description ? ` · ${meta.description}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" color="secondary" iconLeading={ChevronLeft} aria-label="Previous month" onPress={() => shift(-1)} />
            <Button size="sm" color="secondary" onPress={goToday}>
              Today
            </Button>
            <Button size="sm" color="secondary" iconLeading={ChevronRight} aria-label="Next month" onPress={() => shift(1)} />
            {filterParams.length > 0 && (
              <Button size="sm" color={showFilters || Object.keys(filters).length ? 'primary' : 'secondary'} iconLeading={FilterLines} aria-expanded={showFilters} onPress={() => setShowFilters((s) => !s)}>
                {Object.keys(filters).length ? `Filters (${Object.keys(filters).length})` : 'Filters'}
              </Button>
            )}
            {formId && (
              <Button size="sm" iconLeading={Plus} onPress={() => setEditing(null)} className="ml-auto sm:ml-2">
                Add {item}
              </Button>
            )}
          </div>
        </div>

        {showFilters && <GridFilters params={filterParams} applied={filters} onApply={setFilters} />}

        <div className="grid grid-cols-7 border-b border-secondary text-center text-xs font-medium text-tertiary">
          {weekdays.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>

        <div className={`grid grid-cols-7 ${rows ? '' : 'animate-pulse motion-reduce:animate-none'}`}>
          {days.map((day, i) => {
            const events = byDay.get(ymd(day)) ?? [];
            const inMonth = day.getMonth() === month.getMonth();
            const isToday = ymd(day) === ymd(today);
            const isSelected = ymd(day) === ymd(selected);
            return (
              <div
                key={ymd(day)}
                className={`min-h-14 border-secondary p-1 sm:min-h-24 sm:p-1.5 ${i % 7 ? 'border-l' : ''} ${i >= 7 ? 'border-t' : ''} ${
                  isSelected ? 'bg-brand-primary_alt' : inMonth ? '' : 'bg-secondary_alt'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelected(day)}
                  aria-label={day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                  aria-pressed={isSelected}
                  className={`flex size-7 items-center justify-center rounded-full text-sm tabular-nums outline-focus-ring focus-visible:outline-2 ${
                    isToday ? 'bg-brand-solid font-semibold text-white' : inMonth ? 'text-secondary hover:bg-primary_hover' : 'text-quaternary hover:bg-primary_hover'
                  }`}
                >
                  {day.getDate()}
                </button>

                {/* Phones get dots; wider screens get chips. */}
                <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                  {events.slice(0, 4).map((e) => (
                    <span key={e.key} className={`size-1.5 rounded-full ${e.swatch.dot}`} aria-hidden="true" />
                  ))}
                </div>
                <ul className="mt-1 hidden space-y-0.5 sm:block">
                  {events.slice(0, MAX_CHIPS).map((e) => (
                    <li key={e.key}>
                      <button
                        type="button"
                        disabled={!formId}
                        onClick={() => setEditing(e.key)}
                        title={e.title}
                        className={`block w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs font-medium ring-1 ring-inset outline-focus-ring focus-visible:outline-2 ${e.swatch.chip}`}
                      >
                        {label(e, day)}
                      </button>
                    </li>
                  ))}
                  {events.length > MAX_CHIPS && (
                    <li>
                      <button type="button" onClick={() => setSelected(day)} className="px-1.5 text-xs font-medium text-tertiary hover:text-secondary">
                        +{events.length - MAX_CHIPS} more
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>

        <section aria-label="Selected day" className="border-t border-secondary px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-md font-semibold text-primary">
              {selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            {formId && (
              <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => setEditing(null)}>
                Add on this day
              </Button>
            )}
          </div>
          {agenda.length ? (
            <ul className="mt-3 divide-y divide-secondary">
              {agenda.map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    disabled={!formId}
                    onClick={() => setEditing(e.key)}
                    className="flex w-full items-center gap-3 rounded-md py-2.5 text-left outline-focus-ring enabled:hover:bg-primary_hover focus-visible:outline-2"
                  >
                    <span className={`size-2.5 shrink-0 rounded-full ${e.swatch.dot}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{e.title}</span>
                    <span className="shrink-0 text-sm text-tertiary tabular-nums">{span(e)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-tertiary">{rows ? 'Nothing planned.' : 'Loading…'}</p>
          )}
        </section>
      </div>

      {editing !== undefined && formId && (
        <Modal title={editing ? `Edit ${item}` : `New ${item}`} onClose={() => setEditing(undefined)} size="lg">
          <FormView
            metaId={formId}
            recordId={editing}
            fixed={scope}
            defaults={editing ? undefined : { [startField]: `${ymd(selected)}T09:00`, ...(endField ? { [endField]: `${ymd(selected)}T10:00` } : {}) }}
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

/** "9:30 AM – 10:30 AM", "Oct 24 – Oct 26" or "All day". */
function span(e: CalEvent): string {
  const short = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timed = !!(e.start.getHours() || e.start.getMinutes());
  if (e.end && ymd(e.end) !== ymd(e.start)) return `${short(e.start)} – ${short(e.end)}`;
  if (!timed) return 'All day';
  return e.end ? `${time(e.start)} – ${time(e.end)}` : time(e.start);
}

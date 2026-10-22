import { useEffect, useMemo, useState } from 'react';
import { FilterLines } from '@untitledui/icons';
import { dataApi, type Facet } from '../lib/dataApi';
import type { MetaParam } from '../lib/metaApi';
import type { WfmStatus } from '../lib/workflowApi';
import { DatePicker } from '../components/DatePicker';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { useDebounced } from '@/hooks/use-debounced';
import { cx } from '@/utils/cx';
import { optionsOf, useLookupLabels } from './definitions';
import { asFilter, type Filters } from './GridFilters';

/** A list shows this many values until "Show all". */
const SHORT_LIST = 6;

type Kind = 'list' | 'text' | 'number' | 'date';

/** Lists for what is picked (options, lookups, yes/no, statuses); fields for what is typed. */
function kindOf(p: MetaParam, statuses?: WfmStatus[]): Kind {
  if (statuses || optionsOf(p) || (p.is_select && p.ref_meta_id) || p.data_type === 'boolean') return 'list';
  if (p.data_type === 'date' || p.data_type === 'datetime') return 'date';
  return p.data_type === 'integer' || p.data_type === 'decimal' ? 'number' : 'text';
}

/**
 * A grid's filters as a sidebar beside it (json_config.filter_layout = "sidebar"), applied
 * as they change. A field picked from a list (its own or its form's options, a lookup,
 * yes/no, a workflow status) shows its values with how many records have each under the
 * other filters (GET /metas/{id}/facets); a click picks one, another click lets it go.
 * Typed fields apply after a pause.
 */
export function GridSidebar({
  metaId,
  params,
  filters,
  onChange,
  statuses,
  search,
  scope,
  fixed,
}: {
  metaId: number;
  params: MetaParam[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  statuses?: WfmStatus[];
  search: string;
  scope?: Filters;
  fixed?: Filters;
}) {
  const shown = useMemo(() => params.map(asFilter), [params]);
  const statusesOf = (p: MetaParam) => (p.field_path === 'status_id' ? statuses : undefined);
  const lists = shown.filter((p) => kindOf(p, statusesOf(p)) === 'list');
  const labels = useLookupLabels(lists);
  const [facets, setFacets] = useState<Record<string, Facet[]>>({});
  const listKey = lists.map((p) => p.field_path).join(',');
  const queryKey = JSON.stringify([filters, search, scope, fixed]);

  useEffect(() => {
    if (!listKey) return;
    let live = true;
    dataApi.facets(metaId, listKey.split(','), { search, filter: { ...filters, ...fixed }, scope }).then(
      (f) => live && setFacets(f),
      () => live && setFacets({}),
    );
    return () => {
      live = false;
    };
  }, [metaId, listKey, queryKey]);

  const set = (field: string, value: string) => {
    const next = { ...filters };
    if (value === '') delete next[field];
    else next[field] = value;
    onChange(next);
  };
  const active = Object.keys(filters).length;

  return (
    <aside aria-label="Filters" className="rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
          <FilterLines className="size-4 text-fg-quaternary" aria-hidden="true" />
          Filters
        </h2>
        {active > 0 && (
          <Button size="sm" color="link-gray" onPress={() => onChange({})}>
            Clear all
          </Button>
        )}
      </div>
      <div className="space-y-5">
        {shown.map((p) => {
          const kind = kindOf(p, statusesOf(p));
          const label = `${p.label_name || p.param_name}${p.is_mandatory_criteria ? ' *' : ''}`;
          const value = filters[p.field_path] ?? '';
          return (
            <section key={p.field_path} aria-label={label}>
              {kind === 'list' ? (
                <FacetList
                  label={label}
                  choices={choicesOf(p, statusesOf(p), facets[p.field_path], labels.get(p.field_path))}
                  value={value}
                  onPick={(v) => set(p.field_path, v === value ? '' : v)}
                />
              ) : kind === 'date' ? (
                <DatePicker label={label} size="sm" value={value} onChange={(v) => set(p.field_path, v)} />
              ) : (
                <TypedFilter label={label} type={kind} value={value} onChange={(v) => set(p.field_path, v)} />
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

interface Choice {
  value: string;
  label: string;
  count: number;
}

/**
 * The values to pick from, each with its count: a list keeps its own order and shows its
 * values with no records too; lookups and statuses show the values records have, most
 * common first.
 */
function choicesOf(p: MetaParam, statuses: WfmStatus[] | undefined, facets: Facet[] | undefined, names: Map<string, string> | undefined): Choice[] {
  const counts = new Map((facets ?? []).map((f) => [String(f.value ?? ''), f.count]));
  const count = (v: string) => counts.get(v) ?? 0;
  const options = optionsOf(p);
  if (options) return options.map((o) => ({ value: o.id, label: o.label, count: count(o.id) }));
  if (p.data_type === 'boolean') {
    const yes = count('1') + count('true');
    const no = count('0') + count('false');
    return [
      { value: '1', label: 'Yes', count: yes },
      { value: '0', label: 'No', count: no },
    ];
  }
  const statusNames = new Map((statuses ?? []).map((s) => [String(s.id), s.label_name || s.name]));
  return (facets ?? [])
    .filter((f) => f.value !== null && f.value !== '')
    .map((f) => {
      const v = String(f.value);
      return { value: v, label: statusNames.get(v) ?? names?.get(v) ?? v, count: f.count };
    });
}

function FacetList({ label, choices, value, onPick }: { label: string; choices: Choice[]; value: string; onPick: (value: string) => void }) {
  const [all, setAll] = useState(false);
  // The picked value stays in view even when it is past the short list.
  const visible = all ? choices : choices.filter((c, i) => i < SHORT_LIST || c.value === value);

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-tertiary uppercase">{label}</p>
      {choices.length === 0 ? (
        <p className="text-sm text-quaternary">Nothing to pick.</p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {visible.map((c) => {
            const picked = c.value === value;
            return (
              <li key={c.value}>
                <button
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onPick(c.value)}
                  className={cx(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2',
                    picked ? 'bg-brand-primary_alt font-semibold text-brand-secondary' : c.count ? 'text-secondary hover:bg-primary_hover' : 'text-quaternary hover:bg-primary_hover',
                  )}
                >
                  <span className="min-w-0 truncate">{c.label}</span>
                  <span className={cx('shrink-0 text-xs tabular-nums', picked ? 'text-brand-secondary' : 'text-quaternary')}>{c.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {choices.length > SHORT_LIST && (
        <Button size="sm" color="link-gray" className="mt-1" onPress={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${choices.length}`}
        </Button>
      )}
    </div>
  );
}

/** Text or a number, applied once typing pauses. */
function TypedFilter({ label, type, value, onChange }: { label: string; type: 'text' | 'number'; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const settled = useDebounced(text);

  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (settled !== value) onChange(settled);
  }, [settled]);

  return <Input label={label} size="sm" type={type} value={text} onChange={setText} placeholder={type === 'text' ? 'Contains…' : undefined} />;
}

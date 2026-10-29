import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
} from "react";
import type { Selection, SortDescriptor } from "react-aria-components";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy01,
  DotsHorizontal,
  Download01,
  Edit01,
  Eye,
  File06,
  FilterLines,
  GitBranch01,
  Plus,
  SearchLg,
  Trash01,
  Upload01,
  Zap,
} from "@untitledui/icons";
import { Button as AriaButton, Dialog, DialogTrigger, Popover } from "react-aria-components";
import { useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { Ability } from "../lib/accessApi";
import { ApiError } from "../lib/api";
import { dataApi, type DataRow, type Page } from "../lib/dataApi";
import type { MetaAction, MetaParam } from "../lib/metaApi";
import { Alert, IconAction } from "../components/ui";
import { useFillHeight } from "./useFillHeight";
import { ContextMenu, pointOf, type MenuEntry, type MenuPoint } from "../components/ContextMenu";
import { ConfirmDialog, Modal } from "../components/Modal";
import { Table, TableCard } from "@/components/application/table/table";
import { PaginationCardMinimal } from "@/components/application/pagination/pagination";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useDebounced } from "@/hooks/use-debounced";
import { Input } from "@/components/base/input/input";
import { ColumnValue, formatNumber } from "./Cell";
import { cx } from "@/utils/cx";
import { FormView } from "./FormView";
import { GridFilters, type Filters } from "./GridFilters";
import { GridSidebar } from "./GridSidebar";
import { ImportView } from "./ImportView";
import {
  detailParams,
  isNestedSubgrid,
  isOneToOne,
  primaryKey,
  subgridParams,
  title,
  useActions,
  useGridWorkflow,
  useMetaDef,
  visibleParams,
  type MetaDef,
} from "./definitions";
import { drilldownOf, drillParams, useDrilldown } from "./drilldown";
import { StageQueryView } from "./StageQueryView";
import { StatusBadge, StatusDialog } from "./StatusDialog";
import { t } from '@/i18n';

/** Quantities and amounts line up on the right; lookup ids don't count as numbers. */
const isNumber = (p: MetaParam) =>
  (p.data_type === "integer" || p.data_type === "decimal") && !p.is_select;

// An action's icon_cls picks one of these; without one, its kind decides.
const actionIcons: Record<string, FC<{ className?: string }>> = {
  plus: Plus,
  edit: Edit01,
  trash: Trash01,
  copy: Copy01,
  eye: Eye,
  check: Check,
  file: File06,
  upload: Upload01,
};
const kindIcons: Record<MetaAction["action"], FC<{ className?: string }>> = {
  add: Plus,
  edit: Edit01,
  delete: Trash01,
  custom: File06,
  import: Upload01,
  stage_query: Zap,
};
const iconOf = (a: MetaAction) =>
  (a.icon_cls && actionIcons[a.icon_cls]) || kindIcons[a.action];

/** The column a workflow adds to its grid when the grid doesn't list status_id itself. */
const statusColumn = {
  id: -1,
  field_path: "status_id",
  param_name: "status_id",
  label_name: "Status",
  data_type: "integer",
  is_show: true,
  is_select: false,
  ref_meta_id: null,
  render_type: null,
  json_config: null,
} as MetaParam;

/**
 * An action's named parameters from a row: json_config.params maps each to a field of the
 * row. A button that needs a row and names none passes the row's key as :id.
 */
function actionParams(
  action: MetaAction,
  row: DataRow | undefined,
  key: string,
): Record<string, string> {
  const map =
    action.json_config?.params ?? (action.needs_row ? { id: key } : {});
  return Object.fromEntries(
    Object.entries(map).map(([name, field]) => [
      name,
      row?.[field] == null ? "" : String(row[field]),
    ]),
  );
}

/**
 * A tree grid's arrow before a record's first value: indented by how deep it is, opening the
 * records under it (count); a record with none gets the space only, so names line up.
 */
function TreeToggle({ depth, count, open, loading, name, onToggle }: { depth: number; count: number; open: boolean; loading: boolean; name: string; onToggle: () => void }) {
  return (
    <span className="mr-1 inline-flex items-center align-middle" style={{ marginLeft: depth * 20 }}>
      {count > 0 ? (
        <AriaButton
          aria-label={t(open ? "Hide what is under {name}" : "Show the {n} under {name}", { name, n: count })}
          aria-expanded={open}
          onPress={onToggle}
          className="flex size-6 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2"
        >
          <ChevronRight className={`size-4 transition-transform duration-100 ease-linear motion-reduce:transition-none ${open ? "rotate-90" : ""} ${loading ? "animate-pulse" : ""}`} />
        </AriaButton>
      ) : (
        <span className="size-6" aria-hidden="true" />
      )}
    </span>
  );
}

/** A row as the table lists it: a record, or the row under an expanded record that holds its nested subgrids. */
type BodyItem = DataRow & { _key: string; _depth?: number; _nestedOf?: DataRow; _footer?: true; _filler?: true };
const NESTED = "::nested";
/** The footer row: each column's json_config.aggregate over every matching row (the API's footer). */
const FOOTER = "::footer";
/** An empty row taking the space left in a grid that scrolls, so the footer sits just above the pagination. */
const FILLER = "::filler";
const AGGREGATES = ["count", "sum", "avg", "min", "max"];
const aggregateOf = (p: MetaParam) =>
  AGGREGATES.includes(p.json_config?.aggregate as string)
    ? (p.json_config!.aggregate as string)
    : null;

/**
 * How far from the left each frozen column sticks: the widths of the header cells before it,
 * measured after layout and again whenever the table resizes. Also the width the table shows,
 * which nested grids keep to so they stay in view when it scrolls sideways.
 */
function useFrozenOffsets(count: number, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [lefts, setLefts] = useState<number[]>([]);
  const [viewWidth, setViewWidth] = useState<number | undefined>();
  useLayoutEffect(() => {
    // The table's scroll box, whose clientWidth leaves out a vertical scrollbar.
    const view = ref.current?.firstElementChild;
    if (!view) return;
    const observer = new ResizeObserver(() => setViewWidth(view.clientWidth));
    observer.observe(view);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const table = ref.current?.querySelector("table");
    if (!table || !count) return setLefts((prev) => (prev.length ? [] : prev));
    const measure = () => {
      const heads = [...(table.tHead?.rows[0]?.cells ?? [])].slice(0, count);
      let left = 0;
      const next = heads.map((th) => {
        const at = left;
        left += th.getBoundingClientRect().width;
        return at;
      });
      setLefts((prev) =>
        prev.length === next.length && prev.every((v, i) => v === next[i])
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, ...deps]);
  return { ref, lefts, viewWidth };
}

/** What a toolbar button is doing right now. */
type Running = { action: MetaAction; row?: DataRow };

/** What the user must be allowed to do with an action's form to see the button. */
// Running a stage query needs edit access to it, as the run endpoint does.
const abilityOf: Record<MetaAction["action"], Ability> = {
  add: "create",
  custom: "create",
  edit: "edit",
  delete: "delete",
  import: "create",
  stage_query: "edit",
};

/**
 * A datagrid meta as a searchable, filterable, sortable, paged table. Its toolbar buttons
 * come from meta_actions (add, edit, delete, custom), each working through a form, and a
 * get meta decides what the form opens with; an import button loads an Excel file through
 * its excel_import meta. Export downloads what the grid shows, with its filters, as .xlsx. Click a row to pick it (buttons that need a
 * row act on it, and subgrids show its records); double-click runs its Edit button.
 * A nested subgrid (json_config.display "nested") opens instead under each row's expand arrow.
 * The grid's json_config.row_numbers adds a # column, and frozen_columns keeps that many
 * columns (with # and the arrow) in view when the table scrolls sideways.
 *
 * fixed: filter values set from outside, e.g. a subgrid's parameters from the parent row.
 * scope: exact values every row has and every new record gets, e.g. a workspace's tender_id;
 * unlike fixed, they hold whether or not the field is a filter.
 * initialFilters: what the filters start at, e.g. from a tab; people can change them.
 */
export function GridView({
  def,
  fixed,
  scope,
  initialFilters,
  label,
  fill,
}: {
  def: MetaDef;
  fixed?: Filters;
  scope?: Filters;
  initialFilters?: Filters;
  label?: string;
  /** A screen of its own: without a set height the grid reaches the bottom of the window and its rows scroll inside. */
  fill?: boolean;
}) {
  const { meta, params } = def;
  const workflow = useGridWorkflow(meta);
  const columns = useMemo(() => {
    // A scoped column holds the same value on every row, so it isn't shown.
    const visible = visibleParams(params).filter(
      (p) => !(scope && p.field_path in scope),
    );
    return workflow && !visible.some((p) => p.field_path === "status_id")
      ? [...visible, statusColumn]
      : visible;
  }, [params, workflow, scope]);
  const statuses = useMemo(
    () => new Map((workflow?.statuses ?? []).map((s) => [s.id, s])),
    [workflow],
  );
  const filterParams = useMemo(
    () =>
      params.filter(
        (p) =>
          p.is_criteria &&
          p.data_type !== "detail" &&
          p.data_type !== "subgrid" &&
          !(fixed && p.field_path in fixed) &&
          !(scope && p.field_path in scope),
      ),
    [params, fixed, scope],
  );
  const subgrids = useMemo(() => subgridParams(params), [params]);
  const below = useMemo(
    () => subgrids.filter((s) => !isNestedSubgrid(s)),
    [subgrids],
  );
  const nested = useMemo(() => subgrids.filter(isNestedSubgrid), [subgrids]);
  // The field holding each record's parent (is_parent): the records show as a tree.
  const parentParam = useMemo(() => params.find((p) => p.is_parent), [params]);
  const rowNumbers = meta.json_config?.row_numbers === true;
  // The arrow and # columns come first and freeze with the frozen data columns.
  const lead = (nested.length ? 1 : 0) + (rowNumbers ? 1 : 0);
  const frozenData = Math.min(
    Math.max(0, Math.floor(Number(meta.json_config?.frozen_columns) || 0)),
    columns.length,
  );
  const frozen = frozenData ? lead + frozenData : 0;
  // json_config.height / width (px): a fixed-size grid; its rows scroll both ways under a header that stays on top.
  const fixedHeight =
    Number(meta.json_config?.height) > 0
      ? Number(meta.json_config?.height)
      : undefined;
  const fixedWidth =
    Number(meta.json_config?.width) > 0
      ? Number(meta.json_config?.width)
      : undefined;
  const cardRef = useRef<HTMLDivElement>(null);
  const fillHeight = useFillHeight(cardRef, !!fill && !fixedHeight);
  // Rows scroll under a header that stays on top: in a fixed height, or a grid filling the window.
  const scrolls = !!fixedHeight || fillHeight !== undefined;
  const scrollStyle = useMemo(
    (): CSSProperties | undefined =>
      fixedHeight ? { height: fixedHeight } : fillHeight !== undefined ? { height: "100%" } : undefined,
    [fixedHeight, fillHeight],
  );
  const cardStyle = useMemo(
    (): CSSProperties | undefined =>
      fixedWidth || fillHeight !== undefined
        ? {
            ...(fixedWidth ? { width: fixedWidth, maxWidth: "100%" } : {}),
            ...(fillHeight !== undefined ? { height: fillHeight } : {}),
          }
        : undefined,
    [fixedWidth, fillHeight],
  );
  const key = primaryKey(params);
  const actions = useActions(meta.id);
  const { can } = useAuth();
  const toolbar = useMemo(
    () =>
      (actions ?? []).filter((a) => can(a.form_meta_id, abilityOf[a.action])),
    [actions, can],
  );
  const rowActions = toolbar.filter((a) => a.show_in_row);
  // The toolbar shows Add and the next two buttons by order (on a narrow screen only the first);
  // the rest, Export and Change status wait in its ⋯ menu.
  const wide = useBreakpoint("md");
  const toolbarButtons = useMemo(() => {
    const listed = toolbar.filter((a) => a.show_in_toolbar);
    return [
      ...listed.filter((a) => a.action === "add"),
      ...listed.filter((a) => a.action !== "add"),
    ].slice(0, wide ? 3 : 1);
  }, [toolbar, wide]);
  const editAction = toolbar.find((a) => a.action === "edit");
  // A drilldown on the grid opens from each row's button; one on a column, from its values.
  const drill = useDrilldown();
  const rowDrill = drill ? drilldownOf(meta.json_config) : null;
  // json_config.filter_layout "sidebar": the filters sit beside the grid, always open.
  const sidebar =
    meta.json_config?.filter_layout === "sidebar" && filterParams.length > 0;
  // "dropdown": the Filters button opens them over the grid, closing once they are applied.
  const dropdown = meta.json_config?.filter_layout === "dropdown";
  const searchable = filterParams.some(
    (p) =>
      (p.data_type === "string" || p.data_type === "text") &&
      !p.is_select &&
      !Array.isArray(p.json_config?.options),
  );

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [query, setQuery] = useState("");
  const search = useDebounced(query);
  const [filters, setFilters] = useState<Filters>(() => initialFilters ?? {});
  // Open at first when a filter must be filled in; the panel also when starting filters are given.
  const [showFilters, setShowFilters] = useState(
    () => filterParams.some((p) => p.is_mandatory_criteria) || (!!initialFilters && !dropdown),
  );
  const [sort, setSort] = useState<SortDescriptor | undefined>();
  const [result, setResult] = useState<Page<DataRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // A tree: the opened records, and the records under each, loaded when it opens.
  const [openNodes, setOpenNodes] = useState<ReadonlySet<string>>(new Set());
  const [branches, setBranches] = useState<ReadonlyMap<string, DataRow[]>>(new Map());
  // Branches asked for and not back yet, and which load of the top level they belong to.
  const branchLoading = useRef(new Set<string>());
  const branchRound = useRef(0);

  const [running, setRunning] = useState<Running | null>(null);
  const [deleting, setDeleting] = useState<Running | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [changingStatus, setChangingStatus] = useState<DataRow | null>(null);
  const [exporting, setExporting] = useState(false);
  // The right-click menu: on a row (and the cell clicked), or on the grid around the rows;
  // more: the toolbar's ⋯ menu, for the picked row.
  const [menu, setMenu] = useState<{ at: MenuPoint; row?: DataRow; field?: string; more?: boolean } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const moreRef = useRef<HTMLSpanElement>(null);

  // A notification links to /run/{grid}?record={id}: open that record's status straight away.
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedRecord =
    pathname === `/run/${meta.id}` ? searchParams.get("record") : null;
  const closeLinked = () =>
    setSearchParams(
      (p) => {
        p.delete("record");
        return p;
      },
      { replace: true },
    );

  const fixedKey = JSON.stringify([fixed ?? {}, scope ?? {}]);
  const filterKey = JSON.stringify(filters);
  // Searching or filtering lists the matching records flat, at whatever level they are.
  const tree = !!parentParam && !search && Object.keys(filters).length === 0;
  useEffect(() => setPage(1), [search, perPage, filterKey, fixedKey]);

  useEffect(() => {
    let live = true;
    dataApi
      .list(meta.id, {
        page,
        per_page: perPage,
        search,
        filter: { ...filters, ...fixed },
        scope,
        sort: sort?.column ? String(sort.column) : undefined,
        dir: sort?.direction === "descending" ? "desc" : "asc",
        // A tree lists its top level; what is under each opened record loads below.
        parent: tree ? "" : undefined,
      })
      .then(
        (r) => {
          if (!live) return;
          setResult(r);
          branchRound.current++;
          branchLoading.current.clear();
          setBranches(new Map());
          setError(null);
          // Keep the pick only while its row is still on the page.
          setSelected((s) =>
            s && r.data.some((row) => String(row[key]) === s) ? s : null,
          );
        },
        (err) =>
          live &&
          setError(
            err instanceof ApiError
              ? err.message
              : t("Records could not be loaded."),
          ),
      );
    return () => {
      live = false;
    };
    // filters and fixed are compared by value.
  }, [meta.id, page, perPage, search, filterKey, fixedKey, sort, reload, key, tree]);

  // The records under each opened one that aren't loaded yet (all again after the top level reloads).
  // Each is asked for once: opening another row meanwhile doesn't drop and re-ask one on its way;
  // only answers from before the top level reloaded are thrown away.
  useEffect(() => {
    if (!tree) return;
    const round = branchRound.current;
    for (const k of openNodes) {
      if (branches.has(k) || branchLoading.current.has(k)) continue;
      branchLoading.current.add(k);
      dataApi
        .list(meta.id, {
          parent: k,
          per_page: 100,
          filter: fixed,
          scope,
          sort: sort?.column ? String(sort.column) : undefined,
          dir: sort?.direction === "descending" ? "desc" : "asc",
        })
        .then(
          (r) => r.data,
          (): DataRow[] => [],
        )
        .then((data) => {
          if (round !== branchRound.current) return;
          branchLoading.current.delete(k);
          setBranches((b) => new Map(b).set(k, data));
        });
    }
    // fixed and scope are compared by value.
  }, [tree, openNodes, branches, meta.id, fixedKey, sort]);

  const rows = useMemo(() => result?.data ?? [], [result]);
  // Every record shown: the page's, and in a tree those under each opened one, with how deep each is.
  const records = useMemo(() => {
    const out: DataRow[] = [];
    const walk = (list: DataRow[], depth: number, above: ReadonlySet<string>) => {
      for (const r of list) {
        const k = String(r[key]);
        out.push({ ...r, _depth: depth });
        if (tree && openNodes.has(k) && !above.has(k) && depth < 20) walk(branches.get(k) ?? [], depth + 1, new Set(above).add(k));
      }
    };
    walk(rows, 0, new Set());
    return out;
  }, [rows, tree, openNodes, branches, key]);
  const selectedRow = selected
    ? records.find((r) => String(r[key]) === selected)
    : undefined;
  const missing = result?.missing_filters ?? [];
  const activeFilters = Object.keys(filters).length;
  const firstNumber = result
    ? (result.current_page - 1) * result.per_page + 1
    : 1;
  const rowIndex = useMemo(
    () => new Map(rows.map((r, i) => [String(r[key]), i])),
    [rows, key],
  );
  const hasFooter = rows.length > 0 && columns.some(aggregateOf);
  const filler = hasFooter && scrolls;
  const items = useMemo(
    () => [
      ...records.flatMap((r): BodyItem[] => {
        const item = { ...r, _key: String(r[key]) };
        return nested.length && expanded.has(item._key)
          ? [item, { _key: item._key + NESTED, _nestedOf: r }]
          : [item];
      }),
      ...(filler ? [{ _key: FILLER, _filler: true as const }] : []),
      ...(hasFooter ? [{ _key: FOOTER, _footer: true as const }] : []),
    ],
    [records, key, expanded, nested.length, hasFooter, filler],
  );
  const {
    ref: tableRef,
    lefts,
    viewWidth,
  } = useFrozenOffsets(frozen, [columns, items, nested.length, rowNumbers]);

  // The table compares cell props on every render, so each style object is made once per layout.
  const frozenStyles = useMemo(
    () =>
      Array.from({ length: frozen }, (_, i): CSSProperties => ({
        left: lefts[i] ?? 0,
      })),
    [frozen, lefts],
  );
  const nestedStyle = useMemo(
    (): CSSProperties | undefined =>
      viewWidth ? { width: viewWidth } : undefined,
    [viewWidth],
  );

  /** A frozen column's sticky position; i counts every column, the arrow and # included. */
  const freeze = (
    i: number,
    head = false,
  ): { className: string; style?: CSSProperties } =>
    i < frozen
      ? {
          className: `sticky z-[2] ${head ? "bg-secondary" : "bg-primary group-hover:bg-secondary group-data-[selected]:bg-brand-primary_alt"} ${i === frozen - 1 ? "shadow-[inset_-1px_0_0_var(--color-border-secondary)]" : ""}`,
          style: frozenStyles[i],
        }
      : { className: "" };

  const toggleNode = (rowKey: string) =>
    setOpenNodes((s) => {
      const next = new Set(s);
      if (!next.delete(rowKey)) next.add(rowKey);
      return next;
    });
  const toggle = (rowKey: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (!next.delete(rowKey)) next.add(rowKey);
      return next;
    });
  const columnCount =
    lead + columns.length + (rowActions.length || rowDrill ? 1 : 0);
  /** A footer cell: thin, shaded and bold, frozen like its column, and kept in view at the bottom of a grid that scrolls. */
  const footerCell = (i: number) =>
    cx(
      "bg-secondary py-1.5 font-semibold text-primary",
      freeze(i, true).className,
      scrolls && "sticky bottom-0 z-[2]",
      scrolls && i < frozen && "z-[3]",
      i === frozen - 1
        ? "shadow-[inset_-1px_0_0_var(--color-border-secondary),inset_0_1px_0_var(--color-border-secondary)]"
        : "shadow-[inset_0_1px_0_var(--color-border-secondary)]",
    );

  function run(action: MetaAction, row = selectedRow) {
    if (action.needs_row && !row) return;
    if (row) setSelected(String(row[key]));
    if (action.action === "delete") setDeleting({ action, row });
    else setRunning({ action, row });
  }

  async function confirmDelete() {
    if (!deleting?.row || !deleting.action.form_meta_id) return;
    setDeleteBusy(true);
    try {
      const id =
        actionParams(deleting.action, deleting.row, key).id ||
        String(deleting.row[key]);
      await dataApi.remove(deleting.action.form_meta_id, id);
      setDeleting(null);
      setReload((n) => n + 1);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("The record could not be deleted."),
      );
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function exportExcel() {
    setExporting(true);
    try {
      await dataApi.exportExcel(meta.id, meta.code, {
        search,
        filter: { ...filters, ...fixed },
        scope,
        sort: sort?.column ? String(sort.column) : undefined,
        dir: sort?.direction === "descending" ? "desc" : "asc",
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("The records could not be exported."),
      );
    } finally {
      setExporting(false);
    }
  }

  /**
   * The toolbar's actions for the menu: with a row, all of them for it; without, those needing none.
   * Delete goes last. The ⋯ menu (more) lists those needing a row too, disabled until one is picked,
   * and leaves out the buttons already in the toolbar.
   */
  function menuEntries(row?: DataRow, field?: string, more?: boolean): MenuEntry[] {
    const usable = toolbar.filter(
      (a) => (row || more || !a.needs_row) && !(more && toolbarButtons.includes(a)),
    );
    const entry = (a: MetaAction): MenuEntry => ({
      key: `a${a.id}`,
      label: a.label,
      icon: iconOf(a),
      danger: a.action === "delete",
      disabled: !a.form_meta_id || (a.needs_row && !row),
      onSelect: () => run(a, row),
    });
    const column = field ? columns.find((c) => c.field_path === field) : undefined;
    const value = row && column ? row[column.field_path] : undefined;
    return [
      ...(row && rowDrill
        ? [{ key: "drill", label: rowDrill.label || t("Open"), icon: ArrowUpRight, onSelect: () => drill!({ metaId: rowDrill.meta_id, params: drillParams(rowDrill, row), drawer: rowDrill.open_in === "drawer", label: rowName(row) || title(meta) }) }]
        : []),
      ...usable.filter((a) => a.action !== "delete").map(entry),
      ...((row || more) && workflow ? [{ key: "status", label: t("Change status"), icon: GitBranch01, disabled: !row, onSelect: () => row && setChangingStatus(row) }] : []),
      { key: "s1", separator: true as const },
      ...(row && column && value != null && value !== ""
        ? [{ key: "copy", label: t('Copy {name}', { name: column.label_name || column.param_name }), icon: Copy01, onSelect: () => void navigator.clipboard?.writeText(String(value)) }]
        : []),
      { key: "export", label: t("Export"), icon: Download01, disabled: !result?.total, onSelect: () => void exportExcel() },
      { key: "s2", separator: true as const },
      ...usable.filter((a) => a.action === "delete").map(entry),
    ];
  }

  const rowName = (row?: DataRow) =>
    row && columns[0] && !columns[0].is_select
      ? String(row[columns[0].field_path] ?? "")
      : "";

  return (
    <>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div
        className={
          sidebar ? "flex flex-col gap-4 lg:flex-row" : undefined
        }
      >
        {sidebar && (
          // Stretched to the grid's height; the filters scroll inside it when longer.
          <div className="shrink-0 lg:relative lg:w-64">
            <GridSidebar
              metaId={meta.id}
              params={filterParams}
              filters={filters}
              onChange={setFilters}
              statuses={workflow?.statuses}
              search={search}
              scope={scope}
              fixed={fixed}
            />
          </div>
        )}
        <TableCard.Root
          ref={cardRef}
          size="sm"
          style={cardStyle}
          className={cx(
            sidebar && `min-w-0 ${fixedWidth ? "shrink" : "flex-1"}`,
            fillHeight !== undefined && "flex flex-col",
          )}
        >
          <TableCard.Header
            title={label ?? title(meta)}
            badge={
              result && !missing.length ? (
                <Badge type="pill-color" size="sm" color="brand">
                  {t(result.total === 1 ? "{count} record" : "{count} records", { count: result.total })}
                </Badge>
              ) : undefined
            }
            description={meta.description ?? undefined}
            contentTrailing={
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                {searchable && (
                  <Input
                    aria-label={t('Search {name}', { name: title(meta) })}
                    type="search"
                    size="sm"
                    icon={SearchLg}
                    placeholder={t("Search")}
                    value={query}
                    onChange={setQuery}
                    className="sm:w-56"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  {filterParams.length > 0 && !sidebar && (dropdown ? (
                    <DialogTrigger isOpen={showFilters} onOpenChange={setShowFilters}>
                      <Button size="sm" color="secondary" iconLeading={FilterLines}>
                        {activeFilters ? t('Filters ({count})', { count: activeFilters }) : t('Filters')}
                      </Button>
                      <Popover
                        placement="bottom end"
                        offset={6}
                        className={({ isEntering, isExiting }) =>
                          cx(
                            "max-h-[min(36rem,calc(100vh-4rem))] overflow-y-auto rounded-xl bg-primary shadow-lg ring-1 ring-secondary_alt outline-hidden will-change-transform",
                            filterParams.length > 1 ? "w-[36rem] max-w-[calc(100vw-2rem)]" : "w-80",
                            isEntering && "duration-150 ease-out animate-in fade-in placement-bottom:slide-in-from-top-0.5",
                            isExiting && "duration-100 ease-in animate-out fade-out",
                          )
                        }
                      >
                        <Dialog aria-label={t("Filters")} className="outline-hidden">
                          <GridFilters
                            dropdown
                            params={filterParams}
                            applied={filters}
                            onApply={(next) => {
                              setFilters(next);
                              setShowFilters(false);
                            }}
                            statuses={workflow?.statuses}
                          />
                        </Dialog>
                      </Popover>
                    </DialogTrigger>
                  ) : (
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={FilterLines}
                      onPress={() => setShowFilters((s) => !s)}
                      aria-expanded={showFilters}
                    >
                      {activeFilters ? t('Filters ({count})', { count: activeFilters }) : t('Filters')}
                    </Button>
                  ))}
                  {toolbarButtons.map((a) => (
                    <Button
                      key={a.id}
                      size="sm"
                      color={
                        a.action === "add"
                          ? "primary"
                          : a.action === "delete"
                            ? "secondary-destructive"
                            : "secondary"
                      }
                      iconLeading={iconOf(a)}
                      isDisabled={
                        (a.needs_row && !selectedRow) || !a.form_meta_id
                      }
                      onPress={() => run(a)}
                    >
                      {a.label}
                    </Button>
                  ))}
                  <span ref={moreRef} className="inline-flex">
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={DotsHorizontal}
                      aria-label={t("More actions")}
                      aria-haspopup="menu"
                      aria-expanded={!!menu?.more}
                      isLoading={exporting}
                      onPress={() => {
                        const r = moreRef.current!.getBoundingClientRect();
                        // Lined up with the button's right edge (the menu is at least 13rem wide); the menu keeps itself on screen.
                        setMenu((m) => (m?.more ? null : { at: { x: r.right - 208, y: r.bottom + 4 }, row: selectedRow, more: true }));
                      }}
                    />
                  </span>
                </div>
              </div>
            }
          />

          {showFilters && !sidebar && !dropdown && filterParams.length > 0 && (
            <GridFilters
              params={filterParams}
              applied={filters}
              onApply={setFilters}
              statuses={workflow?.statuses}
            />
          )}

          <div
            ref={tableRef}
            className={fillHeight !== undefined ? "min-h-0 flex-1" : undefined}
            onContextMenu={(e) => {
              if (e.defaultPrevented || (e.target as HTMLElement).closest("input,textarea,[contenteditable=true]")) return;
              e.preventDefault();
              setMenu({ at: pointOf(e) });
            }}
          >
            <Table
              aria-label={title(meta)}
              scrollStyle={scrollStyle}
              className={filler ? "h-full" : undefined}
              sortDescriptor={sort}
              onSortChange={setSort}
              selectionMode="single"
              selectionBehavior="replace"
              selectedKeys={selected ? [selected] : []}
              onSelectionChange={(keys: Selection) =>
                setSelected(
                  keys === "all"
                    ? null
                    : [...keys][0] != null
                      ? String([...keys][0])
                      : null,
                )
              }
              // The row holding nested grids takes no selection or row action; the grids inside work as usual.
              disabledKeys={items
                .filter((r) => r._nestedOf || r._footer || r._filler)
                .map((r) => r._key)}
              disabledBehavior="selection"
              onRowAction={
                editAction
                  ? (id) =>
                      !String(id).endsWith(NESTED) &&
                      id !== FOOTER &&
                      id !== FILLER &&
                      run(
                        editAction,
                        records.find((r) => String(r[key]) === String(id)),
                      )
                  : undefined
              }
            >
              <Table.Header
                className={scrolls ? "sticky top-0 z-[3]" : undefined}
              >
                {[
                  ...(nested.length
                    ? [
                        <Table.Head
                          key="_expand"
                          id="_expand"
                          aria-label={t("Expand")}
                          style={freeze(0, true).style}
                          className={`w-px px-2 ${freeze(0, true).className}`}
                        />,
                      ]
                    : []),
                  ...(rowNumbers
                    ? [
                        <Table.Head
                          key="_rownum"
                          id="_rownum"
                          label="#"
                          style={freeze(lead - 1, true).style}
                          className={`w-px px-3 [&>div]:justify-end ${freeze(lead - 1, true).className}`}
                        />,
                      ]
                    : []),
                  ...columns.map((c, i) => {
                    const f = freeze(lead + i, true);
                    return (
                      <Table.Head
                        key={c.field_path}
                        id={c.field_path}
                        label={c === statusColumn ? t("Status") : c.label_name || c.param_name}
                        allowsSorting={c !== statusColumn}
                        isRowHeader={i === 0}
                        style={f.style}
                        className={`${isNumber(c) && !(workflow && c.field_path === "status_id") ? "[&>div]:justify-end" : ""} ${f.className}`}
                      />
                    );
                  }),
                  ...(rowActions.length || rowDrill
                    ? [<Table.Head key="_actions" id="_actions" />]
                    : []),
                ]}
              </Table.Header>
              <Table.Body
                items={items}
                dependencies={[
                  columns,
                  rowActions,
                  rowDrill,
                  lefts,
                  firstNumber,
                  expanded,
                  nested,
                  viewWidth,
                  result?.footer,
                ]}
                renderEmptyState={() => (
                  <div className="px-6 py-10 text-center">
                    {missing.length ? (
                      <>
                        <p className="text-sm font-semibold text-primary">
                          {t("Fill in the required filters")}
                        </p>
                        <p className="mt-1 text-sm text-tertiary">{t('{fields} needed before records show.', { fields: missing.join(', ') })}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-primary">
                          {result
                            ? search || activeFilters
                              ? t("No matches")
                              : t("Nothing here yet")
                            : t("Loading…")}
                        </p>
                        {result && (
                          <p className="mt-1 text-sm text-tertiary">
                            {search || activeFilters
                              ? t("Try other filters.")
                              : t("Records will show up here.")}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              >
                {(row) =>
                  row._filler ? (
                    <Table.Row id={FILLER} className="h-full hover:bg-transparent [&>td]:after:hidden">
                      {Array.from({ length: columnCount }, (_, i) => (
                        <Table.Cell key={i} className="p-0" />
                      ))}
                    </Table.Row>
                  ) : row._footer ? (
                    <Table.Row id={FOOTER} className="h-auto hover:bg-transparent">
                      {[
                        ...Array.from({ length: lead }, (_, i) => (
                          <Table.Cell
                            key={`_lead${i}`}
                            style={freeze(i, true).style}
                            className={footerCell(i)}
                          />
                        )),
                        ...columns.map((c, i) => {
                          const agg = aggregateOf(c);
                          const value = result?.footer?.[c.field_path];
                          return (
                            <Table.Cell
                              key={c.field_path}
                              style={freeze(lead + i, true).style}
                              className={cx(
                                footerCell(lead + i),
                                "whitespace-nowrap",
                                isNumber(c) ? "text-right tabular-nums" : "",
                              )}
                            >
                              {/* Only the value: no label, whatever the total is. */}
                              {!agg || value == null ? null : agg === "count" ? (
                                formatNumber(Number(value))
                              ) : (
                                <ColumnValue param={c} value={value} />
                              )}
                            </Table.Cell>
                          );
                        }),
                        ...(rowActions.length || rowDrill
                          ? [
                              <Table.Cell
                                key="_actions"
                                className={footerCell(columnCount)}
                              />,
                            ]
                          : []),
                      ]}
                    </Table.Row>
                  ) : row._nestedOf ? (
                    <Table.Row
                      id={row._key}
                      className="h-auto hover:bg-transparent"
                    >
                      <Table.Cell
                        colSpan={columnCount}
                        className="bg-secondary_subtle p-0 sm:p-0"
                      >
                        <div
                          style={nestedStyle}
                          className="sticky left-0 space-y-3 px-3 py-3 sm:pl-12"
                        >
                          {nested.map((s) => (
                            <SubGrid
                              key={s.id}
                              param={s}
                              row={row._nestedOf}
                              parentTitle={title(meta)}
                            />
                          ))}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    <Table.Row
                      id={row._key}
                      className="group cursor-pointer selected:bg-brand-primary_alt selected:hover:bg-brand-primary_alt"
                      onContextMenu={(e) => {
                        if ((e.target as HTMLElement).closest("input,textarea")) return;
                        e.preventDefault();
                        setSelected(row._key);
                        setMenu({
                          at: pointOf(e),
                          row: records.find((r) => String(r[key]) === row._key),
                          field: (e.target as HTMLElement).closest<HTMLElement>("[data-field]")?.dataset.field,
                        });
                      }}
                    >
                      {[
                        ...(nested.length
                          ? [
                              <Table.Cell
                                key="_expand"
                                style={freeze(0).style}
                                className={`w-px px-2 ${freeze(0).className}`}
                              >
                                <AriaButton
                                  aria-label={t(expanded.has(row._key) ? "Hide {name}" : "Show {name}", { name: nested.map((s) => s.label_name || s.param_name).join(", ") })}
                                  aria-expanded={expanded.has(row._key)}
                                  onPress={() => toggle(row._key)}
                                  className="flex size-7 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2"
                                >
                                  <ChevronRight
                                    className={`size-4 transition-transform duration-100 ease-linear motion-reduce:transition-none ${expanded.has(row._key) ? "rotate-90" : ""}`}
                                  />
                                </AriaButton>
                              </Table.Cell>,
                            ]
                          : []),
                        ...(rowNumbers
                          ? [
                              <Table.Cell
                                key="_rownum"
                                style={freeze(lead - 1).style}
                                className={`w-px px-3 text-right tabular-nums text-quaternary ${freeze(lead - 1).className}`}
                              >
                                {/* Only the page's own records count; those under them in a tree don't. */}
                                {rowIndex.has(row._key) && !row._depth ? firstNumber + rowIndex.get(row._key)! : ""}
                              </Table.Cell>,
                            ]
                          : []),
                        ...columns.map((c, i) => (
                          <Table.Cell
                            key={c.field_path}
                            data-field={c.field_path}
                            style={freeze(lead + i).style}
                            className={`${i === 0 ? "font-medium text-primary" : "whitespace-nowrap"} ${isNumber(c) && !(workflow && c.field_path === "status_id") ? "text-right" : ""} ${freeze(lead + i).className}`}
                          >
                            {i === 0 && tree && (
                              <TreeToggle
                                depth={row._depth ?? 0}
                                count={Number(row._children) || 0}
                                open={openNodes.has(row._key)}
                                loading={openNodes.has(row._key) && !branches.has(row._key)}
                                name={rowName(row) || row._key}
                                onToggle={() => toggleNode(row._key)}
                              />
                            )}
                            {workflow && c.field_path === "status_id" ? (
                              <StatusBadge
                                status={statuses.get(Number(row.status_id))}
                              />
                            ) : drill && drilldownOf(c.json_config) ? (
                              <AriaButton
                                onPress={() => {
                                  const d = drilldownOf(c.json_config)!;
                                  drill({
                                    metaId: d.meta_id,
                                    params: drillParams(d, row),
                                    drawer: d.open_in === "drawer",
                                    label: rowName(row) || title(meta),
                                  });
                                }}
                                className="rounded text-left font-medium text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                              >
                                <ColumnValue
                                  param={c}
                                  value={row[c.field_path]}
                                />
                              </AriaButton>
                            ) : (
                              <ColumnValue
                                param={c}
                                value={row[c.field_path]}
                              />
                            )}
                          </Table.Cell>
                        )),
                        ...(rowActions.length || rowDrill
                          ? [
                              <Table.Cell key="_actions" className="w-px">
                                <div className="flex justify-end gap-0.5">
                                  {rowDrill && (
                                    <IconAction
                                      icon={ArrowUpRight}
                                      label={rowDrill.label || t("Open")}
                                      onPress={() =>
                                        drill!({
                                          metaId: rowDrill.meta_id,
                                          params: drillParams(rowDrill, row),
                                          drawer: rowDrill.open_in === "drawer",
                                          label: rowName(row) || title(meta),
                                        })
                                      }
                                    />
                                  )}
                                  {rowActions.map((a) => (
                                    <IconAction
                                      key={a.id}
                                      icon={iconOf(a)}
                                      danger={a.action === "delete"}
                                      label={a.label}
                                      onPress={() => run(a, row)}
                                    />
                                  ))}
                                </div>
                              </Table.Cell>,
                            ]
                          : []),
                      ]}
                    </Table.Row>
                  )
                }
              </Table.Body>
            </Table>
          </div>

          {/* Always shown, even on one page, so it doesn't jump away when a filter narrows the rows. */}
          {result && (
            <PaginationCardMinimal
              page={result.current_page}
              total={Math.max(1, result.last_page)}
              pageSize={perPage}
              onPageChange={(p) => setPage(Math.max(1, p))}
              onPageSizeChange={setPerPage}
            />
          )}
        </TableCard.Root>
      </div>

      {menu && (
        <ContextMenu
          at={menu.at}
          title={menu.row ? rowName(menu.row) || title(meta) : title(meta)}
          entries={menuEntries(menu.row, menu.field, menu.more)}
          onClose={closeMenu}
          anchor={menu.more ? moreRef : undefined}
        />
      )}

      {below.map((s) => (
        <div key={s.id} className="mt-4">
          <SubGrid param={s} row={selectedRow} parentTitle={title(meta)} />
        </div>
      ))}

      {running &&
        running.action.action === "import" &&
        running.action.form_meta_id && (
          <ImportDialog
            label={running.action.label}
            importId={running.action.form_meta_id}
            onClose={() => setRunning(null)}
            onDone={() => {
              setRunning(null);
              setReload((n) => n + 1);
            }}
          />
        )}

      {running &&
        running.action.action === "stage_query" &&
        running.action.form_meta_id && (
          <StageQueryDialog
            running={running}
            queryId={running.action.form_meta_id}
            params={actionParams(running.action, running.row, key)}
            rowName={rowName(running.row)}
            onClose={(ran) => {
              setRunning(null);
              if (ran) setReload((n) => n + 1);
            }}
          />
        )}

      {running &&
        running.action.action !== "import" &&
        running.action.action !== "stage_query" &&
        running.action.form_meta_id && (
          <ActionDialog
            running={running}
            formId={running.action.form_meta_id}
            recordId={
              running.action.action === "edit" && running.row
                ? actionParams(running.action, running.row, key).id ||
                  String(running.row[key])
                : null
            }
            fillParams={actionParams(running.action, running.row, key)}
            rowName={rowName(running.row)}
            scope={scope}
            onClose={() => setRunning(null)}
            onSaved={(next) => {
              if (next !== "new") setRunning(null);
              setReload((n) => n + 1);
            }}
          />
        )}

      {changingStatus && workflow && (
        <StatusDialog
          workflowId={workflow.id}
          statuses={workflow.statuses}
          recordId={String(changingStatus[key])}
          recordName={rowName(changingStatus)}
          sourceId={meta.id}
          onClose={() => setChangingStatus(null)}
          onMoved={() => {
            setChangingStatus(null);
            setReload((n) => n + 1);
          }}
        />
      )}

      {linkedRecord && workflow && !changingStatus && (
        <StatusDialog
          workflowId={workflow.id}
          statuses={workflow.statuses}
          recordId={linkedRecord}
          recordName={t("Record #{id}", { id: linkedRecord })}
          sourceId={meta.id}
          onClose={closeLinked}
          onMoved={() => {
            closeLinked();
            setReload((n) => n + 1);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('{action} this record?', { action: deleting.action.label })}
          message={rowName(deleting.row) ? t('"{name}" will be removed. This can\'t be undone.', { name: rowName(deleting.row) }) : t("It will be removed. This can't be undone.")}
          confirmLabel={deleting.action.label}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/** The form a toolbar button opens, filled by its get meta when it has one. */
function ActionDialog({
  running,
  formId,
  recordId,
  fillParams,
  rowName,
  scope,
  onClose,
  onSaved,
}: {
  running: Running;
  formId: number;
  recordId: string | null;
  fillParams: Record<string, string>;
  rowName: string;
  scope?: Filters;
  onClose: () => void;
  /** next "new": the form stays open for another record. */
  onSaved: (next?: "new") => void;
}) {
  const { def: formDef } = useMetaDef(formId);
  const wide =
    !!formDef && detailParams(formDef.params).some((d) => !isOneToOne(d));
  const { action } = running;

  return (
    <Modal
      title={
        rowName && action.needs_row
          ? `${action.label} · ${rowName}`
          : action.label
      }
      onClose={onClose}
      size={wide ? "xl" : "lg"}
    >
      <FormView
        metaId={formId}
        recordId={recordId}
        fill={
          action.get_meta_id
            ? { metaId: action.get_meta_id, params: fillParams }
            : undefined
        }
        fixed={scope}
        embedded
        onCancel={onClose}
        onSaved={(_, next) => onSaved(next)}
      />
    </Modal>
  );
}

/**
 * A stage query button, in a dialog. Its parameters start filled: by the get meta's first row
 * (same-named columns) when the button has one, else straight from the row fields that
 * json_config.params names. Closing after a run refreshes the grid.
 */
function StageQueryDialog({
  running,
  queryId,
  params,
  rowName,
  onClose,
}: {
  running: Running;
  queryId: number;
  params: Record<string, string>;
  rowName: string;
  onClose: (ran: boolean) => void;
}) {
  const { action } = running;
  const { def, error } = useMetaDef(queryId);
  const [defaults, setDefaults] = useState<Record<string, string> | null>(
    action.get_meta_id ? null : params,
  );
  const [fillError, setFillError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  useEffect(() => {
    if (!action.get_meta_id) return;
    let live = true;
    dataApi
      .fill(action.get_meta_id, params)
      .then(
        (row) =>
          live &&
          setDefaults(
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [
                k,
                v == null ? "" : String(v),
              ]),
            ),
          ),
      )
      .catch((err) => {
        if (!live) return;
        setFillError(
          err instanceof ApiError
            ? err.message
            : t("The starting values could not be loaded."),
        );
        setDefaults({});
      });
    return () => {
      live = false;
    };
    // Fills once per opening.
  }, []);

  return (
    <Modal
      title={
        rowName && action.needs_row
          ? `${action.label} · ${rowName}`
          : action.label
      }
      description={def?.meta.description ?? undefined}
      onClose={() => onClose(ran)}
      size="lg"
    >
      {error ? (
        <Alert>{error}</Alert>
      ) : def && defaults ? (
        <div className="space-y-4">
          {fillError && <Alert>{fillError}</Alert>}
          <StageQueryView
            def={def}
            defaults={defaults}
            embedded
            onRan={() => setRan(true)}
          />
        </div>
      ) : (
        <div className="h-48 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
      )}
    </Modal>
  );
}

/** An import button's excel_import meta, in a dialog. Closing after an import refreshes the grid. */
function ImportDialog({
  label,
  importId,
  onClose,
  onDone,
}: {
  label: string;
  importId: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { def, error } = useMetaDef(importId);
  const [imported, setImported] = useState(false);

  return (
    <Modal
      title={label}
      description={def?.meta.description ?? undefined}
      onClose={imported ? onDone : onClose}
      size="lg"
    >
      {error ? (
        <Alert>{error}</Alert>
      ) : def ? (
        <ImportView
          def={def}
          embedded
          onDone={onDone}
          onImported={() => setImported(true)}
        />
      ) : (
        <div className="h-48 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
      )}
    </Modal>
  );
}

/** A grid under a grid: the picked row's fields fill its parameters (json_config.params). */
function SubGrid({
  param,
  row,
  parentTitle,
}: {
  param: MetaParam & { ref_meta_id: number };
  row?: DataRow;
  parentTitle: string;
}) {
  const { def, error } = useMetaDef(param.ref_meta_id);
  const map = (param.json_config?.params ?? {}) as Record<string, string>;
  const fixed = useMemo(
    () =>
      row
        ? Object.fromEntries(
            Object.entries(map).map(([name, field]) => [
              name,
              row[field] == null ? "" : String(row[field]),
            ]),
          )
        : undefined,
    [row, JSON.stringify(map)],
  );
  const label = param.label_name || param.param_name;

  if (error) return <Alert>{error}</Alert>;
  if (!row || !fixed) {
    return (
      <div className="rounded-xl border border-dashed border-primary px-5 py-6 text-center">
        <p className="text-sm font-semibold text-secondary">{label}</p>
        <p className="mt-0.5 text-sm text-tertiary">
          {t('Pick a row in {grid} to see its records here.', { grid: parentTitle })}
        </p>
      </div>
    );
  }
  if (!def)
    return (
      <div className="h-40 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
    );

  return <GridView def={def} fixed={fixed} label={label} />;
}

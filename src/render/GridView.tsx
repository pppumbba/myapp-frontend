import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { Selection, SortDescriptor } from "react-aria-components";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Columns03,
  Copy01,
  DotsGrid,
  DotsHorizontal,
  Download01,
  Edit01,
  Eye,
  File06,
  FlipBackward,
  FilterLines,
  GitBranch01,
  Grid01,
  LayoutGrid01,
  List,
  Plus,
  SearchLg,
  Send01,
  Table as TableIcon,
  Trash01,
  Upload01,
  Zap,
  GitMerge,
} from "@untitledui/icons";
import { Button as AriaButton, Dialog, DialogTrigger, Popover } from "react-aria-components";
import { createPortal } from "react-dom";
import { useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { Ability } from "../lib/accessApi";
import { ApiError } from "../lib/api";
import { dataApi, type DataRow, type Page } from "../lib/dataApi";
import { GRID_VIEWS, GRID_VIEW_LABELS, gridViewButtons, gridViewOf, type GridViewName, type MetaAction, type MetaParam } from "../lib/metaApi";
import { Alert, IconAction } from "../components/ui";
import { useFillHeight } from "./useFillHeight";
import { ContextMenu, pointOf, type MenuEntry, type MenuPoint } from "../components/ContextMenu";
import { ConfirmDialog, Modal } from "../components/Modal";
import { ShareRecord } from "../components/messenger/ShareRecord";
import type { SharedRecord } from "../lib/chatApi";
import { FILE_TYPES } from "../lib/contentApi";
import { Table, TableCard } from "@/components/application/table/table";
import { PaginationCardMinimal } from "@/components/application/pagination/pagination";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { ColumnsList } from "./ColumnsList";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useDebounced } from "@/hooks/use-debounced";
import { Input } from "@/components/base/input/input";
import { ColumnValue, formatNumber } from "./Cell";
import { cx } from "@/utils/cx";
import { FormView, type Consolidating } from "./FormView";
import { CardSort, GridCards } from "./GridCards";
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
  consolidate: GitMerge,
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
type BodyItem = DataRow & { _key: string; _depth?: number; _nestedOf?: DataRow; _footer?: true; _filler?: true; _skeleton?: true };
const NESTED = "::nested";
/** The footer row: each column's json_config.aggregate over every matching row (the API's footer). */
const FOOTER = "::footer";
/** An empty row taking the space left in a grid that scrolls, so the footer sits just above the pagination. */
const FILLER = "::filler";
/** Placeholder rows shown until the first page of records arrives. */
const SKELETON = "::skeleton";
const SKELETON_ROWS = 6;
/** When the card's blur-in (.blur-in, --i:1) has mostly settled, and how long the rows' cascade (.rows-in) takes. */
const CARD_SETTLED_MS = 300;
const ROWS_IN_MS = 450;
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
      // Undo any scale on the way (a modal growing in), keeping sub-pixel widths.
      const scale = table.getBoundingClientRect().width / table.offsetWidth || 1;
      let left = 0;
      const next = heads.map((th) => {
        const at = left;
        left += th.getBoundingClientRect().width / scale;
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

/** The text each cell of a row shows, by field: lookups by their labels, numbers and dates formatted. */
function cellTexts(rowElement: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    [...rowElement.querySelectorAll<HTMLElement>("[data-field]")].map((el) => [el.dataset.field!, el.innerText.trim()]),
  );
}

const VIEW_ICONS: Record<GridViewName, FC<{ className?: string }>> = { table: TableIcon, cards: Grid01, inline: List, tiles: LayoutGrid01 };
const viewKey = (metaId: number) => `grid_view_${metaId}`;

/** The view this person last picked on this grid, in this browser. */
function readGridView(metaId: number): GridViewName | undefined {
  try {
    return GRID_VIEWS.find((v) => v === localStorage.getItem(viewKey(metaId)));
  } catch {
    return undefined;
  }
}

function saveGridView(metaId: number, view: GridViewName) {
  try {
    localStorage.setItem(viewKey(metaId), view);
  } catch {
    // Storage can be blocked; the buttons still work for this visit.
  }
}

const foldKey = (metaId: number) => `grid_filters_folded_${metaId}`;

/** Whether this person folded the filter sidebar away on this grid, in this browser. */
function readFiltersFolded(metaId: number): boolean {
  try {
    return localStorage.getItem(foldKey(metaId)) === "1";
  } catch {
    return false;
  }
}

function saveFiltersFolded(metaId: number, folded: boolean) {
  try {
    if (folded) localStorage.setItem(foldKey(metaId), "1");
    else localStorage.removeItem(foldKey(metaId));
  } catch {
    // Storage can be blocked; the fold still works for this visit.
  }
}

const widthsKey = (metaId: number) => `grid_widths_${metaId}`;
/** The narrowest a column can be dragged to, in px. */
const MIN_COLUMN_WIDTH = 60;

/** The column widths this person dragged on this grid, in this browser, by field. */
function readColumnWidths(metaId: number): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(widthsKey(metaId)) ?? "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function saveColumnWidths(metaId: number, widths: Record<string, number>) {
  try {
    if (Object.keys(widths).length) localStorage.setItem(widthsKey(metaId), JSON.stringify(widths));
    else localStorage.removeItem(widthsKey(metaId));
  } catch {
    // Storage can be blocked; the widths still hold for this visit.
  }
}

/**
 * The handle on a column heading's right edge: drag it to change the column's width (onResize
 * while dragging, onDone at the end), double-click it to go back to the builder's width. Pointer
 * only; the builder sets widths for everyone in the column's settings.
 */
function ColumnResizer({ onResize, onDone, onReset }: { onResize: (width: number) => void; onDone: (width: number) => void; onReset: () => void }) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Keep the heading from taking it as a press to sort.
    e.stopPropagation();
    e.preventDefault();
    const handle = e.currentTarget;
    const start = handle.closest("th")!.getBoundingClientRect().width;
    const x = e.clientX;
    const widthAt = (ev: PointerEvent) => Math.round(Math.max(MIN_COLUMN_WIDTH, start + ev.clientX - x));
    const move = (ev: PointerEvent) => onResize(widthAt(ev));
    const up = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      onDone(widthAt(ev));
    };
    handle.setPointerCapture(e.pointerId);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };
  return (
    <div
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
      className="absolute inset-y-0 right-0 z-[1] w-2 cursor-col-resize touch-none after:absolute after:inset-y-2 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors hover:after:bg-brand-solid"
    />
  );
}

const hiddenKey = (metaId: number) => `grid_hidden_${metaId}`;

/** The columns this person switched off on this grid, in this browser, by field. */
function readHiddenColumns(metaId: number): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(hiddenKey(metaId)) ?? "[]");
    return Array.isArray(saved) ? saved.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
}

function saveHiddenColumns(metaId: number, hidden: string[]) {
  try {
    if (hidden.length) localStorage.setItem(hiddenKey(metaId), JSON.stringify(hidden));
    else localStorage.removeItem(hiddenKey(metaId));
  } catch {
    // Storage can be blocked; the columns still hide for this visit.
  }
}

const sortKey = (metaId: number) => `grid_sort_${metaId}`;

/** The column and direction this person last sorted this grid by, in this browser. */
function readGridSort(metaId: number): SortDescriptor | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(sortKey(metaId)) ?? "null");
    return saved && typeof saved.column === "string" && (saved.direction === "ascending" || saved.direction === "descending")
      ? { column: saved.column, direction: saved.direction }
      : undefined;
  } catch {
    return undefined;
  }
}

function saveGridSort(metaId: number, sort: SortDescriptor | undefined) {
  try {
    if (sort?.column) localStorage.setItem(sortKey(metaId), JSON.stringify({ column: String(sort.column), direction: sort.direction }));
    else localStorage.removeItem(sortKey(metaId));
  } catch {
    // Storage can be blocked; the sort still holds for this visit.
  }
}

const pinnedKey = (metaId: number) => `grid_pinned_${metaId}`;

/**
 * The columns this person froze on this grid, in this browser, by field; null when they haven't
 * changed it, so the builder's frozen_columns holds ([] means none frozen).
 */
function readPinnedColumns(metaId: number): string[] | null {
  try {
    const saved = JSON.parse(localStorage.getItem(pinnedKey(metaId)) ?? "null");
    return Array.isArray(saved) ? saved.filter((f): f is string => typeof f === "string") : null;
  } catch {
    return null;
  }
}

function savePinnedColumns(metaId: number, pinned: string[] | null) {
  try {
    if (pinned) localStorage.setItem(pinnedKey(metaId), JSON.stringify(pinned));
    else localStorage.removeItem(pinnedKey(metaId));
  } catch {
    // Storage can be blocked; the columns still freeze for this visit.
  }
}

const orderKey = (metaId: number) => `grid_order_${metaId}`;

/** The column order this person dragged to on this grid, in this browser: fields, first to last. */
function readColumnOrder(metaId: number): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(orderKey(metaId)) ?? "[]");
    return Array.isArray(saved) ? saved.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
}

function saveColumnOrder(metaId: number, order: string[]) {
  try {
    if (order.length) localStorage.setItem(orderKey(metaId), JSON.stringify(order));
    else localStorage.removeItem(orderKey(metaId));
  } catch {
    // Storage can be blocked; the order still holds for this visit.
  }
}

/** The line on a heading's left or right edge where a dragged column would land. */
const DROP_LINE = "before:absolute before:inset-y-1.5 before:z-[3] before:w-0.5 before:rounded-full before:bg-brand-solid";
const DROP_BEFORE = `${DROP_LINE} before:left-0`;
const DROP_AFTER = `${DROP_LINE} before:right-0`;

/** A heading being dragged: where the pointer is, and where the column would land if dropped there. */
interface ColumnDrag {
  field: string;
  label: string;
  x: number;
  y: number;
  /** The column it would go next to; null where dropping changes nothing. */
  target: string | null;
  side: "before" | "after";
}

/**
 * The grip at a column heading's left, shown on hover: drag it to another heading and drop it
 * there. While dragging, onDrag tells where the pointer is and where the column would land (the
 * grid shows a line at that edge and the column's name by the pointer); on drop, onDrop gets
 * every shown field in the new order. Escape cancels. Pointer only, like the width handle; the
 * Columns list moves columns from the keyboard.
 */
function ColumnGrip({ field, label, onDrag, onDrop }: { field: string; label: string; onDrag: (drag: ColumnDrag | null) => void; onDrop: (order: string[]) => void }) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Keep the heading from taking it as a press to sort.
    e.stopPropagation();
    e.preventDefault();
    const handle = e.currentTarget;
    let drag: ColumnDrag = { field, label, x: e.clientX, y: e.clientY, target: null, side: "before" };
    // The shown fields in the headings' order, and where field would go with this drag.
    const order = () => [...(handle.closest("tr")?.querySelectorAll<HTMLElement>("[data-grip]") ?? [])];
    const move = (ev: PointerEvent) => {
      const grips = order();
      const fields = grips.map((g) => g.dataset.grip!);
      const from = fields.indexOf(field);
      const over = grips.findIndex((g) => {
        const r = g.closest("th")!.getBoundingClientRect();
        return ev.clientX >= r.left && ev.clientX < r.right;
      });
      let target: string | null = null;
      let side: ColumnDrag["side"] = "before";
      if (over >= 0) {
        const r = grips[over].closest("th")!.getBoundingClientRect();
        side = ev.clientX < r.left + r.width / 2 ? "before" : "after";
        const at = over + (side === "after" ? 1 : 0);
        // Its own edges, and its neighbours' edges next to it, leave it where it is.
        if (at !== from && at !== from + 1) target = fields[over];
      }
      drag = { ...drag, x: ev.clientX, y: ev.clientY, target, side };
      onDrag(drag);
    };
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", onKey, true);
      onDrag(null);
    };
    const up = () => {
      stop();
      if (!drag.target) return;
      const fields = order().map((g) => g.dataset.grip!);
      const next = fields.filter((f) => f !== field);
      next.splice(next.indexOf(drag.target) + (drag.side === "after" ? 1 : 0), 0, field);
      onDrop(next);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.stopPropagation();
      stop();
    };
    handle.setPointerCapture(e.pointerId);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", onKey, true);
    onDrag(drag);
  };
  return (
    <div
      aria-hidden="true"
      data-grip={field}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-y-0 left-0 z-[1] flex w-5 cursor-grab touch-none items-center justify-center text-fg-quaternary opacity-0 transition-opacity group-hover/head:opacity-100 active:cursor-grabbing"
    >
      <DotsGrid className="size-3.5" />
    </div>
  );
}

/** The dragged column's name by the pointer, above everything (a portal, so no transformed box moves it). */
function ColumnDragLabel({ drag }: { drag: ColumnDrag }) {
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[100] rounded-md bg-primary px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-secondary shadow-lg ring-1 ring-secondary"
      style={{ left: drag.x + 12, top: drag.y + 12 }}
    >
      {drag.label}
    </div>,
    document.body,
  );
}

/**
 * A cell's content held to its column's width (px, padding included), cut short with "…".
 * The width goes on the content because an auto table never makes a cell narrower than what
 * is in it. The grid's cells are px-5, 40px.
 */
function CellWidth({ width, children }: { width?: number; children: ReactNode }) {
  if (!width) return <>{children}</>;
  return (
    <div className="overflow-hidden text-ellipsis" style={{ width: Math.max(width - 40, 0) }}>
      {children}
    </div>
  );
}

/** What a toolbar button is doing right now. */
type Running = { action: MetaAction; row?: DataRow; /** A consolidate button's picked rows, by key. */ ids?: string[] };

/** What the user must be allowed to do with an action's form to see the button. */
// Running a stage query needs edit access to it, as the run endpoint does.
const abilityOf: Record<MetaAction["action"], Ability> = {
  add: "create",
  custom: "create",
  edit: "edit",
  delete: "delete",
  import: "create",
  stage_query: "edit",
  consolidate: "create",
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
 * json_config.view "cards", "inline" or "tiles" shows the records as those widgets instead
 * (GridCards), except for tree grids and grids with nested subgrids, which need the table's rows.
 * json_config.view_buttons adds toolbar buttons to switch view; each person's pick is remembered.
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
  // The column order this person dragged to, by field; columns it doesn't name keep to the end.
  const [order, setOrder] = useState(() => readColumnOrder(meta.id));
  // The columns this person switched off, by field.
  const [hidden, setHidden] = useState(() => readHiddenColumns(meta.id));
  const allColumns = useMemo(() => {
    // A scoped column holds the same value on every row, so it isn't shown.
    const visible = visibleParams(params).filter(
      (p) => !(scope && p.field_path in scope),
    );
    const all = workflow && !visible.some((p) => p.field_path === "status_id")
      ? [...visible, statusColumn]
      : visible;
    const at = (p: MetaParam) => (order.includes(p.field_path) ? order.indexOf(p.field_path) : order.length);
    return order.length ? [...all].sort((a, b) => at(a) - at(b)) : all;
  }, [params, workflow, scope, order]);
  const shownColumns = useMemo(() => {
    const shown = allColumns.filter((c) => !hidden.includes(c.field_path));
    // Never none: with every column off, they all come back.
    return shown.length ? shown : allColumns;
  }, [allColumns, hidden]);
  // The columns this person froze, in order; null: the builder's frozen_columns (that many from the left).
  const [pinned, setPinned] = useState(() => readPinnedColumns(meta.id));
  const builderFrozen = Math.max(0, Math.floor(Number(meta.json_config?.frozen_columns) || 0));
  const frozenFields = useMemo(
    () => pinned ?? shownColumns.slice(0, builderFrozen).map((c) => c.field_path),
    [pinned, shownColumns, builderFrozen],
  );
  // Frozen columns come first, in the order they were frozen.
  const columns = useMemo(() => {
    if (!pinned) return shownColumns;
    const first = pinned.flatMap((f) => shownColumns.filter((c) => c.field_path === f));
    return [...first, ...shownColumns.filter((c) => !first.includes(c))];
  }, [shownColumns, pinned]);
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
  const tableOnly = !!parentParam || nested.length > 0;
  const viewButtons = tableOnly ? [] : gridViewButtons(meta.json_config);
  const [pickedView, setPickedView] = useState(() => readGridView(meta.id));
  // Widths this person dragged, over the builder's column_width; neither: the column fits its content.
  const [dragged, setDragged] = useState(() => readColumnWidths(meta.id));
  const widthOf = (c: MetaParam) => dragged[c.field_path] ?? (Number.parseInt(c.column_width ?? "", 10) > 0 ? Number.parseInt(c.column_width!, 10) : undefined);
  // The heading being dragged to a new place: shaded, with a line where it would land and its name by the pointer.
  const [columnDrag, setColumnDrag] = useState<ColumnDrag | null>(null);
  const resetColumns = () => {
    setOrder([]);
    setDragged({});
    setHidden([]);
    setPinned(null);
    setSort(undefined);
    saveColumnOrder(meta.id, []);
    saveColumnWidths(meta.id, {});
    saveHiddenColumns(meta.id, []);
    savePinnedColumns(meta.id, null);
  };
  // The Columns list in the grid's order (frozen ones first), hidden columns where they would be.
  const listColumns = useMemo(() => {
    if (!pinned) return allColumns;
    const first = pinned.flatMap((f) => allColumns.filter((c) => c.field_path === f));
    return [...first, ...allColumns.filter((c) => !first.includes(c))];
  }, [allColumns, pinned]);
  /**
   * Puts the columns in this order of fields; frozen ones keep to it among themselves. fields
   * may leave some out (the headings don't show hidden columns): those keep their places.
   */
  const reorderColumns = (fields: string[]) => {
    let k = 0;
    const full = listColumns.map((c) => (fields.includes(c.field_path) ? fields[k++] : c.field_path));
    setOrder(full);
    saveColumnOrder(meta.id, full);
    if (pinned) {
      const next = full.filter((f) => pinned.includes(f));
      setPinned(next);
      savePinnedColumns(meta.id, next);
    }
  };
  /** Freezes a column (it goes last among the frozen ones) or lets it go; starts from the builder's frozen columns. */
  const freezeColumn = (field: string, on: boolean) => {
    const next = on ? [...frozenFields.filter((f) => f !== field), field] : frozenFields.filter((f) => f !== field);
    setPinned(next);
    savePinnedColumns(meta.id, next);
  };
  const showColumn = (field: string, on: boolean) => {
    const next = on ? hidden.filter((f) => f !== field) : [...hidden, field];
    setHidden(next);
    saveHiddenColumns(meta.id, next);
  };
  const resizerFor = (c: MetaParam) => (
    <ColumnResizer
      onResize={(w) => setDragged((d) => ({ ...d, [c.field_path]: w }))}
      onDone={(w) => saveColumnWidths(meta.id, { ...dragged, [c.field_path]: w })}
      onReset={() => {
        const { [c.field_path]: _, ...rest } = dragged;
        setDragged(rest);
        saveColumnWidths(meta.id, rest);
      }}
    />
  );
  const view = tableOnly ? "table" : pickedView && viewButtons.includes(pickedView) ? pickedView : gridViewOf(meta.json_config);
  const cards = view === "table" ? undefined : view;
  const rowNumbers = meta.json_config?.row_numbers === true;
  const actions = useActions(meta.id);
  // A grid with a consolidate button picks several rows, by checkboxes in their own first column.
  const multi = view === "table" && !!actions?.some((a) => a.action === "consolidate");
  const picks = multi ? 1 : 0;
  // The checkbox, arrow and # columns come first and freeze with the frozen data columns.
  const lead = picks + (nested.length ? 1 : 0) + (rowNumbers ? 1 : 0);
  const frozenData = pinned
    ? columns.filter((c) => pinned.includes(c.field_path)).length
    : Math.min(builderFrozen, columns.length);
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
  const { can, user } = useAuth();
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
  // json_config.filter_layout "sidebar": the filters sit beside the grid, always open. Too narrow
  // for that (a phone), they'd come before the records, so they work as "dropdown" instead.
  const roomy = useBreakpoint("lg");
  const sidebarLayout =
    meta.json_config?.filter_layout === "sidebar" && filterParams.length > 0 && roomy;
  // Folded away, the toolbar's Filters button brings the sidebar back.
  const [folded, setFolded] = useState(() => readFiltersFolded(meta.id));
  const fold = (next: boolean) => {
    setFolded(next);
    saveFiltersFolded(meta.id, next);
  };
  const sidebar = sidebarLayout && !folded;
  // "dropdown" (the default): the Filters button opens them over the grid, closing once they are
  // applied. Only "panel" keeps them in a panel above the grid.
  const filterLayout = meta.json_config?.filter_layout;
  const dropdown = filterLayout === "sidebar" ? !roomy : filterLayout !== "panel";
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
  // The sort this person last picked on this grid, kept while its column is still on it.
  const [sort, setSortState] = useState<SortDescriptor | undefined>(() => {
    const saved = readGridSort(meta.id);
    return saved && params.some((p) => p.field_path === saved.column) ? saved : undefined;
  });
  const setSort = (next: SortDescriptor | undefined) => {
    setSortState(next);
    saveGridSort(meta.id, next);
  };
  const [result, setResult] = useState<Page<DataRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // Refreshed by hand: once its records are back, the rows dip and come back, so the reload shows
  // even when it is quick and nothing changed.
  const refreshedByHand = useRef(false);
  // A page, search, sort or reload on its way. The rows only dim when it takes a moment,
  // so a quick answer doesn't flicker.
  const [fetching, setFetching] = useState(true);
  const slow = useDebounced(fetching, 150) && fetching;
  // The rows cascade in once, when the first records arrive (not the skeleton, not later pages,
  // sorts or reloads, which swap in place). They wait until the card's own blur-in has mostly
  // settled, so the two don't animate over each other; cascadeFrom is that wait, null when off.
  const [mountedAt] = useState(() => performance.now());
  const [cascadeFrom, setCascadeFrom] = useState<number | null>(null);
  const cascaded = useRef(false);
  useLayoutEffect(() => {
    if (!result || !refreshedByHand.current) return;
    refreshedByHand.current = false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // On the body, not the rows, so their own animation (.grid-row) isn't touched.
    cardRef.current?.querySelector("tbody")?.animate([{ opacity: 0.3 }, { opacity: 1 }], {
      duration: 300,
      easing: "ease-out",
    });
  }, [result]);
  useLayoutEffect(() => {
    if (!result || cascaded.current) return;
    cascaded.current = true;
    const from = Math.max(0, CARD_SETTLED_MS - (performance.now() - mountedAt));
    setCascadeFrom(from);
    setTimeout(() => setCascadeFrom(null), from + ROWS_IN_MS);
  }, [result, mountedAt]);
  const [selected, setSelected] = useState<string | null>(null);
  // With a consolidate button: the picked rows, by key, kept across pages.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
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
  // texts: the row's cells as shown (lookups by their labels, numbers formatted), for sharing it.
  const [menu, setMenu] = useState<{ at: MenuPoint; row?: DataRow; field?: string; more?: boolean; texts?: Record<string, string> } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const moreRef = useRef<HTMLSpanElement>(null);
  // The Columns popover, opened from the ⋯ menu.
  const [showColumns, setShowColumns] = useState(false);
  const [sharing, setSharing] = useState<SharedRecord | null>(null);

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
    setFetching(true);
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
      )
      .finally(() => live && setFetching(false));
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
    (): BodyItem[] => !result && !error
      ? Array.from({ length: SKELETON_ROWS }, (_, i) => ({ _key: SKELETON + i, _skeleton: true as const }))
      : [
      ...records.flatMap((r): BodyItem[] => {
        const item = { ...r, _key: String(r[key]) };
        return nested.length && expanded.has(item._key)
          ? [item, { _key: item._key + NESTED, _nestedOf: r }]
          : [item];
      }),
      ...(filler ? [{ _key: FILLER, _filler: true as const }] : []),
      ...(hasFooter ? [{ _key: FOOTER, _footer: true as const }] : []),
    ],
    [result, error, records, key, expanded, nested.length, hasFooter, filler],
  );
  const {
    ref: tableRef,
    lefts,
    viewWidth,
  } = useFrozenOffsets(frozen, [columns, items, nested.length, rowNumbers, view]);

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

  // A column that fits its content keeps the widest it has been, so going to another page doesn't
  // shift the columns about: it can still grow for a longer value, never shrink back. Measured
  // once the records are drawn; forgotten when the card's width changes (not the scroll box's,
  // which a vertical scrollbar coming and going with the page's rows changes too).
  const [held, setHeld] = useState<Record<string, number>>({});
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let width = card.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (card.offsetWidth === width) return;
      width = card.offsetWidth;
      setHeld({});
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const head = cardRef.current?.querySelector("thead");
    if (!result || !head) return;
    setHeld((prev) => {
      let next = prev;
      for (const c of columns) {
        if (widthOf(c)) continue;
        const th = head.querySelector<HTMLElement>(`th[data-key="${CSS.escape(c.field_path)}"]`);
        const w = th?.offsetWidth ?? 0;
        if (w > (next[c.field_path] ?? 0)) next = { ...next, [c.field_path]: w };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measured when new records are drawn
  }, [result, columns]);
  // Memoized like the frozen styles: a new style object every render loops React Aria.
  const headStyles = useMemo(() => {
    const out: Record<string, CSSProperties | undefined> = {};
    columns.forEach((c, i) => {
      const style = lead + i < frozen ? frozenStyles[lead + i] : undefined;
      const min = widthOf(c) ? undefined : held[c.field_path];
      out[c.field_path] = min ? { ...style, minWidth: min } : style;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- widthOf reads dragged
  }, [columns, frozenStyles, frozen, lead, held, dragged]);

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

  /** What a consolidate button merges: the picked rows, or the one row it was opened on when that isn't among them. */
  const pickedFor = (row?: DataRow): string[] =>
    row && !picked.has(String(row[key])) ? [String(row[key])] : picked.size ? [...picked] : row ? [String(row[key])] : [];

  function run(action: MetaAction, row = selectedRow) {
    if (action.action === "consolidate") {
      const ids = pickedFor(row);
      if (ids.length) setRunning({ action, ids });
      return;
    }
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
  function menuEntries(row?: DataRow, field?: string, more?: boolean, texts?: Record<string, string>): MenuEntry[] {
    const usable = toolbar.filter(
      (a) => (row || more || !a.needs_row) && !(more && toolbarButtons.includes(a)),
    );
    const entry = (a: MetaAction): MenuEntry => ({
      key: `a${a.id}`,
      label: a.label,
      icon: iconOf(a),
      danger: a.action === "delete",
      disabled: !a.form_meta_id || (a.action === "consolidate" ? !pickedFor(row).length : a.needs_row && !row),
      onSelect: () => run(a, row),
    });
    const column = field ? columns.find((c) => c.field_path === field) : undefined;
    const value = row && column ? row[column.field_path] : undefined;
    return [
      ...(row && rowDrill
        ? [{ key: "drill", label: rowDrill.label || t("Open"), icon: ArrowUpRight, onSelect: () => drill!({ metaId: rowDrill.meta_id, params: drillParams(rowDrill, row), open: rowDrill.open_in, label: rowName(row) || title(meta) }) }]
        : []),
      ...usable.filter((a) => a.action !== "delete").map(entry),
      ...((row || more) && workflow ? [{ key: "status", label: t("Change status"), icon: GitBranch01, disabled: !row, onSelect: () => row && setChangingStatus(row) }] : []),
      { key: "s1", separator: true as const },
      ...(row && column && value != null && value !== ""
        ? [{ key: "copy", label: t('Copy {name}', { name: column.label_name || column.param_name }), icon: Copy01, onSelect: () => void navigator.clipboard?.writeText(String(value)) }]
        : []),
      ...(row && user && row[key] != null
        ? [{ key: "share", label: t("Share to chat"), icon: Send01, onSelect: () => setSharing(shareOf(row, texts)) }]
        : []),
      { key: "export", label: t("Export"), icon: Download01, disabled: !result?.total, onSelect: () => void exportExcel() },
      // Under the ⋯ button only: the popover opens there.
      ...(more && allColumns.length > 1
        ? [{ key: "columns", label: t("Columns"), icon: Columns03, onSelect: () => setShowColumns(true) }]
        : []),
      // Only once this person has moved, sized, hidden, frozen or sorted a column.
      ...(order.length || hidden.length || pinned || sort?.column || Object.keys(dragged).length
        ? [{ key: "reset_columns", label: t("Reset columns"), icon: FlipBackward, onSelect: resetColumns }]
        : []),
      { key: "s2", separator: true as const },
      ...usable.filter((a) => a.action === "delete").map(entry),
    ];
  }

  // The column that names a record (is_label), else the first: which may be a card's picture.
  const nameColumn = columns.find((c) => c.is_label) ?? columns[0];
  const rowName = (row?: DataRow) =>
    row && nameColumn && !nameColumn.is_select
      ? String(row[nameColumn.field_path] ?? "")
      : "";

  /** A row as a chat card: its name and first columns, as shown on screen when the cells were there to read. */
  function shareOf(row: DataRow, texts: Record<string, string> = {}): SharedRecord {
    const shown = (c: MetaParam) => texts[c.field_path] ?? (row[c.field_path] == null ? "" : String(row[c.field_path]));
    const id = String(row[key]);
    const name = (nameColumn && shown(nameColumn)) || t("Record #{id}", { id });
    return {
      meta_id: meta.id,
      record_id: id,
      title: `${title(meta)} · ${name}`.slice(0, 200),
      fields: columns
        .filter((c) => c !== nameColumn && ![...FILE_TYPES, "signature", "json", "document"].includes(c.data_type))
        .slice(0, 6)
        .map((c) => ({ label: (c.label_name || c.param_name).slice(0, 100), value: shown(c).slice(0, 500) })),
    };
  }

  // A record shared in a chat links to /run/{grid}?row={id}: pick that row and open it (the grid's
  // drilldown, else its Edit form). One not on the first page is looked up by its key.
  const sharedRow = pathname === `/run/${meta.id}` ? searchParams.get("row") : null;
  useEffect(() => {
    if (!sharedRow || !result) return;
    const open = (row: DataRow) => {
      setSelected(sharedRow);
      if (rowDrill) drill!({ metaId: rowDrill.meta_id, params: drillParams(rowDrill, row), open: rowDrill.open_in, label: rowName(row) || title(meta) });
      else if (editAction) run(editAction, row);
    };
    const onPage = result.data.find((r) => String(r[key]) === sharedRow);
    if (onPage) open(onPage);
    else
      dataApi.list(meta.id, { per_page: 1, filter: { ...fixed, [key]: sharedRow }, scope }).then(
        (r) => r.data[0] && String(r.data[0][key]) === sharedRow && open(r.data[0]),
        () => {},
      );
    setSearchParams(
      (p) => {
        p.delete("row");
        return p;
      },
      { replace: true },
    );
    // Once per link, when the first records are in.
  }, [sharedRow, !!result]);

  const emptyState = (
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
  );

  /** A column's value in a row: its workflow status, a link when it drills down, or plain. */
  const cellValue = (c: MetaParam, row: DataRow) =>
    workflow && c.field_path === "status_id" ? (
      <StatusBadge status={statuses.get(Number(row.status_id))} />
    ) : drill && drilldownOf(c.json_config) ? (
      <AriaButton
        onPress={() => {
          const d = drilldownOf(c.json_config)!;
          drill({
            metaId: d.meta_id,
            params: drillParams(d, row),
            open: d.open_in,
            label: rowName(row) || title(meta),
          });
        }}
        className="rounded text-left font-medium text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
      >
        <ColumnValue param={c} value={row[c.field_path]} />
      </AriaButton>
    ) : (
      <ColumnValue param={c} value={row[c.field_path]} />
    );

  /** A row's own buttons. */
  const rowButtons = (row: DataRow) => (
    <div className="flex justify-end gap-0.5">
      {rowDrill && (
        <IconAction
          icon={ArrowUpRight}
          label={rowDrill.label || t("Open")}
          onPress={() =>
            drill!({
              metaId: rowDrill.meta_id,
              params: drillParams(rowDrill, row),
              open: rowDrill.open_in,
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
  );

  // An icon beside the search; a dot on it says filters are applied, the tooltip how many.
  const filterHint = activeFilters ? t('Filters ({count})', { count: activeFilters }) : t('Filters');
  const filterButton = ({ onPress, expanded }: { onPress?: () => void; expanded?: boolean }) => (
    <span className="relative inline-flex">
      <Tooltip title={filterHint}>
        <Button size="sm" color="secondary" iconLeading={FilterLines} aria-label={filterHint} onPress={onPress} aria-expanded={expanded} />
      </Tooltip>
      {activeFilters > 0 && (
        <span aria-hidden="true" className="pointer-events-none absolute -top-0.5 -right-0.5 size-2 rounded-full bg-brand-solid ring-2 ring-bg-primary" />
      )}
    </span>
  );

  /** A column's footer value: only the value, no label, whatever the total is. */
  const footerValue = (c: MetaParam) => {
    const agg = aggregateOf(c);
    const value = result?.footer?.[c.field_path];
    if (!agg || value == null) return null;
    return agg === "count" ? formatNumber(Number(value)) : <ColumnValue param={c} value={value} />;
  };

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
              onCollapse={() => fold(true)}
            />
          </div>
        )}
        <TableCard.Root
          ref={cardRef}
          size="sm"
          style={cardStyle}
          // Blurs in a moment after its filters (.blur-in); its rows follow (.rows-in).
          className={cx(
            "blur-in [--i:1]",
            sidebar && `min-w-0 ${fixedWidth ? "shrink" : "flex-1"}`,
            fillHeight !== undefined && "flex flex-col",
          )}
        >
          <TableCard.Header
            className="md:items-center"
            contentLeading={
              searchable || cards || (filterParams.length > 0 && !sidebar) ? (
                <>
                  {searchable && (
                    <Input
                      aria-label={t('Search {name}', { name: title(meta) })}
                      type="search"
                      size="sm"
                      icon={SearchLg}
                      placeholder={t("Search")}
                      value={query}
                      onChange={setQuery}
                      className="min-w-0 flex-1 sm:w-56 sm:flex-none"
                    />
                  )}
                  {cards && (
                    <CardSort
                      columns={columns}
                      labelOf={(c) => (c === statusColumn ? t("Status") : c.label_name || c.param_name)}
                      sort={sort}
                      onSort={setSort}
                    />
                  )}
                  {sidebarLayout && folded ? (
                    filterButton({ onPress: () => fold(false) })
                  ) : filterParams.length > 0 && !sidebar && (dropdown ? (
                    <DialogTrigger isOpen={showFilters} onOpenChange={setShowFilters}>
                      {filterButton({})}
                      <Popover
                        placement="bottom start"
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
                    filterButton({ onPress: () => setShowFilters((s) => !s), expanded: showFilters })
                  ))}
                </>
              ) : undefined
            }
            contentTrailing={
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end md:ml-auto">
                <div className="flex flex-wrap gap-2">
                  {viewButtons.length > 0 && (
                    <ButtonGroup
                      size="sm"
                      aria-label={t("View")}
                      selectionMode="single"
                      disallowEmptySelection
                      selectedKeys={[view]}
                      onSelectionChange={(keys) => {
                        const next = viewButtons.find((v) => keys.has(v));
                        if (!next) return;
                        setPickedView(next);
                        saveGridView(meta.id, next);
                      }}
                    >
                      {viewButtons.map((v) => (
                        <Tooltip key={v} title={t(GRID_VIEW_LABELS[v])}>
                          <ButtonGroupItem id={v} aria-label={t(GRID_VIEW_LABELS[v])} iconLeading={VIEW_ICONS[v]} />
                        </Tooltip>
                      ))}
                    </ButtonGroup>
                  )}
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
                        (a.action === "consolidate" ? !pickedFor(selectedRow).length : a.needs_row && !selectedRow) || !a.form_meta_id
                      }
                      onPress={() => run(a)}
                    >
                      {a.label}{a.action === "consolidate" && picked.size > 1 ? ` (${picked.size})` : ""}
                    </Button>
                  ))}
                  {/* Opened from the ⋯ menu's Columns, under the ⋯ button. */}
                  <Popover
                    triggerRef={moreRef}
                    isOpen={showColumns}
                    onOpenChange={setShowColumns}
                    placement="bottom end"
                    offset={6}
                    className={({ isEntering, isExiting }) =>
                      cx(
                        "max-h-[min(28rem,calc(100vh-4rem))] w-64 overflow-y-auto rounded-xl bg-primary shadow-lg ring-1 ring-secondary_alt outline-hidden will-change-transform",
                        isEntering && "duration-150 ease-out animate-in fade-in placement-bottom:slide-in-from-top-0.5",
                        isExiting && "duration-100 ease-in animate-out fade-out",
                      )
                    }
                  >
                    <Dialog aria-label={t("Columns")} className="outline-hidden">
                      <p className="border-b border-secondary px-4 py-2.5 text-xs font-semibold text-tertiary">{t("Show, order and freeze columns")}</p>
                      <ColumnsList
                        columns={listColumns}
                        nameOf={(c) => (c === statusColumn ? t("Status") : c.label_name || c.param_name)}
                        isShown={(c) => columns.includes(c)}
                        isFrozen={(c) => frozenFields.includes(c.field_path)}
                        canHide={columns.length > 1}
                        onShow={showColumn}
                        onFreeze={freezeColumn}
                        onReorder={reorderColumns}
                      />
                    </Dialog>
                  </Popover>
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
            aria-busy={fetching}
            className={cx(
              fillHeight !== undefined && "min-h-0 flex-1",
              "[&_tbody]:transition-opacity [&_tbody]:duration-150",
              slow && result && "[&_tbody]:opacity-50",
            )}
            onContextMenu={(e) => {
              if (e.defaultPrevented || (e.target as HTMLElement).closest("input,textarea,[contenteditable=true]")) return;
              e.preventDefault();
              setMenu({ at: pointOf(e) });
            }}
          >
            {cards ? (
            <GridCards
              look={cards}
              label={label ?? title(meta)}
              columns={columns}
              records={records}
              rowKey={key}
              loading={!result && !error}
              dimmed={slow && !!result}
              selected={selected}
              onSelect={setSelected}
              onOpen={editAction ? (row) => run(editAction, row) : undefined}
              onMenu={(e, row) => {
                if ((e.target as HTMLElement).closest("input,textarea")) return;
                e.preventDefault();
                setSelected(String(row[key]));
                setMenu({
                  at: pointOf(e),
                  row,
                  field: (e.target as HTMLElement).closest<HTMLElement>("[data-field]")?.dataset.field,
                  texts: cellTexts(e.currentTarget as HTMLElement),
                });
              }}
              labelOf={(c) => (c === statusColumn ? t("Status") : c.label_name || c.param_name)}
              renderValue={cellValue}
              renderActions={(row) => (rowActions.length || rowDrill ? rowButtons(row) : null)}
              empty={emptyState}
              footer={
                hasFooter ? (
                  <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-secondary bg-secondary px-4 py-2 text-sm">
                    {columns.filter(aggregateOf).map((c) => (
                      <div key={c.field_path} className="flex gap-2">
                        <dt className="text-tertiary">{c.label_name || c.param_name}</dt>
                        <dd className="font-semibold text-primary tabular-nums">{footerValue(c)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : undefined
              }
              style={scrollStyle}
            />
            ) : (
            <Table
              aria-label={label ?? title(meta)}
              scrollStyle={scrollStyle}
              className={filler ? "h-full" : undefined}
              sortDescriptor={sort}
              onSortChange={setSort}
              selectionMode={multi ? "multiple" : "single"}
              selectionBehavior="replace"
              selectedKeys={multi ? picked : selected ? [selected] : []}
              onSelectionChange={(keys: Selection) => {
                if (!multi) {
                  setSelected(keys === "all" ? null : [...keys][0] != null ? String([...keys][0]) : null);
                  return;
                }
                // Clicking a row picks only it; its checkbox, Ctrl or Shift add to the picked.
                const next = new Set(keys === "all" ? records.map((r) => String(r[key])) : [...keys].map(String));
                const added = [...next].find((k) => !picked.has(k));
                setPicked(next);
                setSelected(added ?? (selected && next.has(selected) ? selected : ([...next].pop() ?? null)));
              }}
              // The row holding nested grids takes no selection or row action; the grids inside work as usual.
              disabledKeys={items
                .filter((r) => r._nestedOf || r._footer || r._filler || r._skeleton)
                .map((r) => r._key)}
              disabledBehavior="selection"
              onRowAction={
                editAction
                  ? (id) =>
                      !String(id).endsWith(NESTED) &&
                      id !== FOOTER &&
                      id !== FILLER &&
                      !String(id).startsWith(SKELETON) &&
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
                  ...(multi
                    ? [
                        <Table.Head
                          key="_pick"
                          id="_pick"
                          aria-label={t("Pick rows")}
                          style={freeze(0, true).style}
                          className={`w-px pr-0 pl-4 ${freeze(0, true).className}`}
                        >
                          <Checkbox slot="selection" size="sm" />
                        </Table.Head>,
                      ]
                    : []),
                  ...(nested.length
                    ? [
                        <Table.Head
                          key="_expand"
                          id="_expand"
                          aria-label={t("Expand")}
                          style={freeze(picks, true).style}
                          className={`w-px px-2 ${freeze(picks, true).className}`}
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
                        width={widthOf(c)}
                        handles={
                          <>
                            <ColumnGrip
                              field={c.field_path}
                              label={c === statusColumn ? t("Status") : c.label_name || c.param_name}
                              onDrag={setColumnDrag}
                              onDrop={reorderColumns}
                            />
                            {resizerFor(c)}
                          </>
                        }
                        style={headStyles[c.field_path]}
                        className={`${isNumber(c) && !(workflow && c.field_path === "status_id") ? "[&>div]:justify-end" : ""} ${columnDrag?.field === c.field_path ? "bg-tertiary" : ""} ${columnDrag?.target === c.field_path ? (columnDrag.side === "before" ? DROP_BEFORE : DROP_AFTER) : ""} ${f.className}`}
                      />
                    );
                  }),
                  ...(rowActions.length || rowDrill
                    ? [<Table.Head key="_actions" id="_actions" />]
                    : []),
                ]}
              </Table.Header>
              <Table.Body
                className={cascadeFrom !== null ? "rows-in" : undefined}
                style={cascadeFrom !== null ? ({ "--rows-from": `${Math.round(cascadeFrom)}ms` } as React.CSSProperties) : undefined}
                items={items}
                dependencies={[
                  multi,
                  columns,
                  rowActions,
                  rowDrill,
                  lefts,
                  firstNumber,
                  expanded,
                  nested,
                  viewWidth,
                  result?.footer,
                  dragged,
                ]}
                renderEmptyState={() => emptyState}
              >
                {(row) =>
                  row._skeleton ? (
                    <Table.Row id={row._key} className="hover:bg-transparent">
                      {Array.from({ length: columnCount }, (_, i) => (
                        <Table.Cell key={i}>
                          {/* Widths vary by column and row so the placeholder reads as text, not a grid of bars. */}
                          <div
                            className="h-3 animate-pulse rounded bg-tertiary motion-reduce:animate-none"
                            style={{ width: `${40 + ((i * 37 + Number(row._key.slice(SKELETON.length)) * 23) % 50)}%` }}
                          />
                        </Table.Cell>
                      ))}
                    </Table.Row>
                  ) : row._filler ? (
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
                        ...columns.map((c, i) => (
                          <Table.Cell
                            key={c.field_path}
                            style={freeze(lead + i, true).style}
                            className={cx(
                              footerCell(lead + i),
                              "whitespace-nowrap",
                              isNumber(c) ? "text-right tabular-nums" : "",
                            )}
                          >
                            {footerValue(c)}
                          </Table.Cell>
                        )),
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
                      className="grid-row group cursor-pointer selected:bg-brand-primary_alt selected:hover:bg-brand-primary_alt"
                      onContextMenu={(e) => {
                        if ((e.target as HTMLElement).closest("input,textarea")) return;
                        e.preventDefault();
                        setSelected(row._key);
                        // Right-clicking one of the picked rows keeps them all picked, for consolidate.
                        if (multi && !picked.has(row._key)) setPicked(new Set([row._key]));
                        setMenu({
                          at: pointOf(e),
                          row: records.find((r) => String(r[key]) === row._key),
                          field: (e.target as HTMLElement).closest<HTMLElement>("[data-field]")?.dataset.field,
                          texts: cellTexts(e.currentTarget as HTMLElement),
                        });
                      }}
                    >
                      {[
                        ...(multi
                          ? [
                              <Table.Cell
                                key="_pick"
                                style={freeze(0).style}
                                className={`w-px pr-0 pl-4 ${freeze(0).className}`}
                              >
                                <Checkbox slot="selection" size="sm" />
                              </Table.Cell>,
                            ]
                          : []),
                        ...(nested.length
                          ? [
                              <Table.Cell
                                key="_expand"
                                style={freeze(picks).style}
                                className={`w-px px-2 ${freeze(picks).className}`}
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
                            <CellWidth width={widthOf(c)}>
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
                              {cellValue(c, row)}
                            </CellWidth>
                          </Table.Cell>
                        )),
                        ...(rowActions.length || rowDrill
                          ? [
                              <Table.Cell key="_actions" className="w-px">
                                {rowButtons(row)}
                              </Table.Cell>,
                            ]
                          : []),
                      ]}
                    </Table.Row>
                  )
                }
              </Table.Body>
            </Table>
            )}
          </div>

          {/* Always shown, even on one page, so it doesn't jump away when a filter narrows the rows. */}
          {result && (
            <PaginationCardMinimal
              page={result.current_page}
              total={Math.max(1, result.last_page)}
              pageSize={perPage}
              onPageChange={(p) => setPage(Math.max(1, p))}
              onPageSizeChange={setPerPage}
              onRefresh={() => {
                refreshedByHand.current = true;
                setReload((n) => n + 1);
              }}
              refreshing={slow}
              records={result.total}
            />
          )}
        </TableCard.Root>
      </div>


      {columnDrag && <ColumnDragLabel drag={columnDrag} />}

      {menu && (
        <ContextMenu
          at={menu.at}
          title={menu.row ? rowName(menu.row) || title(meta) : title(meta)}
          entries={menuEntries(menu.row, menu.field, menu.more, menu.texts)}
          onClose={closeMenu}
          anchor={menu.more ? moreRef : undefined}
        />
      )}

      {sharing && <ShareRecord record={sharing} onClose={() => setSharing(null)} />}

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
            consolidate={
              running.ids
                ? { gridId: meta.id, actionId: running.action.id, ids: running.ids, filter: { ...filters, ...fixed }, scope }
                : undefined
            }
            onClose={() => setRunning(null)}
            onSaved={(next) => {
              if (next !== "new") setRunning(null);
              // The picked records are done with once they are merged.
              if (running.ids) setPicked(new Set());
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
  consolidate,
  onClose,
  onSaved,
}: {
  running: Running;
  formId: number;
  recordId: string | null;
  fillParams: Record<string, string>;
  rowName: string;
  scope?: Filters;
  /** A consolidate button: the form opens with these picked rows merged. */
  consolidate?: Consolidating;
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
        consolidate && consolidate.ids.length > 1
          ? t("{label} · {n} records", { label: action.label, n: consolidate.ids.length })
          : rowName && action.needs_row
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
          action.get_meta_id && !consolidate
            ? { metaId: action.get_meta_id, params: fillParams }
            : undefined
        }
        consolidate={consolidate}
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
        <div aria-busy="true" className="h-48 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
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
        <div aria-busy="true" className="h-48 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
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
      <div className="h-40" aria-busy="true" />
    );

  return <GridView def={def} fixed={fixed} label={label} />;
}

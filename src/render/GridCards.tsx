import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Image01 } from "@untitledui/icons";
import { GridList, GridListItem, type Selection, type SortDescriptor } from "react-aria-components";
import { contentApi } from "../lib/contentApi";
import type { DataRow } from "../lib/dataApi";
import type { MetaParam, RecordLook, RecordSlot } from "../lib/metaApi";
import { filesOf, isPicture } from "./FileField";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { cx } from "@/utils/cx";
import { t } from "@/i18n";

const SKELETON_CARDS = 6;
const LAYOUTS: Record<RecordLook, string> = {
  cards: "grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] content-start gap-3 p-4",
  inline: "flex flex-col gap-2 p-4",
  tiles: "grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] content-start gap-3 p-4",
};
const SKELETONS: Record<RecordLook, string> = { cards: "h-32", inline: "h-16", tiles: "h-40" };

type Slots = Record<RecordSlot, MetaParam[]>;

/** Each column in its place (widget_position). Without one it's a detail, the status a badge, and with no title the first detail is. */
function slotsOf(columns: MetaParam[]): Slots {
  const slots: Slots = { image: [], title: [], subtitle: [], badge: [], body: [], footer: [] };
  for (const c of columns) slots[c.widget_position ?? (c.id > 0 ? "body" : "badge")].push(c);
  if (!slots.title.length && slots.body.length) slots.title.push(slots.body.shift()!);
  return slots;
}

/** What an image column shows: its uploaded picture, or a web address kept as text. */
function useImageSource(value: unknown) {
  const file = filesOf(value).find(isPicture);
  const text = typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
  const [loaded, setLoaded] = useState<{ id: number; url: string } | null>(null);
  const fileId = file?.id;

  useEffect(() => {
    if (fileId == null) return;
    let live = true;
    let url: string | null = null;
    contentApi.pictureUrl(fileId).then(
      (made) => {
        url = made;
        if (live) setLoaded({ id: fileId, url: made });
        else URL.revokeObjectURL(made);
      },
      () => {},
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId]);

  return text ?? (loaded && loaded.id === fileId ? loaded.url : null);
}

/** A record's picture; an empty box when it has none, so the widgets stay in line. */
function RecordImage({ column, row, className }: { column: MetaParam; row: DataRow; className: string }) {
  const source = useImageSource(row[column.field_path]);
  const [failed, setFailed] = useState<string | null>(null);
  if (source && source !== failed) {
    return <img data-field={column.field_path} src={source} alt="" loading="lazy" onError={() => setFailed(source)} className={cx(className, "bg-secondary object-cover")} />;
  }
  return (
    <div data-field={column.field_path} className={cx(className, "flex items-center justify-center bg-secondary")}>
      <Image01 className="size-5 text-fg-quaternary" aria-hidden />
    </div>
  );
}

interface WidgetProps {
  slots: Slots;
  row: DataRow;
  labelOf: (c: MetaParam) => string;
  renderValue: (c: MetaParam, row: DataRow) => ReactNode;
  actions: ReactNode;
}

function Values({ columns, row, renderValue, className }: Pick<WidgetProps, "row" | "renderValue"> & { columns: MetaParam[]; className: string }) {
  return columns.map((c) => (
    <p key={c.field_path} data-field={c.field_path} className={className}>
      {renderValue(c, row)}
    </p>
  ));
}

/** The added status column is a badge already; a column placed there becomes one. */
function Badges({ slots, row, renderValue }: Pick<WidgetProps, "slots" | "row" | "renderValue">) {
  return slots.badge.map((c) => (
    <span key={c.field_path} data-field={c.field_path} className="inline-flex max-w-full">
      {c.id > 0 ? <Badge type="pill-color" size="sm" color="gray">{renderValue(c, row)}</Badge> : renderValue(c, row)}
    </span>
  ));
}

function Details({ slots, row, labelOf, renderValue }: Pick<WidgetProps, "slots" | "row" | "labelOf" | "renderValue">) {
  if (!slots.body.length) return null;
  return (
    <dl className="mt-2 space-y-1">
      {slots.body.map((c) => (
        <div key={c.field_path} data-field={c.field_path} className="flex items-baseline justify-between gap-3 text-sm">
          <dt className="shrink-0 text-tertiary">{labelOf(c)}</dt>
          <dd className="min-w-0 truncate text-right text-secondary">{renderValue(c, row)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A card: the picture on top, then everything under it. */
function CardWidget({ slots, row, labelOf, renderValue, actions }: WidgetProps) {
  return (
    <>
      {slots.image[0] && <RecordImage column={slots.image[0]} row={row} className="aspect-video w-full rounded-t-xl" />}
      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Values columns={slots.title} row={row} renderValue={renderValue} className="truncate text-sm font-semibold text-primary" />
            <Values columns={slots.subtitle} row={row} renderValue={renderValue} className="truncate text-sm text-tertiary" />
          </div>
          {actions}
        </div>
        {slots.badge.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badges slots={slots} row={row} renderValue={renderValue} />
          </div>
        )}
        <Details slots={slots} row={row} labelOf={labelOf} renderValue={renderValue} />
      </div>
      {slots.footer.length > 0 && (
        <div className="flex flex-wrap justify-between gap-x-3 border-t border-secondary px-4 py-2">
          <Values columns={slots.footer} row={row} renderValue={renderValue} className="truncate text-xs text-tertiary" />
        </div>
      )}
    </>
  );
}

/** An inline card: one line across, the picture at the start and the details running along it. */
function InlineWidget({ slots, row, labelOf, renderValue, actions }: WidgetProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      {slots.image[0] && <RecordImage column={slots.image[0]} row={row} className="size-11 shrink-0 rounded-lg" />}
      {/* Fixed widths, so the same column lines up from one record to the next. */}
      <div className="min-w-0 flex-1 basis-40">
        <Values columns={slots.title} row={row} renderValue={renderValue} className="truncate text-sm font-semibold text-primary" />
        <Values columns={slots.subtitle} row={row} renderValue={renderValue} className="truncate text-sm text-tertiary" />
      </div>
      {slots.body.map((c) => (
        <div key={c.field_path} data-field={c.field_path} className="w-20 shrink-0 text-sm">
          <p className="truncate text-xs text-tertiary">{labelOf(c)}</p>
          <p className="truncate text-secondary">{renderValue(c, row)}</p>
        </div>
      ))}
      {slots.badge.length > 0 && (
        <div className="flex w-28 shrink-0 flex-wrap gap-1.5">
          <Badges slots={slots} row={row} renderValue={renderValue} />
        </div>
      )}
      {slots.footer.length > 0 && (
        <div className="w-16 shrink-0 text-right">
          <Values columns={slots.footer} row={row} renderValue={renderValue} className="truncate text-xs text-tertiary" />
        </div>
      )}
      {actions}
    </div>
  );
}

/** A tile: small and centered, for picking from many at a glance. */
function TileWidget({ slots, row, renderValue, actions }: WidgetProps) {
  return (
    <div className="relative flex h-full flex-col items-center p-4 text-center">
      {actions && <div className="absolute top-2 right-2">{actions}</div>}
      {slots.image[0] && <RecordImage column={slots.image[0]} row={row} className="mb-3 size-16 rounded-full" />}
      <div className="w-full min-w-0">
        <Values columns={slots.title} row={row} renderValue={renderValue} className="truncate text-sm font-semibold text-primary" />
        <Values columns={slots.subtitle} row={row} renderValue={renderValue} className="truncate text-xs text-tertiary" />
        <Values columns={slots.body} row={row} renderValue={renderValue} className="mt-1 truncate text-sm text-secondary" />
      </div>
      {slots.badge.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          <Badges slots={slots} row={row} renderValue={renderValue} />
        </div>
      )}
      {slots.footer.length > 0 && (
        <div className="mt-auto w-full pt-2">
          <Values columns={slots.footer} row={row} renderValue={renderValue} className="truncate text-xs text-tertiary" />
        </div>
      )}
    </div>
  );
}

const WIDGETS: Record<RecordLook, (props: WidgetProps) => ReactNode> = { cards: CardWidget, inline: InlineWidget, tiles: TileWidget };

/**
 * A grid's records as widgets (json_config.view): cards, inline cards or tiles. Each column
 * sits at its widget_position: image, title, subtitle, badge, body or footer (see slotsOf).
 * Picking and opening work as in the table: click picks a record, double-click or Enter opens
 * it, right-click opens its menu. The table's headers sort, so here a control above them does.
 */
export function GridCards({
  look,
  label,
  columns,
  records,
  rowKey,
  loading,
  dimmed,
  selected,
  onSelect,
  onOpen,
  onMenu,
  labelOf,
  renderValue,
  renderActions,
  empty,
  footer,
  sort,
  onSort,
  style,
}: {
  look: RecordLook;
  label: string;
  columns: MetaParam[];
  records: DataRow[];
  rowKey: string;
  loading: boolean;
  dimmed: boolean;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onOpen?: (row: DataRow) => void;
  onMenu: (e: MouseEvent, row: DataRow) => void;
  labelOf: (c: MetaParam) => string;
  renderValue: (c: MetaParam, row: DataRow) => ReactNode;
  renderActions: (row: DataRow) => ReactNode;
  empty: ReactNode;
  footer?: ReactNode;
  sort?: SortDescriptor;
  onSort: (sort: SortDescriptor | undefined) => void;
  style?: CSSProperties;
}) {
  const slots = useMemo(() => slotsOf(columns), [columns]);
  const heading = slots.title[0];
  const descending = sort?.direction === "descending";
  // The added status column has no field to sort on.
  const sortable = columns.filter((c) => c.id > 0);
  const Widget = WIDGETS[look];

  return (
    <div style={style} className="flex flex-col">
      <div className="flex items-end gap-2 border-b border-secondary px-4 py-3">
        <NativeSelect
          label={t("Sort by")}
          size="sm"
          className="sm:w-56"
          value={sort?.column ? String(sort.column) : ""}
          onChange={(e) => onSort(e.target.value ? { column: e.target.value, direction: sort?.direction ?? "ascending" } : undefined)}
          options={[{ value: "", label: t("As listed") }, ...sortable.map((c) => ({ value: c.field_path, label: labelOf(c) }))]}
        />
        {sort?.column && (
          <Button
            size="sm"
            color="secondary"
            iconLeading={descending ? ArrowDown : ArrowUp}
            aria-label={descending ? t("Descending") : t("Ascending")}
            onPress={() => onSort({ column: sort.column, direction: descending ? "ascending" : "descending" })}
          />
        )}
      </div>

      {loading ? (
        <div aria-hidden="true" className={LAYOUTS[look]}>
          {Array.from({ length: SKELETON_CARDS }, (_, i) => (
            <div key={i} className={cx(SKELETONS[look], "animate-pulse rounded-xl bg-secondary motion-reduce:animate-none")} />
          ))}
        </div>
      ) : (
        <GridList
          aria-label={label}
          layout={look === "inline" ? "stack" : "grid"}
          selectionMode="single"
          selectionBehavior="replace"
          selectedKeys={selected ? [selected] : []}
          onSelectionChange={(keys: Selection) => onSelect(keys === "all" || [...keys][0] == null ? null : String([...keys][0]))}
          onAction={onOpen ? (id) => {
            const row = records.find((r) => String(r[rowKey]) === String(id));
            if (row) onOpen(row);
          } : undefined}
          renderEmptyState={() => empty}
          className={cx(records.length > 0 && LAYOUTS[look], "min-h-0 flex-1 overflow-auto transition-opacity duration-150", dimmed && "opacity-50")}
        >
          {records.map((row) => {
            const id = String(row[rowKey]);
            return (
              <GridListItem
                key={id}
                id={id}
                textValue={String(row[heading?.field_path] ?? id)}
                className={({ isSelected, isFocusVisible }) =>
                  cx(
                    "cursor-pointer rounded-xl bg-primary shadow-xs ring-1 outline-hidden animate-in fade-in duration-200 motion-reduce:animate-none hover:bg-primary_hover",
                    isSelected ? "bg-brand-primary_alt ring-2 ring-brand hover:bg-brand-primary_alt" : "ring-secondary",
                    isFocusVisible && "ring-2 ring-brand",
                  )
                }
              >
                {/* The menu is on this box: the list item doesn't pass right-clicks on. */}
                <div className="h-full" onContextMenu={(e) => onMenu(e, row)}>
                  <Widget slots={slots} row={row} labelOf={labelOf} renderValue={renderValue} actions={renderActions(row)} />
                </div>
              </GridListItem>
            );
          })}
        </GridList>
      )}

      {footer}
    </div>
  );
}

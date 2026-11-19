import { DotsGrid, Pin02 } from "@untitledui/icons";
import { Button as AriaButton, DropIndicator, GridList, GridListItem, useDragAndDrop } from "react-aria-components";
import type { MetaParam } from "../lib/metaApi";
import { IconAction } from "../components/ui";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { cx } from "@/utils/cx";
import { t } from "@/i18n";

/**
 * A grid's columns in the Columns popover, in the grid's order: tick to show, pin to freeze, and
 * drag a row (or its grip) to another place in the list and drop it there. A line shows where it
 * will land. From the keyboard: focus the grip, Enter to pick the column up, arrows to choose the
 * place, Enter to drop it.
 */
export function ColumnsList({
  columns,
  nameOf,
  isShown,
  isFrozen,
  canHide,
  onShow,
  onFreeze,
  onReorder,
}: {
  columns: MetaParam[];
  nameOf: (c: MetaParam) => string;
  isShown: (c: MetaParam) => boolean;
  isFrozen: (c: MetaParam) => boolean;
  /** False while one column is left shown: a grid needs a column. */
  canHide: boolean;
  onShow: (field: string, on: boolean) => void;
  onFreeze: (field: string, on: boolean) => void;
  /** Every field, in the new order. */
  onReorder: (fields: string[]) => void;
}) {
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    onReorder: (e) => {
      const fields = columns.map((c) => c.field_path);
      const moving = fields.filter((f) => e.keys.has(f));
      const rest = fields.filter((f) => !e.keys.has(f));
      const at = rest.indexOf(String(e.target.key)) + (e.target.dropPosition === "after" ? 1 : 0);
      rest.splice(at, 0, ...moving);
      onReorder(rest);
    },
    renderDropIndicator: (target) => (
      <DropIndicator target={target} className={({ isDropTarget }) => cx("mx-2 h-0.5 rounded-full", isDropTarget ? "bg-brand-solid" : "bg-transparent")} />
    ),
  });

  return (
    <GridList
      aria-label={t("Columns")}
      items={columns}
      dragAndDropHooks={dragAndDropHooks}
      // The rows draw again when a column is shown, hidden or frozen, not only when the list changes.
      dependencies={[columns.map((c) => `${isShown(c)}${isFrozen(c)}`).join(), canHide]}
      className="flex flex-col py-2 pr-2 pl-1 outline-hidden"
    >
      {(c) => {
        const name = nameOf(c);
        const shown = isShown(c);
        const frozen = shown && isFrozen(c);
        return (
          <GridListItem
            id={c.field_path}
            textValue={name}
            className={({ isDragging, isFocusVisible }) =>
              cx(
                "flex min-h-8 items-center gap-1 rounded-md outline-focus-ring",
                isDragging && "opacity-50",
                isFocusVisible && "outline-2 -outline-offset-2",
              )
            }
          >
            <AriaButton
              slot="drag"
              aria-label={t("Move {name}", { name })}
              className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-fg-quaternary outline-focus-ring hover:text-fg-quaternary_hover focus-visible:outline-2"
            >
              <DotsGrid className="size-3.5" />
            </AriaButton>
            <Checkbox
              className="min-w-0 flex-1"
              label={name}
              isSelected={shown}
              isDisabled={shown && !canHide}
              onChange={(on) => onShow(c.field_path, on)}
            />
            {/* Frozen columns stay in view on the left when the grid scrolls sideways. */}
            {shown && (
              <IconAction
                icon={Pin02}
                label={t(frozen ? "Unfreeze {name}" : "Freeze {name}", { name })}
                onPress={() => onFreeze(c.field_path, !frozen)}
                className={frozen ? "text-fg-brand-primary" : "opacity-60 hover:opacity-100"}
              />
            )}
          </GridListItem>
        );
      }}
    </GridList>
  );
}

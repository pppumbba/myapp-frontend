import { useRef, type ReactNode } from 'react';
import { ChevronDown } from '@untitledui/icons';
import { useFilter } from 'react-aria';
import { Button as AriaButton, ComboBox, Group, Input, ListBox } from 'react-aria-components';
import { HintText } from '@/components/base/input/hint-text';
import { Label } from '@/components/base/input/label';
import { Popover } from '@/components/base/select/popover';
import { SelectItem } from '@/components/base/select/select-item';
import { SelectContext } from '@/components/base/select/select-shared';
import { cx } from '@/utils/cx';

export interface ComboOption {
  id: string;
  label: string;
}

/**
 * A searchable select: type to narrow the list, or open it with the chevron. Values are
 * strings, '' meaning nothing picked; emptying the text clears the value.
 * onSearch hears the typed text, for lists loaded from the server. addon sits inside the
 * field before the chevron (a lookup's browse button).
 */
export function ComboField({
  label,
  'aria-label': ariaLabel,
  items,
  value,
  onChange,
  onSearch,
  isLoading,
  placeholder = 'Choose…',
  size = 'md',
  isRequired,
  isInvalid,
  hint,
  addon,
}: {
  label?: string;
  'aria-label'?: string;
  items: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  onSearch?: (text: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  size?: 'sm' | 'md';
  isRequired?: boolean;
  isInvalid?: boolean;
  hint?: string;
  addon?: ReactNode;
}) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const groupRef = useRef<HTMLDivElement>(null);

  return (
    <SelectContext.Provider value={{ size }}>
      <ComboBox
        aria-label={ariaLabel}
        items={items}
        selectedKey={value || null}
        onSelectionChange={(key) => key !== null && onChange(String(key))}
        onInputChange={(text) => {
          onSearch?.(text);
          if (text === '' && value) onChange('');
        }}
        defaultFilter={contains}
        menuTrigger="input"
        allowsEmptyCollection
        isRequired={isRequired}
        isInvalid={isInvalid}
        className="flex w-full flex-col gap-1.5"
      >
        {label && <Label isRequired={isRequired}>{label}</Label>}

        <Group
          ref={groupRef}
          className={({ isFocusWithin }) =>
            cx(
              'relative flex w-full items-center rounded-lg bg-primary shadow-xs ring-1 ring-primary transition-shadow duration-100 ease-linear ring-inset',
              isFocusWithin && 'ring-2 ring-brand',
              isInvalid && (isFocusWithin ? 'ring-2 ring-error' : 'ring-error_subtle'),
            )
          }
        >
          <Input
            placeholder={placeholder}
            className={cx(
              'min-w-0 flex-1 truncate bg-transparent py-2 pl-3 font-medium text-primary outline-hidden placeholder:font-normal placeholder:text-placeholder',
              size === 'sm' ? 'text-sm' : 'text-md',
            )}
          />
          {addon}
          <AriaButton
            aria-label="Show choices"
            className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2"
          >
            <ChevronDown className="size-4 stroke-[2.25px]" />
          </AriaButton>
        </Group>

        {hint && (
          <HintText isInvalid={isInvalid} className={cx(size === 'sm' && 'text-xs')}>
            {hint}
          </HintText>
        )}

        <Popover size={size} triggerRef={groupRef} style={{ width: groupRef.current?.offsetWidth }}>
          <ListBox
            className="outline-hidden"
            renderEmptyState={() => <p className="px-3 py-2 text-sm text-tertiary">{isLoading ? 'Loading…' : 'No matches'}</p>}
          >
            {(item: ComboOption) => <SelectItem id={item.id} label={item.label} />}
          </ListBox>
        </Popover>
      </ComboBox>
    </SelectContext.Provider>
  );
}

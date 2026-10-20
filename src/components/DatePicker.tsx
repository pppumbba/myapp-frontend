import { useContext } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from '@untitledui/icons';
import { getLocalTimeZone, now, parseDate, parseDateTime, toCalendarDateTime, today, type DateValue } from '@internationalized/date';
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DatePicker as AriaDatePicker,
  DatePickerStateContext,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Popover,
} from 'react-aria-components';
import { HintText } from '@/components/base/input/hint-text';
import { Label } from '@/components/base/input/label';
import { cx } from '@/utils/cx';

/** "YYYY-MM-DD" (or "YYYY-MM-DDTHH:mm" with time) as a picker value; anything else is empty. */
function toValue(value: string, withTime: boolean): DateValue | null {
  if (!value) return null;
  try {
    return withTime ? parseDateTime(value.slice(0, 16)) : parseDate(value.slice(0, 10));
  } catch {
    return null;
  }
}

/** A picker value back as "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm", the way the forms keep dates. */
function toText(value: DateValue | null, withTime: boolean): string {
  if (!value) return '';
  return withTime ? toCalendarDateTime(value).toString().slice(0, 16) : value.toString().slice(0, 10);
}

/**
 * A date (or date and time) typed into segments or picked from a calendar. Values go in and
 * out as strings, like a native date input's, so forms keep their state as text.
 */
export function DatePicker({
  label,
  'aria-label': ariaLabel,
  value,
  onChange,
  withTime = false,
  size = 'md',
  isRequired,
  isInvalid,
  hint,
}: {
  label?: string;
  'aria-label'?: string;
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  size?: 'sm' | 'md';
  isRequired?: boolean;
  isInvalid?: boolean;
  hint?: string;
}) {
  return (
    <AriaDatePicker
      aria-label={ariaLabel}
      value={toValue(value, withTime)}
      onChange={(v) => onChange(toText(v, withTime))}
      granularity={withTime ? 'minute' : 'day'}
      isRequired={isRequired}
      isInvalid={isInvalid}
      shouldForceLeadingZeros
      className="group flex w-full flex-col gap-1.5"
    >
      {label && <Label isRequired={isRequired}>{label}</Label>}

      <Group
        className={({ isFocusWithin }) =>
          cx(
            'relative flex w-full items-center rounded-lg bg-primary shadow-xs ring-1 ring-primary transition-shadow duration-100 ease-linear ring-inset',
            isFocusWithin && 'ring-2 ring-brand',
            isInvalid && (isFocusWithin ? 'ring-2 ring-error' : 'ring-error_subtle'),
          )
        }
      >
        <DateInput className={cx('flex min-w-0 flex-1 overflow-hidden', size === 'sm' ? 'py-2 pl-3 text-sm' : 'py-2 pl-3 text-md')}>
          {(segment) => (
            <DateSegment
              segment={segment}
              className={cx(
                'rounded px-0.5 text-primary tabular-nums caret-transparent focus:bg-brand-solid focus:font-medium focus:text-white focus:outline-hidden',
                segment.isPlaceholder && 'text-placeholder',
                segment.type === 'literal' && 'text-fg-quaternary',
              )}
            />
          )}
        </DateInput>
        <AriaButton
          aria-label="Open calendar"
          className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2"
        >
          <CalendarIcon className="size-4 stroke-[2.25px]" />
        </AriaButton>
      </Group>

      {hint && (
        <HintText isInvalid={isInvalid} className={cx(size === 'sm' && 'text-xs')}>
          {hint}
        </HintText>
      )}

      <Popover
        placement="bottom start"
        offset={4}
        className={({ isEntering, isExiting }) =>
          cx(
            'rounded-xl bg-primary shadow-lg ring-1 ring-secondary_alt outline-hidden',
            isEntering && 'duration-150 ease-out animate-in fade-in placement-bottom:slide-in-from-top-0.5 placement-top:slide-in-from-bottom-0.5',
            isExiting && 'duration-100 ease-in animate-out fade-out',
          )
        }
      >
        <Dialog className="outline-hidden">
          <Calendar className="w-72 p-3">
            <header className="flex items-center justify-between pb-2">
              <AriaButton slot="previous" aria-label="Previous month" className={navButton}>
                <ChevronLeft className="size-4 stroke-[2.25px]" />
              </AriaButton>
              <Heading className="text-sm font-semibold text-secondary" />
              <AriaButton slot="next" aria-label="Next month" className={navButton}>
                <ChevronRight className="size-4 stroke-[2.25px]" />
              </AriaButton>
            </header>
            <CalendarGrid className="w-full border-collapse">
              <CalendarGridHeader>
                {(day) => <CalendarHeaderCell className="pb-1 text-xs font-medium text-tertiary">{day}</CalendarHeaderCell>}
              </CalendarGridHeader>
              <CalendarGridBody>
                {(date) => (
                  <CalendarCell
                    date={date}
                    className={({ isSelected, isToday, isOutsideMonth, isDisabled, isFocusVisible }) =>
                      cx(
                        'mx-auto flex size-9 cursor-pointer items-center justify-center rounded-full text-sm tabular-nums outline-hidden transition duration-100 ease-linear',
                        isOutsideMonth ? 'text-quaternary' : 'text-secondary',
                        !isSelected && 'hover:bg-primary_hover',
                        isToday && !isSelected && 'font-semibold text-brand-secondary',
                        isSelected && 'bg-brand-solid font-semibold text-white',
                        isDisabled && 'cursor-not-allowed opacity-50',
                        isFocusVisible && 'outline-2 outline-offset-2 outline-focus-ring',
                      )
                    }
                  />
                )}
              </CalendarGridBody>
            </CalendarGrid>
          </Calendar>
          <PickerFooter withTime={withTime} onChange={onChange} />
        </Dialog>
      </Popover>
    </AriaDatePicker>
  );
}

const navButton =
  'flex size-8 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2';

/** Today and Clear, under the calendar. */
function PickerFooter({ withTime, onChange }: { withTime: boolean; onChange: (value: string) => void }) {
  const state = useContext(DatePickerStateContext);
  const pick = (value: string) => {
    onChange(value);
    state?.close();
  };
  const footButton =
    'rounded-md px-2 py-1 text-sm font-semibold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2';

  return (
    <div className="flex items-center justify-between border-t border-secondary px-3 py-2">
      <AriaButton
        className={cx(footButton, 'text-brand-secondary hover:bg-brand-primary_alt')}
        onPress={() => pick(withTime ? toText(now(getLocalTimeZone()), true) : today(getLocalTimeZone()).toString())}
      >
        {withTime ? 'Now' : 'Today'}
      </AriaButton>
      <AriaButton className={cx(footButton, 'text-tertiary hover:bg-primary_hover')} onPress={() => pick('')}>
        Clear
      </AriaButton>
    </div>
  );
}

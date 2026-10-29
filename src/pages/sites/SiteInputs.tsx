import { useCallback, useContext, useState, type ReactNode } from 'react';
import { Calendar as CalendarIcon, Check, ChevronDown, ChevronLeft, ChevronRight } from '@untitledui/icons';
import { getLocalTimeZone, now, today } from '@internationalized/date';
import { useFilter } from 'react-aria';
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  ComboBox,
  DateInput,
  DatePicker,
  DatePickerStateContext,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from 'react-aria-components';
import { toText, toValue } from '@/components/DatePicker';
import { t } from '@/i18n';

// The website's own date picker and choice list, drawn in the site's look (hm-* classes in
// site.css). React Aria does the keyboard, focus and screen reader work. Popups open inside
// the nearest <dialog> or .hm-site, so they keep the look's tokens and sit above a modal.

export interface SiteOption {
  id: string;
  label: string;
}

interface FieldProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
  isInvalid?: boolean;
  isDisabled?: boolean;
  /** The id of the field's error line. */
  describedBy?: string;
  /** Drawn under the control, inside the field (its error line). */
  after?: ReactNode;
}

/** Above this many choices the list gets a search box. */
const SEARCH_FROM = 8;

/** Where a popup goes: the open dialog it was pressed in, else the site. */
function usePopoverHost() {
  const [host, setHost] = useState<Element>();
  const ref = useCallback((el: HTMLElement | null) => setHost(el?.closest('dialog') ?? el?.closest('.hm-site') ?? undefined), []);
  return [ref, host] as const;
}

/** A day (or day and time) typed into segments or picked from a month. Values are "YYYY-MM-DD" text, like a native date input's. */
export function SiteDateField({
  label,
  value,
  onChange,
  isRequired,
  isInvalid,
  isDisabled,
  describedBy,
  after,
  withTime = false,
  min,
  max,
}: FieldProps & {
  withTime?: boolean;
  min?: string | null;
  max?: string | null;
}) {
  const [ref, host] = usePopoverHost();
  return (
    <DatePicker
      ref={ref}
      className="hm-field"
      value={toValue(value, withTime)}
      onChange={(v) => onChange(toText(v, withTime))}
      minValue={min ? toValue(min, withTime) : undefined}
      maxValue={max ? toValue(max, withTime) : undefined}
      granularity={withTime ? 'minute' : 'day'}
      shouldForceLeadingZeros
      isRequired={isRequired}
      isInvalid={isInvalid}
      isDisabled={isDisabled}
      aria-describedby={describedBy}
    >
      <Label className="hm-field__label">{label}</Label>
      <Group className="hm-control">
        <DateInput className="hm-control__segments">{(segment) => <DateSegment segment={segment} className="hm-segment" />}</DateInput>
        <Button className="hm-control__icon" aria-label={t('Open calendar')}>
          <CalendarIcon aria-hidden />
        </Button>
      </Group>
      {after}
      <Popover UNSTABLE_portalContainer={host} placement="bottom start" offset={6} className="hm-pop">
        <Dialog className="hm-pop__dialog">
          <Calendar className="hm-cal">
            <header className="hm-cal__head">
              <Button slot="previous" className="hm-control__icon" aria-label={t('Previous month')}>
                <ChevronLeft aria-hidden />
              </Button>
              <Heading className="hm-cal__month" />
              <Button slot="next" className="hm-control__icon" aria-label={t('Next month')}>
                <ChevronRight aria-hidden />
              </Button>
            </header>
            <CalendarGrid className="hm-cal__grid" weekdayStyle="short">
              <CalendarGridHeader>{(day) => <CalendarHeaderCell className="hm-cal__weekday">{day}</CalendarHeaderCell>}</CalendarGridHeader>
              <CalendarGridBody>{(date) => <CalendarCell date={date} className="hm-cal__day" />}</CalendarGridBody>
            </CalendarGrid>
          </Calendar>
          <DateFoot withTime={withTime} canClear={!isRequired} onChange={onChange} />
        </Dialog>
      </Popover>
    </DatePicker>
  );
}

/** Today (or Now) and, on an optional field, Clear. */
function DateFoot({ withTime, canClear, onChange }: { withTime: boolean; canClear: boolean; onChange: (value: string) => void }) {
  const state = useContext(DatePickerStateContext);
  const pick = (value: string) => {
    onChange(value);
    state?.close();
  };
  return (
    <div className="hm-cal__foot">
      <Button className="hm-btn hm-btn--text" onPress={() => pick(withTime ? toText(now(getLocalTimeZone()), true) : today(getLocalTimeZone()).toString())}>
        {withTime ? t('Now') : t('Today')}
      </Button>
      {canClear && (
        <Button className="hm-btn hm-btn--text" onPress={() => pick('')}>
          {t('Clear')}
        </Button>
      )}
    </div>
  );
}

/** One choice from a list: a button that opens it, or with many choices a box to type in that narrows it. '' is nothing picked. */
export function SiteCombo({
  label,
  value,
  onChange,
  isRequired,
  isInvalid,
  isDisabled,
  describedBy,
  after,
  items,
  placeholder = t('Choose…'),
}: FieldProps & { items: SiteOption[]; placeholder?: string }) {
  const [ref, host] = usePopoverHost();
  const { contains } = useFilter({ sensitivity: 'base' });
  const shared = {
    ref,
    className: 'hm-field',
    isRequired,
    isInvalid,
    isDisabled,
    'aria-describedby': describedBy,
  } as const;
  // A Select gives its list the items; a ComboBox hands them over filtered.
  const popover = (listItems?: SiteOption[]) => (
    <Popover UNSTABLE_portalContainer={host} placement="bottom start" offset={6} className="hm-pop hm-pop--list">
      <ListBox className="hm-list" items={listItems} renderEmptyState={() => <p className="hm-list__empty">{t('No matches')}</p>}>
        {(item: SiteOption) => (
          <ListBoxItem id={item.id} textValue={item.label} className="hm-list__item">
            {({ isSelected }) => (
              <>
                <span>{item.label}</span>
                {isSelected && <Check aria-hidden />}
              </>
            )}
          </ListBoxItem>
        )}
      </ListBox>
    </Popover>
  );

  if (items.length < SEARCH_FROM) {
    return (
      <Select {...shared} placeholder={placeholder} selectedKey={value || null} onSelectionChange={(key) => onChange(key === null ? '' : String(key))}>
        <Label className="hm-field__label">{label}</Label>
        <Button className="hm-control hm-control--button">
          <SelectValue className="hm-control__value" />
          <span className="hm-control__icon" aria-hidden>
            <ChevronDown />
          </span>
        </Button>
        {after}
        {popover(items)}
      </Select>
    );
  }

  return (
    <ComboBox
      {...shared}
      defaultItems={items}
      selectedKey={value || null}
      onSelectionChange={(key) => key !== null && onChange(String(key))}
      onInputChange={(text) => text === '' && value && onChange('')}
      defaultFilter={contains}
      menuTrigger="focus"
      allowsEmptyCollection
    >
      <Label className="hm-field__label">{label}</Label>
      <Group className="hm-control">
        <Input className="hm-control__input" placeholder={placeholder} />
        <Button className="hm-control__icon" aria-label={t('Show choices')}>
          <ChevronDown aria-hidden />
        </Button>
      </Group>
      {after}
      {popover()}
    </ComboBox>
  );
}

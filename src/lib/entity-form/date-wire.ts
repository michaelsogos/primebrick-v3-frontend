/**
 * date-wire — the ONE ISO↔CalendarDate conversion for the metadata
 * contract (`type:"date"` / `type:"datetime"` = timestamptz instant).
 *
 * `DateWheelPicker` binds CalendarDate/CalendarDateTime objects while the
 * wire contract is a plain string: `date` stays `YYYY-MM-DD`; `datetime`
 * (timestamptz) is a UTC ISO instant that DISPLAYS and EDITS in the
 * picker's timezone — the same semantics the filter surface has always
 * owned ("the panel owns ISO conversion at apply time").
 *
 * Consumers: `FormFieldDispatcher` (form-surface `date` control) and
 * `FiltersPanel` (filter-surface draft restore/apply). `ConfigValueInput`
 * keeps its own naive variant — config `type_config` datetimes are
 * timezone-naive strings by contract, not instants.
 */
import {
	CalendarDate,
	CalendarDateTime,
	parseDate,
	parseDateTime,
	today,
	getLocalTimeZone,
} from '@internationalized/date';

export type DateWireType = 'date' | 'datetime' | 'time';

/** ISO string → CalendarDate/CalendarDateTime. `Z`-suffixed instants are
 *  rendered in `timezone`; zone-naive ISO parses directly; `time` wires
 *  `HH:mm[:ss]` onto today's date (zone-naive by contract). Returns null
 *  on empty/malformed input — callers render the empty state, they do
 *  not guess. */
export function isoToCalendarDate(
	isoString: string | null | undefined,
	type: DateWireType = 'date',
	timezone: string = 'UTC',
): CalendarDate | CalendarDateTime | null {
	if (!isoString) return null;
	try {
		if (type === 'time') {
			const [h = 0, m = 0, s = 0] = isoString.split(':').map(Number);
			const d = today(getLocalTimeZone());
			return new CalendarDateTime(d.year, d.month, d.day, h, m, s);
		}
		if (type === 'datetime') {
			if (isoString.endsWith('Z')) {
				const date = new Date(isoString);
				const formatter = new Intl.DateTimeFormat('en-US', {
					timeZone: timezone,
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
					hour12: false,
				});
				const parts = formatter.formatToParts(date);
				const get = (p: string) => parseInt(parts.find((x) => x.type === p)?.value || '0', 10);
				let hour = get('hour');
				if (hour === 24) hour = 0;
				return new CalendarDateTime(
					get('year'),
					get('month'),
					get('day'),
					hour,
					get('minute'),
					get('second'),
				);
			}
			return parseDateTime(isoString);
		}
		return parseDate(isoString);
	} catch {
		return null;
	}
}

/** CalendarDate/CalendarDateTime → wire value: `date` keeps the plain
 *  date string; `datetime` converts through `timezone` back to a UTC
 *  ISO instant; `time` serializes `HH:mm:ss` (zone-naive). */
export function calendarDateToUtcIso(
	date: CalendarDate | CalendarDateTime | null,
	timezone: string,
	type: DateWireType = 'date',
): string | null {
	if (!date) return null;
	if (type === 'time') {
		const p = (n: number) => String(n).padStart(2, '0');
		const t = date as CalendarDateTime;
		return `${p(t.hour)}:${p(t.minute)}:${p(t.second)}`;
	}
	if (date instanceof CalendarDate) return date.toString();
	const utcBase = new Date(
		Date.UTC(date.year, date.month - 1, date.day, date.hour, date.minute, date.second),
	);
	const utcDate = new Date(utcBase.getTime() - getTimezoneOffset(timezone) * 60 * 1000);
	return utcDate.toISOString();
}

export function getTimezoneOffset(timezone: string): number {
	const date = new Date();
	const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
	const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
	return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
}

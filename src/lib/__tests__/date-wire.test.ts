import { describe, it, expect } from 'vitest';
import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import {
  isoToCalendarDate,
  calendarDateToUtcIso,
} from '$lib/entity-form/date-wire';

describe('isoToCalendarDate', () => {
  it('parses a plain date wire into CalendarDate', () => {
    const d = isoToCalendarDate('2025-11-12', 'date');
    expect(d).toBeInstanceOf(CalendarDate);
    expect(d?.toString()).toBe('2025-11-12');
  });

  it('renders a Z-instant in the given IANA zone', () => {
    const d = isoToCalendarDate('2025-11-12T23:30:00Z', 'datetime', 'Europe/Rome');
    expect(d).toBeInstanceOf(CalendarDateTime);
    const t = d as CalendarDateTime;
    // Rome is UTC+1 in November → 00:30 on the 13th.
    expect(t.day).toBe(13);
    expect(t.hour).toBe(0);
    expect(t.minute).toBe(30);
  });

  it('parses zone-naive datetime without shifting', () => {
    const d = isoToCalendarDate('2025-11-12T10:15:00', 'datetime', 'America/New_York');
    const t = d as CalendarDateTime;
    expect(t.hour).toBe(10);
    expect(t.minute).toBe(15);
  });

  it('maps HH:mm:ss time wires onto a CalendarDateTime', () => {
    const d = isoToCalendarDate('09:05:30', 'time');
    const t = d as CalendarDateTime;
    expect(t.hour).toBe(9);
    expect(t.minute).toBe(5);
    expect(t.second).toBe(30);
  });

  it('returns null for empty or malformed input — no guessing', () => {
    expect(isoToCalendarDate(null, 'date')).toBeNull();
    expect(isoToCalendarDate('', 'datetime')).toBeNull();
    expect(isoToCalendarDate('not-a-date', 'date')).toBeNull();
  });
});

describe('calendarDateToUtcIso', () => {
  it('serializes CalendarDate as a plain date string', () => {
    const d = new CalendarDate(2025, 11, 12);
    expect(calendarDateToUtcIso(d, 'UTC', 'date')).toBe('2025-11-12');
  });

  it('converts a zoned CalendarDateTime back to a UTC instant', () => {
    const d = new CalendarDateTime(2025, 11, 13, 0, 30, 0);
    const iso = calendarDateToUtcIso(d, 'Europe/Rome', 'datetime');
    // Rome UTC+1 → 23:30Z on the 12th.
    expect(iso).toBe('2025-11-12T23:30:00.000Z');
  });

  it('serializes time wires as HH:mm:ss (zone-naive)', () => {
    const d = new CalendarDateTime(2025, 1, 1, 9, 5, 3);
    expect(calendarDateToUtcIso(d, 'UTC', 'time')).toBe('09:05:03');
  });

  it('returns null for null — empty stays empty', () => {
    expect(calendarDateToUtcIso(null, 'UTC', 'datetime')).toBeNull();
  });
});

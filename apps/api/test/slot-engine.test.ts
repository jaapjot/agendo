import { describe, expect, it } from 'vitest';
import { computeAvailableSlots, isSlotAvailable, type SlotQuery } from '../src/modules/scheduling/slot-engine.js';

const TZ = 'America/Argentina/Buenos_Aires'; // UTC-3, no daylight saving time.

// Monday 2030-06-03, 09:00-12:00 local time.
const baseQuery: SlotQuery = {
  date: '2030-06-03',
  timezone: TZ,
  durationMinutes: 60,
  rules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 }],
  busy: [],
  now: new Date('2030-06-01T12:00:00Z'),
  minNoticeMinutes: 60,
  bookingWindowDays: 30,
};

/** Formats slots as local HH:mm to keep assertions readable. */
const localTimes = (slots: Date[]) =>
  slots.map((slot) =>
    slot.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
  );

describe('computeAvailableSlots', () => {
  it('generates 15-minute steps that fit entirely inside working hours', () => {
    const slots = computeAvailableSlots(baseQuery);
    expect(localTimes(slots)).toEqual([
      '09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00',
    ]);
  });

  it('returns UTC instants that correspond to local wall-clock time', () => {
    const [first] = computeAvailableSlots(baseQuery);
    expect(first?.toISOString()).toBe('2030-06-03T12:00:00.000Z'); // 09:00 at UTC-3
  });

  it('returns nothing on a day without working hours', () => {
    expect(computeAvailableSlots({ ...baseQuery, date: '2030-06-04' })).toEqual([]);
  });

  it('removes every slot that would overlap an existing appointment', () => {
    const slots = computeAvailableSlots({
      ...baseQuery,
      // Booked 10:00-11:00 local.
      busy: [{ start: new Date('2030-06-03T13:00:00Z'), end: new Date('2030-06-03T14:00:00Z') }],
    });
    expect(localTimes(slots)).toEqual(['09:00', '11:00']);
  });

  it('allows back-to-back appointments (end of one equals start of the next)', () => {
    const slots = computeAvailableSlots({
      ...baseQuery,
      busy: [{ start: new Date('2030-06-03T12:00:00Z'), end: new Date('2030-06-03T13:00:00Z') }],
    });
    expect(localTimes(slots)[0]).toBe('10:00');
  });

  it('respects the minimum notice before an appointment', () => {
    const slots = computeAvailableSlots({
      ...baseQuery,
      now: new Date('2030-06-03T12:20:00Z'), // 09:20 local
      minNoticeMinutes: 60, // earliest start: 10:20
    });
    expect(localTimes(slots)).toEqual(['10:30', '10:45', '11:00']);
  });

  it('never offers slots in the past', () => {
    const slots = computeAvailableSlots({
      ...baseQuery,
      now: new Date('2030-06-04T12:00:00Z'),
      minNoticeMinutes: 0,
    });
    expect(slots).toEqual([]);
  });

  it('refuses dates beyond the booking window', () => {
    expect(computeAvailableSlots({ ...baseQuery, bookingWindowDays: 1 })).toEqual([]);
  });

  it('merges overlapping rules without duplicate slots', () => {
    const slots = computeAvailableSlots({
      ...baseQuery,
      durationMinutes: 30,
      rules: [
        { weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 },
        { weekday: 1, startMinute: 9 * 60 + 30, endMinute: 10 * 60 + 30 },
      ],
    });
    expect(localTimes(slots)).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00']);
  });

  it('supports split shifts (morning and afternoon)', () => {
    const slots = computeAvailableSlots({
      ...baseQuery,
      rules: [
        { weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 },
        { weekday: 1, startMinute: 15 * 60, endMinute: 16 * 60 },
      ],
    });
    expect(localTimes(slots)).toEqual(['09:00', '15:00']);
  });

  it('blocks time off that spans several days', () => {
    const slots = computeAvailableSlots({
      ...baseQuery,
      busy: [{ start: new Date('2030-06-02T00:00:00Z'), end: new Date('2030-06-05T00:00:00Z') }],
    });
    expect(slots).toEqual([]);
  });

  it('keeps wall-clock hours on a daylight-saving-time change day', () => {
    // Madrid moves clocks forward on 2030-03-31 (Sunday) at 02:00.
    const slots = computeAvailableSlots({
      ...baseQuery,
      timezone: 'Europe/Madrid',
      date: '2030-03-31',
      rules: [{ weekday: 0, startMinute: 9 * 60, endMinute: 10 * 60 }],
      now: new Date('2030-03-01T00:00:00Z'),
      bookingWindowDays: 60,
    });
    // 09:00 summer time in Madrid (UTC+2) is 07:00 UTC.
    expect(slots.map((s) => s.toISOString())).toEqual(['2030-03-31T07:00:00.000Z']);
  });

  it('returns nothing for an invalid date', () => {
    expect(computeAvailableSlots({ ...baseQuery, date: 'not-a-date' })).toEqual([]);
  });
});

describe('isSlotAvailable', () => {
  const { date: _date, ...query } = baseQuery;

  it('accepts a start time that is one of the generated slots', () => {
    expect(isSlotAvailable(query, new Date('2030-06-03T13:15:00Z'))).toBe(true);
  });

  it('rejects a start time that is not on the 15-minute grid', () => {
    expect(isSlotAvailable(query, new Date('2030-06-03T13:07:00Z'))).toBe(false);
  });

  it('rejects a start time whose appointment would run past closing time', () => {
    expect(isSlotAvailable(query, new Date('2030-06-03T14:30:00Z'))).toBe(false); // 11:30 + 60min
  });
});

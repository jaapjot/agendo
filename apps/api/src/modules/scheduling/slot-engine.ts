import { DateTime, Interval } from 'luxon';

/**
 * Slot engine: decides which start times can be booked on a given day.
 *
 * It is a pure function (no database, no clock, no HTTP) on purpose: everything it needs
 * is passed in, so it is deterministic and easy to unit test. The same function is used
 * to show available slots AND to validate a booking request, so the UI and the server can
 * never disagree about what is bookable.
 */

export const SLOT_STEP_MINUTES = 15;

export interface WeeklyRule {
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** Minutes since local midnight, e.g. 9:30 -> 570. */
  startMinute: number;
  endMinute: number;
}

export interface BusyPeriod {
  start: Date;
  end: Date;
}

export interface SlotQuery {
  /** Calendar day in the professional's time zone, formatted YYYY-MM-DD. */
  date: string;
  timezone: string;
  durationMinutes: number;
  rules: WeeklyRule[];
  /** Existing appointments and time off. Anything overlapping these is unavailable. */
  busy: BusyPeriod[];
  now: Date;
  minNoticeMinutes: number;
  bookingWindowDays: number;
  stepMinutes?: number;
}

/** Luxon numbers weekdays 1 (Monday) .. 7 (Sunday); we use 0 (Sunday) .. 6 (Saturday). */
const toSundayBasedWeekday = (luxonWeekday: number) => luxonWeekday % 7;

export function computeAvailableSlots(query: SlotQuery): Date[] {
  const step = query.stepMinutes ?? SLOT_STEP_MINUTES;
  const day = DateTime.fromISO(query.date, { zone: query.timezone }).startOf('day');
  if (!day.isValid) return [];

  const now = DateTime.fromJSDate(query.now, { zone: query.timezone });
  const earliestStart = now.plus({ minutes: query.minNoticeMinutes });
  const lastBookableDay = now.startOf('day').plus({ days: query.bookingWindowDays });
  if (day > lastBookableDay) return [];

  const busyIntervals = query.busy.map((period) =>
    Interval.fromDateTimes(DateTime.fromJSDate(period.start), DateTime.fromJSDate(period.end)),
  );

  const weekday = toSundayBasedWeekday(day.weekday);
  const rulesForDay = query.rules
    .filter((rule) => rule.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute);

  const slots = new Map<number, Date>();

  for (const rule of rulesForDay) {
    for (
      let minute = rule.startMinute;
      minute + query.durationMinutes <= rule.endMinute;
      minute += step
    ) {
      // Build the wall-clock time explicitly (instead of adding minutes to midnight) so
      // the result stays correct on days with a daylight-saving-time change.
      const start = day.set({ hour: Math.floor(minute / 60), minute: minute % 60 });
      const end = start.plus({ minutes: query.durationMinutes });

      if (start < earliestStart) continue;

      const candidate = Interval.fromDateTimes(start, end);
      // Interval#overlaps treats intervals as half-open [start, end), so back-to-back
      // appointments (10:00-10:30 and 10:30-11:00) do not collide.
      const isBusy = busyIntervals.some((busy) => busy.overlaps(candidate));
      if (isBusy) continue;

      // Overlapping rules (e.g. 9-13 and 12-14) could produce the same start twice.
      slots.set(start.toMillis(), start.toJSDate());
    }
  }

  return [...slots.values()].sort((a, b) => a.getTime() - b.getTime());
}

/** True if `start` is exactly one of the bookable slots for its local day. */
export function isSlotAvailable(query: Omit<SlotQuery, 'date'>, start: Date): boolean {
  const date = DateTime.fromJSDate(start, { zone: query.timezone }).toISODate();
  if (!date) return false;
  return computeAvailableSlots({ ...query, date }).some(
    (slot) => slot.getTime() === start.getTime(),
  );
}

/** Formats minutes since midnight as HH:mm (used in validation messages). */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const mins = (minutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

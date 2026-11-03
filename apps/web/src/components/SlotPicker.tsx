import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { DateTime } from 'luxon';
import { useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { formatTime } from '../lib/format';
import { cn } from './ui/cn';
import { Skeleton } from './ui/Spinner';
import { ErrorState } from './ui/States';

interface SlotPickerProps {
  slug: string;
  serviceId: string;
  timezone: string;
  bookingWindowDays: number;
  /** 0 = Sunday ... 6 = Saturday. Days the professional never works are disabled. */
  workingWeekdays: number[];
  selectedSlot: string | null;
  onSelectSlot: (slot: string | null) => void;
}

const MAX_DAYS_SHOWN = 28;

/** Days from today (in the professional's zone) up to the booking window. */
function buildDays(timezone: string, bookingWindowDays: number) {
  const today = DateTime.now().setZone(timezone).startOf('day').setLocale('es-AR');
  const count = Math.min(bookingWindowDays + 1, MAX_DAYS_SHOWN);
  return Array.from({ length: count }, (_, i) => today.plus({ days: i }));
}

function groupByPartOfDay(slots: string[], timezone: string) {
  const groups = [
    { label: 'Mañana', slots: [] as string[] },
    { label: 'Tarde', slots: [] as string[] },
    { label: 'Noche', slots: [] as string[] },
  ];
  for (const slot of slots) {
    const hour = DateTime.fromISO(slot, { zone: timezone }).hour;
    groups[hour < 13 ? 0 : hour < 19 ? 1 : 2]!.slots.push(slot);
  }
  return groups.filter((group) => group.slots.length > 0);
}

export function SlotPicker({
  slug,
  serviceId,
  timezone,
  bookingWindowDays,
  workingWeekdays,
  selectedSlot,
  onSelectSlot,
}: SlotPickerProps) {
  const days = useMemo(() => buildDays(timezone, bookingWindowDays), [timezone, bookingWindowDays]);
  const isWorkingDay = (day: DateTime) => workingWeekdays.includes(day.weekday % 7);
  const [selectedDate, setSelectedDate] = useState(() =>
    (days.find(isWorkingDay) ?? days[0])!.toISODate()!,
  );
  const stripRef = useRef<HTMLDivElement>(null);

  const slotsQuery = useQuery({
    queryKey: ['slots', slug, serviceId, selectedDate],
    queryFn: () =>
      api.get<{ slots: string[] }>(
        `/professionals/${slug}/slots?serviceId=${serviceId}&date=${selectedDate}`,
      ),
    staleTime: 15_000,
  });

  function chooseDate(date: string) {
    setSelectedDate(date);
    onSelectSlot(null);
  }

  const scrollStrip = (direction: 1 | -1) =>
    stripRef.current?.scrollBy({ left: direction * 280, behavior: 'smooth' });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => scrollStrip(-1)}
          className="hidden rounded-lg p-2 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 sm:block"
          aria-label="Días anteriores"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div
          ref={stripRef}
          className="flex flex-1 snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
          role="radiogroup"
          aria-label="Elegí un día"
        >
          {days.map((day) => {
            const iso = day.toISODate()!;
            const disabled = !isWorkingDay(day);
            const active = iso === selectedDate;
            return (
              <button
                key={iso}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => chooseDate(iso)}
                className={cn(
                  'flex min-w-16 snap-start flex-col items-center rounded-xl px-3 py-2.5 text-sm ring-1 transition-colors',
                  active
                    ? 'bg-brand-700 text-white ring-brand-700'
                    : 'bg-white text-slate-700 ring-slate-200 hover:ring-brand-500',
                  disabled && 'cursor-not-allowed opacity-40 hover:ring-slate-200',
                )}
              >
                <span
                  className={cn('text-xs uppercase', active ? 'text-brand-100' : 'text-slate-500')}
                >
                  {day.toFormat('ccc')}
                </span>
                <span className="text-lg leading-tight font-semibold">{day.day}</span>
                <span className={cn('text-xs', active ? 'text-brand-100' : 'text-slate-500')}>
                  {day.toFormat('LLL')}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => scrollStrip(1)}
          className="hidden rounded-lg p-2 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 sm:block"
          aria-label="Días siguientes"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div aria-live="polite">
        {slotsQuery.isPending ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : slotsQuery.isError ? (
          <ErrorState error={slotsQuery.error} onRetry={() => slotsQuery.refetch()} />
        ) : slotsQuery.data.slots.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-slate-100 px-4 py-6 text-sm text-slate-600">
            <Clock className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
            No quedan horarios disponibles este día. Probá con otra fecha.
          </div>
        ) : (
          <div className="space-y-4">
            {groupByPartOfDay(slotsQuery.data.slots, timezone).map((group) => (
              <div key={group.label}>
                <h4 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {group.label}
                </h4>
                <div
                  className="grid grid-cols-3 gap-2 sm:grid-cols-5"
                  role="radiogroup"
                  aria-label={`Horarios de la ${group.label.toLowerCase()}`}
                >
                  {group.slots.map((slot) => {
                    const active = slot === selectedSlot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onSelectSlot(slot)}
                        className={cn(
                          'h-10 rounded-lg text-sm font-medium tabular-nums ring-1 transition-colors',
                          active
                            ? 'bg-brand-700 text-white ring-brand-700'
                            : 'bg-white text-slate-800 ring-slate-200 hover:ring-brand-500',
                        )}
                      >
                        {formatTime(slot, timezone)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

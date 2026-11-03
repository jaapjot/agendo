import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, Plus, Trash2, X } from 'lucide-react';
import { DateTime } from 'luxon';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { inputClasses, TextField } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Spinner';
import { ErrorState, PageHeader } from '../../components/ui/States';
import { api } from '../../lib/api';
import { formatDateTime, minutesToTime, timeToMinutes, WEEKDAYS } from '../../lib/format';
import type { AvailabilityRule, Profile, TimeOff } from '../../lib/types';
import { useDocumentTitle } from '../../lib/use-document-title';

type Range = { start: string; end: string };
type WeekDraft = Record<number, Range[]>;

/** Monday first, the way most people read a week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function rulesToDraft(rules: AvailabilityRule[]): WeekDraft {
  const draft: WeekDraft = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const rule of rules) {
    draft[rule.weekday]!.push({
      start: minutesToTime(rule.startMinute),
      end: minutesToTime(rule.endMinute),
    });
  }
  return draft;
}

function draftToRules(draft: WeekDraft): AvailabilityRule[] {
  return Object.entries(draft).flatMap(([weekday, ranges]) =>
    ranges.map((range) => ({
      weekday: Number(weekday),
      startMinute: timeToMinutes(range.start),
      endMinute: timeToMinutes(range.end),
    })),
  );
}

function WeeklyScheduleEditor({ initialRules }: { initialRules: AvailabilityRule[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => rulesToDraft(initialRules));
  const [dirty, setDirty] = useState(false);

  const invalidDays = WEEK_ORDER.filter((day) =>
    draft[day]!.some((r) => !r.start || !r.end || timeToMinutes(r.end) <= timeToMinutes(r.start)),
  );

  const save = useMutation({
    mutationFn: () => api.put('/me/availability', { rules: draftToRules(draft) }),
    onSuccess: () => {
      toast.success('Horarios guardados');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (error) => toast.error(error.message),
  });

  function update(day: number, ranges: Range[]) {
    setDraft((current) => ({ ...current, [day]: ranges }));
    setDirty(true);
  }

  return (
    <Card className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Horario semanal</h2>
          <p className="text-sm text-slate-500">
            Podés cargar turnos partidos (por ejemplo, mañana y tarde).
          </p>
        </div>
        <Button
          onClick={() => save.mutate()}
          isLoading={save.isPending}
          disabled={!dirty || invalidDays.length > 0}
        >
          Guardar horarios
        </Button>
      </div>

      <div className="divide-y divide-slate-100">
        {WEEK_ORDER.map((day) => {
          const ranges = draft[day]!;
          const enabled = ranges.length > 0;
          return (
            <div key={day} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
              <label className="flex w-36 shrink-0 items-center gap-3 pt-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-700"
                  checked={enabled}
                  onChange={(e) =>
                    update(day, e.target.checked ? [{ start: '09:00', end: '18:00' }] : [])
                  }
                />
                {WEEKDAYS[day]}
              </label>
              <div className="flex-1 space-y-2">
                {!enabled && <p className="pt-2 text-sm text-slate-400">No atendés</p>}
                {ranges.map((range, index) => {
                  const invalid =
                    range.start &&
                    range.end &&
                    timeToMinutes(range.end) <= timeToMinutes(range.start);
                  return (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        step={900}
                        value={range.start}
                        aria-label={`${WEEKDAYS[day]}: desde`}
                        className={cn(inputClasses, 'w-32')}
                        onChange={(e) =>
                          update(
                            day,
                            ranges.map((r, i) =>
                              i === index ? { ...r, start: e.target.value } : r,
                            ),
                          )
                        }
                      />
                      <span className="text-slate-400">a</span>
                      <input
                        type="time"
                        step={900}
                        value={range.end}
                        aria-label={`${WEEKDAYS[day]}: hasta`}
                        aria-invalid={Boolean(invalid)}
                        className={cn(inputClasses, 'w-32')}
                        onChange={(e) =>
                          update(
                            day,
                            ranges.map((r, i) => (i === index ? { ...r, end: e.target.value } : r)),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Quitar rango"
                        onClick={() =>
                          update(
                            day,
                            ranges.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X className="size-4" />
                      </button>
                      {invalid && (
                        <span className="text-sm text-rose-600">
                          La hora de fin debe ser posterior
                        </span>
                      )}
                    </div>
                  );
                })}
                {enabled && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
                    onClick={() => {
                      const last = ranges.at(-1);
                      const start = last ? last.end : '09:00';
                      const end = minutesToTime(Math.min(timeToMinutes(start) + 4 * 60, 1440));
                      update(day, [...ranges, { start, end }]);
                    }}
                  >
                    <Plus className="size-4" aria-hidden="true" /> Agregar rango
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TimeOffSection({ timezone }: { timezone: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ start: '', end: '', reason: '' });
  const query = useQuery({
    queryKey: ['time-off'],
    queryFn: () => api.get<{ timeOff: TimeOff[] }>('/me/time-off'),
  });

  // datetime-local inputs have no time zone; they are read as wall-clock time in the
  // professional's zone, then converted to an exact instant for the API.
  const toInstant = (value: string) => DateTime.fromISO(value, { zone: timezone }).toUTC().toISO();

  const create = useMutation({
    mutationFn: () =>
      api.post<{ conflictingAppointments: number }>('/me/time-off', {
        startsAt: toInstant(form.start),
        endsAt: toInstant(form.end),
        reason: form.reason,
      }),
    onSuccess: ({ conflictingAppointments }) => {
      setForm({ start: '', end: '', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['time-off'] });
      if (conflictingAppointments > 0) {
        toast.warning(
          `Bloqueo guardado. Ojo: hay ${conflictingAppointments} turno(s) confirmados en ese período. Revisalos en tu agenda.`,
          { duration: 8000 },
        );
      } else {
        toast.success('Bloqueo guardado');
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/me/time-off/${id}`),
    onSuccess: () => {
      toast.success('Bloqueo eliminado');
      queryClient.invalidateQueries({ queryKey: ['time-off'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const rangeInvalid = Boolean(form.start && form.end && form.end <= form.start);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.start || !form.end || rangeInvalid) return;
    create.mutate();
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold text-slate-900">Vacaciones y días bloqueados</h2>
      <p className="text-sm text-slate-500">Durante estos períodos no se ofrecen horarios.</p>

      <form
        onSubmit={onSubmit}
        className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <TextField
          label="Desde"
          type="datetime-local"
          required
          value={form.start}
          onChange={(e) => setForm({ ...form, start: e.target.value })}
        />
        <TextField
          label="Hasta"
          type="datetime-local"
          required
          value={form.end}
          onChange={(e) => setForm({ ...form, end: e.target.value })}
          error={rangeInvalid ? 'Debe ser posterior al inicio' : undefined}
        />
        <TextField
          label="Motivo (opcional)"
          maxLength={120}
          placeholder="Ej.: Vacaciones"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        <Button
          type="submit"
          isLoading={create.isPending}
          disabled={!form.start || !form.end || rangeInvalid}
        >
          Bloquear
        </Button>
      </form>

      <div className="mt-6">
        {query.isPending ? (
          <Skeleton className="h-16" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.timeOff.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <CalendarOff className="size-4" aria-hidden="true" /> No tenés bloqueos programados.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {query.data.timeOff.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-slate-900">{item.reason || 'Sin motivo'}</p>
                  <p className="text-slate-500">
                    {formatDateTime(item.startsAt, timezone)} →{' '}
                    {formatDateTime(item.endsAt, timezone)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Eliminar bloqueo"
                  isLoading={remove.isPending && remove.variables === item.id}
                  onClick={() => remove.mutate(item.id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function SchedulePage() {
  useDocumentTitle('Horarios');
  const rulesQuery = useQuery({
    queryKey: ['availability'],
    queryFn: () => api.get<{ rules: AvailabilityRule[] }>('/me/availability'),
  });
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<{ profile: Profile }>('/me/profile'),
  });

  return (
    <>
      <PageHeader
        title="Horarios"
        description={
          profileQuery.data
            ? `Todos los horarios están en tu zona horaria: ${profileQuery.data.profile.timezone}.`
            : 'Definí cuándo atendés.'
        }
      />
      <div className="space-y-6">
        {rulesQuery.isPending ? (
          <Skeleton className="h-96" />
        ) : rulesQuery.isError ? (
          <ErrorState error={rulesQuery.error} onRetry={() => rulesQuery.refetch()} />
        ) : (
          <WeeklyScheduleEditor initialRules={rulesQuery.data.rules} />
        )}
        {profileQuery.data && <TimeOffSection timezone={profileQuery.data.profile.timezone} />}
      </div>
    </>
  );
}

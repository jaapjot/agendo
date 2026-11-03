import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Copy, UserX, X } from 'lucide-react';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthContext';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Spinner';
import { EmptyState, ErrorState, PageHeader } from '../../components/ui/States';
import { api } from '../../lib/api';
import {
  capitalize,
  formatDuration,
  formatLongDate,
  formatPrice,
  formatTime,
} from '../../lib/format';
import type { Appointment, AppointmentStatus, Profile, Summary } from '../../lib/types';
import { useDocumentTitle } from '../../lib/use-document-title';

const plural = (count: number, singular: string, pluralForm: string) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

const attendanceHint = ({ completed, noShows }: Summary['lastThirtyDays']) =>
  `${plural(completed, 'asistió', 'asistieron')} · ${plural(noShows, 'ausente', 'ausentes')}`;

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}

function SetupChecklist({ setup }: { setup: Summary['setup'] }) {
  if (setup.hasServices && setup.hasSchedule) return null;
  const steps = [
    { done: setup.hasServices, label: 'Cargá al menos un servicio', to: '/dashboard/servicios' },
    {
      done: setup.hasSchedule,
      label: 'Configurá tus horarios de atención',
      to: '/dashboard/horarios',
    },
  ];
  return (
    <Card className="mb-8 border-l-4 border-amber-400 p-5">
      <h2 className="font-semibold text-slate-900">
        Completá tu perfil para empezar a recibir turnos
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Hasta entonces, tu página no aparece en el buscador.
      </p>
      <ul className="mt-4 space-y-2">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2 text-sm">
            {step.done ? (
              <Check className="size-4 text-emerald-600" aria-label="Hecho" />
            ) : (
              <span className="size-4 rounded-full ring-2 ring-slate-300" aria-label="Pendiente" />
            )}
            {step.done ? (
              <span className="text-slate-500 line-through">{step.label}</span>
            ) : (
              <Link to={step.to} className="font-medium text-brand-700 hover:underline">
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

const ACTION_COPY: Record<
  Exclude<AppointmentStatus, 'CONFIRMED'>,
  { title: string; text: string; success: string }
> = {
  COMPLETED: {
    title: 'Marcar como asistido',
    text: 'El turno se registra como atendido.',
    success: 'Asistencia registrada',
  },
  NO_SHOW: {
    title: 'Marcar ausencia',
    text: 'El cliente no se presentó. Se tiene en cuenta en tu tasa de asistencia.',
    success: 'Ausencia registrada',
  },
  CANCELLED: {
    title: 'Cancelar turno',
    text: 'El horario queda libre y el cliente ve el turno como cancelado por vos.',
    success: 'Turno cancelado',
  },
};

export function AgendaPage() {
  useDocumentTitle('Agenda');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{
    appointment: Appointment;
    status: Exclude<AppointmentStatus, 'CONFIRMED'>;
  } | null>(null);

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<{ profile: Profile }>('/me/profile'),
  });
  const summaryQuery = useQuery({
    queryKey: ['summary'],
    queryFn: () => api.get<{ summary: Summary }>('/me/summary'),
  });
  const timezone = profileQuery.data?.profile.timezone;

  // The visible week starts on Monday, in the professional's time zone.
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = timezone
    ? DateTime.now().setZone(timezone).startOf('week').plus({ weeks: weekOffset })
    : null;
  const weekEnd = weekStart?.plus({ days: 6 });

  const agendaQuery = useQuery({
    queryKey: ['agenda', weekStart?.toISODate()],
    queryFn: () =>
      api.get<{ appointments: Appointment[] }>(
        `/me/agenda?from=${weekStart!.toISODate()}&to=${weekEnd!.toISODate()}`,
      ),
    enabled: Boolean(weekStart),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      api.patch(`/appointments/${id}/status`, { status }),
    onSuccess: (_data, variables) => {
      toast.success(ACTION_COPY[variables.status as keyof typeof ACTION_COPY].success);
      setPending(null);
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const publicUrl = user?.professional
    ? `${window.location.origin}/p/${user.professional.slug}`
    : '';
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar. Seleccioná el link y copialo a mano.');
    }
  }

  const summary = summaryQuery.data?.summary;
  const appointmentsByDay = new Map<string, Appointment[]>();
  for (const appointment of agendaQuery.data?.appointments ?? []) {
    const day = DateTime.fromISO(appointment.startsAt, { zone: timezone }).toISODate()!;
    appointmentsByDay.set(day, [...(appointmentsByDay.get(day) ?? []), appointment]);
  }

  return (
    <>
      <PageHeader
        title={`Hola, ${user?.name.split(' ')[0] ?? ''}`}
        description="Este es el resumen de tu agenda."
        actions={
          <Button variant="secondary" onClick={copyLink}>
            <Copy className="size-4" aria-hidden="true" /> Copiar mi link
          </Button>
        }
      />

      {summary && <SetupChecklist setup={summary.setup} />}

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        {summaryQuery.isPending ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)
        ) : summaryQuery.isError ? (
          <div className="sm:col-span-3">
            <ErrorState error={summaryQuery.error} onRetry={() => summaryQuery.refetch()} />
          </div>
        ) : (
          <>
            <StatCard
              label="Turnos hoy"
              value={String(summary!.today)}
              hint="Sin contar cancelados"
            />
            <StatCard
              label="Próximos 7 días"
              value={String(summary!.nextSevenDays)}
              hint="Turnos confirmados"
            />
            <StatCard
              label="Asistencia (30 días)"
              value={
                summary!.attendanceRate === null
                  ? '—'
                  : `${Math.round(summary!.attendanceRate * 100)} %`
              }
              hint={
                summary!.attendanceRate === null
                  ? 'Todavía no marcaste asistencias'
                  : attendanceHint(summary!.lastThirtyDays)
              }
            />
          </>
        )}
      </div>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {weekStart && weekEnd
              ? `Semana del ${weekStart.setLocale('es-AR').toFormat("d 'de' LLLL")} al ${weekEnd.setLocale('es-AR').toFormat("d 'de' LLLL")}`
              : 'Agenda'}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setWeekOffset((w) => w - 1)}
              aria-label="Semana anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setWeekOffset(0)}
              disabled={weekOffset === 0}
            >
              Hoy
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setWeekOffset((w) => w + 1)}
              aria-label="Semana siguiente"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {profileQuery.isError ? (
          <ErrorState error={profileQuery.error} onRetry={() => profileQuery.refetch()} />
        ) : agendaQuery.isPending ? (
          <Skeleton className="h-64" />
        ) : agendaQuery.isError ? (
          <ErrorState error={agendaQuery.error} onRetry={() => agendaQuery.refetch()} />
        ) : appointmentsByDay.size === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No hay turnos esta semana"
            description="Compartí tu link para que tus clientes reserven."
          />
        ) : (
          <div className="space-y-6">
            {[...appointmentsByDay.entries()].map(([day, appointments]) => (
              <div key={day}>
                <h3 className="mb-2 text-sm font-semibold text-slate-500">
                  {capitalize(formatLongDate(appointments[0]!.startsAt, timezone!))}
                </h3>
                <Card className="divide-y divide-slate-100">
                  {appointments.map((appointment) => {
                    const started = new Date(appointment.startsAt) <= new Date();
                    const open = appointment.status === 'CONFIRMED';
                    return (
                      <div
                        key={appointment.id}
                        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                      >
                        <div className="w-28 shrink-0 font-semibold text-slate-900 tabular-nums">
                          {formatTime(appointment.startsAt, timezone!)}–
                          {formatTime(appointment.endsAt, timezone!)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">{appointment.client.name}</p>
                          <p className="text-sm text-slate-500">
                            {appointment.service.name} ·{' '}
                            {formatDuration(appointment.service.durationMinutes)} ·{' '}
                            {formatPrice(appointment.priceCents)}
                          </p>
                          {appointment.notes && (
                            <p className="mt-1 text-sm text-slate-600 italic">
                              “{appointment.notes}”
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={appointment.status} />
                          {open && started && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setPending({ appointment, status: 'COMPLETED' })}
                              >
                                <Check className="size-4" aria-hidden="true" /> Asistió
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setPending({ appointment, status: 'NO_SHOW' })}
                              >
                                <UserX className="size-4" aria-hidden="true" /> No vino
                              </Button>
                            </>
                          )}
                          {open && !started && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPending({ appointment, status: 'CANCELLED' })}
                            >
                              <X className="size-4" aria-hidden="true" /> Cancelar
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending ? ACTION_COPY[pending.status].title : ''}
        description={
          pending
            ? `${pending.appointment.client.name} · ${formatTime(pending.appointment.startsAt, timezone ?? 'UTC')} h`
            : undefined
        }
      >
        <p className="text-sm text-slate-600">{pending && ACTION_COPY[pending.status].text}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPending(null)}>
            Volver
          </Button>
          <Button
            variant={pending?.status === 'CANCELLED' ? 'danger' : 'primary'}
            isLoading={updateStatus.isPending}
            onClick={() =>
              pending && updateStatus.mutate({ id: pending.appointment.id, status: pending.status })
            }
          >
            Confirmar
          </Button>
        </div>
      </Modal>
    </>
  );
}

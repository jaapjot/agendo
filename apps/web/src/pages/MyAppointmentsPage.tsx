import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX2, Clock } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { SlotPicker } from '../components/SlotPicker';
import { StatusBadge } from '../components/ui/Badge';
import { Button, ButtonLink } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cn } from '../components/ui/cn';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Spinner';
import { EmptyState, ErrorState, PageHeader } from '../components/ui/States';
import { api } from '../lib/api';
import { formatDateTime, formatDuration, formatPrice } from '../lib/format';
import type { Appointment, PublicProfessional } from '../lib/types';
import { useDocumentTitle } from '../lib/use-document-title';

type Scope = 'upcoming' | 'past';

/** Mirrors the server rule so we can hide actions that would be rejected anyway. */
function canStillChange(appointment: Appointment): boolean {
  const deadline =
    new Date(appointment.startsAt).getTime() -
    appointment.professional.cancellationNoticeHours * 3_600_000;
  return appointment.status === 'CONFIRMED' && Date.now() < deadline;
}

export function MyAppointmentsPage() {
  useDocumentTitle('Mis turnos');
  const [scope, setScope] = useState<Scope>('upcoming');
  const [toCancel, setToCancel] = useState<Appointment | null>(null);
  const [toReschedule, setToReschedule] = useState<Appointment | null>(null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['my-appointments', scope],
    queryFn: () => api.get<{ appointments: Appointment[] }>(`/appointments/mine?scope=${scope}`),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/cancel`),
    onSuccess: () => {
      toast.success('Turno cancelado');
      setToCancel(null);
      queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader
        title="Mis turnos"
        description="Consultá, cancelá o reprogramá tus reservas."
        actions={
          <ButtonLink to="/explorar" variant="secondary">
            Reservar otro
          </ButtonLink>
        }
      />

      <div className="mb-6 inline-flex rounded-lg bg-slate-100 p-1" role="tablist">
        {(['upcoming', 'past'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={scope === value}
            onClick={() => setScope(value)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium',
              scope === value
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {value === 'upcoming' ? 'Próximos' : 'Historial'}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.appointments.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title={
            scope === 'upcoming'
              ? 'No tenés turnos próximos'
              : 'Todavía no hay turnos en tu historial'
          }
          action={
            scope === 'upcoming' ? (
              <ButtonLink to="/explorar">Buscar un profesional</ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {query.data.appointments.map((appointment) => {
            const changeable = canStillChange(appointment);
            return (
              <li key={appointment.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {formatDateTime(appointment.startsAt, appointment.professional.timezone)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {appointment.service.name} ·{' '}
                        <Link
                          to={`/p/${appointment.professional.slug}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {appointment.professional.businessName}
                        </Link>
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="size-3.5" aria-hidden="true" />{' '}
                        {formatDuration(appointment.service.durationMinutes)} ·{' '}
                        {formatPrice(appointment.priceCents)}
                      </p>
                    </div>
                    <StatusBadge status={appointment.status} />
                  </div>
                  {appointment.status === 'CONFIRMED' && scope === 'upcoming' && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                      {changeable ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setToReschedule(appointment)}
                          >
                            Reprogramar
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setToCancel(appointment)}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Ya no se puede modificar online (plazo de{' '}
                          {appointment.professional.cancellationNoticeHours} h). Contactá al
                          profesional.
                        </p>
                      )}
                    </div>
                  )}
                  {appointment.status === 'CANCELLED' && (
                    <p className="mt-3 text-xs text-slate-500">
                      Cancelado por{' '}
                      {appointment.cancelledBy === 'CLIENT' ? 'vos' : 'el profesional'}.
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={toCancel !== null}
        onClose={() => setToCancel(null)}
        title="¿Cancelar este turno?"
        description={
          toCancel ? formatDateTime(toCancel.startsAt, toCancel.professional.timezone) : undefined
        }
      >
        <p className="text-sm text-slate-600">
          El horario va a quedar libre para otras personas. Esta acción no se puede deshacer.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setToCancel(null)}>
            Volver
          </Button>
          <Button
            variant="danger"
            isLoading={cancel.isPending}
            onClick={() => toCancel && cancel.mutate(toCancel.id)}
          >
            Sí, cancelar
          </Button>
        </div>
      </Modal>

      {toReschedule && (
        <RescheduleModal appointment={toReschedule} onClose={() => setToReschedule(null)} />
      )}
    </div>
  );
}

function RescheduleModal({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const [slot, setSlot] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const proQuery = useQuery({
    queryKey: ['professional', appointment.professional.slug],
    queryFn: () =>
      api.get<{ professional: PublicProfessional }>(
        `/professionals/${appointment.professional.slug}`,
      ),
  });

  const reschedule = useMutation({
    mutationFn: () => api.post(`/appointments/${appointment.id}/reschedule`, { startsAt: slot }),
    onSuccess: () => {
      toast.success('Turno reprogramado');
      queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
      setSlot(null);
      queryClient.invalidateQueries({ queryKey: ['slots'] });
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Reprogramar turno"
      description={`${appointment.service.name} · actualmente ${formatDateTime(appointment.startsAt, appointment.professional.timezone)}`}
    >
      {proQuery.isPending ? (
        <Skeleton className="h-48" />
      ) : proQuery.isError ? (
        <ErrorState error={proQuery.error} onRetry={() => proQuery.refetch()} />
      ) : (
        <SlotPicker
          slug={appointment.professional.slug}
          serviceId={appointment.service.id}
          timezone={proQuery.data.professional.timezone}
          bookingWindowDays={proQuery.data.professional.bookingWindowDays}
          workingWeekdays={proQuery.data.professional.workingWeekdays}
          selectedSlot={slot}
          onSelectSlot={setSlot}
        />
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Volver
        </Button>
        <Button
          disabled={!slot}
          isLoading={reschedule.isPending}
          onClick={() => reschedule.mutate()}
        >
          Confirmar nuevo horario
        </Button>
      </div>
    </Modal>
  );
}

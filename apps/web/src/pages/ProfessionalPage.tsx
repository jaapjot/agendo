import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CheckCircle2, Clock, Info } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext';
import { SlotPicker } from '../components/SlotPicker';
import { Button, ButtonLink } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cn } from '../components/ui/cn';
import { TextAreaField } from '../components/ui/Field';
import { FullPageSpinner } from '../components/ui/Spinner';
import { EmptyState, ErrorState } from '../components/ui/States';
import { api, ApiError } from '../lib/api';
import { formatDateTime, formatDuration, formatPrice } from '../lib/format';
import type { Appointment, PublicProfessional } from '../lib/types';
import { useDocumentTitle } from '../lib/use-document-title';

function StepTitle({ number, children }: { number: number; children: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-slate-900">
      <span className="flex size-7 items-center justify-center rounded-full bg-brand-700 text-sm text-white">
        {number}
      </span>
      {children}
    </h2>
  );
}

export function ProfessionalPage() {
  const { slug = '' } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [booked, setBooked] = useState<Appointment | null>(null);

  const query = useQuery({
    queryKey: ['professional', slug],
    queryFn: () => api.get<{ professional: PublicProfessional }>(`/professionals/${slug}`),
  });
  const professional = query.data?.professional;
  useDocumentTitle(professional?.businessName ?? 'Reservar turno');

  const booking = useMutation({
    mutationFn: () =>
      api.post<{ appointment: Appointment }>('/appointments', {
        professionalSlug: slug,
        serviceId,
        startsAt: slot,
        notes,
      }),
    onSuccess: ({ appointment }) => {
      setBooked(appointment);
      queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
    },
    onError: (error) => {
      toast.error(error.message);
      // The slot was taken in the meantime: drop the selection and show fresh availability.
      if (error instanceof ApiError && error.status === 409) {
        setSlot(null);
        queryClient.invalidateQueries({ queryKey: ['slots', slug] });
      }
    },
  });

  if (query.isPending) return <FullPageSpinner />;
  if (query.isError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        {query.error instanceof ApiError && query.error.status === 404 ? (
          <EmptyState
            icon={Info}
            title="No encontramos este profesional"
            description="Revisá que el link esté bien escrito."
            action={
              <ButtonLink to="/explorar" variant="secondary">
                Ver profesionales
              </ButtonLink>
            }
          />
        ) : (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        )}
      </div>
    );
  }

  const pro = professional!;
  const service = pro.services.find((s) => s.id === serviceId);

  if (booked) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">¡Turno confirmado!</h1>
          <p className="mt-2 text-slate-600">
            {booked.service.name} con {pro.businessName}
          </p>
          <p className="mt-1 font-medium text-slate-900">
            {formatDateTime(booked.startsAt, pro.timezone)}
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Podés cancelarlo o reprogramarlo hasta {pro.cancellationNoticeHours} h antes desde “Mis
            turnos”.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink to="/mis-turnos">Ver mis turnos</ButtonLink>
            <Button
              variant="secondary"
              onClick={() => {
                setBooked(null);
                setSlot(null);
                setNotes('');
              }}
            >
              Reservar otro turno
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-10 flex items-start gap-5">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-2xl font-semibold text-white">
          {pro.businessName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            {pro.businessName}
          </h1>
          <p className="text-sm text-slate-500">Atendido por {pro.ownerName}</p>
          {pro.description && <p className="mt-3 max-w-2xl text-slate-600">{pro.description}</p>}
        </div>
      </header>

      {pro.services.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Este profesional todavía no publicó servicios" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-10">
            <section>
              <StepTitle number={1}>Elegí un servicio</StepTitle>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Servicios">
                {pro.services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={s.id === serviceId}
                    onClick={() => {
                      setServiceId(s.id);
                      setSlot(null);
                    }}
                    className={cn(
                      'rounded-xl bg-white p-4 text-left ring-1 transition-all',
                      s.id === serviceId
                        ? 'ring-2 ring-brand-600'
                        : 'ring-slate-200 hover:ring-brand-400',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium text-slate-900">{s.name}</span>
                      <span className="shrink-0 text-sm font-semibold text-slate-900">
                        {formatPrice(s.priceCents)}
                      </span>
                    </div>
                    {s.description && (
                      <p className="mt-1 text-sm text-slate-500">{s.description}</p>
                    )}
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="size-3.5" aria-hidden="true" />{' '}
                      {formatDuration(s.durationMinutes)}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {service && (
              <section>
                <StepTitle number={2}>Elegí día y horario</StepTitle>
                <SlotPicker
                  key={service.id}
                  slug={slug}
                  serviceId={service.id}
                  timezone={pro.timezone}
                  bookingWindowDays={pro.bookingWindowDays}
                  workingWeekdays={pro.workingWeekdays}
                  selectedSlot={slot}
                  onSelectSlot={setSlot}
                />
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card className="p-6">
              <h2 className="font-semibold text-slate-900">Tu reserva</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Servicio</dt>
                  <dd className="text-right font-medium text-slate-900">{service?.name ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Fecha</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {slot ? formatDateTime(slot, pro.timezone) : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-100 pt-3">
                  <dt className="text-slate-500">Precio</dt>
                  <dd className="font-semibold text-slate-900">
                    {service ? formatPrice(service.priceCents) : '—'}
                  </dd>
                </div>
              </dl>

              {user?.role === 'CLIENT' && service && slot && (
                <div className="mt-5">
                  <TextAreaField
                    label="Nota para el profesional (opcional)"
                    maxLength={300}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              )}

              <div className="mt-6">
                {!user ? (
                  <ButtonLink
                    to={`/login?next=${encodeURIComponent(location.pathname)}`}
                    className="w-full"
                  >
                    Ingresá para reservar
                  </ButtonLink>
                ) : user.role === 'PROFESSIONAL' ? (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    Estás con una cuenta de profesional. Para reservar, usá una cuenta de cliente.
                  </p>
                ) : (
                  <Button
                    className="w-full"
                    disabled={!service || !slot}
                    isLoading={booking.isPending}
                    onClick={() => booking.mutate()}
                  >
                    Confirmar turno
                  </Button>
                )}
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Horarios en hora local del profesional. Cancelación sin cargo hasta{' '}
                {pro.cancellationNoticeHours} h antes.
              </p>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

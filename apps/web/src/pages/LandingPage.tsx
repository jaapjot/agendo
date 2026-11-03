import {
  BellOff,
  CalendarCheck,
  CalendarClock,
  Link2,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ButtonLink } from '../components/ui/Button';
import { useDocumentTitle } from '../lib/use-document-title';

const steps = [
  { title: 'Cargá tus servicios', text: 'Definí qué ofrecés, cuánto dura y cuánto cuesta.' },
  {
    title: 'Configurá tus horarios',
    text: 'Turnos partidos, sábados, vacaciones: vos decidís cuándo atendés.',
  },
  {
    title: 'Compartí tu link',
    text: 'Tus clientes eligen un horario libre y reservan solos, a cualquier hora.',
  },
];

const features = [
  {
    icon: CalendarClock,
    title: 'Disponibilidad en tiempo real',
    text: 'Solo se ofrecen horarios realmente libres, calculados según tu agenda.',
  },
  {
    icon: ShieldCheck,
    title: 'Sin turnos superpuestos',
    text: 'Aunque dos personas reserven al mismo instante, solo una se queda con el horario.',
  },
  {
    icon: BellOff,
    title: 'Reglas de cancelación',
    text: 'Elegí con cuánta anticipación se puede reservar, cancelar o reprogramar.',
  },
  {
    icon: Link2,
    title: 'Tu página pública',
    text: 'Un link propio para poner en tu bio de Instagram o en WhatsApp.',
  },
  {
    icon: CalendarCheck,
    title: 'Control de asistencia',
    text: 'Marcá quién asistió y seguí tu tasa de asistencia del último mes.',
  },
  {
    icon: Smartphone,
    title: 'Pensado para el celular',
    text: 'Tus clientes reservan desde el teléfono en menos de un minuto.',
  },
];

export function LandingPage() {
  useDocumentTitle('');
  const { user } = useAuth();
  const primaryCta =
    user?.role === 'PROFESSIONAL'
      ? { to: '/dashboard', label: 'Ir a mi panel' }
      : { to: '/registro?rol=profesional', label: 'Crear mi agenda gratis' };

  return (
    <>
      <section className="relative overflow-hidden bg-white">
        <div
          className="absolute inset-x-0 top-0 -z-0 h-full bg-[radial-gradient(60%_60%_at_70%_0%,var(--color-brand-50),transparent)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
          <div>
            <p className="mb-4 inline-flex rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-800 ring-1 ring-brand-200">
              Para profesionales independientes
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Dejá de coordinar turnos por WhatsApp.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Agendo le da a tus clientes un link para reservar solos, con tus horarios reales. Vos
              te enfocás en atender.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to={primaryCta.to} size="lg">
                {primaryCta.label}
              </ButtonLink>
              <ButtonLink to="/explorar" size="lg" variant="secondary">
                Buscar un profesional
              </ButtonLink>
            </div>
          </div>

          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-700 font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <h2 className="font-semibold text-slate-900">{step.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-900">
          Todo lo que necesitás para tu agenda
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
              <Icon className="size-6 text-brand-700" aria-hidden="true" />
              <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

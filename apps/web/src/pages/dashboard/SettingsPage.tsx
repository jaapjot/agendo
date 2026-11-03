import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/Spinner';
import { ErrorState, PageHeader } from '../../components/ui/States';
import { api } from '../../lib/api';
import { handleFormError } from '../../lib/form-errors';
import type { Profile } from '../../lib/types';
import { useDocumentTitle } from '../../lib/use-document-title';

const intNumber = (min: number, max: number, message: string) =>
  z.coerce
    .number<string>({ message: 'Ingresá un número' })
    .int('Usá un número entero')
    .min(min, message)
    .max(max, message);

const settingsSchema = z.object({
  businessName: z.string().trim().min(2, 'Ingresá un nombre').max(80),
  description: z.string().trim().max(500, 'Máximo 500 caracteres'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Mínimo 3 caracteres')
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones simples'),
  timezone: z.string().min(1),
  minNoticeMinutes: intNumber(0, 10080, 'Entre 0 y 10080 minutos'),
  bookingWindowDays: intNumber(1, 365, 'Entre 1 y 365 días'),
  cancellationNoticeHours: intNumber(0, 336, 'Entre 0 y 336 horas'),
});
type SettingsInput = z.input<typeof settingsSchema>;
type SettingsValues = z.output<typeof settingsSchema>;

// Every IANA zone the browser knows, with Argentina first for convenience.
const TIMEZONES = (() => {
  const all =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const preferred = 'America/Argentina/Buenos_Aires';
  return [preferred, ...all.filter((zone) => zone !== preferred)];
})();

function SettingsForm({ profile }: { profile: Profile }) {
  const { reloadUser } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<SettingsInput, unknown, SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      ...profile,
      minNoticeMinutes: String(profile.minNoticeMinutes),
      bookingWindowDays: String(profile.bookingWindowDays),
      cancellationNoticeHours: String(profile.cancellationNoticeHours),
    },
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const slug = form.watch('slug');

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { profile: saved } = await api.patch<{ profile: Profile }>('/me/profile', values);
      toast.success('Cambios guardados');
      queryClient.setQueryData(['profile'], { profile: saved });
      await reloadUser(); // the business name and slug also live in the session user
      form.reset({
        ...saved,
        minNoticeMinutes: String(saved.minNoticeMinutes),
        bookingWindowDays: String(saved.bookingWindowDays),
        cancellationNoticeHours: String(saved.cancellationNoticeHours),
      });
    } catch (error) {
      handleFormError(error, form.setError, ['businessName', 'description', 'slug', 'timezone']);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card className="space-y-5 p-6">
        <h2 className="font-semibold text-slate-900">Perfil público</h2>
        <TextField
          label="Nombre del negocio"
          error={errors.businessName?.message}
          {...form.register('businessName')}
        />
        <TextAreaField
          label="Descripción"
          hint="Contale a tus clientes qué hacés y dónde atendés."
          error={errors.description?.message}
          {...form.register('description')}
        />
        <TextField
          label="Link público"
          error={errors.slug?.message}
          hint={<span className="break-all">{`${window.location.origin}/p/${slug || '…'}`}</span>}
          {...form.register('slug')}
        />
      </Card>

      <Card className="space-y-5 p-6">
        <div>
          <h2 className="font-semibold text-slate-900">Reglas de reserva</h2>
          <p className="text-sm text-slate-500">
            Se aplican a todas las reservas nuevas y a los cambios de tus clientes.
          </p>
        </div>
        <SelectField
          label="Zona horaria"
          error={errors.timezone?.message}
          {...form.register('timezone')}
        >
          {TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-5 sm:grid-cols-3">
          <TextField
            label="Anticipación mínima (min)"
            type="number"
            inputMode="numeric"
            hint="Ej.: 60 = no se puede reservar con menos de 1 h."
            error={errors.minNoticeMinutes?.message}
            {...form.register('minNoticeMinutes')}
          />
          <TextField
            label="Reservas hasta (días)"
            type="number"
            inputMode="numeric"
            hint="Cuántos días hacia adelante se ve tu agenda."
            error={errors.bookingWindowDays?.message}
            {...form.register('bookingWindowDays')}
          />
          <TextField
            label="Cancelación (horas)"
            type="number"
            inputMode="numeric"
            hint="Hasta cuántas horas antes el cliente puede cancelar."
            error={errors.cancellationNoticeHours?.message}
            {...form.register('cancellationNoticeHours')}
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" isLoading={isSubmitting} disabled={!isDirty}>
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}

export function SettingsPage() {
  useDocumentTitle('Configuración');
  const query = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<{ profile: Profile }>('/me/profile'),
  });
  return (
    <>
      <PageHeader title="Configuración" description="Tu perfil y las reglas de tu agenda." />
      {query.isPending ? (
        <Skeleton className="h-96" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <SettingsForm profile={query.data.profile} />
      )}
    </>
  );
}

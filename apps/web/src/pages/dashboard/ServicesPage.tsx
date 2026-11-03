import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Pencil, Plus, Scissors, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextAreaField, TextField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Spinner';
import { EmptyState, ErrorState, PageHeader } from '../../components/ui/States';
import { api } from '../../lib/api';
import { formatDuration, formatPrice } from '../../lib/format';
import { handleFormError } from '../../lib/form-errors';
import type { Service } from '../../lib/types';
import { useDocumentTitle } from '../../lib/use-document-title';

// The form works in pesos; the API stores cents. Conversion happens in one place (onSubmit).
const serviceFormSchema = z.object({
  name: z.string().trim().min(2, 'Ingresá un nombre').max(80),
  description: z.string().trim().max(300, 'Máximo 300 caracteres'),
  durationMinutes: z.coerce
    .number<string>({ message: 'Ingresá la duración' })
    .int('Usá minutos enteros')
    .min(5, 'Mínimo 5 minutos')
    .max(480, 'Máximo 8 horas')
    .refine((value) => value % 5 === 0, 'Usá múltiplos de 5 minutos'),
  price: z.coerce
    .number<string>({ message: 'Ingresá un precio' })
    .min(0, 'El precio no puede ser negativo')
    .max(1_000_000),
  active: z.boolean(),
});
type ServiceFormInput = z.input<typeof serviceFormSchema>;
type ServiceFormValues = z.output<typeof serviceFormSchema>;

function ServiceForm({ service, onDone }: { service: Service | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<ServiceFormInput, unknown, ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: service?.name ?? '',
      description: service?.description ?? '',
      durationMinutes: String(service?.durationMinutes ?? 30),
      price: String((service?.priceCents ?? 0) / 100),
      active: service?.active ?? true,
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ price, ...values }) => {
    const body = { ...values, priceCents: Math.round(price * 100) };
    try {
      if (service) await api.patch(`/me/services/${service.id}`, body);
      else await api.post('/me/services', body);
      toast.success(service ? 'Servicio actualizado' : 'Servicio creado');
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      onDone();
    } catch (error) {
      handleFormError(error, form.setError, ['name', 'description', 'durationMinutes']);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <TextField
        label="Nombre"
        placeholder="Ej.: Corte de pelo"
        error={errors.name?.message}
        {...form.register('name')}
      />
      <TextAreaField
        label="Descripción (opcional)"
        error={errors.description?.message}
        {...form.register('description')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Duración (minutos)"
          type="number"
          inputMode="numeric"
          step={5}
          min={5}
          error={errors.durationMinutes?.message}
          {...form.register('durationMinutes')}
        />
        <TextField
          label="Precio (ARS)"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          hint="0 = sin cargo"
          error={errors.price?.message}
          {...form.register('price')}
        />
      </div>
      <label className="flex items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          className="size-4 rounded accent-brand-700"
          {...form.register('active')}
        />
        Disponible para reservar
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {service ? 'Guardar cambios' : 'Crear servicio'}
        </Button>
      </div>
    </form>
  );
}

export function ServicesPage() {
  useDocumentTitle('Servicios');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Service | null>(null);

  const query = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<{ services: Service[] }>('/me/services'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/me/services/${id}`),
    onSuccess: () => {
      toast.success('Servicio eliminado');
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (error) => {
      toast.error(error.message);
      setToDelete(null);
    },
  });

  return (
    <>
      <PageHeader
        title="Servicios"
        description="Lo que tus clientes pueden reservar."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden="true" /> Nuevo servicio
          </Button>
        }
      />

      {query.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.services.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="Todavía no cargaste servicios"
          description="Creá tu primer servicio para que tus clientes puedan reservar."
          action={<Button onClick={() => setEditing('new')}>Crear servicio</Button>}
        />
      ) : (
        <Card className="divide-y divide-slate-100">
          {query.data.services.map((service) => (
            <div key={service.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900">{service.name}</p>
                  {!service.active && <Badge>Inactivo</Badge>}
                </div>
                {service.description && (
                  <p className="mt-0.5 text-sm text-slate-500">{service.description}</p>
                )}
                <p className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                  <Clock className="size-3.5" aria-hidden="true" />{' '}
                  {formatDuration(service.durationMinutes)} · {formatPrice(service.priceCents)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(service)}>
                  <Pencil className="size-4" aria-hidden="true" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setToDelete(service)}
                  aria-label={`Eliminar ${service.name}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nuevo servicio' : 'Editar servicio'}
      >
        {editing !== null && (
          <ServiceForm
            service={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>

      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={`¿Eliminar “${toDelete?.name ?? ''}”?`}
      >
        <p className="text-sm text-slate-600">
          Si el servicio ya tiene turnos, no se puede eliminar para no perder el historial. En ese
          caso, editalo y desmarcá “Disponible para reservar”.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setToDelete(null)}>
            Volver
          </Button>
          <Button
            variant="danger"
            isLoading={remove.isPending}
            onClick={() => toDelete && remove.mutate(toDelete.id)}
          >
            Eliminar
          </Button>
        </div>
      </Modal>
    </>
  );
}

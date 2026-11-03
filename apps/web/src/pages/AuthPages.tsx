import { zodResolver } from '@hookform/resolvers/zod';
import { Briefcase, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../components/layout/Logo';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cn } from '../components/ui/cn';
import { TextField } from '../components/ui/Field';
import { handleFormError } from '../lib/form-errors';
import type { User as AppUser } from '../lib/types';
import { useDocumentTitle } from '../lib/use-document-title';

/** Only allow redirects to paths inside this app (prevents open-redirect tricks). */
function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

const homeFor = (user: AppUser) => (user.role === 'PROFESSIONAL' ? '/dashboard' : '/mis-turnos');

function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">{subtitle}</p>
        {children}
      </Card>
      <p className="mt-6 text-sm text-slate-600">{footer}</p>
    </div>
  );
}

const loginSchema = z.object({
  email: z.email('Ingresá un email válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});
type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  useDocumentTitle('Ingresar');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const { errors, isSubmitting } = form.formState;

  if (user) return <Navigate to={next ?? homeFor(user)} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const loggedIn = await login(values.email, values.password);
      navigate(next ?? homeFor(loggedIn), { replace: true });
    } catch (error) {
      handleFormError(error, form.setError, ['email', 'password']);
    }
  });

  return (
    <AuthCard
      title="Ingresá a tu cuenta"
      subtitle="Gestioná tus turnos desde cualquier dispositivo."
      footer={
        <>
          ¿No tenés cuenta?{' '}
          <Link
            to={`/registro${next ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-medium text-brand-700 hover:underline"
          >
            Registrate
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Ingresar
        </Button>
      </form>
    </AuthCard>
  );
}

const registerSchema = z
  .object({
    role: z.enum(['CLIENT', 'PROFESSIONAL']),
    name: z.string().trim().min(2, 'Ingresá tu nombre').max(80),
    businessName: z.string().trim().max(80).optional(),
    email: z.email('Ingresá un email válido'),
    password: z
      .string()
      .min(8, 'Usá al menos 8 caracteres')
      .max(72, 'Usá como máximo 72 caracteres')
      .regex(/[A-Za-z]/, 'Incluí al menos una letra')
      .regex(/\d/, 'Incluí al menos un número'),
  })
  .refine((data) => data.role !== 'PROFESSIONAL' || (data.businessName?.length ?? 0) >= 2, {
    path: ['businessName'],
    message: 'Ingresá el nombre de tu negocio o marca',
  });
type RegisterValues = z.infer<typeof registerSchema>;

const roleOptions = [
  { value: 'CLIENT', label: 'Quiero reservar turnos', icon: User },
  { value: 'PROFESSIONAL', label: 'Quiero recibir turnos', icon: Briefcase },
] as const;

export function RegisterPage() {
  useDocumentTitle('Crear cuenta');
  const { user, register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: params.get('rol') === 'profesional' ? 'PROFESSIONAL' : 'CLIENT' },
  });
  const { errors, isSubmitting } = form.formState;
  const role = form.watch('role');

  if (user) return <Navigate to={next ?? homeFor(user)} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const created = await registerAccount({
        ...values,
        businessName: values.role === 'PROFESSIONAL' ? values.businessName : undefined,
      });
      navigate(next ?? homeFor(created), { replace: true });
    } catch (error) {
      handleFormError(error, form.setError, ['name', 'email', 'password', 'businessName']);
    }
  });

  return (
    <AuthCard
      title="Creá tu cuenta"
      subtitle="Es gratis y lleva menos de un minuto."
      footer={
        <>
          ¿Ya tenés cuenta?{' '}
          <Link
            to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-medium text-brand-700 hover:underline"
          >
            Ingresá
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">
            ¿Cómo vas a usar Agendo?
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {roleOptions.map(({ value, label, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-2 rounded-xl p-4 text-center text-sm font-medium ring-1 transition-colors has-[:focus-visible]:ring-2',
                  role === value
                    ? 'bg-brand-50 text-brand-800 ring-brand-600'
                    : 'text-slate-600 ring-slate-200 hover:ring-slate-300',
                )}
              >
                <input type="radio" value={value} className="sr-only" {...form.register('role')} />
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <TextField
          label="Tu nombre"
          autoComplete="name"
          error={errors.name?.message}
          {...form.register('name')}
        />
        {role === 'PROFESSIONAL' && (
          <TextField
            label="Nombre de tu negocio o marca"
            placeholder="Ej.: Estudio Lucía Pérez"
            hint="Se usa para crear tu link público. Podés cambiarlo después."
            error={errors.businessName?.message}
            {...form.register('businessName')}
          />
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          hint="Mínimo 8 caracteres, con letras y números."
          error={errors.password?.message}
          {...form.register('password')}
        />
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Crear cuenta
        </Button>
      </form>
    </AuthCard>
  );
}

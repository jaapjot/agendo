import { AlertTriangle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { Button } from './Button';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="mb-4 rounded-full bg-brand-50 p-3 text-brand-700">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'No pudimos cargar esta información.';
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-xl bg-rose-50 px-6 py-10 text-center ring-1 ring-rose-200"
    >
      <AlertTriangle className="mb-3 size-6 text-rose-600" aria-hidden="true" />
      <p className="font-medium text-rose-900">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

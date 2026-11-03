import type { ReactNode } from 'react';
import type { AppointmentStatus } from '../../lib/types';
import { cn } from './cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

const statusLabels: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  CONFIRMED: { label: 'Confirmado', tone: 'brand' },
  COMPLETED: { label: 'Asistió', tone: 'success' },
  NO_SHOW: { label: 'No asistió', tone: 'warning' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, tone } = statusLabels[status];
  return <Badge tone={tone}>{label}</Badge>;
}

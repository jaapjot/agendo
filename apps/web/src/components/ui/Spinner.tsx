import { cn } from './cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-5 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-brand-700" role="status">
      <Spinner className="size-8" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-slate-200/70', className)} aria-hidden="true" />
  );
}

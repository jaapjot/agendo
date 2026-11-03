import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

const control =
  'block rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs ring-1 ring-slate-300 ' +
  'placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600 focus:outline-none ' +
  'disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:ring-rose-400';

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}

/** Label + control + hint/error, wired together for screen readers. */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type WithField<T> = T & { label: string; error?: string; hint?: ReactNode };

export function TextField({
  label,
  error,
  hint,
  className,
  ref,
  ...props
}: WithField<InputHTMLAttributes<HTMLInputElement>> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(a11y) => (
        <input ref={ref} className={cn(control, 'w-full', className)} {...a11y} {...props} />
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  ref,
  ...props
}: WithField<TextareaHTMLAttributes<HTMLTextAreaElement>> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(a11y) => (
        <textarea
          ref={ref}
          rows={3}
          className={cn(control, 'w-full resize-y', className)}
          {...a11y}
          {...props}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ref,
  ...props
}: WithField<SelectHTMLAttributes<HTMLSelectElement>> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(a11y) => (
        <select ref={ref} className={cn(control, 'w-full pr-8', className)} {...a11y} {...props}>
          {children}
        </select>
      )}
    </Field>
  );
}

export const inputClasses = control;

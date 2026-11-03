import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from './api';

/**
 * Shows server-side validation errors next to the matching form fields, and any other
 * error as a toast. The server is the source of truth even if the client validated first.
 */
export function handleFormError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: Path<T>[],
) {
  if (error instanceof ApiError && error.details?.length) {
    let shown = false;
    for (const detail of error.details) {
      if ((fields as string[]).includes(detail.field)) {
        setError(detail.field as Path<T>, { message: detail.message });
        shown = true;
      }
    }
    if (shown) return;
  }
  toast.error(error instanceof Error ? error.message : 'Ocurrió un error inesperado.');
}

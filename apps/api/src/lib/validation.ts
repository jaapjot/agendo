import { z } from 'zod';

/** Reusable field schemas so the same rule is never written twice with different limits. */
export const uuidParam = z.object({ id: z.uuid('Invalid id') });

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const isoDateTime = z.iso
  .datetime({ offset: true, message: 'Use an ISO 8601 date-time' })
  .transform((value) => new Date(value));

export const trimmedString = (max: number) =>
  z.string().trim().max(max, `Maximum ${max} characters`);

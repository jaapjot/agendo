import { z } from 'zod';
import { trimmedString } from '../../lib/validation.js';

export const registerSchema = z
  .object({
    name: trimmedString(80).min(2, 'Enter your name'),
    email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
    // bcrypt only uses the first 72 bytes of a password, so longer ones are rejected.
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(72, 'Use at most 72 characters')
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    role: z.enum(['PROFESSIONAL', 'CLIENT']),
    businessName: trimmedString(80).optional(),
  })
  .refine((data) => data.role !== 'PROFESSIONAL' || (data.businessName?.length ?? 0) >= 2, {
    path: ['businessName'],
    message: 'Enter the name of your business',
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  password: z.string().min(1, 'Enter your password').max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;

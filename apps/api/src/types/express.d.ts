import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware once the access token is verified. */
      user?: { id: string; role: Role };
    }
  }
}

export {};

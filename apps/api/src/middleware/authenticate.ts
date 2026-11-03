import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';

/** Requires a valid `Authorization: Bearer <access token>` header. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized();
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    throw unauthorized('Invalid or expired access token');
  }
  next();
};

/** Must run after `authenticate`. Rejects users whose role is not allowed. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw forbidden();
    }
    next();
  };

/** Returns the authenticated user or fails loudly if a route forgot `authenticate`. */
export function currentUser(req: Express.Request): { id: string; role: Role } {
  if (!req.user) throw unauthorized();
  return req.user;
}

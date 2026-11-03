import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/** Postgres error 23P01 = exclusion constraint violation (our "no overlapping appointments" rule). */
export function isOverlapViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.message.includes('appointments_no_overlap') || error.message.includes('23P01');
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return error.message.includes('appointments_no_overlap') || error.message.includes('23P01');
  }
  return false;
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
};

/**
 * The single place where errors become HTTP responses. Route handlers just throw;
 * Express 5 forwards errors from async handlers here automatically.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (isOverlapViolation(error)) {
    res.status(409).json({
      error: { code: 'SLOT_TAKEN', message: 'That time slot was just booked by someone else' },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res
      .status(409)
      .json({ error: { code: 'ALREADY_EXISTS', message: 'That value is already in use' } });
    return;
  }

  // Malformed JSON body.
  if (error instanceof SyntaxError && 'body' in error) {
    res
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    return;
  }

  // Anything else is a bug: log it in full, but never leak internals to the client.
  logger.error({ err: error, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};

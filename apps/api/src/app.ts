import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isProduction } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { authenticate, requireRole } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { agendaRouter, appointmentsRouter } from './modules/appointments/appointments.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { availabilityRouter } from './modules/availability/availability.routes.js';
import { professionalsRouter } from './modules/professionals/professionals.routes.js';
import { profileRouter } from './modules/profile/profile.routes.js';
import { servicesRouter } from './modules/services/services.routes.js';

export function createApp() {
  const app = express();

  // Behind a hosting proxy (Render, Railway...) this makes req.ip the real client IP,
  // which the rate limiter depends on.
  if (isProduction) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(pinoHttp({ logger }));

  // Health check for the hosting platform: also verifies the database answers.
  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/professionals', professionalsRouter);
  app.use('/api/appointments', authenticate, appointmentsRouter);

  const professionalOnly = [authenticate, requireRole('PROFESSIONAL')];
  app.use('/api/me/profile', professionalOnly, profileRouter);
  app.use('/api/me/services', professionalOnly, servicesRouter);
  app.use('/api/me', professionalOnly, availabilityRouter);
  app.use('/api/me', professionalOnly, agendaRouter);

  app.use('/api', notFoundHandler);

  // In production the API also serves the built React app, so both live on one origin.
  // That keeps the refresh cookie SameSite=Strict and removes the need for CORS.
  if (isProduction) {
    const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
    app.use(
      express.static(webDist, {
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // Client-side routes (/dashboard, /p/:slug...) all return index.html.
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

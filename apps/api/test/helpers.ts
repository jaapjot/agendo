import { DateTime } from 'luxon';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

export const app: App = createApp();
export const TZ = 'America/Argentina/Buenos_Aires';

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE appointments, time_off, availability_rules, services, professional_profiles, refresh_tokens, users CASCADE',
  );
}

let emailCounter = 0;
const uniqueEmail = (prefix: string) => `${prefix}${++emailCounter}-${Date.now()}@example.com`;

export async function registerClient(name = 'Test Client') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email: uniqueEmail('client'), password: 'password123', role: 'CLIENT' });
  return { token: res.body.accessToken as string, user: res.body.user };
}

/**
 * Creates a professional who works every day 09:00-18:00 and offers one 60-minute service,
 * with no minimum notice so tests can book any future slot.
 */
export async function createBookableProfessional(businessName = 'Test Studio') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Pro',
      email: uniqueEmail('pro'),
      password: 'password123',
      role: 'PROFESSIONAL',
      businessName,
    });
  const token = res.body.accessToken as string;
  const auth = { Authorization: `Bearer ${token}` };

  await request(app).patch('/api/me/profile').set(auth).send({ minNoticeMinutes: 0, timezone: TZ });
  await request(app)
    .put('/api/me/availability')
    .set(auth)
    .send({
      rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startMinute: 540,
        endMinute: 1080,
      })),
    });
  const serviceRes = await request(app)
    .post('/api/me/services')
    .set(auth)
    .send({ name: 'Haircut', durationMinutes: 60, priceCents: 1500000 });

  return {
    token,
    auth,
    slug: res.body.user.professional.slug as string,
    serviceId: serviceRes.body.service.id as string,
  };
}

/** A date a few days ahead (local), so slots are always in the future and in the window. */
export function futureDate(daysAhead = 3): string {
  return DateTime.now().setZone(TZ).plus({ days: daysAhead }).toISODate()!;
}

/** ISO instant for a local wall-clock time on `date`. */
export function localTime(date: string, time: string): string {
  return DateTime.fromISO(`${date}T${time}`, { zone: TZ }).toUTC().toISO()!;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

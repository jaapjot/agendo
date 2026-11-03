import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import {
  app,
  bearer,
  createBookableProfessional,
  futureDate,
  localTime,
  registerClient,
  resetDatabase,
} from './helpers.js';

let pro: Awaited<ReturnType<typeof createBookableProfessional>>;
let client: Awaited<ReturnType<typeof registerClient>>;
const date = futureDate(3);

function book(token: string, startsAt: string, serviceId = pro.serviceId) {
  return request(app)
    .post('/api/appointments')
    .set(bearer(token))
    .send({ professionalSlug: pro.slug, serviceId, startsAt });
}

function getSlots(day = date) {
  return request(app)
    .get(`/api/professionals/${pro.slug}/slots`)
    .query({ serviceId: pro.serviceId, date: day });
}

beforeEach(async () => {
  await resetDatabase();
  pro = await createBookableProfessional();
  client = await registerClient();
});
afterAll(() => prisma.$disconnect());

describe('public professional pages', () => {
  it('lists bookable professionals and searches by service name', async () => {
    const all = await request(app).get('/api/professionals');
    expect(all.body.professionals).toHaveLength(1);
    const search = await request(app).get('/api/professionals').query({ q: 'haircut' });
    expect(search.body.professionals[0].slug).toBe(pro.slug);
    const none = await request(app).get('/api/professionals').query({ q: 'dentist' });
    expect(none.body.professionals).toHaveLength(0);
  });

  it('hides professionals who cannot be booked yet (no services)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'New',
        email: 'new@example.com',
        password: 'password123',
        role: 'PROFESSIONAL',
        businessName: 'Empty',
      });
    const res = await request(app).get('/api/professionals');
    expect(res.body.professionals).toHaveLength(1);
  });

  it('returns 404 for an unknown professional', async () => {
    const res = await request(app).get('/api/professionals/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('lists free slots for a day (09:00 to 17:00 for a 60-minute service)', async () => {
    const res = await getSlots();
    expect(res.status).toBe(200);
    expect(res.body.slots[0]).toBe(localTime(date, '09:00'));
    expect(res.body.slots.at(-1)).toBe(localTime(date, '17:00'));
  });
});

describe('booking', () => {
  it('books a free slot and removes it from availability', async () => {
    const startsAt = localTime(date, '10:00');
    const res = await book(client.token, startsAt);

    expect(res.status).toBe(201);
    expect(res.body.appointment).toMatchObject({ status: 'CONFIRMED', priceCents: 1500000 });
    expect(res.body.appointment.endsAt).toBe(localTime(date, '11:00'));

    const slots = (await getSlots()).body.slots as string[];
    // 09:15..10:45 all overlap the 10:00-11:00 booking for a 60-minute service.
    expect(slots).not.toContain(startsAt);
    expect(slots).not.toContain(localTime(date, '09:15'));
    expect(slots).toContain(localTime(date, '09:00'));
    expect(slots).toContain(localTime(date, '11:00'));
  });

  it('rejects a second booking for the same slot', async () => {
    const startsAt = localTime(date, '10:00');
    await book(client.token, startsAt);
    const other = await registerClient('Other');
    const res = await book(other.token, startsAt);
    expect(res.status).toBe(409);
  });

  it('allows exactly one of many simultaneous bookings for the same slot', async () => {
    const startsAt = localTime(date, '14:00');
    const clients = await Promise.all(
      Array.from({ length: 10 }, (_, i) => registerClient(`Client ${i}`)),
    );

    // Fire all requests at once: several pass the availability check before any insert lands.
    const results = await Promise.all(clients.map((c) => book(c.token, startsAt)));
    const statuses = results.map((r) => r.status).sort();

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);
    const stored = await prisma.appointment.count({ where: { status: 'CONFIRMED' } });
    expect(stored).toBe(1);
  });

  it('rejects start times outside working hours or off the 15-minute grid', async () => {
    expect((await book(client.token, localTime(date, '07:00'))).status).toBe(409);
    expect((await book(client.token, localTime(date, '10:07'))).status).toBe(409);
    expect((await book(client.token, localTime(date, '17:30'))).status).toBe(409); // would end 18:30
  });

  it('rejects times in the past', async () => {
    const res = await book(client.token, localTime(futureDate(-1), '10:00'));
    expect(res.status).toBe(409);
  });

  it('snapshots the price so later price changes do not rewrite history', async () => {
    const res = await book(client.token, localTime(date, '10:00'));
    await request(app)
      .patch(`/api/me/services/${pro.serviceId}`)
      .set(pro.auth)
      .send({ priceCents: 2000000 });
    const stored = await prisma.appointment.findUniqueOrThrow({
      where: { id: res.body.appointment.id },
    });
    expect(stored.priceCents).toBe(1500000);
  });

  it('does not allow professionals to book', async () => {
    const res = await book(pro.token, localTime(date, '10:00'));
    expect(res.status).toBe(403);
  });

  it('does not allow booking an inactive service', async () => {
    await request(app)
      .patch(`/api/me/services/${pro.serviceId}`)
      .set(pro.auth)
      .send({ active: false });
    const res = await book(client.token, localTime(date, '10:00'));
    expect(res.status).toBe(404);
  });

  it('time off blocks slots', async () => {
    await request(app)
      .post('/api/me/time-off')
      .set(pro.auth)
      .send({
        startsAt: localTime(date, '00:00'),
        endsAt: localTime(date, '23:59'),
        reason: 'Holiday',
      });
    const res = await getSlots();
    expect(res.body.slots).toEqual([]);
  });
});

describe('client changes', () => {
  it('cancelling frees the slot for others', async () => {
    const startsAt = localTime(date, '10:00');
    const booked = await book(client.token, startsAt);
    const cancel = await request(app)
      .post(`/api/appointments/${booked.body.appointment.id}/cancel`)
      .set(bearer(client.token));
    expect(cancel.body.appointment).toMatchObject({ status: 'CANCELLED', cancelledBy: 'CLIENT' });

    const other = await registerClient('Other');
    expect((await book(other.token, startsAt)).status).toBe(201);
  });

  it('reschedules to another free slot', async () => {
    const booked = await book(client.token, localTime(date, '10:00'));
    const res = await request(app)
      .post(`/api/appointments/${booked.body.appointment.id}/reschedule`)
      .set(bearer(client.token))
      .send({ startsAt: localTime(date, '15:00') });
    expect(res.status).toBe(200);
    expect(res.body.appointment.startsAt).toBe(localTime(date, '15:00'));
  });

  it('can reschedule into a slot overlapping its own current time', async () => {
    const booked = await book(client.token, localTime(date, '10:00'));
    const res = await request(app)
      .post(`/api/appointments/${booked.body.appointment.id}/reschedule`)
      .set(bearer(client.token))
      .send({ startsAt: localTime(date, '10:30') });
    expect(res.status).toBe(200);
  });

  it('refuses changes inside the cancellation notice period', async () => {
    await request(app)
      .patch('/api/me/profile')
      .set(pro.auth)
      .send({ cancellationNoticeHours: 24 * 7 });
    const booked = await book(client.token, localTime(date, '10:00'));
    const res = await request(app)
      .post(`/api/appointments/${booked.body.appointment.id}/cancel`)
      .set(bearer(client.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TOO_LATE_TO_CHANGE');
  });

  it("cannot see or touch another client's appointment", async () => {
    const booked = await book(client.token, localTime(date, '10:00'));
    const intruder = await registerClient('Intruder');
    const res = await request(app)
      .post(`/api/appointments/${booked.body.appointment.id}/cancel`)
      .set(bearer(intruder.token));
    expect(res.status).toBe(404);
    const list = await request(app).get('/api/appointments/mine').set(bearer(intruder.token));
    expect(list.body.appointments).toEqual([]);
  });

  it('separates upcoming and past appointments', async () => {
    const booked = await book(client.token, localTime(date, '10:00'));
    const upcoming = await request(app)
      .get('/api/appointments/mine?scope=upcoming')
      .set(bearer(client.token));
    expect(upcoming.body.appointments.map((a: { id: string }) => a.id)).toEqual([
      booked.body.appointment.id,
    ]);
    const past = await request(app)
      .get('/api/appointments/mine?scope=past')
      .set(bearer(client.token));
    expect(past.body.appointments).toEqual([]);
  });
});

describe('professional agenda', () => {
  it('returns appointments in a date range with client details', async () => {
    await book(client.token, localTime(date, '10:00'));
    const res = await request(app)
      .get('/api/me/agenda')
      .set(pro.auth)
      .query({ from: date, to: date });
    expect(res.status).toBe(200);
    expect(res.body.appointments).toHaveLength(1);
    expect(res.body.appointments[0].client.name).toBe('Test Client');
  });

  it('rejects oversized ranges', async () => {
    const res = await request(app)
      .get('/api/me/agenda')
      .set(pro.auth)
      .query({ from: '2030-01-01', to: '2030-12-31' });
    expect(res.status).toBe(400);
  });

  it('cannot mark attendance before the appointment starts, but can cancel', async () => {
    const booked = await book(client.token, localTime(date, '10:00'));
    const id = booked.body.appointment.id;
    const early = await request(app)
      .patch(`/api/appointments/${id}/status`)
      .set(pro.auth)
      .send({ status: 'COMPLETED' });
    expect(early.body.error.code).toBe('NOT_STARTED');
    const cancel = await request(app)
      .patch(`/api/appointments/${id}/status`)
      .set(pro.auth)
      .send({ status: 'CANCELLED' });
    expect(cancel.body.appointment).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'PROFESSIONAL',
    });
    const again = await request(app)
      .patch(`/api/appointments/${id}/status`)
      .set(pro.auth)
      .send({ status: 'CANCELLED' });
    expect(again.body.error.code).toBe('ALREADY_FINAL');
  });

  it('marks a past appointment as completed and reports real attendance stats', async () => {
    const booked = await book(client.token, localTime(date, '10:00'));
    // Move the appointment into the past directly (the API rightly refuses to book the past).
    const start = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.appointment.update({
      where: { id: booked.body.appointment.id },
      data: { startsAt: start, endsAt: new Date(start.getTime() + 60 * 60 * 1000) },
    });
    const res = await request(app)
      .patch(`/api/appointments/${booked.body.appointment.id}/status`)
      .set(pro.auth)
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(200);

    const summary = await request(app).get('/api/me/summary').set(pro.auth);
    expect(summary.body.summary.lastThirtyDays).toEqual({ completed: 1, noShows: 0 });
    expect(summary.body.summary.attendanceRate).toBe(1);
  });

  it('reports a null attendance rate when there is no data', async () => {
    const summary = await request(app).get('/api/me/summary').set(pro.auth);
    expect(summary.body.summary.attendanceRate).toBeNull();
    expect(summary.body.summary.setup).toEqual({ hasServices: true, hasSchedule: true });
  });
});

describe('services and schedule management', () => {
  it("returns 404 when editing another professional's service", async () => {
    const other = await createBookableProfessional('Other Studio');
    const res = await request(app)
      .patch(`/api/me/services/${pro.serviceId}`)
      .set(other.auth)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(404);
  });

  it('refuses to delete a service with appointments, but deletes an unused one', async () => {
    await book(client.token, localTime(date, '10:00'));
    const used = await request(app).delete(`/api/me/services/${pro.serviceId}`).set(pro.auth);
    expect(used.body.error.code).toBe('SERVICE_IN_USE');

    const created = await request(app)
      .post('/api/me/services')
      .set(pro.auth)
      .send({ name: 'Unused', durationMinutes: 30, priceCents: 0 });
    const unused = await request(app)
      .delete(`/api/me/services/${created.body.service.id}`)
      .set(pro.auth);
    expect(unused.status).toBe(204);
  });

  it('rejects overlapping ranges in the weekly schedule', async () => {
    const res = await request(app)
      .put('/api/me/availability')
      .set(pro.auth)
      .send({
        rules: [
          { weekday: 1, startMinute: 540, endMinute: 780 },
          { weekday: 1, startMinute: 720, endMinute: 900 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OVERLAPPING_HOURS');
  });

  it('reports existing appointments that fall inside new time off', async () => {
    await book(client.token, localTime(date, '10:00'));
    const res = await request(app)
      .post('/api/me/time-off')
      .set(pro.auth)
      .send({ startsAt: localTime(date, '09:00'), endsAt: localTime(date, '12:00') });
    expect(res.body.conflictingAppointments).toBe(1);
  });

  it('rejects a public link that is already taken', async () => {
    const other = await createBookableProfessional('Other Studio');
    const res = await request(app)
      .patch('/api/me/profile')
      .set(other.auth)
      .send({ slug: pro.slug });
    expect(res.status).toBe(409);
  });
});

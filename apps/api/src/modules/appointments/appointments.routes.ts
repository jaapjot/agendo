import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { badRequest, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { isoDate, isoDateTime, trimmedString, uuidParam } from '../../lib/validation.js';
import { currentUser, requireRole } from '../../middleware/authenticate.js';
import * as appointments from './appointments.service.js';

const bookSchema = z.object({
  professionalSlug: z.string().min(1).max(60),
  serviceId: z.uuid(),
  startsAt: isoDateTime,
  notes: trimmedString(300).default(''),
});

const scopeQuery = z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming') });
const rescheduleSchema = z.object({ startsAt: isoDateTime });
const statusSchema = z.object({ status: z.enum(['CANCELLED', 'COMPLETED', 'NO_SHOW']) });

const agendaQuery = z.object({ from: isoDate, to: isoDate });
const MAX_AGENDA_DAYS = 62;

/** Mounted at /api/appointments (authenticated). */
export const appointmentsRouter = Router();

appointmentsRouter.post('/', requireRole('CLIENT'), async (req, res) => {
  const input = bookSchema.parse(req.body);
  const appointment = await appointments.bookAppointment(currentUser(req).id, input);
  res.status(201).json({ appointment });
});

appointmentsRouter.get('/mine', requireRole('CLIENT'), async (req, res) => {
  const { scope } = scopeQuery.parse(req.query);
  res.json({ appointments: await appointments.listClientAppointments(currentUser(req).id, scope) });
});

appointmentsRouter.post('/:id/cancel', requireRole('CLIENT'), async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  res.json({ appointment: await appointments.cancelByClient(id, currentUser(req).id) });
});

appointmentsRouter.post('/:id/reschedule', requireRole('CLIENT'), async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  const { startsAt } = rescheduleSchema.parse(req.body);
  res.json({
    appointment: await appointments.rescheduleByClient(id, currentUser(req).id, startsAt),
  });
});

appointmentsRouter.patch('/:id/status', requireRole('PROFESSIONAL'), async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  const { status } = statusSchema.parse(req.body);
  res.json({
    appointment: await appointments.updateStatusByProfessional(id, currentUser(req).id, status),
  });
});

/** Mounted at /api/me (professionals): agenda and dashboard summary. */
export const agendaRouter = Router();

agendaRouter.get('/agenda', async (req, res) => {
  const query = agendaQuery.parse(req.query);
  const profile = await prisma.professionalProfile.findUnique({
    where: { userId: currentUser(req).id },
  });
  if (!profile) throw notFound('Profile');
  // Days are interpreted in the professional's own time zone, not the server's.
  const from = DateTime.fromISO(query.from, { zone: profile.timezone }).startOf('day');
  const to = DateTime.fromISO(query.to, { zone: profile.timezone }).endOf('day');
  if (!from.isValid || !to.isValid) throw badRequest('INVALID_RANGE', 'Invalid date range');
  if (to < from) throw badRequest('INVALID_RANGE', '"to" must not be before "from"');
  if (to.diff(from, 'days').days > MAX_AGENDA_DAYS) {
    throw badRequest('RANGE_TOO_LARGE', `Request at most ${MAX_AGENDA_DAYS} days at a time`);
  }
  res.json({
    appointments: await appointments.listProfessionalAgenda(
      currentUser(req).id,
      from.toJSDate(),
      to.toJSDate(),
    ),
  });
});

agendaRouter.get('/summary', async (req, res) => {
  res.json({ summary: await appointments.getProfessionalSummary(currentUser(req).id) });
});

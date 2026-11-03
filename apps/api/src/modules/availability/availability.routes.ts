import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { isoDateTime, trimmedString, uuidParam } from '../../lib/validation.js';
import { currentUser } from '../../middleware/authenticate.js';
import { minutesToTime } from '../scheduling/slot-engine.js';

const ruleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((rule) => rule.endMinute > rule.startMinute, {
    message: 'End time must be after start time',
    path: ['endMinute'],
  });

const weeklyScheduleSchema = z.object({ rules: z.array(ruleSchema).max(50) });

const timeOffSchema = z
  .object({
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    reason: trimmedString(120).default(''),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: 'End must be after start',
    path: ['endsAt'],
  });

type Rule = z.infer<typeof ruleSchema>;

/** Rejects schedules where two ranges on the same day overlap (almost always a typo). */
function assertNoOverlaps(rules: Rule[]) {
  const sorted = [...rules].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]!;
    const current = sorted[i]!;
    if (previous.weekday === current.weekday && current.startMinute < previous.endMinute) {
      throw badRequest(
        'OVERLAPPING_HOURS',
        `Ranges ${minutesToTime(previous.startMinute)}-${minutesToTime(previous.endMinute)} and ` +
          `${minutesToTime(current.startMinute)}-${minutesToTime(current.endMinute)} overlap on the same day`,
      );
    }
  }
}

/** Mounted at /api/me, professionals only. */
export const availabilityRouter = Router();

availabilityRouter.get('/availability', async (req, res) => {
  const rules = await prisma.availabilityRule.findMany({
    where: { professionalId: currentUser(req).id },
    select: { weekday: true, startMinute: true, endMinute: true },
    orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
  });
  res.json({ rules });
});

/** Replaces the whole weekly schedule at once: simpler and atomic for a form-based editor. */
availabilityRouter.put('/availability', async (req, res) => {
  const { rules } = weeklyScheduleSchema.parse(req.body);
  assertNoOverlaps(rules);
  const professionalId = currentUser(req).id;

  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({ where: { professionalId } }),
    prisma.availabilityRule.createMany({
      data: rules.map((rule) => ({ ...rule, professionalId })),
    }),
  ]);

  res.json({
    rules: [...rules].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute),
  });
});

availabilityRouter.get('/time-off', async (req, res) => {
  const timeOff = await prisma.timeOff.findMany({
    where: { professionalId: currentUser(req).id, endsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
  });
  res.json({ timeOff });
});

availabilityRouter.post('/time-off', async (req, res) => {
  const data = timeOffSchema.parse(req.body);
  const professionalId = currentUser(req).id;
  const timeOff = await prisma.timeOff.create({ data: { ...data, professionalId } });

  // Blocking time does not silently cancel existing bookings; the professional is told
  // how many appointments fall inside the period so they can handle them explicitly.
  const conflictingAppointments = await prisma.appointment.count({
    where: {
      professionalId,
      status: 'CONFIRMED',
      startsAt: { lt: data.endsAt },
      endsAt: { gt: data.startsAt },
    },
  });
  res.status(201).json({ timeOff, conflictingAppointments });
});

availabilityRouter.delete('/time-off/:id', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  const { count } = await prisma.timeOff.deleteMany({
    where: { id, professionalId: currentUser(req).id },
  });
  if (count === 0) throw notFound('Time off');
  res.status(204).end();
});

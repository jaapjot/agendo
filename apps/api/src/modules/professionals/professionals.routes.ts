import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { isoDate } from '../../lib/validation.js';
import { getAvailableSlots } from '../appointments/appointments.service.js';

const directoryQuery = z.object({ q: z.string().trim().max(80).default('') });
const slotsQuery = z.object({ serviceId: z.uuid(), date: isoDate });
const slugParam = z.object({ slug: z.string().min(1).max(60) });

/** Public routes (no login needed): directory, profile pages and free slots. */
export const professionalsRouter = Router();

professionalsRouter.get('/', async (req, res) => {
  const { q } = directoryQuery.parse(req.query);
  const professionals = await prisma.professionalProfile.findMany({
    where: {
      // Only list professionals a client can actually book with.
      services: { some: { active: true } },
      availability: { some: {} },
      ...(q
        ? {
            OR: [
              { businessName: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { services: { some: { active: true, name: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    },
    select: {
      slug: true,
      businessName: true,
      description: true,
      services: { where: { active: true }, select: { name: true }, orderBy: { name: 'asc' } },
    },
    orderBy: { businessName: 'asc' },
    take: 50,
  });
  res.json({ professionals });
});

professionalsRouter.get('/:slug', async (req, res) => {
  const { slug } = slugParam.parse(req.params);
  const professional = await prisma.professionalProfile.findUnique({
    where: { slug },
    select: {
      slug: true,
      businessName: true,
      description: true,
      timezone: true,
      bookingWindowDays: true,
      cancellationNoticeHours: true,
      user: { select: { name: true } },
      services: {
        where: { active: true },
        select: {
          id: true,
          name: true,
          description: true,
          durationMinutes: true,
          priceCents: true,
        },
        orderBy: { name: 'asc' },
      },
      availability: { select: { weekday: true }, distinct: ['weekday'] },
    },
  });
  if (!professional) throw notFound('Professional');
  const { availability, user, ...rest } = professional;
  res.json({
    professional: {
      ...rest,
      ownerName: user.name,
      workingWeekdays: availability.map((rule) => rule.weekday).sort(),
    },
  });
});

professionalsRouter.get('/:slug/slots', async (req, res) => {
  const { slug } = slugParam.parse(req.params);
  const { serviceId, date } = slotsQuery.parse(req.query);
  res.json(await getAvailableSlots(slug, serviceId, date));
});

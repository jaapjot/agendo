import { Router } from 'express';
import { IANAZone } from 'luxon';
import { z } from 'zod';
import { conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { trimmedString } from '../../lib/validation.js';
import { currentUser } from '../../middleware/authenticate.js';

const profileSelect = {
  slug: true,
  businessName: true,
  description: true,
  timezone: true,
  minNoticeMinutes: true,
  bookingWindowDays: true,
  cancellationNoticeHours: true,
} as const;

const updateProfileSchema = z
  .object({
    businessName: trimmedString(80).min(2),
    description: trimmedString(500),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
      .min(3)
      .max(60),
    timezone: z.string().refine((zone) => IANAZone.isValidZone(zone), 'Unknown time zone'),
    minNoticeMinutes: z
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 60),
    bookingWindowDays: z.number().int().min(1).max(365),
    cancellationNoticeHours: z
      .number()
      .int()
      .min(0)
      .max(14 * 24),
  })
  .partial();

/** Mounted at /api/me/profile, professionals only. */
export const profileRouter = Router();

profileRouter.get('/', async (req, res) => {
  const profile = await prisma.professionalProfile.findUnique({
    where: { userId: currentUser(req).id },
    select: profileSelect,
  });
  if (!profile) throw notFound('Profile');
  res.json({ profile });
});

profileRouter.patch('/', async (req, res) => {
  const data = updateProfileSchema.parse(req.body);
  const userId = currentUser(req).id;

  if (data.slug) {
    const owner = await prisma.professionalProfile.findUnique({ where: { slug: data.slug } });
    if (owner && owner.userId !== userId) {
      throw conflict('SLUG_TAKEN', 'That public link is already in use');
    }
  }

  const profile = await prisma.professionalProfile.update({
    where: { userId },
    data,
    select: profileSelect,
  });
  res.json({ profile });
});

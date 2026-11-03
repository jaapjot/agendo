import { Router } from 'express';
import { z } from 'zod';
import { conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { trimmedString, uuidParam } from '../../lib/validation.js';
import { currentUser } from '../../middleware/authenticate.js';

const serviceSchema = z.object({
  name: trimmedString(80).min(2, 'Enter a name'),
  description: trimmedString(300).default(''),
  durationMinutes: z
    .number()
    .int()
    .min(5, 'Minimum 5 minutes')
    .max(480, 'Maximum 8 hours')
    .refine((minutes) => minutes % 5 === 0, 'Use multiples of 5 minutes'),
  priceCents: z.number().int().min(0, 'Price cannot be negative').max(100_000_000),
  active: z.boolean().default(true),
});

/** Mounted at /api/me/services, professionals only. */
export const servicesRouter = Router();

/** Loads a service and guarantees it belongs to the logged-in professional. */
async function findOwnService(serviceId: string, professionalId: string) {
  const service = await prisma.service.findFirst({ where: { id: serviceId, professionalId } });
  // 404 (not 403) so other professionals' ids cannot even be confirmed to exist.
  if (!service) throw notFound('Service');
  return service;
}

servicesRouter.get('/', async (req, res) => {
  const services = await prisma.service.findMany({
    where: { professionalId: currentUser(req).id },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
  res.json({ services });
});

servicesRouter.post('/', async (req, res) => {
  const data = serviceSchema.parse(req.body);
  const service = await prisma.service.create({
    data: { ...data, professionalId: currentUser(req).id },
  });
  res.status(201).json({ service });
});

servicesRouter.patch('/:id', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  await findOwnService(id, currentUser(req).id);
  const data = serviceSchema.partial().parse(req.body);
  const service = await prisma.service.update({ where: { id }, data });
  res.json({ service });
});

servicesRouter.delete('/:id', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  await findOwnService(id, currentUser(req).id);
  const appointmentCount = await prisma.appointment.count({ where: { serviceId: id } });
  if (appointmentCount > 0) {
    // Deleting would break the history of past appointments.
    throw conflict(
      'SERVICE_IN_USE',
      'This service has appointments. Deactivate it instead so clients can no longer book it.',
    );
  }
  await prisma.service.delete({ where: { id } });
  res.status(204).end();
});

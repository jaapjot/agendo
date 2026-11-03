import type { AppointmentStatus, Prisma, ProfessionalProfile } from '@prisma/client';
import { DateTime } from 'luxon';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  computeAvailableSlots,
  isSlotAvailable,
  type BusyPeriod,
} from '../scheduling/slot-engine.js';

/** Fields every appointment response includes, for both clients and professionals. */
export const appointmentInclude = {
  service: { select: { id: true, name: true, durationMinutes: true } },
  client: { select: { id: true, name: true, email: true } },
  professional: {
    select: { slug: true, businessName: true, timezone: true, cancellationNoticeHours: true },
  },
} satisfies Prisma.AppointmentInclude;

/**
 * Everything that blocks the calendar between two instants: active appointments and
 * time off. `excludeAppointmentId` lets a reschedule ignore the appointment being moved.
 */
async function loadBusyPeriods(
  professionalId: string,
  from: Date,
  to: Date,
  excludeAppointmentId?: string,
): Promise<BusyPeriod[]> {
  const overlapsWindow = { startsAt: { lt: to }, endsAt: { gt: from } };
  const [appointments, timeOff] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        professionalId,
        status: { not: 'CANCELLED' },
        ...overlapsWindow,
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      select: { startsAt: true, endsAt: true },
    }),
    prisma.timeOff.findMany({
      where: { professionalId, ...overlapsWindow },
      select: { startsAt: true, endsAt: true },
    }),
  ]);
  return [...appointments, ...timeOff].map((period) => ({
    start: period.startsAt,
    end: period.endsAt,
  }));
}

/** The local calendar day of `date` in `timezone`, padded by one day each side for safety. */
function dayWindow(date: string | Date, timezone: string) {
  const day =
    typeof date === 'string'
      ? DateTime.fromISO(date, { zone: timezone })
      : DateTime.fromJSDate(date, { zone: timezone });
  return {
    from: day.startOf('day').minus({ days: 1 }).toJSDate(),
    to: day.endOf('day').plus({ days: 1 }).toJSDate(),
  };
}

async function loadSlotContext(
  profile: ProfessionalProfile,
  window: { from: Date; to: Date },
  excludeId?: string,
) {
  const [rules, busy] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { professionalId: profile.userId } }),
    loadBusyPeriods(profile.userId, window.from, window.to, excludeId),
  ]);
  return {
    timezone: profile.timezone,
    rules,
    busy,
    now: new Date(),
    minNoticeMinutes: profile.minNoticeMinutes,
    bookingWindowDays: profile.bookingWindowDays,
  };
}

async function findBookableService(professionalId: string, serviceId: string) {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, professionalId, active: true },
  });
  if (!service) throw notFound('Service');
  return service;
}

export async function getAvailableSlots(slug: string, serviceId: string, date: string) {
  const profile = await prisma.professionalProfile.findUnique({ where: { slug } });
  if (!profile) throw notFound('Professional');
  const service = await findBookableService(profile.userId, serviceId);
  const context = await loadSlotContext(profile, dayWindow(date, profile.timezone));
  const slots = computeAvailableSlots({
    ...context,
    date,
    durationMinutes: service.durationMinutes,
  });
  return { date, timezone: profile.timezone, slots: slots.map((slot) => slot.toISOString()) };
}

export async function bookAppointment(
  clientId: string,
  input: { professionalSlug: string; serviceId: string; startsAt: Date; notes: string },
) {
  const profile = await prisma.professionalProfile.findUnique({
    where: { slug: input.professionalSlug },
  });
  if (!profile) throw notFound('Professional');
  if (profile.userId === clientId)
    throw badRequest('SELF_BOOKING', 'You cannot book with yourself');

  const service = await findBookableService(profile.userId, input.serviceId);
  const context = await loadSlotContext(profile, dayWindow(input.startsAt, profile.timezone));

  // First line of defence: is this start time one of the slots we would offer?
  if (!isSlotAvailable({ ...context, durationMinutes: service.durationMinutes }, input.startsAt)) {
    throw conflict(
      'SLOT_UNAVAILABLE',
      'That time is no longer available. Please choose another one.',
    );
  }

  // Second line of defence: if two clients pass the check above at the same moment, the
  // database exclusion constraint rejects the second INSERT (mapped to 409 SLOT_TAKEN).
  return prisma.appointment.create({
    data: {
      professionalId: profile.userId,
      clientId,
      serviceId: service.id,
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + service.durationMinutes * 60_000),
      priceCents: service.priceCents,
      notes: input.notes,
    },
    include: appointmentInclude,
  });
}

export async function listClientAppointments(clientId: string, scope: 'upcoming' | 'past') {
  const now = new Date();
  return prisma.appointment.findMany({
    where:
      scope === 'upcoming'
        ? { clientId, status: 'CONFIRMED', endsAt: { gte: now } }
        : { clientId, OR: [{ endsAt: { lt: now } }, { status: { not: 'CONFIRMED' } }] },
    include: appointmentInclude,
    orderBy: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' },
    take: 100,
  });
}

/** Loads a client's own appointment and checks it can still be changed. */
async function findChangeableClientAppointment(appointmentId: string, clientId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clientId },
    include: { professional: true },
  });
  if (!appointment) throw notFound('Appointment');
  if (appointment.status !== 'CONFIRMED') {
    throw conflict('NOT_CHANGEABLE', 'Only confirmed appointments can be changed');
  }
  const deadline = new Date(
    appointment.startsAt.getTime() -
      appointment.professional.cancellationNoticeHours * 60 * 60 * 1000,
  );
  if (new Date() > deadline) {
    throw new AppError(
      409,
      'TOO_LATE_TO_CHANGE',
      `Changes are allowed up to ${appointment.professional.cancellationNoticeHours} hours before the appointment. Please contact the professional.`,
    );
  }
  return appointment;
}

export async function cancelByClient(appointmentId: string, clientId: string) {
  await findChangeableClientAppointment(appointmentId, clientId);
  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CANCELLED', cancelledBy: 'CLIENT' },
    include: appointmentInclude,
  });
}

export async function rescheduleByClient(appointmentId: string, clientId: string, newStart: Date) {
  const appointment = await findChangeableClientAppointment(appointmentId, clientId);
  const service = await findBookableService(appointment.professionalId, appointment.serviceId);
  const context = await loadSlotContext(
    appointment.professional,
    dayWindow(newStart, appointment.professional.timezone),
    appointment.id,
  );
  if (!isSlotAvailable({ ...context, durationMinutes: service.durationMinutes }, newStart)) {
    throw conflict(
      'SLOT_UNAVAILABLE',
      'That time is no longer available. Please choose another one.',
    );
  }
  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      startsAt: newStart,
      endsAt: new Date(newStart.getTime() + service.durationMinutes * 60_000),
    },
    include: appointmentInclude,
  });
}

export async function listProfessionalAgenda(professionalId: string, from: Date, to: Date) {
  return prisma.appointment.findMany({
    where: { professionalId, startsAt: { gte: from, lt: to } },
    include: appointmentInclude,
    orderBy: { startsAt: 'asc' },
  });
}

/**
 * Allowed status changes for the professional. Final states cannot be changed, and an
 * appointment can only be marked as attended or missed once it has started.
 */
export async function updateStatusByProfessional(
  appointmentId: string,
  professionalId: string,
  status: Exclude<AppointmentStatus, 'CONFIRMED'>,
) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, professionalId },
  });
  if (!appointment) throw notFound('Appointment');
  if (appointment.status !== 'CONFIRMED') {
    throw conflict('ALREADY_FINAL', 'This appointment was already closed');
  }
  if ((status === 'COMPLETED' || status === 'NO_SHOW') && appointment.startsAt > new Date()) {
    throw conflict('NOT_STARTED', 'You can only mark attendance once the appointment has started');
  }
  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status, cancelledBy: status === 'CANCELLED' ? 'PROFESSIONAL' : null },
    include: appointmentInclude,
  });
}

/** Headline numbers for the professional's dashboard, all computed from real data. */
export async function getProfessionalSummary(professionalId: string) {
  const profile = await prisma.professionalProfile.findUnique({
    where: { userId: professionalId },
  });
  if (!profile) throw forbidden();
  const now = DateTime.now().setZone(profile.timezone);
  const todayStart = now.startOf('day').toJSDate();
  const todayEnd = now.endOf('day').toJSDate();
  const weekEnd = now.plus({ days: 7 }).toJSDate();
  const monthAgo = now.minus({ days: 30 }).toJSDate();

  const [today, nextSevenDays, closedLastMonth, activeServices, scheduleRules] = await Promise.all([
    prisma.appointment.count({
      where: {
        professionalId,
        status: { not: 'CANCELLED' },
        startsAt: { gte: todayStart, lte: todayEnd },
      },
    }),
    prisma.appointment.count({
      where: {
        professionalId,
        status: 'CONFIRMED',
        startsAt: { gte: now.toJSDate(), lt: weekEnd },
      },
    }),
    prisma.appointment.groupBy({
      by: ['status'],
      where: {
        professionalId,
        startsAt: { gte: monthAgo, lt: now.toJSDate() },
        status: { in: ['COMPLETED', 'NO_SHOW'] },
      },
      _count: { _all: true },
    }),
    prisma.service.count({ where: { professionalId, active: true } }),
    prisma.availabilityRule.count({ where: { professionalId } }),
  ]);

  const completed = closedLastMonth.find((group) => group.status === 'COMPLETED')?._count._all ?? 0;
  const noShows = closedLastMonth.find((group) => group.status === 'NO_SHOW')?._count._all ?? 0;

  return {
    today,
    nextSevenDays,
    lastThirtyDays: { completed, noShows },
    // Null when there is no data yet, so the UI can say "no data" instead of a fake 0%.
    attendanceRate: completed + noShows > 0 ? completed / (completed + noShows) : null,
    setup: { hasServices: activeServices > 0, hasSchedule: scheduleRules > 0 },
  };
}

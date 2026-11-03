/**
 * Demo data for local development and for trying the deployed app.
 * Everything here is fictional and labelled as a demo; run with `npm run db:seed`.
 * The script is idempotent: it deletes the previous demo accounts first.
 */
import bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TZ = 'America/Argentina/Buenos_Aires';
const DEMO_PASSWORD = 'demo1234';
const DEMO_EMAILS = [
  'profesional@demo.agendo.app',
  'cliente@demo.agendo.app',
  'cliente2@demo.agendo.app',
];

async function main() {
  await prisma.user.deleteMany({ where: { email: { in: DEMO_EMAILS } } });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const professional = await prisma.user.create({
    data: {
      name: 'Laura Demo',
      email: DEMO_EMAILS[0]!,
      passwordHash,
      role: 'PROFESSIONAL',
      professionalProfile: {
        create: {
          slug: 'estudio-demo',
          businessName: 'Estudio Demo',
          description: 'Cuenta de demostración de Agendo. Los datos de este perfil son ficticios.',
          timezone: TZ,
          minNoticeMinutes: 60,
          bookingWindowDays: 30,
          cancellationNoticeHours: 2,
        },
      },
    },
  });

  const [client, secondClient] = await Promise.all(
    [
      { name: 'Martín Demo', email: DEMO_EMAILS[1]! },
      { name: 'Sofía Demo', email: DEMO_EMAILS[2]! },
    ].map((data) => prisma.user.create({ data: { ...data, passwordHash, role: 'CLIENT' } })),
  );

  const services = await Promise.all(
    [
      {
        name: 'Corte de pelo',
        description: 'Lavado, corte y peinado.',
        durationMinutes: 45,
        priceCents: 1800000,
      },
      {
        name: 'Color',
        description: 'Coloración completa.',
        durationMinutes: 120,
        priceCents: 4500000,
      },
      {
        name: 'Consulta de asesoramiento',
        description: 'Charla para definir un cambio de look.',
        durationMinutes: 30,
        priceCents: 0,
      },
    ].map((data) => prisma.service.create({ data: { ...data, professionalId: professional.id } })),
  );

  // Monday to Friday 09:00-13:00 and 15:00-19:00, Saturday 10:00-14:00.
  const rules = [1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, startMinute: 9 * 60, endMinute: 13 * 60 },
    { weekday, startMinute: 15 * 60, endMinute: 19 * 60 },
  ]);
  rules.push({ weekday: 6, startMinute: 10 * 60, endMinute: 14 * 60 });
  await prisma.availabilityRule.createMany({
    data: rules.map((rule) => ({ ...rule, professionalId: professional.id })),
  });

  // A few appointments around today so the dashboard has something to show.
  const today = DateTime.now().setZone(TZ).startOf('day');
  const nextWeekday = (offset: number) => {
    let day = today.plus({ days: offset });
    while (day.weekday > 5) day = day.plus({ days: 1 }); // skip weekends
    return day;
  };
  const [haircut, color, consult] = services as [
    (typeof services)[0],
    (typeof services)[0],
    (typeof services)[0],
  ];
  const appointments = [
    {
      day: nextWeekday(-6),
      hour: 10,
      service: haircut,
      clientId: client!.id,
      status: 'COMPLETED' as const,
    },
    {
      day: nextWeekday(-5),
      hour: 16,
      service: color,
      clientId: secondClient!.id,
      status: 'COMPLETED' as const,
    },
    {
      day: nextWeekday(-3),
      hour: 11,
      service: consult,
      clientId: client!.id,
      status: 'NO_SHOW' as const,
    },
    {
      day: nextWeekday(1),
      hour: 9,
      service: haircut,
      clientId: client!.id,
      status: 'CONFIRMED' as const,
    },
    {
      day: nextWeekday(1),
      hour: 15,
      service: color,
      clientId: secondClient!.id,
      status: 'CONFIRMED' as const,
    },
    {
      day: nextWeekday(3),
      hour: 11,
      service: consult,
      clientId: secondClient!.id,
      status: 'CONFIRMED' as const,
    },
  ];
  for (const { day, hour, service, clientId, status } of appointments) {
    const startsAt = day.set({ hour }).toJSDate();
    await prisma.appointment.create({
      data: {
        professionalId: professional.id,
        clientId,
        serviceId: service.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + service.durationMinutes * 60_000),
        priceCents: service.priceCents,
        status,
      },
    });
  }

  console.log('Demo data created. Log in with password "%s" as:', DEMO_PASSWORD);
  console.log('  Professional: %s', DEMO_EMAILS[0]);
  console.log('  Client:       %s', DEMO_EMAILS[1]);
  console.log('  Public page:  /p/estudio-demo');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

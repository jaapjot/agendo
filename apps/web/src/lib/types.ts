// Shapes of the JSON the API returns. Kept in one file so a backend change is easy to mirror.

export type Role = 'PROFESSIONAL' | 'CLIENT';
export type AppointmentStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  professional: { slug: string; businessName: string } | null;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
}

export type PublicService = Omit<Service, 'active'>;

export interface PublicProfessional {
  slug: string;
  businessName: string;
  description: string;
  timezone: string;
  bookingWindowDays: number;
  cancellationNoticeHours: number;
  ownerName: string;
  workingWeekdays: number[];
  services: PublicService[];
}

export interface DirectoryEntry {
  slug: string;
  businessName: string;
  description: string;
  services: { name: string }[];
}

export interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  priceCents: number;
  notes: string;
  cancelledBy: Role | null;
  service: { id: string; name: string; durationMinutes: number };
  client: { id: string; name: string; email: string };
  professional: {
    slug: string;
    businessName: string;
    timezone: string;
    cancellationNoticeHours: number;
  };
}

export interface Profile {
  slug: string;
  businessName: string;
  description: string;
  timezone: string;
  minNoticeMinutes: number;
  bookingWindowDays: number;
  cancellationNoticeHours: number;
}

export interface AvailabilityRule {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface TimeOff {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}

export interface Summary {
  today: number;
  nextSevenDays: number;
  lastThirtyDays: { completed: number; noShows: number };
  attendanceRate: number | null;
  setup: { hasServices: boolean; hasSchedule: boolean };
}

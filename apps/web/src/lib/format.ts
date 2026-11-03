import { DateTime } from 'luxon';

const LOCALE = 'es-AR';

/** Prices are stored in cents; 1500000 -> "$ 15.000". */
export function formatPrice(cents: number): string {
  if (cents === 0) return 'Sin cargo';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * Every date shown to the user is rendered in the professional's time zone: a 10:00
 * appointment in Buenos Aires must read 10:00 even if the visitor's laptop is in Madrid.
 */
export const inZone = (iso: string, timezone: string) =>
  DateTime.fromISO(iso, { zone: timezone }).setLocale(LOCALE);

export const formatTime = (iso: string, timezone: string) =>
  inZone(iso, timezone).toFormat('HH:mm');

export const formatLongDate = (iso: string, timezone: string) =>
  capitalize(inZone(iso, timezone).toFormat("cccc d 'de' LLLL"));

export const formatDateTime = (iso: string, timezone: string) =>
  `${formatLongDate(iso, timezone)} · ${formatTime(iso, timezone)} h`;

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 570 -> "09:30" and back. Used by the weekly schedule editor. */
export function minutesToTime(minutes: number): string {
  if (minutes === 1440) return '24:00';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatPrice,
  formatTime,
  minutesToTime,
  timeToMinutes,
} from '../lib/format';

describe('format helpers', () => {
  it('formats cents as Argentine pesos', () => {
    expect(formatPrice(1500000).replace(/\s/g, ' ')).toBe('$ 15.000');
    expect(formatPrice(1050).replace(/\s/g, ' ')).toBe('$ 10,50');
    expect(formatPrice(0)).toBe('Sin cargo');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
  });

  it("renders times in the professional's zone, not the browser's", () => {
    expect(formatTime('2030-06-03T12:00:00Z', 'America/Argentina/Buenos_Aires')).toBe('09:00');
    expect(formatTime('2030-06-03T12:00:00Z', 'Europe/Madrid')).toBe('14:00');
  });

  it('converts between minutes and HH:mm', () => {
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(1440)).toBe('24:00');
    expect(timeToMinutes('09:30')).toBe(570);
  });
});

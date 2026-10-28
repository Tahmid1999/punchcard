import { clock, countdown, hoursBetween, monthDays, stamp, weekday } from './format';

describe('format', () => {
  it('shows times in Dhaka, six hours ahead of utc', () => {
    expect(stamp('2026-10-01T19:30:00Z')).toBe('2026-10-02 01:30:00');
    expect(clock('2026-10-02T03:05:00Z')).toBe('09:05');
  });

  it('lists every day of a month, leap february included', () => {
    expect(monthDays('2026-10')).toHaveLength(31);
    expect(monthDays('2028-02').at(-1)).toBe('2028-02-29');
    expect(monthDays('2026-02').at(-1)).toBe('2026-02-28');
  });

  it('knows 2 Oct 2026 is a friday', () => {
    expect(weekday('2026-10-02')).toBe(5);
  });

  it('counts down in m:ss and never below zero', () => {
    expect(countdown(600_000)).toBe('10:00');
    expect(countdown(61_400)).toBe('1:02');
    expect(countdown(-5)).toBe('0:00');
  });

  it('gives hours worked, blank when out is before in', () => {
    expect(hoursBetween('2026-10-02T03:00:00Z', '2026-10-02T11:45:00Z')).toBe('8h45');
    expect(hoursBetween('2026-10-02T11:00:00Z', '2026-10-02T03:00:00Z')).toBe('');
  });
});

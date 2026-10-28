import { distanceM, nearestOffice } from './geo';

describe('distanceM', () => {
  it('is zero for the same point', () => {
    expect(distanceM(23.78, 90.27, 23.78, 90.27)).toBe(0);
  });

  it('puts one degree of latitude near 111 km', () => {
    expect(distanceM(23, 90, 24, 90)).toBeGreaterThan(111_000);
    expect(distanceM(23, 90, 24, 90)).toBeLessThan(111_400);
  });

  it('shrinks a degree of longitude away from the equator', () => {
    expect(distanceM(60, 10, 60, 11)).toBeLessThan(distanceM(0, 10, 0, 11) / 1.9);
  });
});

describe('nearestOffice', () => {
  const offices = [
    { id: 'a', lat: 23.7806, lng: 90.2792, radiusM: 80 },
    { id: 'b', lat: 23.8103, lng: 90.4125, radiusM: 80 },
  ];

  it('picks the closer office', () => {
    expect(nearestOffice(23.781, 90.2795, offices)?.office.id).toBe('a');
  });

  it('returns null when there are no offices', () => {
    expect(nearestOffice(23.78, 90.27, [])).toBeNull();
  });
});

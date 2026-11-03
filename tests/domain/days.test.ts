import { describe, expect, it } from 'vitest';
import { addDays, diffDays, endOfMonth, fromUtcDate, toUtcDate } from '../../src/domain/days';

describe('days', () => {
  it('addDays attraversa mese e anno', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('addDays gestisce l\'anno bisestile', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('diffDays non risente dei cambi di ora legale', () => {
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
  });
  it('endOfMonth', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2026-11-03')).toBe('2026-11-30');
  });
  it('toUtcDate / fromUtcDate sono inverse', () => {
    expect(fromUtcDate(toUtcDate('2026-03-29'))).toBe('2026-03-29');
  });
});

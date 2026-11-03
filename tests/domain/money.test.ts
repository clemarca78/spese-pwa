import { describe, expect, it } from 'vitest';
import { formatEuro, parseEuro } from '../../src/domain/money';

const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('money', () => {
  it('formatEuro in formato italiano', () => {
    expect(norm(formatEuro(123456))).toBe('1.234,56 €');
    expect(formatEuro(-5000)).toContain('50,00');
    expect(formatEuro(-5000)).toContain('-');
  });
  it('parseEuro accetta il punto come separatore decimale (tastiere Android)', () => {
    expect(parseEuro('12.50')).toBe(1250);
    expect(parseEuro('1.5')).toBe(150);
    expect(parseEuro('1.234')).toBe(123400); // un punto + 3 cifre = migliaia all'italiana
    expect(parseEuro('1.234.567')).toBe(123456700);
    expect(parseEuro('1.2345')).toBeNull();
  });
  it('parseEuro', () => {
    expect(parseEuro('1.234,56')).toBe(123456);
    expect(parseEuro('12,5')).toBe(1250);
    expect(parseEuro('abc')).toBeNull();
  });
});

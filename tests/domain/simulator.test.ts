import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/domain/days';
import { findFeasible, simulateAt } from '../../src/domain/simulator';
import type { ForecastPoint } from '../../src/domain/types';

const START = '2026-11-01';
const day = (n: number) => addDays(START, n - 1); // giorno 1 = 2026-11-01
// 100000 fino al giorno 9; 20000 dal 10 al 19; 220000 dal giorno 20 in poi (30 giorni)
const pts: ForecastPoint[] = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1;
  return { day: day(n), balance: n < 10 ? 100000 : n < 20 ? 20000 : 220000 };
});

describe('findFeasible', () => {
  it('trova la prima data dopo lo stipendio', () => {
    const r = findFeasible(pts, 30000, 0, day(1), day(30));
    expect(r.first).toBe(day(20));
    expect(r.ranges).toEqual([[day(20), day(30)]]);
    expect(r.baselineBelowMargin).toBe(false);
  });
  it('nessuna data: indica di quanto dovrebbe diminuire', () => {
    const r = findFeasible(pts, 300000, 0, day(1), day(30));
    expect(r.first).toBeUndefined();
    expect(r.ranges).toEqual([]);
    expect(r.shortfall).toBe(80000);
  });
  it('il margine di sicurezza restringe le date', () => {
    const r = findFeasible(pts, 30000, 195000, day(1), day(30));
    expect(r.first).toBeUndefined();
    expect(r.shortfall).toBe(30000 - 25000);
  });
  it('previsione già sotto il margine: lo segnala', () => {
    const below = pts.map((p) => ({ ...p, balance: -5000 }));
    const r = findFeasible(below, 1000, 0, day(1), day(30));
    expect(r.baselineBelowMargin).toBe(true);
    expect(r.first).toBeUndefined();
    expect(r.shortfall).toBeUndefined();
  });
  it('rispetta la finestra richiesta', () => {
    const r = findFeasible(pts, 30000, 0, day(22), day(25));
    expect(r.ranges).toEqual([[day(22), day(25)]]);
  });
});

describe('simulateAt', () => {
  it('esito ok con saldo minimo e data', () => {
    const r = simulateAt(pts, 30000, day(20), 0);
    expect(r.verdict).toBe('ok');
    expect(r.minBalance).toBe(190000);
    expect(r.minDay).toBe(day(20));
  });
  it('esito stretto entro il 10% dell\'importo dal margine', () => {
    const r = simulateAt(pts, 215000, day(20), 0);
    expect(r.minBalance).toBe(5000);
    expect(r.verdict).toBe('tight');
  });
  it('esito sotto il margine', () => {
    expect(simulateAt(pts, 230000, day(20), 0).verdict).toBe('below');
  });
  it('withPurchase abbassa il saldo dal giorno della spesa', () => {
    const r = simulateAt(pts, 30000, day(20), 0);
    expect(r.withPurchase).toHaveLength(pts.length);
    expect(r.withPurchase[18].balance).toBe(20000);
    expect(r.withPurchase[19].balance).toBe(190000);
  });
  it('saldo a fine mese con la spesa', () => {
    expect(simulateAt(pts, 30000, day(5), 0).endOfMonthBalance).toBe(190000);
  });
});

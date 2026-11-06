import { describe, expect, it } from 'vitest';
import { biggestDrops, firstBelow, forecast } from '../../src/domain/forecast';
import type { OneOff } from '../../src/domain/types';
import { emptyTestData } from './fixtures';

const oo = (extra: Partial<OneOff>): OneOff =>
  ({ id: 'o1', name: 'x', kind: 'expense', amount: 50000, day: '2026-11-05', paid: false, ...extra });

function base() {
  const d = emptyTestData();
  d.balances = [{ value: 100000, day: '2026-11-03' }];
  return d;
}

describe('forecast', () => {
  it('applica le uscite giorno per giorno', () => {
    const d = base();
    d.oneOffs = [oo({})];
    expect(forecast(d, 2)).toEqual([
      { day: '2026-11-03', balance: 100000 },
      { day: '2026-11-04', balance: 100000 },
      { day: '2026-11-05', balance: 50000 },
    ]);
  });
  it('somma le entrate; la spunta "pagata" non toglie la voce dalla previsione', () => {
    const d = base();
    d.oneOffs = [oo({ kind: 'income', amount: 200000, day: '2026-11-04' }), oo({ id: 'o2', paid: true })];
    const pts = forecast(d, 2);
    expect(pts.map((p) => p.balance)).toEqual([100000, 300000, 250000]);
  });
  it('una voce con scadenza prima del saldo ma pagata dopo il saldo pesa sul primo giorno', () => {
    const d = base();
    d.oneOffs = [oo({ day: '2026-10-01', amount: 8500, paid: true, paidOn: '2026-11-04' })];
    expect(forecast(d, 1).map((p) => p.balance)).toEqual([100000, 91500]);
  });
  it('sottrae le spese varie se attive', () => {
    const d = base();
    d.settings.varieEnabled = true;
    d.settings.varieDailyDefault = 1000;
    expect(forecast(d, 2).map((p) => p.balance)).toEqual([100000, 99000, 98000]);
  });
  it('senza saldo non prevede nulla', () => {
    expect(forecast(emptyTestData(), 30)).toEqual([]);
  });
});

describe('firstBelow / biggestDrops', () => {
  const pts = [
    { day: '2026-11-03', balance: 100000 },
    { day: '2026-11-04', balance: 90000 },
    { day: '2026-11-05', balance: -5000 },
    { day: '2026-11-06', balance: 10000 },
  ];
  it('firstBelow trova il primo giorno sotto soglia', () => {
    expect(firstBelow(pts, 0)?.day).toBe('2026-11-05');
    expect(firstBelow(pts, -10000)).toBeUndefined();
  });
  it('biggestDrops ordina per calo maggiore', () => {
    expect(biggestDrops(pts, 2)).toEqual([
      { day: '2026-11-05', delta: -95000 },
      { day: '2026-11-04', delta: -10000 },
    ]);
  });
});

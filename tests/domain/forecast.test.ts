import { describe, expect, it } from 'vitest';
import { biggestDrops, firstBelow, forecast, monthlyFlows } from '../../src/domain/forecast';
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
  it('usa gli importi per mese delle regole', () => {
    const d = base();
    d.balances = [{ value: 100000, day: '2026-12-01' }];
    d.rules = [{ id: 'l', name: 'Luce', kind: 'expense', amount: 15000, variable: true, rrule: 'FREQ=MONTHLY;BYMONTHDAY=26;BYMONTH=12,2', start: '2026-01-01', active: true, autoDebit: true, monthAmounts: { '12': 30000, '2': 9000 } }];
    const pts = forecast(d, 90);
    expect(pts.find((p) => p.day === '2026-12-25')?.balance).toBe(100000);
    expect(pts.find((p) => p.day === '2026-12-26')?.balance).toBe(100000 - 30000);
    expect(pts.find((p) => p.day === '2027-02-26')?.balance).toBe(100000 - 30000 - 9000);
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

describe('monthlyFlows', () => {
  it('raggruppa entrate e uscite per mese e torna con il grafico', () => {
    const d = base();
    d.oneOffs = [
      oo({ id: 'a', day: '2026-11-05', amount: 30000 }),
      oo({ id: 'b', kind: 'income', day: '2026-12-10', amount: 80000 }),
      oo({ id: 'c', day: '2026-12-20', amount: 10000 }),
      oo({ id: 'd', day: '2027-01-02', amount: 5000 }),
    ];
    d.settings.varieEnabled = true;
    d.settings.varieDailyDefault = 100;
    const flows = monthlyFlows(d, 60); // 04/11 - 02/01
    expect(flows.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(flows[0]).toMatchObject({ income: 0, expense: 30000 });
    expect(flows[1]).toMatchObject({ income: 80000, expense: 10000 });
    expect(flows[2]).toMatchObject({ income: 0, expense: 5000 });
    expect(flows[0].items.map((x) => x.item.oneOffId)).toEqual(['a']);
    // le spese varie sono 100 al giorno per i giorni di ogni mese nella finestra
    expect(flows.map((m) => m.varie)).toEqual([27 * 100, 31 * 100, 2 * 100]);
    const last = forecast(d, 60).at(-1)?.balance as number;
    const net = flows.reduce((s, m) => s + m.income - m.expense - m.varie, 0);
    expect(last).toBe(100000 + net);
  });
  it('una voce con scadenza passata ma pagata dopo il saldo conta nel mese del primo giorno', () => {
    const d = base();
    d.oneOffs = [oo({ day: '2026-10-01', amount: 8500, paid: true, paidOn: '2026-11-04' })];
    const flows = monthlyFlows(d, 10);
    expect(flows[0]).toMatchObject({ month: '2026-11', expense: 8500 });
  });
  it('senza saldo è vuoto', () => {
    expect(monthlyFlows(emptyTestData(), 30)).toEqual([]);
  });
});

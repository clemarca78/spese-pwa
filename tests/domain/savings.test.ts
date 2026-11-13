import { describe, expect, it } from 'vitest';
import { savingsPlan } from '../../src/domain/savings';
import { emptyData } from '../../src/storage/backup';

function base(balance = 100000) {
  const d = emptyData();
  d.balances = [{ value: balance, day: '2026-11-03' }];
  return d;
}

describe('savingsPlan', () => {
  it('senza saldo non c’è piano', () => {
    expect(savingsPlan(emptyData())).toBeNull();
  });
  it('con saldo fermo il massimo è il saldo diviso i mesi (versamenti crescenti)', () => {
    const p = savingsPlan(base(), { amount: 200000, day: '2027-05-15' })!;
    expect(p.months).toBe(6);
    expect(p.maxMonthly).toBe(16600); // 1.000 / 6 mesi, euro interi per difetto
    expect(p.neededMonthly).toBe(33400);
    expect(p.avgSurplus).toBe(0); // nessuna entrata né uscita: non avanza nulla
    expect(p.realisticMonthly).toBe(0); // il saldo da solo non è un risparmio mensile
    expect(p.reachable).toBe(false);
    expect(p.shortfall).toBe(200000);
  });
  it('un obiettivo piccolo è raggiungibile quando ogni mese avanza qualcosa', () => {
    const d = base();
    const rule = { variable: false, start: '2026-01-01', active: true };
    d.rules = [
      { ...rule, id: 'i', name: 'stipendio', kind: 'income', amount: 150000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=5' },
      { ...rule, id: 'u', name: 'affitto', kind: 'expense', amount: 100000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10' },
    ];
    const p = savingsPlan(d, { amount: 60000, day: '2027-05-15' })!;
    expect(p.avgSurplus).toBeGreaterThan(45000);
    expect(p.avgSurplus).toBeLessThan(60000);
    expect(p.totalSavable).toBeGreaterThanOrEqual(60000);
    expect(p.neededMonthly).toBe(10000);
    expect(p.reachable).toBe(true);
    expect(p.shortfall).toBe(0);
  });
  it('una spesa grande prevista riduce quanto si può accantonare', () => {
    const d = base();
    d.oneOffs = [{ id: 'o', name: 'vacanza', kind: 'expense', amount: 50000, day: '2027-01-10', paid: false }];
    const p = savingsPlan(d, { amount: 100000, day: '2027-05-15' })!;
    // dopo la spesa restano 500 €: con 3+ versamenti già fatti il massimo cala
    expect(p.maxMonthly).toBeLessThan(16600);
    expect(p.maxMonthly).toBeGreaterThan(0);
  });
  it('escludere un mese toglie il suo avanzo dall’accantonamento', () => {
    const d = base();
    const rule = { variable: false, start: '2026-01-01', active: true };
    d.rules = [
      { ...rule, id: 'i', name: 'stipendio', kind: 'income', amount: 150000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=5' },
      { ...rule, id: 'u', name: 'affitto', kind: 'expense', amount: 100000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10' },
    ];
    const tutti = savingsPlan(d, { amount: 600000, day: '2027-05-15' })!.totalSavable;
    d.settings.savingsSkipMonths = ['2026-12', '2027-01'];
    const meno = savingsPlan(d, { amount: 600000, day: '2027-05-15' })!;
    expect(meno.totalSavable).toBeLessThan(tutti);
    expect(meno.monthRows.find((r) => r.month === '2026-12')?.included).toBe(false);
  });
  it('un mese in perdita non toglie nulla all’accantonato già messo da parte', () => {
    const d = base();
    d.oneOffs = [{ id: 'o', name: 'spesa', kind: 'expense', amount: 30000, day: '2027-02-10', paid: false }];
    const p = savingsPlan(d, { amount: 10000, day: '2027-05-15' })!;
    p.monthRows.reduce((prev, r) => { expect(r.cumulative).toBeGreaterThanOrEqual(prev); return r.cumulative; }, 0);
  });
  it('il margine abbassa il massimo accantonabile', () => {
    const d = base();
    const senza = savingsPlan(d, { amount: 60000, day: '2027-05-15' })!.maxMonthly;
    d.settings.savingsMargin = 30000;
    expect(savingsPlan(d, { amount: 60000, day: '2027-05-15' })!.maxMonthly).toBeLessThan(senza);
  });
  it('un saldo che va in negativo non permette di accantonare nulla', () => {
    const d = base(10000);
    d.oneOffs = [{ id: 'o', name: 'spesa', kind: 'expense', amount: 50000, day: '2026-12-01', paid: false }];
    expect(savingsPlan(d, { amount: 100000, day: '2027-05-15' })!.maxMonthly).toBe(0);
  });
  it('senza obiettivo guarda 6 mesi; data nel passato vale null', () => {
    expect(savingsPlan(base())!.months).toBe(5);
    expect(savingsPlan(base(), { amount: 1000, day: '2026-10-01' })).toBeNull();
  });
});

describe('spese varie scelte a mano', () => {
  it('con un importo mensile le varie riducono l’avanzo di ogni mese', () => {
    const d = base();
    d.settings.varieEnabled = true;
    const senza = savingsPlan(d, { amount: 60000, day: '2027-05-15' })!.monthRows[2].net;
    d.settings.varieMonthly = 80000;
    const con = savingsPlan(d, { amount: 60000, day: '2027-05-15' })!.monthRows[2].net;
    expect(senza - con).toBeGreaterThan(70000);
    expect(senza - con).toBeLessThan(90000);
  });
});

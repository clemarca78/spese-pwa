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
    expect(p.reachable).toBe(false);
    expect(p.shortfall).toBe(200000 - 16600 * 6);
  });
  it('un obiettivo piccolo è raggiungibile', () => {
    const p = savingsPlan(base(), { amount: 60000, day: '2027-05-15' })!;
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

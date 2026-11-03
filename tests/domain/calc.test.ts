import { describe, expect, it } from 'vitest';
import { latestBalance, monthlyFixedCost, outstandingItems, residual } from '../../src/domain/calc';
import type { OneOff } from '../../src/domain/types';
import { emptyTestData, mkRule } from './fixtures';

const oneOff = (extra: Partial<OneOff>): OneOff =>
  ({ id: 'o1', name: 'x', kind: 'expense', amount: 5000, day: '2026-11-10', paid: false, ...extra });

function withBalance() {
  const d = emptyTestData();
  d.balances = [{ value: 150000, day: '2026-11-03' }];
  return d;
}

describe('outstandingItems / residual', () => {
  it('conta le uscite dopo il saldo e calcola il residuo', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({})];
    expect(outstandingItems(d, '2026-11-30')).toHaveLength(1);
    expect(residual(d, '2026-11-30')).toBe(150000 - 5000);
  });
  it('esclude il giorno del saldo, salvo pendingDebit', () => {
    const d = withBalance();
    d.rules = [mkRule({ rrule: 'FREQ=MONTHLY;BYMONTHDAY=3' })];
    expect(outstandingItems(d, '2026-11-30')).toHaveLength(0);
    d.overrides = [{ ruleId: 'r1', day: '2026-11-03', pendingDebit: true }];
    expect(outstandingItems(d, '2026-11-30')).toHaveLength(1);
  });
  it('conta una voce slittata PRIMA del giorno del saldo se marcata ancora da addebitare', () => {
    const d = withBalance();
    d.rules = [mkRule({ amount: 60000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1' })];
    expect(outstandingItems(d, '2026-11-30')).toHaveLength(0);
    d.overrides = [{ ruleId: 'r1', day: '2026-11-01', pendingDebit: true }];
    expect(outstandingItems(d, '2026-11-30')).toHaveLength(1);
    expect(residual(d, '2026-11-30')).toBe(150000 - 60000);
  });
  it('esclude pagate, entrate e voci oltre until', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({ paid: true }), oneOff({ id: 'o2', kind: 'income' }), oneOff({ id: 'o3', day: '2026-12-15' })];
    expect(outstandingItems(d, '2026-11-30')).toHaveLength(0);
  });
  it('senza saldo non calcola nulla', () => {
    const d = emptyTestData();
    d.oneOffs = [oneOff({})];
    expect(latestBalance(d)).toBeUndefined();
    expect(outstandingItems(d, '2026-11-30')).toEqual([]);
    expect(residual(d, '2026-11-30')).toBeNull();
  });
  it('usa il saldo più recente', () => {
    const d = withBalance();
    d.balances.push({ value: 1, day: '2026-10-01' });
    expect(latestBalance(d)?.value).toBe(150000);
  });
});

describe('monthlyFixedCost', () => {
  it('somma le regole fisse normalizzate su base mensile', () => {
    const rules = [
      mkRule({ id: 'a', amount: 60000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1' }),
      mkRule({ id: 'b', amount: 5000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=2' }),
      mkRule({ id: 'c', amount: 12000, rrule: 'FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=1' }),
      mkRule({ id: 'd', amount: 9999, variable: true }),
      mkRule({ id: 'e', kind: 'income', amount: 200000 }),
    ];
    expect(monthlyFixedCost(rules, '2026-11-03')).toBe(60000 + 5000 + 1000);
  });
});

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

const END = '2026-11-30';
const TODAY = '2026-11-20';

describe('outstandingItems / residual', () => {
  it('senza entrate in arrivo, il residuo sottrae le uscite non pagate fino a until', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({}), oneOff({ id: 'late', day: '2026-12-05' })];
    expect(outstandingItems(d, END)).toHaveLength(1);
    expect(residual(d, END, TODAY)).toBe(150000 - 5000);
  });
  it('sottrae le uscite non pagate solo fino alla prossima entrata prevista', () => {
    const d = withBalance();
    d.oneOffs = [
      oneOff({ id: 'paid', day: '2026-11-05', amount: 1107, paid: true }),
      oneOff({ id: 'a', day: '2026-11-08', amount: 5000 }),
      oneOff({ id: 'b', day: '2026-11-10', amount: 3000 }),
      oneOff({ id: 'inc', kind: 'income', day: '2026-11-20', amount: 20000 }),
      oneOff({ id: 'c', day: '2026-11-25', amount: 9000 }),
    ];
    expect(residual(d, END, '2026-11-05')).toBe(150000 - 1107 - 5000 - 3000);
  });
  it('una spesa non pagata con data già passata (dopo il saldo) conta ancora', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({ day: '2026-11-04', amount: 4000 }), oneOff({ id: 'inc', kind: 'income', day: '2026-11-20', amount: 1 })];
    expect(residual(d, END, '2026-11-05')).toBe(150000 - 4000);
  });
  it('un entrata già incassata non è la prossima entrata', () => {
    const d = withBalance();
    d.oneOffs = [
      oneOff({ id: 'inc', kind: 'income', day: '2026-11-06', amount: 1000, paid: true }),
      oneOff({ id: 'a', day: '2026-11-08', amount: 5000 }),
    ];
    expect(residual(d, END, '2026-11-07')).toBe(150000 + 1000 - 5000);
  });
  it('una spesa spuntata dopo il saldo scala dal residuo e non è più "da pagare"', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({ paid: true })];
    d.rules = [mkRule({ amount: 1000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=12' })];
    d.overrides = [{ ruleId: 'r1', day: '2026-11-12', paid: true }];
    expect(outstandingItems(d, END)).toHaveLength(0);
    expect(residual(d, END, TODAY)).toBe(150000 - 5000 - 1000);
  });
  it('una spesa spuntata con data futura (dopo oggi) o già nel saldo non scala', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({ id: 'f', day: '2026-11-25', paid: true }), oneOff({ id: 's', day: '2026-11-03', paid: true })];
    expect(residual(d, END, TODAY)).toBe(150000);
  });
  it('il residuo non guarda oltre until', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({ day: '2026-11-10', paid: true })];
    expect(residual(d, '2026-11-09', TODAY)).toBe(150000);
    expect(residual(d, END, TODAY)).toBe(150000 - 5000);
  });
  it('esclude il giorno del saldo, salvo pendingDebit', () => {
    const d = withBalance();
    d.rules = [mkRule({ rrule: 'FREQ=MONTHLY;BYMONTHDAY=3' })];
    expect(outstandingItems(d, END)).toHaveLength(0);
    d.overrides = [{ ruleId: 'r1', day: '2026-11-03', pendingDebit: true }];
    expect(outstandingItems(d, END)).toHaveLength(1);
  });
  it('una voce slittata PRIMA del saldo e "ancora da addebitare" è da pagare e scala dal residuo', () => {
    const d = withBalance();
    d.rules = [mkRule({ amount: 60000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1' })];
    expect(outstandingItems(d, END)).toHaveLength(0);
    expect(residual(d, END, TODAY)).toBe(150000);
    d.overrides = [{ ruleId: 'r1', day: '2026-11-01', pendingDebit: true }];
    expect(outstandingItems(d, END)).toHaveLength(1);
    expect(residual(d, END, TODAY)).toBe(150000 - 60000);
  });
  it('esclude entrate e voci oltre until dalle uscite da pagare', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({ id: 'o2', kind: 'income' }), oneOff({ id: 'o3', day: '2026-12-15' })];
    expect(outstandingItems(d, END)).toHaveLength(0);
  });
  it('un entrata incassata dopo il saldo (fino a oggi) aumenta il residuo; le altre no', () => {
    const d = withBalance();
    d.oneOffs = [
      oneOff({ id: 'i1', kind: 'income', amount: 20000, day: '2026-11-05', paid: true }),
      oneOff({ id: 'i2', kind: 'income', amount: 7000, day: '2026-11-06', paid: false }),
      oneOff({ id: 'i3', kind: 'income', amount: 9000, day: '2026-11-03', paid: true }),
      oneOff({ id: 'i4', kind: 'income', amount: 4000, day: '2026-11-28', paid: true }),
    ];
    expect(residual(d, END, TODAY)).toBe(150000 + 20000);
  });
  it('senza saldo non calcola nulla', () => {
    const d = emptyTestData();
    d.oneOffs = [oneOff({})];
    expect(latestBalance(d)).toBeUndefined();
    expect(outstandingItems(d, '2026-11-30')).toEqual([]);
    expect(residual(d, END, TODAY)).toBeNull();
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

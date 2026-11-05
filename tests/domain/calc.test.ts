import { describe, expect, it } from 'vitest';
import { available, latestBalance, monthlyFixedCost, outstandingItems, residual } from '../../src/domain/calc';
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
  it('le uscite non pagate dopo il saldo sono da pagare ma non toccano il residuo', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({}), oneOff({ id: 'late', day: '2026-12-05' })];
    expect(outstandingItems(d, END)).toHaveLength(1);
    expect(residual(d, END, TODAY)).toBe(150000);
  });
  it('una spesa spuntata dopo il saldo scala dal residuo e non è più da pagare', () => {
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
  it('una voce slittata PRIMA del saldo e ancora da addebitare è da pagare e scala dal residuo', () => {
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
  it('una entrata incassata dopo il saldo (fino a oggi) aumenta il residuo; le altre no', () => {
    const d = withBalance();
    d.oneOffs = [
      oneOff({ id: 'i1', kind: 'income', amount: 20000, day: '2026-11-05', paid: true }),
      oneOff({ id: 'i2', kind: 'income', amount: 7000, day: '2026-11-06', paid: false }),
      oneOff({ id: 'i3', kind: 'income', amount: 9000, day: '2026-11-03', paid: true }),
      oneOff({ id: 'i4', kind: 'income', amount: 4000, day: '2026-11-28', paid: true }),
    ];
    expect(residual(d, END, TODAY)).toBe(150000 + 20000);
  });
});

describe('available (disponibile da spendere)', () => {
  function withRules() {
    const d = withBalance();
    d.rules = [
      mkRule({ id: 'tim', name: 'Tim', amount: 2789, rrule: 'FREQ=MONTHLY;BYMONTHDAY=8', autoDebit: true }),
      mkRule({ id: 'dent', name: 'Dentista', amount: 8500, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10' }),
      mkRule({ id: 'inps', name: 'INPS', kind: 'income', amount: 20380, rrule: 'FREQ=MONTHLY;BYMONTHDAY=20' }),
      mkRule({ id: 'ass', name: 'Assicurazione', amount: 3695, rrule: 'FREQ=MONTHLY;BYMONTHDAY=27', autoDebit: true }),
    ];
    return d;
  }
  it('sottrae al residuo solo gli addebiti automatici fino alla prossima entrata', () => {
    const d = withRules();
    const a = available(d, END, '2026-11-05');
    expect(a).toMatchObject({ value: 150000 - 2789, upTo: '2026-11-20' });
    expect(a?.debits.map((i) => i.name)).toEqual(['Tim']);
  });
  it('le uscite non automatiche (decido io) non riducono il disponibile', () => {
    const d = withRules();
    d.rules = d.rules.filter((r) => r.id !== 'tim');
    expect(available(d, END, '2026-11-05')?.value).toBe(150000);
  });
  it('un addebito già spuntato non viene sottratto due volte', () => {
    const d = withRules();
    d.overrides = [{ ruleId: 'tim', day: '2026-11-08', paid: true }];
    expect(available(d, END, '2026-11-09')?.value).toBe(150000 - 2789); // solo tramite il residuo
  });
  it('parte dal residuo (spese pagate) e senza entrate in arrivo conta fino a until', () => {
    const d = withRules();
    d.rules = d.rules.filter((r) => r.id !== 'inps');
    d.oneOffs = [oneOff({ id: 'sp', day: '2026-11-05', amount: 1107, paid: true })];
    const a = available(d, END, '2026-11-05');
    expect(a?.value).toBe(150000 - 1107 - 2789 - 3695);
    expect(a?.upTo).toBeUndefined();
  });
  it('un addebito automatico già scaduto dopo il saldo e non spuntato pesa ancora', () => {
    const d = withRules();
    expect(available(d, END, '2026-11-12')?.value).toBe(150000 - 2789);
  });
  it('senza saldo è null', () => {
    expect(available(emptyTestData(), END, TODAY)).toBeNull();
  });
});

describe('saldo', () => {
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

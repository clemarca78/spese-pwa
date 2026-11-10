import { describe, expect, it } from 'vitest';
import { totalsByCategory } from '../../src/domain/categories';
import type { OneOff } from '../../src/domain/types';
import { emptyTestData, mkRule } from './fixtures';

const oo = (extra: Partial<OneOff>): OneOff =>
  ({ id: 'o1', name: 'x', kind: 'expense', amount: 1000, day: '2026-11-10', paid: false, ...extra });

describe('totalsByCategory', () => {
  it('somma entrate e uscite per categoria, con Senza categoria a parte', () => {
    const d = emptyTestData();
    d.rules = [mkRule({ id: 'r1', amount: 5000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=5', categoryId: 'casa' })];
    d.oneOffs = [
      oo({ id: 'a', amount: 3000, categoryId: 'casa' }),
      oo({ id: 'b', amount: 2000, categoryId: 'carb' }),
      oo({ id: 'c', amount: 700 }),
      oo({ id: 'd', kind: 'income', amount: 9000, categoryId: 'stip' }),
    ];
    const t = totalsByCategory(d, '2026-11-01', '2026-11-30');
    expect(t).toEqual([
      { categoryId: 'casa', income: 0, expense: 8000 },
      { categoryId: 'carb', income: 0, expense: 2000 },
      { categoryId: undefined, income: 0, expense: 700 },
      { categoryId: 'stip', income: 9000, expense: 0 },
    ]);
  });
  it('rispetta il periodo ed esclude le voci saltate', () => {
    const d = emptyTestData();
    d.rules = [mkRule({ id: 'r1', amount: 1000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=5', categoryId: 'casa' })];
    d.overrides = [{ ruleId: 'r1', day: '2026-02-05', skipped: true }];
    const year = totalsByCategory(d, '2026-01-01', '2026-12-31');
    expect(year).toEqual([{ categoryId: 'casa', income: 0, expense: 11000 }]); // 12 mesi meno quello saltato
    expect(totalsByCategory(d, '2026-03-01', '2026-03-31')).toEqual([{ categoryId: 'casa', income: 0, expense: 1000 }]);
  });
  it('usa gli importi per mese delle regole', () => {
    const d = emptyTestData();
    d.rules = [mkRule({ id: 'l', amount: 15000, variable: true, rrule: 'FREQ=MONTHLY;BYMONTHDAY=26;BYMONTH=2,4', monthAmounts: { '2': 24000, '4': 12000 }, categoryId: 'bol' })];
    expect(totalsByCategory(d, '2026-01-01', '2026-12-31')).toEqual([{ categoryId: 'bol', income: 0, expense: 36000 }]);
  });
  it('senza voci è vuoto', () => {
    expect(totalsByCategory(emptyTestData(), '2026-01-01', '2026-12-31')).toEqual([]);
  });
});

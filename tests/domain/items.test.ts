import { describe, expect, it } from 'vitest';
import { buildItems, estimateVariable } from '../../src/domain/items';
import type { Override } from '../../src/domain/types';
import { emptyTestData, mkRule } from './fixtures';

const ov = (day: string, amount?: number, extra: Partial<Override> = {}): Override =>
  ({ ruleId: 'r1', day, amount, ...extra });

describe('estimateVariable', () => {
  const rule = mkRule({ amount: 10000, variable: true });
  it('media degli ultimi 3 importi reali', () => {
    const o = [ov('2026-05-24', 5000), ov('2026-06-24', 10000), ov('2026-07-24', 20000), ov('2026-08-24', 30000)];
    expect(estimateVariable(rule, o)).toBe(20000);
  });
  it('senza storico usa l\'importo della regola', () => {
    expect(estimateVariable(rule, [])).toBe(10000);
  });
  it('ignora gli override senza importo', () => {
    expect(estimateVariable(rule, [ov('2026-05-24', undefined, { paid: true })])).toBe(10000);
  });
  it('considera solo gli importi precedenti al giorno indicato', () => {
    const o = [ov('2026-05-24', 1000), ov('2026-09-24', 99999)];
    expect(estimateVariable(rule, o, '2026-08-24')).toBe(1000);
  });
});

describe('buildItems', () => {
  it('occorrenza variabile senza override: stimata', () => {
    const d = emptyTestData();
    d.rules = [mkRule({ amount: 10000, variable: true })];
    d.overrides = [ov('2026-10-24', 20000)];
    const [it1] = buildItems(d, '2026-11-01', '2026-11-30');
    expect(it1).toMatchObject({ day: '2026-11-24', amount: 20000, estimated: true, ruleId: 'r1' });
  });
  it('con override importo: non stimata', () => {
    const d = emptyTestData();
    d.rules = [mkRule({ amount: 10000, variable: true })];
    d.overrides = [ov('2026-11-24', 12345, { paid: true })];
    const [it1] = buildItems(d, '2026-11-01', '2026-11-30');
    expect(it1).toMatchObject({ amount: 12345, estimated: false, paid: true });
  });
  it('regola non variabile non è stimata', () => {
    const d = emptyTestData();
    d.rules = [mkRule()];
    expect(buildItems(d, '2026-11-01', '2026-11-30')[0]).toMatchObject({ amount: 1000, estimated: false });
  });
  it('voce saltata resta presente con skipped', () => {
    const d = emptyTestData();
    d.rules = [mkRule()];
    d.overrides = [ov('2026-11-24', undefined, { skipped: true })];
    expect(buildItems(d, '2026-11-01', '2026-11-30')[0].skipped).toBe(true);
  });
  it('include le una tantum nell\'intervallo e ordina per giorno', () => {
    const d = emptyTestData();
    d.rules = [mkRule()];
    d.oneOffs = [
      { id: 'o1', name: 'compleanno', kind: 'expense', amount: 44000, day: '2026-11-10', paid: true },
      { id: 'o2', name: 'fuori', kind: 'expense', amount: 1, day: '2026-12-10', paid: false },
    ];
    const items = buildItems(d, '2026-11-01', '2026-11-30');
    expect(items.map((i) => i.day)).toEqual(['2026-11-10', '2026-11-24']);
    expect(items[0]).toMatchObject({ oneOffId: 'o1', paid: true, estimated: false });
  });
});

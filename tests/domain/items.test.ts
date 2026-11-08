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

describe('addebito automatico', () => {
  const auto = () => { const d = emptyTestData(); d.rules = [mkRule({ id: 'a', rrule: 'FREQ=MONTHLY;BYMONTHDAY=8', autoDebit: true }), mkRule({ id: 'm', rrule: 'FREQ=MONTHLY;BYMONTHDAY=8' })]; return d; };
  it('alla scadenza una voce con addebito automatico risulta già pagata (alla sua data)', () => {
    const items = buildItems(auto(), '2026-11-01', '2026-11-30', '2026-11-10');
    expect(items.find((i) => i.ruleId === 'a')).toMatchObject({ paid: true, paidOn: '2026-11-08', autoDebit: true });
    expect(items.find((i) => i.ruleId === 'm')).toMatchObject({ paid: false });
  });
  it('prima della scadenza non è ancora pagata', () => {
    const items = buildItems(auto(), '2026-11-01', '2026-11-30', '2026-11-07');
    expect(items.find((i) => i.ruleId === 'a')?.paid).toBe(false);
  });
  it('una vecchia spunta tolta a mano (paid false) non impedisce l addebito automatico', () => {
    const d = auto();
    d.overrides = [{ ruleId: 'a', day: '2026-11-08', paid: false }];
    expect(buildItems(d, '2026-11-01', '2026-11-30', '2026-11-10').find((i) => i.ruleId === 'a')).toMatchObject({ paid: true, paidOn: '2026-11-08' });
  });
});

describe('importi per mese', () => {
  const bolletta = () => mkRule({ id: 'r1', amount: 15000, variable: true, rrule: 'FREQ=MONTHLY;BYMONTHDAY=26;BYMONTH=2,4,6', monthAmounts: { '2': 24000, '4': 12000 } });
  it('ogni mese usa il proprio importo, gli altri quello della regola', () => {
    const d = emptyTestData();
    d.rules = [bolletta()];
    const items = buildItems(d, '2027-01-01', '2027-06-30');
    expect(items.map((i) => [i.day, i.amount])).toEqual([['2027-02-26', 24000], ['2027-04-26', 12000], ['2027-06-26', 15000]]);
    expect(items.every((i) => i.estimated)).toBe(true);
  });
  it('un importo corretto a mano per quella scadenza prevale', () => {
    const d = emptyTestData();
    d.rules = [bolletta()];
    d.overrides = [ov('2027-02-26', 23337)];
    expect(buildItems(d, '2027-02-01', '2027-02-28')[0]).toMatchObject({ amount: 23337, estimated: false });
  });
  it('la tabella dei mesi ha la precedenza sulla media degli importi reali', () => {
    const d = emptyTestData();
    d.rules = [bolletta()];
    d.overrides = [ov('2026-10-26', 99999)];
    expect(buildItems(d, '2027-02-01', '2027-02-28')[0].amount).toBe(24000);
  });
});

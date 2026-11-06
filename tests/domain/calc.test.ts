import { describe, expect, it } from 'vitest';
import { available, latestBalance, monthlyFixedCost, residual } from '../../src/domain/calc';
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

describe('residual', () => {
  it('le uscite non pagate dopo il saldo non toccano il residuo', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({}), oneOff({ id: 'late', day: '2026-12-05' })];
    expect(residual(d, END, TODAY)).toBe(150000);
  });
  it('una spesa spuntata dopo il saldo scala dal residuo', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({ paid: true })];
    d.rules = [mkRule({ amount: 1000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=12' })];
    d.overrides = [{ ruleId: 'r1', day: '2026-11-12', paid: true }];
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

describe('residual: data del pagamento (paidOn)', () => {
  const dentist = () => mkRule({ id: 'dent', name: 'Dentista', amount: 8500, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1' });
  it('una rata arretrata pagata dopo il saldo scala dal residuo anche se scadeva prima', () => {
    const d = withBalance();
    d.rules = [dentist()];
    d.overrides = [{ ruleId: 'dent', day: '2026-10-01', paid: true, paidOn: '2026-11-05' }];
    expect(residual(d, TODAY, TODAY)).toBe(150000 - 8500);
  });
  it('più rate arretrate pagate insieme scalano tutte', () => {
    const d = withBalance();
    d.rules = [dentist()];
    d.overrides = [
      { ruleId: 'dent', day: '2026-09-01', paid: true, paidOn: '2026-11-05' },
      { ruleId: 'dent', day: '2026-10-01', paid: true, paidOn: '2026-11-05' },
    ];
    expect(residual(d, TODAY, TODAY)).toBe(150000 - 2 * 8500);
  });
  it('pagata prima o il giorno del saldo non scala (è già nel saldo)', () => {
    const d = withBalance();
    d.rules = [dentist()];
    d.overrides = [{ ruleId: 'dent', day: '2026-10-01', paid: true, paidOn: '2026-11-03' }];
    expect(residual(d, TODAY, TODAY)).toBe(150000);
  });
  it('senza paidOn vale la data della voce (voci vecchie)', () => {
    const d = withBalance();
    d.rules = [dentist()];
    d.overrides = [{ ruleId: 'dent', day: '2026-10-01', paid: true }];
    expect(residual(d, TODAY, TODAY)).toBe(150000);
  });
  it('una voce con scadenza futura pagata in anticipo scala subito', () => {
    const d = withBalance();
    d.oneOffs = [oneOff({ day: '2026-11-25', paid: true, paidOn: '2026-11-05' })];
    expect(residual(d, '2026-11-06', '2026-11-06')).toBe(150000 - 5000);
  });
});

describe('residual: ordine tra saldo e pagamento nello stesso giorno', () => {
  const rule = mkRule({ id: 'den', name: 'Dentista', amount: 8500, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1' });
  it('con un saldo senza orario, una spunta fatta lo stesso giorno scala', () => {
    const d = withBalance(); // saldo 03/11 senza orario
    d.rules = [rule];
    d.overrides = [{ ruleId: 'den', day: '2026-10-01', paid: true, paidOn: '2026-11-03', paidAt: '2026-11-03T09:00:00.000Z' }];
    expect(residual(d, TODAY, TODAY)).toBe(150000 - 8500);
  });
  it('con un saldo con orario conta solo ciò che spunti dopo averlo inserito', () => {
    const d = withBalance();
    d.balances = [{ value: 150000, day: '2026-11-03', at: '2026-11-03T12:00:00.000Z' }];
    d.rules = [rule];
    d.overrides = [{ ruleId: 'den', day: '2026-10-01', paid: true, paidOn: '2026-11-03', paidAt: '2026-11-03T10:00:00.000Z' }];
    expect(residual(d, TODAY, TODAY)).toBe(150000); // spuntata prima del saldo: è già dentro
    d.overrides = [{ ruleId: 'den', day: '2026-10-01', paid: true, paidOn: '2026-11-03', paidAt: '2026-11-03T15:00:00.000Z' }];
    expect(residual(d, TODAY, TODAY)).toBe(150000 - 8500);
  });
});

describe('available (disponibile da spendere)', () => {
  function withRules() {
    const d = withBalance();
    d.rules = [
      mkRule({ id: 'tim', name: 'Tim', amount: 2789, rrule: 'FREQ=MONTHLY;BYMONTHDAY=8' }),
      mkRule({ id: 'pal', name: 'Palestra', amount: 4000, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10' }),
      mkRule({ id: 'ass', name: 'Assicurazione', amount: 3695, rrule: 'FREQ=MONTHLY;BYMONTHDAY=27' }),
    ];
    return d;
  }
  it('toglie dal residuo tutte le uscite non pagate prima del giorno dello stipendio', () => {
    const d = withRules();
    d.oneOffs = [oneOff({ id: 'segnata', day: '2026-11-09', amount: 1000 })];
    const a = available(d, '2026-11-06', 10);
    expect(a).toMatchObject({ value: 150000 - 2789 - 1000, upTo: '2026-11-10' });
    expect(a?.debits.map((i) => i.name).sort()).toEqual(['Tim', 'x']);
  });
  it('non somma le entrate previste e non conta le uscite dal giorno dello stipendio in poi', () => {
    const d = withRules();
    d.oneOffs = [oneOff({ id: 'inc', kind: 'income', day: '2026-11-08', amount: 99999 })];
    expect(available(d, '2026-11-06', 10)?.value).toBe(150000 - 2789);
  });
  it('dopo il giorno dello stipendio guarda al mese successivo', () => {
    const d = withRules();
    expect(available(d, '2026-11-12', 10)?.upTo).toBe('2026-12-10');
    expect(available(d, '2026-11-12', 10)?.value).toBe(150000 - 3695 - 2 * 2789 - 4000);
  });
  it('le spese già spuntate stanno nel residuo e non si sottraggono due volte', () => {
    const d = withRules();
    d.overrides = [{ ruleId: 'tim', day: '2026-11-08', paid: true }];
    expect(available(d, '2026-11-09', 10)?.value).toBe(150000 - 2789);
  });
  it('senza saldo è null', () => {
    expect(available(emptyTestData(), '2026-11-06', 10)).toBeNull();
  });
});

describe('saldo', () => {
  it('senza saldo non calcola nulla', () => {
    const d = emptyTestData();
    d.oneOffs = [oneOff({})];
    expect(latestBalance(d)).toBeUndefined();
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

import { describe, expect, it } from 'vitest';
import { buildRrule, parseRrule, validateSpec, type RecurrenceSpec } from '../../src/domain/ruleBuilder';

const spec = (s: Partial<RecurrenceSpec>): RecurrenceSpec => ({ freq: 'monthly', interval: 1, ...s });

describe('buildRrule', () => {
  it('mensile a giorno fisso', () => {
    expect(buildRrule(spec({ monthDay: 24 }))).toBe('FREQ=MONTHLY;BYMONTHDAY=24');
  });
  it('ultimo giorno del mese', () => {
    expect(buildRrule(spec({ monthDay: 'last' }))).toBe('FREQ=MONTHLY;BYMONTHDAY=-1');
  });
  it('ogni 2 settimane di venerdì', () => {
    expect(buildRrule(spec({ freq: 'weekly', interval: 2, weekdays: [4] }))).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=FR');
  });
  it('solo certi mesi', () => {
    expect(buildRrule(spec({ monthDay: 24, months: [2, 4, 6] }))).toBe('FREQ=MONTHLY;BYMONTHDAY=24;BYMONTH=2,4,6');
  });
  it('certe settimane del mese', () => {
    expect(buildRrule(spec({ weekdays: [0], weekOfMonth: [1] }))).toBe('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1');
  });
  it('annuale e giornaliera', () => {
    expect(buildRrule(spec({ freq: 'yearly', monthDay: 1, months: [3] }))).toBe('FREQ=YEARLY;BYMONTHDAY=1;BYMONTH=3');
    expect(buildRrule(spec({ freq: 'daily', interval: 3 }))).toBe('FREQ=DAILY;INTERVAL=3');
  });
});

describe('parseRrule', () => {
  it.each([
    'FREQ=MONTHLY;BYMONTHDAY=24',
    'FREQ=MONTHLY;BYMONTHDAY=-1',
    'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR',
    'FREQ=MONTHLY;BYMONTHDAY=24;BYMONTH=2,4,6',
    'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1',
  ])('round-trip di %s', (r) => {
    expect(buildRrule(parseRrule(r))).toBe(r);
  });
});

describe('validateSpec', () => {
  it('giorno 29-31 non esiste nel costruttore', () => {
    expect(validateSpec(spec({ monthDay: 31 }))).not.toBeNull();
    expect(validateSpec(spec({ monthDay: 28 }))).toBeNull();
    expect(validateSpec(spec({ monthDay: 'last' }))).toBeNull();
  });
  it('intervallo minimo 1', () => {
    expect(validateSpec(spec({ monthDay: 1, interval: 0 }))).not.toBeNull();
  });
  it('settimanale richiede almeno un giorno', () => {
    expect(validateSpec(spec({ freq: 'weekly' }))).not.toBeNull();
  });
  it('mensile richiede un giorno oppure settimana+giorno', () => {
    expect(validateSpec(spec({}))).not.toBeNull();
  });
});

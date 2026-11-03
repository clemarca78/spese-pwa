import { describe, expect, it } from 'vitest';
import { expandRule } from '../../src/domain/recurrence';
import type { Rule } from '../../src/domain/types';

const rule = (rrule: string, extra: Partial<Rule> = {}): Rule => ({
  id: 'r1', name: 'x', kind: 'expense', amount: 1000, variable: false,
  rrule, start: '2026-01-01', active: true, ...extra,
});

describe('expandRule', () => {
  it('mensile al giorno 24', () => {
    expect(expandRule(rule('FREQ=MONTHLY;BYMONTHDAY=24'), '2026-11-01', '2027-01-31'))
      .toEqual(['2026-11-24', '2026-12-24', '2027-01-24']);
  });
  it('ultimo giorno del mese non salta i mesi corti', () => {
    expect(expandRule(rule('FREQ=MONTHLY;BYMONTHDAY=-1'), '2027-02-01', '2027-03-31'))
      .toEqual(['2027-02-28', '2027-03-31']);
  });
  it('solo certi mesi', () => {
    expect(expandRule(rule('FREQ=MONTHLY;BYMONTHDAY=24;BYMONTH=2,4,6'), '2026-01-01', '2026-12-31'))
      .toEqual(['2026-02-24', '2026-04-24', '2026-06-24']);
  });
  it('ogni 2 settimane di venerdì', () => {
    expect(expandRule(rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=FR', { start: '2026-11-06' }), '2026-11-01', '2026-12-10'))
      .toEqual(['2026-11-06', '2026-11-20', '2026-12-04']);
  });
  it('settimanale a cavallo dell\'ora legale non sposta i giorni', () => {
    expect(expandRule(rule('FREQ=WEEKLY;BYDAY=SU'), '2026-03-15', '2026-04-05'))
      .toEqual(['2026-03-15', '2026-03-22', '2026-03-29', '2026-04-05']);
  });
  it('primo lunedì del mese', () => {
    expect(expandRule(rule('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1'), '2026-11-01', '2026-12-31'))
      .toEqual(['2026-11-02', '2026-12-07']);
  });
  it('rispetta la fine della regola', () => {
    expect(expandRule(rule('FREQ=MONTHLY;BYMONTHDAY=24', { end: '2026-11-30' }), '2026-11-01', '2027-01-31'))
      .toEqual(['2026-11-24']);
  });
  it('start dopo l\'intervallo e regola inattiva danno []', () => {
    expect(expandRule(rule('FREQ=MONTHLY;BYMONTHDAY=24', { start: '2030-01-01' }), '2026-11-01', '2026-12-31')).toEqual([]);
    expect(expandRule(rule('FREQ=MONTHLY;BYMONTHDAY=24', { active: false }), '2026-11-01', '2026-12-31')).toEqual([]);
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  ImportError, backupDue, emptyData, exportJson, mergeRules, parseImport, parseRulesFile,
} from '../../src/storage/backup';
import { openRepo } from '../../src/storage/repo';
import type { Rule } from '../../src/domain/types';

const rule = (extra: Partial<Rule> = {}): Rule => ({
  id: 'r1', name: 'mutuo', kind: 'expense', amount: 60000, variable: false,
  rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', start: '2026-01-01', active: true, ...extra,
});

describe('parseImport', () => {
  it('round-trip senza perdita', () => {
    const d = emptyData();
    d.rules = [rule()];
    d.balances = [{ value: 100, day: '2026-11-03' }];
    expect(parseImport(exportJson(d))).toEqual(d);
  });
  it('rifiuta JSON non valido', () => {
    expect(() => parseImport('{non json')).toThrow(ImportError);
  });
  it('rifiuta una versione diversa', () => {
    const d = { ...emptyData(), schemaVersion: 2 };
    expect(() => parseImport(JSON.stringify(d))).toThrow(/versione/);
  });
  it('rifiuta struttura incompleta e importi non interi', () => {
    const noRules: Record<string, unknown> = { ...emptyData() };
    delete noRules.rules;
    expect(() => parseImport(JSON.stringify(noRules))).toThrow(ImportError);
    const d = emptyData();
    d.rules = [rule({ amount: 10.5 })];
    expect(() => parseImport(JSON.stringify(d))).toThrow(ImportError);
  });
  it('un import fallito non tocca i dati salvati', async () => {
    const repo = await openRepo('t-import-fail');
    const d = emptyData();
    d.balances = [{ value: 5, day: '2026-11-03' }];
    await repo.save(d);
    try {
      parseImport('{rotto');
    } catch {
      /* atteso */
    }
    expect(await repo.load()).toEqual(d);
  });
});

describe('validazione robusta', () => {
  const withRule = (extra: object) => JSON.stringify({ type: 'rules', schemaVersion: 1, rules: [{ ...rule(), ...extra }] });
  it('rifiuta una ricorrenza illeggibile', () => {
    expect(() => parseRulesFile(withRule({ rrule: 'FREQ=MONTLY' }))).toThrow(ImportError);
    const d = emptyData();
    d.rules = [rule({ rrule: 'garbage' })];
    expect(() => parseImport(exportJson(d))).toThrow(ImportError);
  });
  it('rifiuta il giorno 29-31 (salterebbe i mesi corti)', () => {
    expect(() => parseRulesFile(withRule({ rrule: 'FREQ=MONTHLY;BYMONTHDAY=31' }))).toThrow(ImportError);
    expect(() => parseRulesFile(withRule({ rrule: 'FREQ=MONTHLY;BYMONTHDAY=-1' }))).not.toThrow();
  });
  it('rifiuta una voce una tantum senza nome o tipo', () => {
    const d = emptyData();
    d.oneOffs = [{ id: 'o', kind: 'expense', amount: 1, day: '2026-11-01', paid: false } as never];
    expect(() => parseImport(exportJson(d))).toThrow(ImportError);
  });
  it('rifiuta impostazioni incomplete', () => {
    const d = { ...emptyData(), settings: {} };
    expect(() => parseImport(JSON.stringify(d))).toThrow(ImportError);
  });
});

describe('file regole', () => {
  const file = (o: object) => JSON.stringify({ type: 'rules', schemaVersion: 1, rules: [rule()], ...o });
  it('parse valido', () => {
    expect(parseRulesFile(file({ varieDailyDefault: 4600 }))).toEqual({ rules: [rule()], varieDailyDefault: 4600 });
  });
  it('rifiuta un tipo diverso', () => {
    expect(() => parseRulesFile(file({ type: 'backup' }))).toThrow(ImportError);
  });
  it('mergeRules fa upsert per id senza toccare saldi e override', () => {
    const d = emptyData();
    d.rules = [rule()];
    d.balances = [{ value: 1, day: '2026-11-03' }];
    d.overrides = [{ ruleId: 'r1', day: '2026-11-01', paid: true }];
    const out = mergeRules(d, [rule({ amount: 60000 }), rule({ id: 'r2', name: 'nuova' })], 4600);
    expect(out.rules).toHaveLength(2);
    expect(out.rules.find((r) => r.id === 'r1')?.amount).toBe(60000);
    expect(out.balances).toEqual(d.balances);
    expect(out.overrides).toEqual(d.overrides);
    expect(out.settings.varieDailyDefault).toBe(4600);
  });
});

describe('backupDue', () => {
  const s = (lastBackupAt?: string) => ({ ...emptyData().settings, lastBackupAt });
  const now = '2026-11-15T12:00:00.000Z';
  it('senza backup è dovuto', () => expect(backupDue(s(), now)).toBe(true));
  it('13 giorni fa no', () => expect(backupDue(s('2026-11-02T12:00:00.000Z'), now)).toBe(false));
  it('14 giorni fa sì', () => expect(backupDue(s('2026-11-01T12:00:00.000Z'), now)).toBe(true));
});

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  ImportError, backupDue, emptyData, exportJson, exportRulesJson, mergeRules, parseImport, parseRulesFile,
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
    expect(() => parseRulesFile(withRule({ autoDebit: 'si' as never }))).toThrow(ImportError);
    expect(() => parseRulesFile(withRule({ autoDebit: true }))).not.toThrow();
    expect(() => parseRulesFile(withRule({ monthAmounts: { '2': 100 } }))).not.toThrow();
    expect(() => parseRulesFile(withRule({ monthAmounts: { '13': 100 } }))).toThrow(ImportError);
    expect(() => parseRulesFile(withRule({ monthAmounts: { '2': 1.5 } }))).toThrow(ImportError);
  });
  it('rifiuta una voce una tantum senza nome o tipo', () => {
    const d = emptyData();
    d.oneOffs = [{ id: 'o', kind: 'expense', amount: 1, day: '2026-11-01', paid: false } as never];
    expect(() => parseImport(exportJson(d))).toThrow(ImportError);
  });
  it('rifiuta un giorno dello stipendio fuori da 1-28', () => {
    const d = emptyData();
    d.settings.payDay = 31;
    expect(() => parseImport(JSON.stringify(d))).toThrow(ImportError);
    d.settings.payDay = 10;
    expect(() => parseImport(JSON.stringify(d))).not.toThrow();
  });
  it('rifiuta impostazioni incomplete', () => {
    const d = { ...emptyData(), settings: {} };
    expect(() => parseImport(JSON.stringify(d))).toThrow(ImportError);
  });
});

describe('esporta regole', () => {
  it('il file esportato si reimporta identico (regole e spese varie)', () => {
    const d = emptyData();
    d.rules = [rule({ id: 'a', autoDebit: true }), rule({ id: 'b', name: 'Altra', kind: 'income', end: '2027-01-01' })];
    d.settings.varieDailyDefault = 4600;
    d.balances = [{ value: 1, day: '2026-11-01' }];
    const text = exportRulesJson(d);
    expect(JSON.parse(text)).toMatchObject({ type: 'rules', schemaVersion: 1 });
    expect(JSON.parse(text).balances).toBeUndefined(); // niente saldi né voci: solo regole
    expect(parseRulesFile(text)).toEqual({ rules: d.rules, varieDailyDefault: 4600 });
  });
});

describe('gruppi di regole', () => {
  const withGroups = (extra: object) => JSON.stringify({ ...emptyData(), ...extra });
  it('il backup accetta i gruppi e rifiuta quelli malformati', () => {
    expect(() => parseImport(withGroups({ groups: [{ id: 'g1', name: 'Bollette' }], rules: [rule({ groupId: 'g1' })] }))).not.toThrow();
    expect(() => parseImport(withGroups({ groups: [{ id: 'g1' }] }))).toThrow(ImportError);
    expect(() => parseImport(withGroups({ groups: 'x' }))).toThrow(ImportError);
    expect(() => parseImport(withGroups({ rules: [rule({ groupId: 5 as never })] }))).toThrow(ImportError);
  });
  it('esporta e reimporta le regole insieme ai loro gruppi', () => {
    const d = emptyData();
    d.groups = [{ id: 'g1', name: 'Bollette' }];
    d.rules = [rule({ id: 'a', groupId: 'g1' })];
    const text = exportRulesJson(d);
    const parsed = parseRulesFile(text);
    expect(parsed.groups).toEqual([{ id: 'g1', name: 'Bollette' }]);
    const merged = mergeRules(emptyData(), parsed.rules, parsed.varieDailyDefault, parsed.groups);
    expect(merged.groups).toEqual([{ id: 'g1', name: 'Bollette' }]);
    expect(merged.rules[0].groupId).toBe('g1');
  });
  it('senza gruppi il file di regole non ha la chiave groups', () => {
    const d = emptyData();
    d.rules = [rule({ id: 'a' })];
    expect(JSON.parse(exportRulesJson(d)).groups).toBeUndefined();
  });
  it('un file con gruppi malformati viene rifiutato', () => {
    expect(() => parseRulesFile(JSON.stringify({ type: 'rules', schemaVersion: 1, rules: [rule()], groups: [{ name: 'x' }] }))).toThrow(ImportError);
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

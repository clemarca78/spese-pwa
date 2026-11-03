import type { AppData, Rule } from '../../src/domain/types';

export function emptyTestData(): AppData {
  return {
    schemaVersion: 1,
    updatedAt: '2026-11-03T00:00:00.000Z',
    rules: [], overrides: [], oneOffs: [], balances: [],
    settings: { varieEnabled: false, varieDailyDefault: 0, backupReminderDays: 14 },
  };
}

export function mkRule(extra: Partial<Rule> = {}): Rule {
  return {
    id: 'r1', name: 'regola', kind: 'expense', amount: 1000, variable: false,
    rrule: 'FREQ=MONTHLY;BYMONTHDAY=24', start: '2026-01-01', active: true, ...extra,
  };
}

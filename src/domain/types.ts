export type Day = string; // 'YYYY-MM-DD'
export type Cents = number; // intero
export type Kind = 'income' | 'expense';

export interface Rule {
  id: string;
  name: string;
  kind: Kind;
  amount: Cents;
  variable: boolean;
  /** senza DTSTART, es. 'FREQ=MONTHLY;BYMONTHDAY=24' */
  rrule: string;
  start: Day;
  end?: Day;
  active: boolean;
}
export interface Override {
  ruleId: string;
  day: Day;
  amount?: Cents;
  paid?: boolean;
  skipped?: boolean;
  pendingDebit?: boolean;
}
export interface OneOff {
  id: string;
  name: string;
  kind: Kind;
  amount: Cents;
  day: Day;
  paid: boolean;
}
export interface Balance {
  value: Cents;
  day: Day;
}
export interface Settings {
  varieEnabled: boolean;
  varieDailyDefault: Cents;
  backupReminderDays: number;
  lastBackupAt?: string;
  /** Giorno del mese in cui arriva lo stipendio (1-28, default 10). */
  payDay?: number;
}
export interface AppData {
  schemaVersion: 1;
  updatedAt: string;
  rules: Rule[];
  overrides: Override[];
  oneOffs: OneOff[];
  balances: Balance[];
  settings: Settings;
}
export interface Item {
  key: string;
  ruleId?: string;
  oneOffId?: string;
  name: string;
  kind: Kind;
  day: Day;
  amount: Cents;
  estimated: boolean;
  paid: boolean;
  skipped: boolean;
  pendingDebit: boolean;
}
export interface ForecastPoint {
  day: Day;
  balance: Cents;
}

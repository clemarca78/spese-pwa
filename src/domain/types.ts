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
  /** Addebito (uscita) o accredito (entrata) automatico sul conto: alla data risulta già pagato/incassato. */
  autoDebit?: boolean;
}
export interface Override {
  ruleId: string;
  day: Day;
  amount?: Cents;
  paid?: boolean;
  /** Giorno in cui hai spuntato "pagata": conta per il residuo al posto della scadenza. */
  paidOn?: Day;
  /** Istante preciso della spunta: serve a capire se è successa prima o dopo l'ultimo saldo. */
  paidAt?: string;
  skipped?: boolean;
}
export interface OneOff {
  id: string;
  name: string;
  kind: Kind;
  amount: Cents;
  day: Day;
  paid: boolean;
  paidOn?: Day;
  paidAt?: string;
}
export interface Balance {
  value: Cents;
  day: Day;
  /** Istante in cui hai inserito il saldo (assente nei saldi vecchi). */
  at?: string;
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
  paidOn?: Day;
  paidAt?: string;
  skipped: boolean;
  autoDebit?: boolean;
  /** Automatica e a importo fisso: l'importo non si modifica dall'elenco. */
  locked?: boolean;
}
export interface ForecastPoint {
  day: Day;
  balance: Cents;
}

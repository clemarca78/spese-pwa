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
  /** Importo per mese ('1'-'12'), ad esempio per le bollette: ha la precedenza su `amount` e sulla media. */
  monthAmounts?: Record<string, Cents>;
  /** Gruppo scelto dall'utente (vedi AppData.groups). Senza gruppo, la regola va nei gruppi automatici. */
  groupId?: string;
  /** Per cosa sono i soldi (vedi AppData.categories). Indipendente dal gruppo. */
  categoryId?: string;
}
export interface Category {
  id: string;
  name: string;
}
/** Spesa catturata da una notifica, in attesa di conferma. */
export interface Capture {
  id: string;
  name: string;
  amount: Cents;
  kind: Kind;
  day: Day;
  time?: string;
  card?: string;
  source?: string;
  createdAt: string;
}
export interface RuleGroup {
  id: string;
  name: string;
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
  categoryId?: string;
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
  /** Regola di entrata dello stipendio: se scelta, il riferimento di "Usabile" è la sua prossima occorrenza non ancora arrivata. */
  salaryRuleId?: string;
  /** Somma da tenere sempre sul conto: il calcolo dell'accantonamento non scende sotto questa cifra. */
  savingsMargin?: Cents;
}
export interface AppData {
  schemaVersion: 1;
  updatedAt: string;
  rules: Rule[];
  groups?: RuleGroup[];
  /** I gruppi predefiniti (Entrate, Uscite con addebito automatico, Altre uscite) sono stati creati. */
  defaultGroupsSeeded?: boolean;
  categories?: Category[];
  /** Le categorie standard sono state create. */
  defaultCategoriesSeeded?: boolean;
  /** Spese catturate dalle notifiche, da confermare. */
  captures?: Capture[];
  /** Ultimi pagamenti già visti (confermati o scartati), per non rientrare due volte. */
  captureLog?: Array<{ amount: Cents; day: Day; time?: string }>;
  /** Esercente (chiave) -> categoria scelta l'ultima volta. */
  merchantCategories?: Record<string, string>;
  /** Obiettivo di risparmio (es. la comunione): importo da avere entro il giorno indicato. */
  goal?: SavingsGoal;
  overrides: Override[];
  oneOffs: OneOff[];
  balances: Balance[];
  settings: Settings;
}
export interface SavingsGoal {
  name: string;
  amount: Cents;
  day: Day;
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
  categoryId?: string;
  /** Importo fisso (regola non variabile o voce inserita): non si modifica dall'elenco. */
  locked?: boolean;
}
export interface ForecastPoint {
  day: Day;
  balance: Cents;
}

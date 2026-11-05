import { RRule } from 'rrule';
import type { AppData, Cents, Rule, Settings } from '../domain/types';

export class ImportError extends Error {}

export function emptyData(): AppData {
  return {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    rules: [],
    overrides: [],
    oneOffs: [],
    balances: [],
    settings: { varieEnabled: false, varieDailyDefault: 0, backupReminderDays: 14 },
  };
}

export function exportJson(d: AppData): string {
  return JSON.stringify(d, null, 2);
}

type Obj = Record<string, unknown>;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(msg: string): never {
  throw new ImportError(msg);
}
function int(v: unknown, what: string) {
  if (!Number.isInteger(v)) fail(`${what}: importo non intero`);
}
function day(v: unknown, what: string) {
  if (typeof v !== 'string' || !DAY_RE.test(v)) fail(`${what}: data non valida`);
}
function arr(v: unknown, what: string): unknown[] {
  return Array.isArray(v) ? v : fail(`${what} mancante`);
}
function obj(v: unknown, what: string): Obj {
  return isObj(v) ? v : fail(`${what} non valido`);
}

function checkRule(r: unknown): Rule {
  const o = obj(r, 'regola');
  const name = String(o.name);
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.rrule !== 'string') fail('regola incompleta');
  if (o.kind !== 'income' && o.kind !== 'expense') fail('regola: tipo non valido');
  int(o.amount, `regola ${name}`);
  day(o.start, `regola ${name}`);
  if (o.end !== undefined) day(o.end, `regola ${name}`);
  if (typeof o.variable !== 'boolean' || typeof o.active !== 'boolean') fail('regola incompleta');
  if (o.autoDebit !== undefined && typeof o.autoDebit !== 'boolean') fail(`regola ${name}: addebito automatico non valido`);
  checkRrule(o.rrule as string, name);
  return o as unknown as Rule;
}

function checkRrule(rrule: string, name: string) {
  let opts;
  try {
    opts = RRule.parseString(rrule);
    new RRule(opts);
  } catch {
    return fail(`regola ${name}: ricorrenza non valida`);
  }
  const md = ([] as number[]).concat(opts.bymonthday ?? []);
  if (md.some((d) => d > 28)) fail(`regola ${name}: i giorni 29-31 saltano i mesi corti, usa l'ultimo giorno (BYMONTHDAY=-1)`);
}

function parseJson(text: string): Obj {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return fail('file non valido: JSON illeggibile');
  }
  return obj(v, 'file');
}

function checkVersion(o: Obj) {
  if (o.schemaVersion !== 1) fail(`versione dello schema non supportata (${String(o.schemaVersion)})`);
}

/** Valida e restituisce i dati; non scrive mai nulla. */
export function parseImport(text: string): AppData {
  const o = parseJson(text);
  checkVersion(o);
  arr(o.rules, 'regole').forEach(checkRule);
  arr(o.overrides, 'override').forEach((v) => {
    const x = obj(v, 'override');
    if (typeof x.ruleId !== 'string') fail('override non valido');
    day(x.day, 'override');
    if (x.amount !== undefined) int(x.amount, 'override');
  });
  arr(o.oneOffs, 'voci una tantum').forEach((v) => {
    const x = obj(v, 'voce');
    if (typeof x.id !== 'string' || typeof x.name !== 'string') fail('voce non valida');
    if (x.kind !== 'income' && x.kind !== 'expense') fail('voce: tipo non valido');
    if (typeof x.paid !== 'boolean') fail('voce non valida');
    int(x.amount, 'voce');
    day(x.day, 'voce');
  });
  arr(o.balances, 'saldi').forEach((v) => {
    const x = obj(v, 'saldo');
    int(x.value, 'saldo');
    day(x.day, 'saldo');
  });
  const st = obj(o.settings, 'impostazioni');
  if (typeof st.varieEnabled !== 'boolean') fail('impostazioni incomplete');
  int(st.varieDailyDefault, 'impostazioni');
  if (!Number.isInteger(st.backupReminderDays)) fail('impostazioni incomplete');
  if (typeof o.updatedAt !== 'string') fail('updatedAt mancante');
  return o as unknown as AppData;
}

export function parseRulesFile(text: string): { rules: Rule[]; varieDailyDefault?: Cents } {
  const o = parseJson(text);
  if (o.type !== 'rules') fail('non è un file di regole');
  checkVersion(o);
  const rules = arr(o.rules, 'regole').map(checkRule);
  if (o.varieDailyDefault === undefined) return { rules };
  int(o.varieDailyDefault, 'spese varie');
  return { rules, varieDailyDefault: o.varieDailyDefault as number };
}

export function mergeRules(d: AppData, rules: Rule[], varieDailyDefault?: Cents): AppData {
  const byId = new Map(d.rules.map((r) => [r.id, r]));
  for (const r of rules) byId.set(r.id, r);
  return {
    ...d,
    rules: [...byId.values()],
    settings: varieDailyDefault !== undefined ? { ...d.settings, varieDailyDefault } : d.settings,
  };
}

export function backupDue(s: Settings, nowIso: string): boolean {
  if (!s.lastBackupAt) return true;
  const days = (Date.parse(nowIso) - Date.parse(s.lastBackupAt)) / 86_400_000;
  return days >= s.backupReminderDays;
}

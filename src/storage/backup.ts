import { RRule } from 'rrule';
import type { AppData, Cents, Rule, RuleGroup, Settings } from '../domain/types';

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
  if (o.groupId !== undefined && typeof o.groupId !== 'string') fail(`regola ${name}: gruppo non valido`);
  if (o.autoDebit !== undefined && typeof o.autoDebit !== 'boolean') fail(`regola ${name}: addebito automatico non valido`);
  if (o.monthAmounts !== undefined) {
    const m = obj(o.monthAmounts, `regola ${name}: importi per mese`);
    for (const [k, v] of Object.entries(m)) {
      if (!/^([1-9]|1[0-2])$/.test(k)) fail(`regola ${name}: mese ${k} non valido`);
      int(v, `regola ${name}`);
    }
  }
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

function checkGroups(v: unknown): RuleGroup[] {
  return arr(v, 'gruppi').map((g) => {
    const x = obj(g, 'gruppo');
    if (typeof x.id !== 'string' || typeof x.name !== 'string' || !x.name.trim()) fail('gruppo non valido');
    return { id: x.id, name: x.name };
  });
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
  if (o.groups !== undefined) checkGroups(o.groups);
  arr(o.overrides, 'override').forEach((v) => {
    const x = obj(v, 'override');
    if (typeof x.ruleId !== 'string') fail('override non valido');
    day(x.day, 'override');
    if (x.amount !== undefined) int(x.amount, 'override');
    if (x.paidOn !== undefined) day(x.paidOn, 'override');
    if (x.paidAt !== undefined && typeof x.paidAt !== 'string') fail('override non valido');
  });
  arr(o.oneOffs, 'voci una tantum').forEach((v) => {
    const x = obj(v, 'voce');
    if (typeof x.id !== 'string' || typeof x.name !== 'string') fail('voce non valida');
    if (x.kind !== 'income' && x.kind !== 'expense') fail('voce: tipo non valido');
    if (typeof x.paid !== 'boolean') fail('voce non valida');
    int(x.amount, 'voce');
    day(x.day, 'voce');
    if (x.paidOn !== undefined) day(x.paidOn, 'voce');
    if (x.paidAt !== undefined && typeof x.paidAt !== 'string') fail('voce non valida');
  });
  arr(o.balances, 'saldi').forEach((v) => {
    const x = obj(v, 'saldo');
    int(x.value, 'saldo');
    day(x.day, 'saldo');
    if (x.at !== undefined && typeof x.at !== 'string') fail('saldo non valido');
  });
  const st = obj(o.settings, 'impostazioni');
  if (typeof st.varieEnabled !== 'boolean') fail('impostazioni incomplete');
  int(st.varieDailyDefault, 'impostazioni');
  if (!Number.isInteger(st.backupReminderDays)) fail('impostazioni incomplete');
  if (st.payDay !== undefined && !(Number.isInteger(st.payDay) && (st.payDay as number) >= 1 && (st.payDay as number) <= 28)) fail('impostazioni: giorno dello stipendio non valido');
  if (typeof o.updatedAt !== 'string') fail('updatedAt mancante');
  return o as unknown as AppData;
}

export function parseRulesFile(text: string): { rules: Rule[]; varieDailyDefault?: Cents; groups?: RuleGroup[] } {
  const o = parseJson(text);
  if (o.type !== 'rules') fail('non è un file di regole');
  checkVersion(o);
  const rules = arr(o.rules, 'regole').map(checkRule);
  const groups = o.groups === undefined ? undefined : checkGroups(o.groups);
  if (o.varieDailyDefault !== undefined) int(o.varieDailyDefault, 'spese varie');
  return {
    rules,
    ...(o.varieDailyDefault !== undefined ? { varieDailyDefault: o.varieDailyDefault as number } : {}),
    ...(groups ? { groups } : {}),
  };
}

/** Solo le regole e le spese varie: si reimporta con "Importa regole" su un altro telefono o dopo un reset. */
export function exportRulesJson(d: AppData): string {
  const groups = d.groups ?? [];
  return JSON.stringify(
    { type: 'rules', schemaVersion: 1, rules: d.rules, varieDailyDefault: d.settings.varieDailyDefault, ...(groups.length ? { groups } : {}) },
    null,
    2,
  );
}

export function mergeRules(d: AppData, rules: Rule[], varieDailyDefault?: Cents, groups?: RuleGroup[]): AppData {
  const byId = new Map(d.rules.map((r) => [r.id, r]));
  for (const r of rules) byId.set(r.id, r);
  const groupsById = new Map((d.groups ?? []).map((g) => [g.id, g]));
  for (const g of groups ?? []) groupsById.set(g.id, g);
  return {
    ...d,
    rules: [...byId.values()],
    ...(groupsById.size ? { groups: [...groupsById.values()] } : {}),
    settings: varieDailyDefault !== undefined ? { ...d.settings, varieDailyDefault } : d.settings,
  };
}

export function backupDue(s: Settings, nowIso: string): boolean {
  if (!s.lastBackupAt) return true;
  const days = (Date.parse(nowIso) - Date.parse(s.lastBackupAt)) / 86_400_000;
  return days >= s.backupReminderDays;
}

import { signal } from '@preact/signals';
import { todayLocal } from '../domain/days';
import type { AppData, Cents, Day, Item, OneOff, Override } from '../domain/types';
import { emptyData } from '../storage/backup';
import type { Repo } from '../storage/repo';

export const data = signal<AppData>(emptyData());
export const ready = signal(false);
export const syncStatus = signal<'idle' | 'syncing' | 'offline' | 'conflict' | 'error'>('idle');

let repoRef: Repo | null = null;
let syncHook: (() => void) | null = null;

/** Collegato dalla schermata Impostazioni / avvio: chiamato dopo ogni modifica. */
export function setSyncHook(fn: (() => void) | null) {
  syncHook = fn;
}

export function getRepo(): Repo | null {
  return repoRef;
}

export async function initStore(repo: Repo): Promise<void> {
  repoRef = repo;
  data.value = await repo.load();
  ready.value = true;
}

export async function mutate(fn: (d: AppData) => AppData): Promise<void> {
  const next: AppData = { ...fn(data.value), updatedAt: new Date().toISOString() };
  data.value = next;
  await repoRef?.save(next);
  syncHook?.();
}

export function addBalance(value: Cents, day: Day = todayLocal()): Promise<void> {
  return mutate((d) => ({ ...d, balances: [...d.balances.filter((b) => b.day !== day), { value, day, at: new Date().toISOString() }] }));
}

const dropUndefined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

function upsertOverride(d: AppData, item: Item, patch: Partial<Override>): AppData {
  const ruleId = item.ruleId as string;
  const rest = d.overrides.filter((o) => !(o.ruleId === ruleId && o.day === item.day));
  const prev = d.overrides.find((o) => o.ruleId === ruleId && o.day === item.day);
  return { ...d, overrides: [...rest, dropUndefined({ ...prev, ruleId, day: item.day, ...patch })] };
}

/** Giorno e istante del pagamento: l'istante dice se è avvenuto prima o dopo l'ultimo saldo. */
export const paidStamp = () => ({ paidOn: todayLocal(), paidAt: new Date().toISOString() });
const noStamp = { paidOn: undefined, paidAt: undefined };

export function setPaid(item: Item, paid: boolean): Promise<void> {
  const stamp = paid ? paidStamp() : noStamp;
  if (item.oneOffId) {
    return mutate((d) => ({
      ...d,
      oneOffs: d.oneOffs.map((o) => (o.id === item.oneOffId ? dropUndefined({ ...o, paid, ...stamp }) : o)),
    }));
  }
  return mutate((d) => upsertOverride(d, item, { paid, ...stamp }));
}

/** Scambio sincrono: se nel frattempo c'è stata una modifica locale non sovrascrive nulla. */
export async function applyRemote(remote: AppData, expectedLocalUpdatedAt: string): Promise<boolean> {
  if (data.value.updatedAt !== expectedLocalUpdatedAt) return false;
  data.value = remote;
  await repoRef?.save(remote);
  return true;
}

/** "Non dovuta / già sistemata": l'occorrenza esce da elenchi e calcoli. */
export function setSkipped(item: Item, skipped: boolean): Promise<void> {
  return mutate((d) => upsertOverride(d, item, { skipped }));
}

export function setItemAmount(item: Item, amount: Cents): Promise<void> {
  if (item.oneOffId) {
    return mutate((d) => ({ ...d, oneOffs: d.oneOffs.map((o) => (o.id === item.oneOffId ? { ...o, amount } : o)) }));
  }
  return mutate((d) => upsertOverride(d, item, { amount }));
}

const cleanName = (n: string) => n.trim();

export function addGroup(name: string): Promise<void> {
  return mutate((d) => ({ ...d, groups: [...(d.groups ?? []), { id: crypto.randomUUID(), name: cleanName(name) }] }));
}

export function renameGroup(id: string, name: string): Promise<void> {
  return mutate((d) => ({ ...d, groups: (d.groups ?? []).map((g) => (g.id === id ? { ...g, name: cleanName(name) } : g)) }));
}

/** Elimina il gruppo. Con `keepRules` le sue regole restano, senza gruppo; altrimenti spariscono con le loro correzioni. */
export function deleteGroup(id: string, keepRules = true): Promise<void> {
  return mutate((d) => {
    const doomed = new Set(keepRules ? [] : d.rules.filter((r) => r.groupId === id).map((r) => r.id));
    return {
      ...d,
      groups: (d.groups ?? []).filter((g) => g.id !== id),
      rules: d.rules
        .filter((r) => !doomed.has(r.id))
        .map((r) => {
          if (r.groupId !== id) return r;
          const { groupId: _drop, ...rest } = r;
          return rest;
        }),
      overrides: d.overrides.filter((o) => !doomed.has(o.ruleId)),
    };
  });
}

/** Sposta una regola in un altro gruppo; senza `groupId` la toglie dal gruppo. */
export function moveRuleToGroup(ruleId: string, groupId: string | undefined): Promise<void> {
  return mutate((d) => ({
    ...d,
    rules: d.rules.map((r) => {
      if (r.id !== ruleId) return r;
      const { groupId: _drop, ...rest } = r;
      return groupId ? { ...rest, groupId } : rest;
    }),
  }));
}

export function updateOneOff(id: string, patch: Partial<Omit<OneOff, 'id'>>): Promise<void> {
  return mutate((d) => ({ ...d, oneOffs: d.oneOffs.map((o) => (o.id === id ? dropUndefined({ ...o, ...patch }) : o)) }));
}

export function deleteOneOff(id: string): Promise<void> {
  return mutate((d) => ({ ...d, oneOffs: d.oneOffs.filter((o) => o.id !== id) }));
}

/** Elimina la regola e le correzioni (importi, spunte) fatte sulle sue occorrenze. */
export function deleteRule(id: string): Promise<void> {
  return mutate((d) => ({
    ...d,
    rules: d.rules.filter((r) => r.id !== id),
    overrides: d.overrides.filter((o) => o.ruleId !== id),
  }));
}

export function addOneOff(o: Omit<OneOff, 'id'>): Promise<void> {
  return mutate((d) => ({ ...d, oneOffs: [...d.oneOffs, { ...o, id: crypto.randomUUID() }] }));
}

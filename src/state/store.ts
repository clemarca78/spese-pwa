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
  return mutate((d) => ({ ...d, balances: [...d.balances.filter((b) => b.day !== day), { value, day }] }));
}

function upsertOverride(d: AppData, item: Item, patch: Partial<Override>): AppData {
  const ruleId = item.ruleId as string;
  const rest = d.overrides.filter((o) => !(o.ruleId === ruleId && o.day === item.day));
  const prev = d.overrides.find((o) => o.ruleId === ruleId && o.day === item.day);
  return { ...d, overrides: [...rest, { ...prev, ruleId, day: item.day, ...patch }] };
}

export function setPaid(item: Item, paid: boolean): Promise<void> {
  if (item.oneOffId) {
    return mutate((d) => ({ ...d, oneOffs: d.oneOffs.map((o) => (o.id === item.oneOffId ? { ...o, paid } : o)) }));
  }
  return mutate((d) => upsertOverride(d, item, { paid }));
}

/** Scambio sincrono: se nel frattempo c'è stata una modifica locale non sovrascrive nulla. */
export async function applyRemote(remote: AppData, expectedLocalUpdatedAt: string): Promise<boolean> {
  if (data.value.updatedAt !== expectedLocalUpdatedAt) return false;
  data.value = remote;
  await repoRef?.save(remote);
  return true;
}

export function setPendingDebit(item: Item, pendingDebit: boolean): Promise<void> {
  return mutate((d) => upsertOverride(d, item, { pendingDebit }));
}

export function setItemAmount(item: Item, amount: Cents): Promise<void> {
  if (item.oneOffId) {
    return mutate((d) => ({ ...d, oneOffs: d.oneOffs.map((o) => (o.id === item.oneOffId ? { ...o, amount } : o)) }));
  }
  return mutate((d) => upsertOverride(d, item, { amount }));
}

export function updateOneOff(id: string, patch: Partial<Omit<OneOff, 'id'>>): Promise<void> {
  return mutate((d) => ({ ...d, oneOffs: d.oneOffs.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
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

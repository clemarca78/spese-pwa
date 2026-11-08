import { latestBalance, paidAfterBalance } from './calc';
import { addDays } from './days';
import { buildItems } from './items';
import type { AppData, Cents, Day, ForecastPoint, Item } from './types';
import { estimateDailyVarie } from './varie';

export interface PlannedItem {
  /** Giorno in cui la voce pesa sulla previsione. */
  day: Day;
  item: Item;
}

/** Voci che muovono il saldo dopo l'ultimo saldo inserito, fino a `horizonDays` giorni. */
export function plannedItems(data: AppData, horizonDays: number): PlannedItem[] {
  const bal = latestBalance(data);
  if (!bal) return [];
  const firstDay = addDays(bal.day, 1);
  const out: PlannedItem[] = [];
  for (const item of buildItems(data, firstDay, addDays(bal.day, horizonDays))) {
    if (!item.skipped) out.push({ day: item.day, item });
  }
  // voci con scadenza passata ma pagate dopo il saldo: il saldo non le contiene, pesano sul primo giorno futuro
  for (const item of buildItems(data, addDays(bal.day, -366), bal.day)) {
    if (!item.paid || item.skipped || !item.paidOn || !paidAfterBalance(item, bal)) continue;
    out.push({ day: firstDay, item });
  }
  return out;
}

/** Saldo previsto giorno per giorno a partire dall'ultimo saldo inserito. */
export function forecast(data: AppData, horizonDays: number): ForecastPoint[] {
  const bal = latestBalance(data);
  if (!bal) return [];
  const byDay = new Map<Day, Cents>();
  for (const { day, item } of plannedItems(data, horizonDays)) {
    byDay.set(day, (byDay.get(day) ?? 0) + (item.kind === 'income' ? item.amount : -item.amount));
  }
  const varie = data.settings.varieEnabled ? estimateDailyVarie(data) : 0;
  const points: ForecastPoint[] = [{ day: bal.day, balance: bal.value }];
  let cur = bal.value;
  for (let i = 1; i <= horizonDays; i++) {
    const day = addDays(bal.day, i);
    cur += (byDay.get(day) ?? 0) - varie;
    points.push({ day, balance: cur });
  }
  return points;
}

export interface MonthFlow {
  /** 'YYYY-MM' */
  month: string;
  income: Cents;
  expense: Cents;
  /** Spese varie stimate (zero se disattivate). */
  varie: Cents;
  items: PlannedItem[];
}

/** Entrate e uscite previste per mese, con le stesse voci del grafico del saldo. */
export function monthlyFlows(data: AppData, horizonDays: number): MonthFlow[] {
  const bal = latestBalance(data);
  if (!bal) return [];
  const varie = data.settings.varieEnabled ? estimateDailyVarie(data) : 0;
  const byMonth = new Map<string, MonthFlow>();
  const slot = (month: string) => {
    let m = byMonth.get(month);
    if (!m) byMonth.set(month, (m = { month, income: 0, expense: 0, varie: 0, items: [] }));
    return m;
  };
  for (let i = 1; i <= horizonDays; i++) slot(addDays(bal.day, i).slice(0, 7)).varie += varie;
  for (const p of plannedItems(data, horizonDays).sort((a, b) => a.day.localeCompare(b.day) || a.item.name.localeCompare(b.item.name))) {
    const m = slot(p.day.slice(0, 7));
    if (p.item.kind === 'income') m.income += p.item.amount;
    else m.expense += p.item.amount;
    m.items.push(p);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function firstBelow(points: ForecastPoint[], threshold: Cents): ForecastPoint | undefined {
  return points.find((p) => p.balance < threshold);
}

/** Cali giornalieri più grandi (delta negativo), dal più grande. */
export function biggestDrops(points: ForecastPoint[], n: number): { day: Day; delta: Cents }[] {
  const drops: { day: Day; delta: Cents }[] = [];
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].balance - points[i - 1].balance;
    if (delta < 0) drops.push({ day: points[i].day, delta });
  }
  return drops.sort((a, b) => a.delta - b.delta).slice(0, n);
}

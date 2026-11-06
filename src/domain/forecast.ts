import { latestBalance } from './calc';
import { addDays } from './days';
import { buildItems } from './items';
import type { AppData, Cents, Day, ForecastPoint } from './types';
import { estimateDailyVarie } from './varie';

/** Saldo previsto giorno per giorno a partire dall'ultimo saldo inserito. */
export function forecast(data: AppData, horizonDays: number): ForecastPoint[] {
  const bal = latestBalance(data);
  if (!bal) return [];
  const end = addDays(bal.day, horizonDays);
  const byDay = new Map<Day, Cents>();
  for (const it of buildItems(data, addDays(bal.day, 1), end)) {
    if (it.skipped) continue;
    byDay.set(it.day, (byDay.get(it.day) ?? 0) + (it.kind === 'income' ? it.amount : -it.amount));
  }
  const firstDay = addDays(bal.day, 1);
  // voci con scadenza passata ma pagate dopo il saldo: il saldo non le contiene, pesano sul primo giorno futuro
  for (const it of buildItems(data, addDays(bal.day, -366), bal.day)) {
    if (!it.paid || it.skipped || !it.paidOn || it.paidOn <= bal.day) continue;
    byDay.set(firstDay, (byDay.get(firstDay) ?? 0) + (it.kind === 'income' ? it.amount : -it.amount));
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

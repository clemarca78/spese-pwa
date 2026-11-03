import { endOfMonth } from './days';
import type { Cents, Day, ForecastPoint } from './types';

export interface SimResult {
  verdict: 'ok' | 'tight' | 'below';
  minBalance: Cents;
  minDay: Day;
  endOfMonthBalance: Cents;
  withPurchase: ForecastPoint[];
}

export interface Feasibility {
  first?: Day;
  ranges: Array<[Day, Day]>;
  shortfall?: Cents;
  baselineBelowMargin: boolean;
}

/** Spesa di `amount` il giorno `day`: abbassa di `amount` tutti i giorni da `day` in poi. */
export function simulateAt(points: ForecastPoint[], amount: Cents, day: Day, margin: Cents): SimResult {
  const withPurchase = points.map((p) => (p.day >= day ? { ...p, balance: p.balance - amount } : p));
  const after = withPurchase.filter((p) => p.day >= day);
  const lowest = after.reduce((m, p) => (p.balance < m.balance ? p : m), after[0] ?? withPurchase[0]);
  const eom = endOfMonth(day);
  const inMonth = withPurchase.filter((p) => p.day <= eom);
  const endOfMonthBalance = (inMonth.at(-1) ?? withPurchase.at(-1)!).balance;
  const verdict =
    lowest.balance < margin ? 'below' : lowest.balance - margin < 0.1 * amount ? 'tight' : 'ok';
  return { verdict, minBalance: lowest.balance, minDay: lowest.day, endOfMonthBalance, withPurchase };
}

/** Date in cui la spesa regge: min(B(t), t >= d) - amount >= margin (spec §6.1). */
export function findFeasible(
  points: ForecastPoint[], amount: Cents, margin: Cents, from: Day, to: Day,
): Feasibility {
  const suffixMin: number[] = new Array(points.length);
  let m = Infinity;
  for (let i = points.length - 1; i >= 0; i--) {
    m = Math.min(m, points[i].balance);
    suffixMin[i] = m;
  }
  const ranges: Array<[Day, Day]> = [];
  let bestHeadroom = -Infinity;
  let open: [Day, Day] | null = null;
  for (let i = 0; i < points.length; i++) {
    const d = points[i].day;
    if (d < from || d > to) continue;
    const headroom = suffixMin[i] - margin;
    bestHeadroom = Math.max(bestHeadroom, headroom);
    if (headroom - amount >= 0) {
      if (open) open[1] = d;
      else { open = [d, d]; ranges.push(open); }
    } else open = null;
  }
  if (ranges.length > 0) return { first: ranges[0][0], ranges, baselineBelowMargin: false };
  if (bestHeadroom === -Infinity) return { ranges, baselineBelowMargin: false };
  if (bestHeadroom < 0) return { ranges, baselineBelowMargin: true };
  return { ranges, shortfall: amount - bestHeadroom, baselineBelowMargin: false };
}

import { latestBalance } from './calc';
import { addDays, diffDays } from './days';
import { forecast } from './forecast';
import type { AppData, Cents, Day } from './types';

export interface SavingsPlan {
  /** Giorni dall'ultimo saldo alla data considerata. */
  horizonDays: number;
  /** Quanti accantonamenti mensili. */
  months: number;
  /** Massimo da mettere da parte ogni mese (euro interi) senza mai scendere sotto zero. */
  maxMonthly: Cents;
  /** Con un obiettivo: quanto servirebbe ogni mese (arrotondato per eccesso a euro interi). */
  neededMonthly?: Cents;
  /** Con un obiettivo: quanto avresti messo da parte versando il massimo ogni mese. */
  savedAtMax?: Cents;
  /** Con un obiettivo: true se il massimo basta a raggiungerlo. */
  reachable?: boolean;
  /** Con un obiettivo: quanto manca se non basta (0 se basta). */
  shortfall?: Cents;
}

/** Mesi interi tra due giorni, almeno 1. */
function monthsBetween(from: Day, to: Day): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  let n = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) n -= 1;
  return Math.max(1, n);
}

/**
 * Quanto si può accantonare ogni mese partendo dal saldo previsto (regole, voci e spese varie se attive).
 * Un versamento al mese, spalmati fino alla data: il saldo previsto, al netto di quanto già messo da parte,
 * non scende mai sotto zero. Con `goal` calcola anche quanto servirebbe per arrivare all'importo.
 * Senza una data usa `defaultDays` giorni (6 mesi).
 */
export function savingsPlan(data: AppData, goal?: { amount: Cents; day: Day }, defaultDays = 180): SavingsPlan | null {
  const bal = latestBalance(data);
  if (!bal) return null;
  const H = goal ? diffDays(bal.day, goal.day) : defaultDays;
  if (H < 1) return null;
  const n = monthsBetween(bal.day, goal ? goal.day : addDays(bal.day, H));
  const points = forecast(data, H);
  const start = (k: number) => Math.round((k * H) / n);
  let best = Infinity;
  for (let k = 1; k <= n; k++) {
    const from = start(k);
    const to = k < n ? start(k + 1) - 1 : H;
    let min = Infinity;
    for (let i = from; i <= to && i < points.length; i++) min = Math.min(min, points[i].balance);
    if (min < Infinity) best = Math.min(best, Math.floor(min / k));
  }
  const maxMonthly = best === Infinity ? 0 : Math.max(0, Math.floor(best / 100) * 100);
  const plan: SavingsPlan = { horizonDays: H, months: n, maxMonthly };
  if (goal) {
    plan.neededMonthly = Math.ceil(goal.amount / n / 100) * 100;
    plan.savedAtMax = maxMonthly * n;
    plan.reachable = maxMonthly >= plan.neededMonthly;
    plan.shortfall = plan.reachable ? 0 : goal.amount - plan.savedAtMax;
  }
  return plan;
}

import { latestBalance } from './calc';
import { addDays, diffDays } from './days';
import { forecast, monthlyFlows } from './forecast';
import type { AppData, Cents, Day } from './types';

export interface MonthSaving {
  /** 'YYYY-MM' */
  month: string;
  net: Cents;
  included: boolean;
  /** Accantonato fino alla fine di questo mese. */
  cumulative: Cents;
}

export interface SavingsPlan {
  /** Giorni dall'ultimo saldo alla data considerata. */
  horizonDays: number;
  /** Quanti accantonamenti mensili. */
  months: number;
  /** Massimo da mettere da parte ogni mese (euro interi) senza mai scendere sotto zero. */
  maxMonthly: Cents;
  /** Avanzo medio mensile previsto: entrate meno uscite (spese varie incluse) spalmate sui mesi dell'orizzonte. */
  avgSurplus: Cents;
  /** Importo realistico da accantonare ogni mese: il minore tra avanzo medio e massimo, in euro interi. */
  realisticMonthly: Cents;
  /** Mese per mese: quanto avanza (entrate meno uscite) e se è scelto per accantonare. */
  monthRows: MonthSaving[];
  /** Totale accantonabile entro la data, sommando l'avanzo dei mesi scelti senza scendere sotto il margine. */
  totalSavable: Cents;
  /** Con un obiettivo: quanto servirebbe ogni mese (arrotondato per eccesso a euro interi). */
  neededMonthly?: Cents;
  /** Con un obiettivo: quanto avresti messo da parte versando ogni mese l'importo realistico. */
  savedAtMax?: Cents;
  /** Con un obiettivo: true se l'importo realistico basta a raggiungerlo. */
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
  const margin = Math.max(0, data.settings.savingsMargin ?? 0);
  const points = forecast(data, H);
  const start = (k: number) => Math.round((k * H) / n);
  let best = Infinity;
  for (let k = 1; k <= n; k++) {
    const from = start(k);
    const to = k < n ? start(k + 1) - 1 : H;
    let min = Infinity;
    for (let i = from; i <= to && i < points.length; i++) min = Math.min(min, points[i].balance);
    if (min < Infinity) best = Math.min(best, Math.floor((min - margin) / k));
  }
  const maxMonthly = best === Infinity ? 0 : Math.max(0, Math.floor(best / 100) * 100);
  const flows = monthlyFlows(data, H);
  const skip = new Set(data.settings.savingsSkipMonths ?? []);
  const lastIdx = (m: string) => {
    let idx = 0;
    points.forEach((p, i) => { if (p.day.slice(0, 7) === m) idx = i; });
    return idx;
  };
  const minFrom = new Array<number>(points.length + 1).fill(Infinity);
  for (let i = points.length - 1; i >= 0; i--) minFrom[i] = Math.min(minFrom[i + 1], points[i].balance);
  let cum = 0;
  const monthRows: MonthSaving[] = flows.map((m) => {
    const net = m.income - m.expense - m.varie;
    const included = !skip.has(m.month);
    if (included) cum = Math.max(cum, Math.min(cum + Math.max(0, net), minFrom[lastIdx(m.month)] - margin));
    return { month: m.month, net, included, cumulative: cum };
  });
  const totalSavable = Math.max(0, Math.floor(cum / 100) * 100);
  const used = monthRows.filter((r) => r.included);
  const avgSurplus = used.length ? Math.round(used.reduce((t, r) => t + r.net, 0) / used.length) : 0;
  const realisticMonthly = Math.max(0, Math.min(maxMonthly, Math.floor(totalSavable / n / 100) * 100));
  const plan: SavingsPlan = { horizonDays: H, months: n, maxMonthly, avgSurplus, realisticMonthly, monthRows, totalSavable };
  if (goal) {
    plan.neededMonthly = Math.ceil(goal.amount / n / 100) * 100;
    plan.savedAtMax = totalSavable;
    plan.reachable = totalSavable >= goal.amount;
    plan.shortfall = plan.reachable ? 0 : goal.amount - totalSavable;
  }
  return plan;
}

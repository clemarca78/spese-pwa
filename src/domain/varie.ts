import { addDays, diffDays } from './days';
import { buildItems } from './items';
import type { AppData, Cents } from './types';

/** Spese non tracciate (centesimi al giorno): l'importo mensile scelto a mano, altrimenti dalle ultime 4 coppie di saldi (con meno di 2 saldi vale il valore predefinito, 0). */
export function estimateDailyVarie(data: AppData): Cents {
  if (data.settings.varieMonthly !== undefined) return Math.round((data.settings.varieMonthly * 12) / 365);
  const bal = [...data.balances].sort((a, b) => a.day.localeCompare(b.day));
  if (bal.length < 2) return data.settings.varieDailyDefault;
  let varie = 0;
  let days = 0;
  for (let i = Math.max(1, bal.length - 4); i < bal.length; i++) {
    const [s1, s2] = [bal[i - 1], bal[i]];
    const span = diffDays(s1.day, s2.day);
    if (span <= 0) continue;
    let planned = 0;
    for (const it of buildItems(data, addDays(s1.day, 1), s2.day)) {
      if (it.skipped) continue;
      planned += it.kind === 'income' ? it.amount : -it.amount;
    }
    varie += s1.value + planned - s2.value;
    days += span;
  }
  if (days === 0) return data.settings.varieDailyDefault;
  return Math.round(Math.max(0, varie) / days);
}

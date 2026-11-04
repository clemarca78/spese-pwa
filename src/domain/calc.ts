import { addDays } from './days';
import { buildItems, isSettled } from './items';
import { expandRule } from './recurrence';
import type { AppData, Balance, Cents, Day, Item, Rule } from './types';

export const PENDING_LOOKBACK_DAYS = 45;

export function latestBalance(data: AppData): Balance | undefined {
  return [...data.balances].sort((a, b) => a.day.localeCompare(b.day)).at(-1);
}

/** Uscite ancora da pagare fino a `until` (vedi spec §6). Vuoto se manca il saldo. */
export function outstandingItems(data: AppData, until: Day): Item[] {
  const bal = latestBalance(data);
  if (!bal) return [];
  // si guarda indietro di 45 giorni per le voci slittate ("ancora da addebitare")
  return buildItems(data, addDays(bal.day, -PENDING_LOOKBACK_DAYS), until).filter((i) => {
    if (i.kind !== 'expense' || i.skipped || isSettled(i)) return false;
    if (i.day > bal.day) return true;
    return i.pendingDebit; // già nel saldo, salvo "ancora da addebitare"
  });
}

export function residual(data: AppData, until: Day): Cents | null {
  const bal = latestBalance(data);
  if (!bal) return null;
  return bal.value - outstandingItems(data, until).reduce((s, i) => s + i.amount, 0);
}

/** Uscite fisse attive, occorrenze nei prossimi 365 giorni × importo ÷ 12. */
export function monthlyFixedCost(rules: Rule[], today: Day): Cents {
  const to = addDays(today, 364);
  let total = 0;
  for (const r of rules) {
    if (r.kind !== 'expense' || r.variable) continue;
    total += expandRule(r, today, to).length * r.amount;
  }
  return Math.round(total / 12);
}

import { addDays } from './days';
import { buildItems } from './items';
import { expandRule } from './recurrence';
import type { AppData, Balance, Cents, Day, Item, Rule } from './types';

export const PENDING_LOOKBACK_DAYS = 45;

export function latestBalance(data: AppData): Balance | undefined {
  return [...data.balances].sort((a, b) => a.day.localeCompare(b.day)).at(-1);
}

/** Uscite "ancora da pagare" fino a `until`: non spuntate dopo il saldo, più quelle slittate e ancora da addebitare. */
export function outstandingItems(data: AppData, until: Day): Item[] {
  const bal = latestBalance(data);
  if (!bal) return [];
  // si guarda indietro di 45 giorni per le voci slittate ("ancora da addebitare")
  return buildItems(data, addDays(bal.day, -PENDING_LOOKBACK_DAYS), until).filter((i) => {
    if (i.kind !== 'expense' || i.skipped) return false;
    if (i.day > bal.day) return !i.paid;
    return i.pendingDebit; // già nel saldo, salvo "ancora da addebitare"
  });
}

/**
 * Residuo = saldo − uscite già pagate dopo il saldo + entrate già incassate dopo il saldo.
 * Contano solo le voci spuntate con data fino a `min(until, today)`; le uscite slittate
 * "ancora da addebitare" scalano perché il saldo non le contiene ancora.
 */
export function residual(data: AppData, until: Day, today: Day): Cents | null {
  const bal = latestBalance(data);
  if (!bal) return null;
  const cutoff = until < today ? until : today;
  let total = bal.value;
  for (const i of buildItems(data, addDays(bal.day, -PENDING_LOOKBACK_DAYS), cutoff)) {
    if (i.skipped) continue;
    if (i.day > bal.day) {
      if (i.paid) total += i.kind === 'income' ? i.amount : -i.amount;
    } else if (i.kind === 'expense' && i.pendingDebit) {
      total -= i.amount;
    }
  }
  return total;
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

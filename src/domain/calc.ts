import { addDays } from './days';
import { buildItems } from './items';
import { expandRule } from './recurrence';
import type { AppData, Balance, Cents, Day, Item, Rule } from './types';

export const PENDING_LOOKBACK_DAYS = 45;

export function latestBalance(data: AppData): Balance | undefined {
  return [...data.balances].sort((a, b) => a.day.localeCompare(b.day)).at(-1);
}

/** Uscite ancora da sottrarre al saldo fino a `until` (spec §6). La spunta "pagata" è solo un promemoria e non conta. Vuoto se manca il saldo. */
export function outstandingItems(data: AppData, until: Day): Item[] {
  const bal = latestBalance(data);
  if (!bal) return [];
  // si guarda indietro di 45 giorni per le voci slittate ("ancora da addebitare")
  return buildItems(data, addDays(bal.day, -PENDING_LOOKBACK_DAYS), until).filter((i) => {
    if (i.kind !== 'expense' || i.skipped) return false;
    if (i.day > bal.day) return true;
    return i.pendingDebit; // già nel saldo, salvo "ancora da addebitare"
  });
}

/** Entrate segnate come incassate dopo il giorno del saldo: il saldo non le contiene ancora. */
export function receivedIncomes(data: AppData, until: Day): Item[] {
  const bal = latestBalance(data);
  if (!bal) return [];
  return buildItems(data, addDays(bal.day, 1), until).filter((i) => i.kind === 'income' && i.paid && !i.skipped);
}

export function residual(data: AppData, until: Day): Cents | null {
  const bal = latestBalance(data);
  if (!bal) return null;
  const spent = outstandingItems(data, until).reduce((s, i) => s + i.amount, 0);
  const received = receivedIncomes(data, until).reduce((s, i) => s + i.amount, 0);
  return bal.value - spent + received;
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

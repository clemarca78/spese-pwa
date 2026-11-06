import { addDays } from './days';
import { buildItems } from './items';
import { expandRule } from './recurrence';
import type { AppData, Balance, Cents, Day, Item, Rule } from './types';

export const PENDING_LOOKBACK_DAYS = 45;

export function latestBalance(data: AppData): Balance | undefined {
  return [...data.balances].sort((a, b) => a.day.localeCompare(b.day)).at(-1);
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
  for (const i of buildItems(data, addDays(bal.day, -PENDING_LOOKBACK_DAYS), until)) {
    if (i.skipped) continue;
    if (i.day > bal.day) {
      if (i.paid && i.day <= cutoff) total += i.kind === 'income' ? i.amount : -i.amount;
    } else if (i.kind === 'expense' && i.pendingDebit) {
      total -= i.amount;
    }
  }
  return total;
}

export interface Available {
  value: Cents;
  /** Giorno dello stipendio fino al quale si tolgono le uscite. */
  upTo: Day;
  /** Uscite non ancora pagate (dopo il saldo, prima di `upTo`) tolte dal residuo. */
  debits: Item[];
}

/** Prossimo `payDay` del mese strettamente dopo `today`. */
export function nextPayDay(today: Day, payDay: number): Day {
  const [y, m] = today.split('-').map(Number);
  const dd = String(payDay).padStart(2, '0');
  const thisMonth = `${today.slice(0, 7)}-${dd}`;
  if (thisMonth > today) return thisMonth;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-${dd}`;
}

/**
 * Disponibile da spendere = residuo − tutte le uscite non ancora pagate (ricorrenti e segnate)
 * dopo il saldo e prima del prossimo giorno dello stipendio (quel giorno arrivano i soldi). Le entrate previste non si
 * sommano finché non le incassi: serve a non andare in negativo prima dello stipendio.
 */
export function available(data: AppData, today: Day, payDay: number): Available | null {
  const bal = latestBalance(data);
  const res = residual(data, today, today);
  if (!bal || res === null) return null;
  const upTo = nextPayDay(today, payDay);
  const debits = buildItems(data, addDays(bal.day, 1), addDays(upTo, -1)).filter((i) => i.kind === 'expense' && !i.paid && !i.skipped);
  return { value: res - debits.reduce((s, i) => s + i.amount, 0), upTo, debits };
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

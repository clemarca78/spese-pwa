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

/** Giorno della prossima entrata prevista e non ancora incassata (da `today` in poi), se c'è. */
function nextIncomeDay(data: AppData, today: Day): Day | undefined {
  return buildItems(data, today, addDays(today, 366))
    .filter((i) => i.kind === 'income' && !i.paid && !i.skipped)
    .map((i) => i.day)
    .sort()[0];
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
  /** Giorno della prossima entrata prevista: gli addebiti contati sono quelli prima di questo giorno. */
  upTo?: Day;
  debits: Item[];
}

/**
 * Disponibile da spendere = residuo − addebiti automatici ancora da scalare dal conto,
 * cioè non spuntati, dopo il saldo e prima della prossima entrata prevista (o fino a `until`).
 * Le uscite senza addebito automatico le decide l'utente e non contano.
 */
export function available(data: AppData, until: Day, today: Day): Available | null {
  const bal = latestBalance(data);
  const res = residual(data, until, today);
  if (!bal || res === null) return null;
  const upTo = nextIncomeDay(data, today);
  const debits = buildItems(data, addDays(bal.day, 1), until).filter(
    (i) => i.kind === 'expense' && i.autoDebit && !i.paid && !i.skipped && (upTo === undefined || i.day < upTo),
  );
  return { value: res - debits.reduce((s, i) => s + i.amount, 0), ...(upTo ? { upTo } : {}), debits };
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

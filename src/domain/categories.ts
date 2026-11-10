import { buildItems } from './items';
import type { AppData, Cents, Day } from './types';

export interface CategoryTotal {
  /** `undefined` = Senza categoria */
  categoryId: string | undefined;
  income: Cents;
  expense: Cents;
}

/**
 * Totale per categoria nel periodo: tutte le voci previste e registrate (non saltate), pagate o no.
 * Ordinate per uscite decrescenti, poi per entrate.
 */
export function totalsByCategory(data: AppData, from: Day, to: Day): CategoryTotal[] {
  const map = new Map<string | undefined, CategoryTotal>();
  for (const it of buildItems(data, from, to)) {
    if (it.skipped) continue;
    let t = map.get(it.categoryId);
    if (!t) map.set(it.categoryId, (t = { categoryId: it.categoryId, income: 0, expense: 0 }));
    if (it.kind === 'income') t.income += it.amount;
    else t.expense += it.amount;
  }
  return [...map.values()].sort((a, b) => b.expense - a.expense || b.income - a.income);
}

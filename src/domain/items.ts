import { todayLocal } from './days';
import { expandRule } from './recurrence';
import type { AppData, Cents, Day, Item, Override, Rule } from './types';

/** Media degli ultimi 3 importi reali della regola (solo giorni < `before`, se indicato). */
export function estimateVariable(rule: Rule, overrides: Override[], before?: Day): Cents {
  const real = overrides
    .filter((o) => o.ruleId === rule.id && o.amount !== undefined && (!before || o.day < before))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-3);
  if (real.length === 0) return rule.amount;
  return Math.round(real.reduce((s, o) => s + (o.amount as number), 0) / real.length);
}

/** `today`: le voci con addebito automatico risultano pagate dalla loro scadenza in poi. */
export function buildItems(data: AppData, from: Day, to: Day, today: Day = todayLocal()): Item[] {
  const items: Item[] = [];
  for (const rule of data.rules) {
    for (const day of expandRule(rule, from, to)) {
      const o = data.overrides.find((x) => x.ruleId === rule.id && x.day === day);
      const hasAmount = o?.amount !== undefined;
      const autoPaid = !!rule.autoDebit && o?.paid !== true && day <= today; // una spunta tolta in passato non conta
      items.push({
        key: `${rule.id}@${day}`,
        ruleId: rule.id,
        name: rule.name,
        kind: rule.kind,
        day,
        amount: hasAmount ? (o!.amount as number) : rule.variable ? estimateVariable(rule, data.overrides, day) : rule.amount,
        estimated: !hasAmount && rule.variable,
        paid: (o?.paid ?? false) || autoPaid,
        ...(autoPaid ? { paidOn: day } : o?.paidOn ? { paidOn: o.paidOn } : {}),
        ...(o?.paidAt ? { paidAt: o.paidAt } : {}),
        skipped: o?.skipped ?? false,
        ...(rule.autoDebit ? { autoDebit: true } : {}),
        ...(!rule.variable ? { locked: true } : {}),
      });
    }
  }
  for (const o of data.oneOffs) {
    if (o.day < from || o.day > to) continue;
    items.push({
      key: o.id, oneOffId: o.id, name: o.name, kind: o.kind, day: o.day, amount: o.amount,
      estimated: false, locked: true, paid: o.paid, ...(o.paidOn ? { paidOn: o.paidOn } : {}), ...(o.paidAt ? { paidAt: o.paidAt } : {}), skipped: false,
    });
  }
  return items.sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
}

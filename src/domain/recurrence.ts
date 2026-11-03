import { RRule } from 'rrule';
import { fromUtcDate, toUtcDate } from './days';
import type { Day, Rule } from './types';

/** Giorni (estremi inclusi) in cui cade la regola, in ordine. Tutto in UTC: nessuna deriva da ora legale. */
export function expandRule(rule: Rule, from: Day, to: Day): Day[] {
  if (!rule.active) return [];
  const lo = from > rule.start ? from : rule.start;
  const hi = rule.end && rule.end < to ? rule.end : to;
  if (lo > hi) return [];
  const opts = RRule.parseString(rule.rrule);
  const r = new RRule({ ...opts, dtstart: toUtcDate(rule.start) });
  return r.between(toUtcDate(lo), toUtcDate(hi), true).map(fromUtcDate);
}

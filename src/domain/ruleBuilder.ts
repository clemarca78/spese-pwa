export interface RecurrenceSpec {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  /** 0 = lunedì .. 6 = domenica */
  weekdays?: number[];
  /** 1-28 oppure 'last' (ultimo giorno del mese) */
  monthDay?: number | 'last';
  months?: number[];
  /** settimana del mese: 1..4, oppure -1 (ultima) */
  weekOfMonth?: number[];
}

const WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function buildRrule(s: RecurrenceSpec): string {
  const parts = [`FREQ=${s.freq.toUpperCase()}`];
  if (s.interval > 1) parts.push(`INTERVAL=${s.interval}`);
  if (s.weekdays?.length) parts.push(`BYDAY=${s.weekdays.map((d) => WD[d]).join(',')}`);
  if (s.monthDay !== undefined) parts.push(`BYMONTHDAY=${s.monthDay === 'last' ? -1 : s.monthDay}`);
  if (s.months?.length) parts.push(`BYMONTH=${s.months.join(',')}`);
  if (s.weekOfMonth?.length) parts.push(`BYSETPOS=${s.weekOfMonth.join(',')}`);
  return parts.join(';');
}

export function parseRrule(rrule: string): RecurrenceSpec {
  const kv = new Map(rrule.split(';').map((p) => p.split('=') as [string, string]));
  const nums = (k: string) => kv.get(k)?.split(',').map(Number);
  const spec: RecurrenceSpec = {
    freq: (kv.get('FREQ') ?? 'MONTHLY').toLowerCase() as RecurrenceSpec['freq'],
    interval: Number(kv.get('INTERVAL') ?? 1),
  };
  const byday = kv.get('BYDAY');
  if (byday) spec.weekdays = byday.split(',').map((d) => WD.indexOf(d));
  const md = kv.get('BYMONTHDAY');
  if (md) spec.monthDay = Number(md) === -1 ? 'last' : Number(md);
  if (kv.has('BYMONTH')) spec.months = nums('BYMONTH');
  if (kv.has('BYSETPOS')) spec.weekOfMonth = nums('BYSETPOS');
  return spec;
}

/** Messaggio d'errore, oppure null se la specifica è valida. */
export function validateSpec(s: RecurrenceSpec): string | null {
  if (!Number.isInteger(s.interval) || s.interval < 1) return "L'intervallo deve essere almeno 1.";
  if (s.monthDay !== undefined && s.monthDay !== 'last' && (s.monthDay < 1 || s.monthDay > 28)) {
    return 'Scegli un giorno da 1 a 28 oppure "ultimo giorno del mese".';
  }
  if (s.weekOfMonth?.length && s.weekdays?.length !== 1) {
    return 'Con la settimana del mese scegli un solo giorno della settimana.';
  }
  if (s.freq === 'weekly' && !s.weekdays?.length) return 'Scegli almeno un giorno della settimana.';
  if (s.freq === 'monthly' && s.monthDay === undefined && !(s.weekOfMonth?.length && s.weekdays?.length)) {
    return 'Scegli il giorno del mese, oppure la settimana e il giorno.';
  }
  if (s.freq === 'yearly' && (s.monthDay === undefined || !s.months?.length)) {
    return 'Per una regola annuale scegli mese e giorno.';
  }
  return null;
}

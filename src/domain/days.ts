import type { Day } from './types';

const MS_DAY = 86_400_000;

export function toUtcDate(d: Day): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function fromUtcDate(date: Date): Day {
  return date.toISOString().slice(0, 10);
}

export function addDays(d: Day, n: number): Day {
  return fromUtcDate(new Date(toUtcDate(d).getTime() + n * MS_DAY));
}

/** b - a, in giorni di calendario */
export function diffDays(a: Day, b: Day): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / MS_DAY);
}

export function endOfMonth(d: Day): Day {
  const [y, m] = d.split('-').map(Number);
  return fromUtcDate(new Date(Date.UTC(y, m, 0)));
}

export function todayLocal(): Day {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

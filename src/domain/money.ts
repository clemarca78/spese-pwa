import type { Cents } from './types';

const fmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);

export function formatEuro(c: Cents): string {
  return fmt.format(c / 100);
}

export function parseEuro(s: string): Cents | null {
  const raw = s.trim();
  let t: string;
  if (raw.includes(',')) t = raw.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) t = raw.replace(/\./g, ''); // 1.234 = migliaia
  else if (/^-?\d+\.\d{1,2}$/.test(raw)) t = raw; // 12.50 = decimali (tastiere Android)
  else if (/^-?\d+$/.test(raw)) t = raw;
  else return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

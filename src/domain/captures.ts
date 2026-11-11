import { parseEuro } from './money';
import type { Cents, Day, Kind } from './types';

export interface CaptureDraft {
  name: string;
  amount: Cents;
  kind: Kind;
  day: Day;
  time?: string;
  card?: string;
  /** Da dove arriva: intesa, wallet, shortcut… */
  source?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date): Day => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Giorno e mese senza anno: se la data cadrebbe nel futuro (oltre una settimana) è dell'anno scorso. */
function inferDay(dd: number, mm: number, yy: number | undefined, now: Date): Day | null {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  let year = yy === undefined ? now.getFullYear() : yy < 100 ? 2000 + yy : yy;
  if (yy === undefined && new Date(year, mm - 1, dd).getTime() > now.getTime() + 7 * 86_400_000) year -= 1;
  return `${year}-${pad(mm)}-${pad(dd)}`;
}

const cleanAmount = (s: string) => parseEuro(s.replace(/[.,]+$/, ''));
const cleanName = (s: string) => s.split(',')[0].replace(/[\s.]+$/, '').trim();

/**
 * Legge il testo di una notifica di pagamento (Intesa Sanpaolo, Google Wallet, o generica).
 * Senza un importo non è una spesa e restituisce null.
 */
export function parseNotification(n: { titolo?: string; testo: string; app?: string }, now: Date): CaptureDraft | null {
  const testo = n.testo.trim();
  const source = n.app ? { source: n.app } : {};

  // "Hai pagato 9,50 € con la carta *2722 il 11.11 alle ore 13:45 da SFIZI & P, SANTERAMO."
  const bank = /Hai\s+(pagato|ricevuto)\s+([\d.,]+)\s*€(.*)$/is.exec(testo);
  if (bank) {
    const amount = cleanAmount(bank[2]);
    if (amount === null || amount <= 0) return null;
    const rest = bank[3];
    const card = /carta\s*[*•]*\s*(\d{3,4})/i.exec(rest);
    const date = /\bil\s+(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/i.exec(rest);
    const time = /alle\s+ore\s+(\d{1,2})[:.](\d{2})/i.exec(rest);
    const tail = rest.slice(Math.max(time ? time.index + time[0].length : 0, date ? date.index + date[0].length : 0));
    const who = /\bda\s+(.+)$/is.exec(tail);
    const day = date ? inferDay(Number(date[1]), Number(date[2]), date[3] ? Number(date[3]) : undefined, now) : null;
    return {
      name: who ? cleanName(who[1]) : (n.titolo ?? '').replace(/[\s.]+$/, ''),
      amount,
      kind: bank[1].toLowerCase() === 'ricevuto' ? 'income' : 'expense',
      day: day ?? localDay(now),
      ...(time ? { time: `${pad(Number(time[1]))}:${time[2]}` } : {}),
      ...(card ? { card: card[1] } : {}),
      ...source,
    };
  }

  // Google Wallet: titolo = esercente, testo = "9,50 € con Xme card Plus cobadge ••2722"
  const wallet = /([\d.,]+)\s*€\s+con\s+(.*)$/is.exec(testo);
  if (wallet && (n.app === 'wallet' || /[•*]+\s*\d{4}/.test(wallet[2]))) {
    const amount = cleanAmount(wallet[1]);
    if (amount === null || amount <= 0) return null;
    const card = /[•*]+\s*(\d{4})/.exec(wallet[2]);
    return {
      name: (n.titolo ?? '').replace(/[\s.]+$/, '').trim(),
      amount,
      kind: 'expense',
      day: localDay(now),
      time: localTime(now),
      ...(card ? { card: card[1] } : {}),
      ...source,
    };
  }

  // generica: il primo importo in euro
  const any = /([\d.,]+)\s*€|€\s*([\d.,]+)/.exec(testo);
  const amount = any ? cleanAmount(any[1] ?? any[2]) : null;
  if (amount === null || amount <= 0) return null;
  return { name: (n.titolo ?? '').replace(/[\s.]+$/, '').trim(), amount, kind: 'expense', day: localDay(now), time: localTime(now), ...source };
}

/** Legge il link aperto da Tasker/Automate/Comandi Rapidi: `?testo=…` (testo della notifica) oppure `?importo=…&nome=…`. */
export function parseCaptureParams(search: string, now: Date = new Date()): CaptureDraft | null {
  const p = new URLSearchParams(search);
  const ora = /^(\d{1,2})[:.](\d{2})$/.exec(p.get('ora') ?? '');
  const oraOk = ora ? `${pad(Number(ora[1]))}:${ora[2]}` : undefined;
  const testo = p.get('testo');
  if (testo) {
    const c = parseNotification({ titolo: p.get('titolo') ?? undefined, testo, app: p.get('app') ?? undefined }, now);
    if (!c) return null;
    return c.time || !oraOk ? c : { ...c, time: oraOk };
  }
  const importo = p.get('importo');
  if (importo === null) return null;
  const amount = parseEuro(importo);
  if (amount === null || amount <= 0) return null;
  const data = p.get('data') ?? '';
  let day: Day = localDay(now);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  const it = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/.exec(data);
  if (iso) day = data;
  else if (it) day = inferDay(Number(it[1]), Number(it[2]), it[3] ? Number(it[3]) : undefined, now) ?? day;
  const app = p.get('app');
  return {
    name: (p.get('nome') ?? '').trim(),
    amount,
    kind: /^entrata$/i.test(p.get('tipo') ?? '') ? 'income' : 'expense',
    day,
    ...(oraOk ? { time: oraOk } : {}),
    ...(app ? { source: app } : {}),
  };
}

type Seen = { amount: Cents; day: Day; time?: string };
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Lo stesso pagamento visto due volte (per esempio da Intesa e da Wallet): stesso importo e giorno, orari entro 15 minuti. */
export function isDuplicateCapture(a: Seen, b: Seen): boolean {
  if (a.amount !== b.amount || a.day !== b.day) return false;
  if (a.time && b.time) return Math.abs(minutes(a.time) - minutes(b.time)) <= 15;
  return true;
}

/** Chiave dell'esercente, uguale per "SFIZI & P" e "SFIZI & PARTY DI COFA.": la prima parola di almeno 3 lettere. */
export function merchantKey(name: string): string {
  const words = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.find((w) => w.length >= 3) ?? words[0] ?? '';
}

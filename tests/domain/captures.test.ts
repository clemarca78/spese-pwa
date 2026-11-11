import { describe, expect, it } from 'vitest';
import { isDuplicateCapture, merchantKey, parseCaptureParams, parseNotification } from '../../src/domain/captures';

const NOW = new Date(2026, 10, 11, 14, 17); // 11/11/2026 14:17

const INTESA = '💸 Hai pagato 9,50 € con la carta *2722 il 11.11 alle ore 13:45 da SFIZI & P, SANTERAMO IN COLLE.';

describe('parseNotification', () => {
  it('legge la notifica di Intesa Sanpaolo: importo, data, ora, carta ed esercente', () => {
    expect(parseNotification({ titolo: 'SFIZI & P', testo: INTESA, app: 'intesa' }, NOW)).toEqual({
      name: 'SFIZI & P', amount: 950, kind: 'expense', day: '2026-11-11', time: '13:45', card: '2722', source: 'intesa',
    });
  });
  it('legge la notifica di Google Wallet: l esercente è nel titolo, la data è quella di arrivo', () => {
    expect(parseNotification({ titolo: 'SFIZI & PARTY DI COFA.', testo: '9,50 € con Xme card Plus cobadge ••2722', app: 'wallet' }, NOW)).toEqual({
      name: 'SFIZI & PARTY DI COFA', amount: 950, kind: 'expense', day: '2026-11-11', time: '14:17', card: '2722', source: 'wallet',
    });
  });
  it('importi con migliaia e senza decimali', () => {
    expect(parseNotification({ testo: 'Hai pagato 1.234,56 € il 03.11 da MUTUO' }, NOW)?.amount).toBe(123456);
    expect(parseNotification({ testo: 'Hai pagato 20 € il 03.11 da BAR' }, NOW)?.amount).toBe(2000);
  });
  it('una data senza anno nel futuro è dell anno scorso', () => {
    const jan = new Date(2027, 0, 5, 10, 0);
    expect(parseNotification({ testo: 'Hai pagato 5,00 € il 30.12 alle ore 09:00 da BAR' }, jan)?.day).toBe('2026-12-30');
  });
  it('un accredito è un entrata', () => {
    expect(parseNotification({ testo: 'Hai ricevuto 100,00 € il 10.11 alle ore 08:00 da MARIO ROSSI' }, NOW)).toMatchObject({ kind: 'income', amount: 10000, name: 'MARIO ROSSI' });
  });
  it('senza importo non è una spesa', () => {
    expect(parseNotification({ testo: 'Scansione completata. Nessun malware rilevato' }, NOW)).toBeNull();
  });
});

describe('parseCaptureParams', () => {
  it('legge testo e titolo codificati nel link', () => {
    const q = '?app=intesa&testo=' + encodeURIComponent(INTESA);
    expect(parseCaptureParams(q, NOW)).toMatchObject({ amount: 950, name: 'SFIZI & P', time: '13:45', source: 'intesa' });
  });
  it('legge i campi espliciti (importo, nome, data, ora, tipo)', () => {
    const q = '?importo=12.50&nome=Pizzeria&data=2026-11-09&ora=20:10&tipo=uscita&app=shortcut';
    expect(parseCaptureParams(q, NOW)).toEqual({ name: 'Pizzeria', amount: 1250, kind: 'expense', day: '2026-11-09', time: '20:10', source: 'shortcut' });
    expect(parseCaptureParams('?importo=5&nome=Rimborso&tipo=entrata', NOW)).toMatchObject({ kind: 'income', day: '2026-11-11' });
  });
  it('senza parametri utili o con importo non valido vale null', () => {
    expect(parseCaptureParams('', NOW)).toBeNull();
    expect(parseCaptureParams('?importo=abc', NOW)).toBeNull();
    expect(parseCaptureParams('?importo=0', NOW)).toBeNull();
  });
});

describe('doppioni e esercenti', () => {
  it('stesso importo e giorno a pochi minuti di distanza, o senza orario, è lo stesso pagamento', () => {
    const a = { amount: 950, day: '2026-11-11', time: '13:45' };
    expect(isDuplicateCapture(a, { amount: 950, day: '2026-11-11', time: '13:52' })).toBe(true);
    expect(isDuplicateCapture(a, { amount: 950, day: '2026-11-11' })).toBe(true);
    expect(isDuplicateCapture(a, { amount: 950, day: '2026-11-11', time: '18:00' })).toBe(false);
    expect(isDuplicateCapture(a, { amount: 951, day: '2026-11-11', time: '13:45' })).toBe(false);
    expect(isDuplicateCapture(a, { amount: 950, day: '2026-11-12', time: '13:45' })).toBe(false);
  });
  it('lo stesso esercente scritto in modi diversi ha la stessa chiave', () => {
    expect(merchantKey('SFIZI & PARTY DI COFA.')).toBe(merchantKey('SFIZI & P'));
    expect(merchantKey('Q8 Carburanti')).not.toBe(merchantKey('Sfizi & P'));
  });
});

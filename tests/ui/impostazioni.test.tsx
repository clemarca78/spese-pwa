import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { data } from '../../src/state/store';
import { emptyData, exportJson } from '../../src/storage/backup';
import { Impostazioni } from '../../src/ui/Impostazioni';

afterEach(cleanup);

beforeEach(() => {
  const d = emptyData();
  d.balances = [{ value: 150000, day: '2026-11-03' }];
  data.value = d;
  Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const pick = (el: HTMLElement, text: string, name = 'f.json') =>
  fireEvent.change(el, { target: { files: [new File([text], name, { type: 'application/json' })] } });

describe('Impostazioni', () => {
  it('Esporta aggiorna lastBackupAt', async () => {
    const r = render(<Impostazioni />);
    expect(data.value.settings.lastBackupAt).toBeUndefined();
    fireEvent.click(r.getByText('Esporta backup'));
    await waitFor(() => expect(data.value.settings.lastBackupAt).toBeDefined());
  });
  it('Importa backup corrotto: errore e dati intatti', async () => {
    const before = data.value;
    const r = render(<Impostazioni />);
    pick(r.getByLabelText('Importa backup'), '{rotto');
    await waitFor(() => expect(r.getByRole('alert')).toBeTruthy());
    expect(data.value).toBe(before);
  });
  it('Importa backup di versione diversa: errore e dati intatti', async () => {
    const before = data.value;
    const r = render(<Impostazioni />);
    pick(r.getByLabelText('Importa backup'), JSON.stringify({ ...emptyData(), schemaVersion: 2 }));
    await waitFor(() => expect(r.getByRole('alert').textContent).toMatch(/versione/i));
    expect(data.value).toBe(before);
  });
  it('Importa backup valido sostituisce i dati', async () => {
    const other = emptyData();
    other.balances = [{ value: 999, day: '2026-10-01' }];
    const r = render(<Impostazioni />);
    pick(r.getByLabelText('Importa backup'), exportJson(other));
    await waitFor(() => expect(data.value.balances[0].value).toBe(999));
  });
  it('Importa regole aggiunge le regole senza cancellare i saldi', async () => {
    const rules = {
      type: 'rules', schemaVersion: 1, varieDailyDefault: 4600,
      rules: [{ id: 'm', name: 'Mutuo', kind: 'expense', amount: 60000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', start: '2026-01-01', active: true }],
    };
    const r = render(<Impostazioni />);
    pick(r.getByLabelText('Importa regole'), JSON.stringify(rules));
    await waitFor(() => expect(data.value.rules).toHaveLength(1));
    expect(data.value.balances).toHaveLength(1);
    expect(data.value.settings.varieDailyDefault).toBe(4600);
  });
  it('imposta il giorno di riferimento e rifiuta valori fuori da 1-28', () => {
    const r = render(<Impostazioni />);
    const input = r.getByLabelText('Giorno di riferimento');
    fireEvent.input(input, { target: { value: '12' } });
    expect(data.value.settings.payDay).toBe(12);
    fireEvent.input(input, { target: { value: '31' } });
    expect(data.value.settings.payDay).toBe(12);
  });
  it('cambia i giorni del promemoria di backup', () => {
    const r = render(<Impostazioni />);
    fireEvent.input(r.getByLabelText('Promemoria backup (giorni)'), { target: { value: '7' } });
    expect(data.value.settings.backupReminderDays).toBe(7);
  });
});

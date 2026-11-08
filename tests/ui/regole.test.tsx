import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { data } from '../../src/state/store';
import { emptyData } from '../../src/storage/backup';
import { Regole } from '../../src/ui/Regole';

beforeEach(() => {
  data.value = emptyData();
});
afterEach(cleanup);

function fill(r: ReturnType<typeof render>, name: string, amount: string) {
  fireEvent.click(r.getByText('Nuova regola'));
  fireEvent.input(r.getByLabelText('Nome regola'), { target: { value: name } });
  fireEvent.input(r.getByLabelText('Importo regola'), { target: { value: amount } });
}

describe('Regole', () => {
  it('salva una regola mensile con la ricorrenza costruita', () => {
    const r = render(<Regole />);
    fill(r, 'Mutuo', '600,00');
    fireEvent.input(r.getByLabelText('Inizio'), { target: { value: '2026-01-01' } });
    fireEvent.click(r.getByText('Salva regola'));
    const rule = data.value.rules[0];
    expect(rule).toMatchObject({ name: 'Mutuo', amount: 60000, kind: 'expense', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1' });
  });
  it('mostra le prossime 6 date', () => {
    const r = render(<Regole />);
    fill(r, 'Mutuo', '600,00');
    expect(r.getAllByTestId('preview-date')).toHaveLength(6);
  });
  it('non salva se la ricorrenza non è valida e mostra l\'errore', () => {
    const r = render(<Regole />);
    fill(r, 'Mutuo', '600,00');
    fireEvent.input(r.getByLabelText('Ogni N'), { target: { value: '0' } });
    fireEvent.click(r.getByText('Salva regola'));
    expect(data.value.rules).toHaveLength(0);
    expect(r.getByRole('alert').textContent).toMatch(/intervallo/i);
  });
  it('settimana del mese + giorno: non lascia un giorno fisso in conflitto', () => {
    const r = render(<Regole />);
    fill(r, 'Corso', '10');
    fireEvent.click(r.getByLabelText('1ª'));
    fireEvent.click(r.getByLabelText('Lun'));
    fireEvent.click(r.getByText('Salva regola'));
    expect(data.value.rules[0].rrule).toBe('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1');
  });
  it('separa l elenco dal modulo: Nuova regola apre il modulo, Torna alle regole chiude', () => {
    const r = render(<Regole />);
    expect(r.queryByLabelText('Nome regola')).toBeNull();
    fireEvent.click(r.getByText('Nuova regola'));
    expect(r.getByLabelText('Nome regola')).toBeTruthy();
    fireEvent.click(r.getByText('‹ Torna alle regole'));
    expect(r.queryByLabelText('Nome regola')).toBeNull();
  });
  it('dopo il salvataggio torna alla lista con la nuova regola', () => {
    const r = render(<Regole />);
    fill(r, 'Mutuo', '600,00');
    fireEvent.click(r.getByText('Salva regola'));
    expect(r.queryByLabelText('Nome regola')).toBeNull();
    expect(r.getByText(/Mutuo/)).toBeTruthy();
  });
  it('Modifica apre il modulo compilato', () => {
    const d = emptyData();
    d.rules = [{ id: 'r1', name: 'Palestra', kind: 'expense', amount: 2500, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-01-01', active: true }];
    data.value = d;
    const r = render(<Regole />);
    fireEvent.click(r.getByText('Modifica'));
    expect((r.getByLabelText('Nome regola') as HTMLInputElement).value).toBe('Palestra');
  });
  it('salva e riapre una regola con addebito automatico', () => {
    const r = render(<Regole />);
    fill(r, 'Tim', '27,89');
    fireEvent.click(r.getByLabelText('Addebito automatico sul conto'));
    fireEvent.click(r.getByText('Salva regola'));
    expect(data.value.rules[0].autoDebit).toBe(true);
    fireEvent.click(r.getByText('Modifica'));
    expect((r.getByLabelText('Addebito automatico sul conto') as HTMLInputElement).checked).toBe(true);
  });
  it('per un entrata la casella si chiama Accredito automatico sul conto', () => {
    const r = render(<Regole />);
    fill(r, 'INPS', '203,80');
    fireEvent.change(r.getByLabelText('Tipo regola'), { target: { value: 'income' } });
    fireEvent.click(r.getByLabelText('Accredito automatico sul conto'));
    fireEvent.click(r.getByText('Salva regola'));
    expect(data.value.rules[0]).toMatchObject({ kind: 'income', autoDebit: true });
  });
  it('importo diverso per mese: i mesi scelti ottengono ciascuno il proprio importo', () => {
    const r = render(<Regole />);
    fill(r, 'Luce', '155,61');
    fireEvent.click(r.getByLabelText('Feb'));
    fireEvent.click(r.getByLabelText('Apr'));
    fireEvent.click(r.getByLabelText('Importo diverso per mese'));
    fireEvent.input(r.getByLabelText('Importo di Feb'), { target: { value: '240,00' } });
    fireEvent.input(r.getByLabelText('Importo di Apr'), { target: { value: '120,50' } });
    fireEvent.click(r.getByText('Salva regola'));
    expect(data.value.rules[0].monthAmounts).toEqual({ '2': 24000, '4': 12050 });
    fireEvent.click(r.getByText('Modifica'));
    expect((r.getByLabelText('Importo di Apr') as HTMLInputElement).value).toBe('120,50');
  });
  it('senza l opzione la regola non salva importi per mese', () => {
    const r = render(<Regole />);
    fill(r, 'Luce', '155,61');
    fireEvent.click(r.getByLabelText('Feb'));
    fireEvent.click(r.getByText('Salva regola'));
    expect(data.value.rules[0].monthAmounts).toBeUndefined();
  });
  it('elimina una regola e le sue correzioni solo dopo la conferma', () => {
    const d = emptyData();
    d.rules = [
      { id: 'r1', name: 'Palestra', kind: 'expense', amount: 2500, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-01-01', active: true },
      { id: 'r2', name: 'Corso', kind: 'expense', amount: 1000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=12', start: '2026-01-01', active: true },
    ];
    d.overrides = [{ ruleId: 'r1', day: '2026-11-10', paid: true }, { ruleId: 'r2', day: '2026-11-12', paid: true }];
    data.value = d;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const r = render(<Regole />);
    fireEvent.click(r.getByLabelText('Elimina: Palestra'));
    expect(data.value.rules).toHaveLength(2);
    confirm.mockReturnValue(true);
    fireEvent.click(r.getByLabelText('Elimina: Palestra'));
    expect(data.value.rules.map((x) => x.id)).toEqual(['r2']);
    expect(data.value.overrides.map((o) => o.ruleId)).toEqual(['r2']);
    confirm.mockRestore();
  });
  it('elenca le regole esistenti e permette di disattivarle', () => {
    const d = emptyData();
    d.rules = [{ id: 'r1', name: 'Palestra', kind: 'expense', amount: 2500, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-01-01', active: true }];
    data.value = d;
    const r = render(<Regole />);
    fireEvent.click(r.getByLabelText('Attiva: Palestra'));
    expect(data.value.rules[0].active).toBe(false);
  });
});

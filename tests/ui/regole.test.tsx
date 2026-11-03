import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { data } from '../../src/state/store';
import { emptyData } from '../../src/storage/backup';
import { Regole } from '../../src/ui/Regole';

beforeEach(() => {
  data.value = emptyData();
});
afterEach(cleanup);

function fill(r: ReturnType<typeof render>, name: string, amount: string) {
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
  it('elenca le regole esistenti e permette di disattivarle', () => {
    const d = emptyData();
    d.rules = [{ id: 'r1', name: 'Palestra', kind: 'expense', amount: 2500, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-01-01', active: true }];
    data.value = d;
    const r = render(<Regole />);
    fireEvent.click(r.getByLabelText('Attiva: Palestra'));
    expect(data.value.rules[0].active).toBe(false);
  });
});

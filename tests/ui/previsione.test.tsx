import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { data } from '../../src/state/store';
import { emptyData } from '../../src/storage/backup';
import { Previsione } from '../../src/ui/Previsione';

afterEach(cleanup);

function setup(balance = 100000, oneOffs: Array<{ amount: number; day: string }> = []) {
  const d = emptyData();
  d.balances = [{ value: balance, day: '2026-11-03' }];
  d.oneOffs = oneOffs.map((o, i) => ({ id: `o${i}`, name: 'spesa', kind: 'expense' as const, amount: o.amount, day: o.day, paid: false }));
  data.value = d;
}

beforeEach(() => setup());

describe('Previsione', () => {
  it('l\'orizzonte cambia il numero di punti (1, 3, 6, 12 mesi)', () => {
    const { container, getByText } = render(<Previsione />);
    const count = () => container.querySelector('svg')?.getAttribute('data-count');
    expect(count()).toBe('91'); // default 3 mesi = 90 giorni + 1
    fireEvent.click(getByText('1 mese'));
    expect(count()).toBe('31');
    fireEvent.click(getByText('6 mesi'));
    expect(count()).toBe('181');
    fireEvent.click(getByText('12 mesi'));
    expect(count()).toBe('366');
  });
  it('il grafico mostra saldo, entrate e uscite e si possono nascondere', () => {
    const { container, getByLabelText } = render(<Previsione />);
    const lines = () => container.querySelectorAll('[data-testid="series-path"]').length;
    expect(lines()).toBe(3);
    fireEvent.click(getByLabelText('Mostra uscite'));
    expect(lines()).toBe(2);
    fireEvent.click(getByLabelText('Mostra entrate'));
    expect(lines()).toBe(1);
  });
  it('l\'interruttore scrive settings.varieEnabled', () => {
    const { getByLabelText } = render(<Previsione />);
    fireEvent.click(getByLabelText('Spese varie stimate'));
    expect(data.value.settings.varieEnabled).toBe(true);
  });
  it('segnala il primo giorno sotto zero', () => {
    setup(1000, [{ amount: 5000, day: '2026-11-05' }]);
    const { getByText } = render(<Previsione />);
    expect(getByText(/sotto zero il 05\/11\/2026/i)).toBeTruthy();
  });
  it('elenca i giorni con le uscite maggiori', () => {
    setup(100000, [{ amount: 50000, day: '2026-11-05' }]);
    const { getAllByTestId } = render(<Previsione />);
    expect(getAllByTestId('drop-day')[0].textContent).toContain('05/11/2026');
  });
  it('senza saldo chiede di inserirlo', () => {
    data.value = emptyData();
    const { getByText } = render(<Previsione />);
    expect(getByText(/Inserisci il saldo/i)).toBeTruthy();
  });
});

describe('Previsione: entrate e uscite per mese', () => {
  it('mostra i totali di ogni mese e le voci dentro', () => {
    const d = emptyData();
    d.balances = [{ value: 100000, day: '2026-11-03' }];
    d.oneOffs = [
      { id: 'a', name: 'bolletta', kind: 'expense', amount: 30000, day: '2026-11-05', paid: false },
      { id: 'b', name: 'rimborso', kind: 'income', amount: 50000, day: '2026-12-10', paid: false },
    ];
    data.value = d;
    const { getByText, getAllByTestId } = render(<Previsione />);
    expect(getByText('novembre 2026')).toBeTruthy();
    expect(getByText('dicembre 2026')).toBeTruthy();
    const months = getAllByTestId('flow-month');
    expect(months[0].textContent).toContain('300,00');
    expect(months[1].textContent).toContain('500,00');
    expect(getByText('bolletta')).toBeTruthy();
    expect(getByText('rimborso')).toBeTruthy();
  });
});

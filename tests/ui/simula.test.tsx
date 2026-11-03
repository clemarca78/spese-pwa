import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { data } from '../../src/state/store';
import { emptyData } from '../../src/storage/backup';
import { Simula } from '../../src/ui/Simula';

afterEach(cleanup);

const norm = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ');

// saldo 1.000 € al 3/11; spesa 800 € il 10/11; stipendio 2.000 € il 20/11
// => 1.000 € fino al 9, 200 € dal 10 al 19, 2.200 € dal 20 in poi
function setup(balance = 100000, withIncome = true) {
  const d = emptyData();
  d.balances = [{ value: balance, day: '2026-11-03' }];
  d.oneOffs = withIncome
    ? [
        { id: 'a', name: 'affitto', kind: 'expense', amount: 80000, day: '2026-11-10', paid: false },
        { id: 'b', name: 'stipendio', kind: 'income', amount: 200000, day: '2026-11-20', paid: false },
      ]
    : [];
  data.value = d;
}
beforeEach(() => setup());

function type(r: ReturnType<typeof render>, label: string, value: string) {
  fireEvent.input(r.getByLabelText(label), { target: { value } });
}

describe('Simula', () => {
  it('modalità A: esito ok con saldo minimo e due linee nel grafico', () => {
    const r = render(<Simula today="2026-11-03" />);
    type(r, 'Importo spesa', '300,00');
    type(r, 'Data spesa', '2026-11-20');
    expect(r.getByText(/Puoi permettertela/i)).toBeTruthy();
    expect(norm(r.container.textContent)).toContain('1.900,00');
    expect(r.container.querySelectorAll('[data-testid="series-path"]')).toHaveLength(2);
  });
  it('modalità A: sotto il margine prima dello stipendio', () => {
    const r = render(<Simula today="2026-11-03" />);
    type(r, 'Importo spesa', '300,00');
    type(r, 'Data spesa', '2026-11-05');
    expect(r.getByText(/Non te la puoi permettere/i)).toBeTruthy();
  });
  it('modalità B: prima data possibile dopo lo stipendio', () => {
    const r = render(<Simula today="2026-11-03" />);
    fireEvent.click(r.getByText('Quando posso farla?'));
    type(r, 'Importo spesa', '300,00');
    expect(r.getByText(/Prima data possibile: 20\/11\/2026/)).toBeTruthy();
  });
  it('modalità B: nessuna data, indica di quanto dovrebbe diminuire', () => {
    const r = render(<Simula today="2026-11-03" />);
    fireEvent.click(r.getByText('Quando posso farla?'));
    type(r, 'Importo spesa', '3000,00');
    expect(norm(r.getByText(/dovrebbe diminuire/i).textContent)).toContain('800,00');
  });
  it('previsione già sotto il margine: lo dice', () => {
    setup(-5000, false);
    const r = render(<Simula today="2026-11-03" />);
    fireEvent.click(r.getByText('Quando posso farla?'));
    type(r, 'Importo spesa', '10,00');
    expect(r.getByText(/già sotto il margine/i)).toBeTruthy();
  });
  it('la simulazione non modifica i dati; il pulsante aggiunge la voce', () => {
    const before = data.value;
    const r = render(<Simula today="2026-11-03" />);
    fireEvent.click(r.getByText('Quando posso farla?'));
    type(r, 'Importo spesa', '300,00');
    type(r, 'Nome spesa', 'Divano');
    expect(data.value).toBe(before);
    fireEvent.click(r.getByText('Aggiungi come voce una tantum'));
    const added = data.value.oneOffs.find((o) => o.name === 'Divano');
    expect(added).toMatchObject({ amount: 30000, day: '2026-11-20', kind: 'expense', paid: false });
  });
  it('mostra sempre l\'avvertenza che è una stima', () => {
    const r = render(<Simula today="2026-11-03" />);
    type(r, 'Importo spesa', '300,00');
    expect(r.getByText(/è una stima/i)).toBeTruthy();
  });
  it('senza saldo chiede di inserirlo', () => {
    data.value = emptyData();
    const r = render(<Simula today="2026-11-03" />);
    expect(r.getByText(/Inserisci il saldo/i)).toBeTruthy();
  });
});

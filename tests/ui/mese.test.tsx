import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { data } from '../../src/state/store';
import { Mese, viewMonth } from '../../src/ui/Mese';
import { emptyData } from '../../src/storage/backup';

const text = (c: Element) => (c.textContent ?? '').replace(/[  ]/g, ' ');

beforeEach(() => {
  viewMonth.value = '2026-11';
});
afterEach(cleanup);

function withBalance() {
  const d = emptyData();
  d.balances = [{ value: 150000, day: '2026-11-03' }];
  d.settings.lastBackupAt = new Date().toISOString();
  d.oneOffs = [{ id: 'o1', name: 'bolletta', kind: 'expense', amount: 5000, day: '2026-11-10', paid: false }];
  data.value = d;
}

describe('Mese', () => {
  it('mostra saldo, ancora da pagare e residuo', () => {
    withBalance();
    const { container } = render(<Mese />);
    const t = text(container);
    expect(t).toContain('1.500,00');
    expect(t).toContain('50,00');
    expect(t).toContain('1.450,00');
    expect(t).toMatch(/residuo/i);
  });
  it('la spunta "pagata" aggiorna la voce', () => {
    withBalance();
    const { getByLabelText } = render(<Mese />);
    fireEvent.click(getByLabelText('Pagata: bolletta'));
    expect(data.value.oneOffs[0].paid).toBe(true);
  });
  it('permette di segnare una voce slittata prima del saldo come ancora da addebitare', () => {
    const d = emptyData();
    d.balances = [{ value: 150000, day: '2026-11-03' }];
    d.settings.lastBackupAt = new Date().toISOString();
    d.rules = [{ id: 'm', name: 'Mutuo', kind: 'expense', amount: 60000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', start: '2026-01-01', active: true }];
    data.value = d;
    const { getByLabelText, container } = render(<Mese />);
    fireEvent.click(getByLabelText('Ancora da addebitare: Mutuo'));
    expect(data.value.overrides[0]).toMatchObject({ ruleId: 'm', day: '2026-11-01', pendingDebit: true });
    expect(text(container)).toContain('900,00'); // residuo: 1.500,00 - 600,00
  });
  it('modifica una voce aggiunta a mano', () => {
    withBalance();
    const { getByLabelText, getByText } = render(<Mese />);
    fireEvent.click(getByLabelText('Modifica: bolletta'));
    expect((getByLabelText('Nome voce') as HTMLInputElement).value).toBe('bolletta');
    expect((getByLabelText('Importo voce') as HTMLInputElement).value).toBe('50,00');
    fireEvent.input(getByLabelText('Importo voce'), { target: { value: '75,50' } });
    fireEvent.input(getByLabelText('Nome voce'), { target: { value: 'luce' } });
    fireEvent.click(getByText('Salva modifiche'));
    expect(data.value.oneOffs).toHaveLength(1);
    expect(data.value.oneOffs[0]).toMatchObject({ id: 'o1', name: 'luce', amount: 7550 });
  });
  it('annullando la modifica non cambia nulla', () => {
    withBalance();
    const before = data.value;
    const { getByLabelText, getByText } = render(<Mese />);
    fireEvent.click(getByLabelText('Modifica: bolletta'));
    fireEvent.input(getByLabelText('Importo voce'), { target: { value: '1,00' } });
    fireEvent.click(getByText('Annulla'));
    expect(data.value).toBe(before);
  });
  it('elimina una voce solo dopo la conferma', () => {
    withBalance();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { getByLabelText } = render(<Mese />);
    fireEvent.click(getByLabelText('Elimina: bolletta'));
    expect(data.value.oneOffs).toHaveLength(1);
    confirm.mockReturnValue(true);
    fireEvent.click(getByLabelText('Elimina: bolletta'));
    expect(data.value.oneOffs).toHaveLength(0);
    confirm.mockRestore();
  });
  it('le voci generate da una regola non hanno Modifica/Elimina', () => {
    const d = emptyData();
    d.balances = [{ value: 150000, day: '2026-11-03' }];
    d.settings.lastBackupAt = new Date().toISOString();
    d.rules = [{ id: 'm', name: 'Mutuo', kind: 'expense', amount: 60000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=20', start: '2026-01-01', active: true }];
    data.value = d;
    const { queryByLabelText } = render(<Mese />);
    expect(queryByLabelText('Modifica: Mutuo')).toBeNull();
    expect(queryByLabelText('Elimina: Mutuo')).toBeNull();
  });
  it('senza saldo chiede il saldo e non mostra il residuo', () => {
    data.value = emptyData();
    const { container, queryByText, getByText } = render(<Mese />);
    expect(getByText(/Inserisci il saldo/i)).toBeTruthy();
    expect(queryByText(/residuo/i)).toBeNull();
    expect(text(container)).not.toContain('€ 0');
  });
  it('mostra l\'avviso di backup quando è dovuto', () => {
    withBalance();
    data.value = { ...data.value, settings: { ...data.value.settings, lastBackupAt: undefined } };
    const { getByText } = render(<Mese />);
    expect(getByText(/backup/i)).toBeTruthy();
  });
});

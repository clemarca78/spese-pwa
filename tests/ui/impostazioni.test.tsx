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
  it('Esporta regole scarica solo le regole', async () => {
    const d = data.value;
    data.value = { ...d, rules: [{ id: 'm', name: 'Mutuo', kind: 'expense', amount: 60000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', start: '2026-01-01', active: true }] };
    let blob: Blob | undefined;
    Object.assign(URL, { createObjectURL: (b: Blob) => { blob = b; return 'blob:x'; } });
    const r = render(<Impostazioni />);
    fireEvent.click(r.getByText('Esporta regole'));
    await waitFor(() => expect(blob).toBeDefined());
    const parsed = JSON.parse(await (blob as Blob).text());
    expect(parsed).toMatchObject({ type: 'rules', rules: [{ name: 'Mutuo' }] });
    expect(r.getByRole('status').textContent).toMatch(/1 regol/);
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
  it('spiega come catturare le spese dalle notifiche e mostra il link da usare', () => {
    const r = render(<Impostazioni />);
    expect(r.getByText('Spese dalle notifiche')).toBeTruthy();
    expect(r.container.textContent).toContain('?testo=');
    expect(r.container.textContent).toMatch(/Tasker/);
    expect(r.container.textContent).toMatch(/Automate/);
    expect(r.container.textContent).toMatch(/iPhone/);
  });
  describe('categorie', () => {
    function withCats() {
      const d = data.value;
      data.value = {
        ...d,
        defaultCategoriesSeeded: true,
        categories: [{ id: 'c-casa', name: 'Casa' }, { id: 'c-carb', name: 'Carburante' }],
        rules: [{ id: 'r1', name: 'Mutuo', kind: 'expense', amount: 1, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', start: '2026-01-01', active: true, categoryId: 'c-casa' }],
        oneOffs: [{ id: 'o1', name: 'pieno', kind: 'expense', amount: 1, day: '2026-11-10', paid: false, categoryId: 'c-carb' }],
      };
    }
    it('aggiunge una categoria nuova, ma non una doppia o vuota', async () => {
      withCats();
      const r = render(<Impostazioni />);
      fireEvent.click(r.getByText('Aggiungi categoria'));
      expect(r.getByRole('alert').textContent).toMatch(/nome/i);
      fireEvent.input(r.getByLabelText('Nome nuova categoria'), { target: { value: ' casa ' } });
      fireEvent.click(r.getByText('Aggiungi categoria'));
      expect(r.getByRole('alert').textContent).toMatch(/esiste già/i);
      fireEvent.input(r.getByLabelText('Nome nuova categoria'), { target: { value: 'Hobby' } });
      fireEvent.click(r.getByText('Aggiungi categoria'));
      await waitFor(() => expect(data.value.categories?.some((c) => c.name === 'Hobby')).toBe(true));
    });
    it('rinomina una categoria', async () => {
      withCats();
      const r = render(<Impostazioni />);
      fireEvent.click(r.getByLabelText('Rinomina categoria: Carburante'));
      fireEvent.input(r.getByLabelText('Nuovo nome della categoria'), { target: { value: 'Benzina e gasolio' } });
      fireEvent.click(r.getByText('Salva nome categoria'));
      await waitFor(() => expect(data.value.categories?.find((c) => c.id === 'c-carb')?.name).toBe('Benzina e gasolio'));
    });
    it('elimina una categoria dopo la conferma: le voci restano senza categoria', async () => {
      withCats();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const r = render(<Impostazioni />);
      fireEvent.click(r.getByLabelText('Elimina categoria: Carburante'));
      expect(data.value.categories).toHaveLength(2);
      confirm.mockReturnValue(true);
      fireEvent.click(r.getByLabelText('Elimina categoria: Carburante'));
      await waitFor(() => expect(data.value.categories?.some((c) => c.id === 'c-carb')).toBe(false));
      expect(data.value.oneOffs[0].categoryId).toBeUndefined();
      expect(data.value.rules[0].categoryId).toBe('c-casa');
    });
    it('Importa regole porta anche le categorie del file', async () => {
      withCats();
      const file = { type: 'rules', schemaVersion: 1, categories: [{ id: 'c-nuova', name: 'Animali' }], rules: [{ id: 'm', name: 'Veterinario', kind: 'expense', amount: 1, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', start: '2026-01-01', active: true, categoryId: 'c-nuova' }] };
      const r = render(<Impostazioni />);
      pick(r.getByLabelText('Importa regole'), JSON.stringify(file));
      await waitFor(() => expect(data.value.categories?.some((c) => c.id === 'c-nuova')).toBe(true));
      expect(data.value.rules.find((x) => x.id === 'm')?.categoryId).toBe('c-nuova');
    });
  });
  it('sceglie la regola dello stipendio tra le entrate', () => {
    const d = data.value;
    data.value = { ...d, rules: [
      { id: 'i1', name: 'Stipendio', kind: 'income', amount: 200000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-01-01', active: true },
      { id: 'e1', name: 'Tim', kind: 'expense', amount: 2789, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=8', start: '2026-01-01', active: true },
    ] };
    const r = render(<Impostazioni />);
    const sel = r.getByLabelText('Regola dello stipendio') as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(['Nessuna: uso il giorno di riferimento', 'Stipendio']);
    fireEvent.change(sel, { target: { value: 'i1' } });
    expect(data.value.settings.salaryRuleId).toBe('i1');
    fireEvent.change(sel, { target: { value: '' } });
    expect(data.value.settings.salaryRuleId).toBeUndefined();
  });
  it('cambia i giorni del promemoria di backup', () => {
    const r = render(<Impostazioni />);
    fireEvent.input(r.getByLabelText('Promemoria backup (giorni)'), { target: { value: '7' } });
    expect(data.value.settings.backupReminderDays).toBe(7);
  });
});

describe('versione', () => {
  it('mostra quando è stata compilata l app', () => {
    const r = render(<Impostazioni />);
    expect(r.getByTestId('app-version').textContent).toMatch(/Compilata il \d/);
  });
});

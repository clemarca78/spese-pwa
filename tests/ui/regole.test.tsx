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
  describe('gruppi personalizzati', () => {
    const rule = (id: string, name: string, extra: object = {}) => ({
      id, name, kind: 'expense' as const, amount: 1000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-01-01', active: true, ...extra,
    });
    it('crea un gruppo e lo mostra anche vuoto', () => {
      const r = render(<Regole />);
      fireEvent.input(r.getByLabelText('Nome nuovo gruppo'), { target: { value: 'Bollette' } });
      fireEvent.click(r.getByText('Aggiungi gruppo'));
      expect(data.value.groups?.map((g) => g.name)).toEqual(['Bollette']);
      expect(r.container.querySelector('details.group-rules > summary')?.textContent).toBe('Bollette · 0');
    });
    it('non crea gruppi con nome vuoto o doppio', () => {
      const d = emptyData();
      d.groups = [{ id: 'g1', name: 'Bollette' }];
      data.value = d;
      const r = render(<Regole />);
      fireEvent.click(r.getByText('Aggiungi gruppo'));
      fireEvent.input(r.getByLabelText('Nome nuovo gruppo'), { target: { value: ' bollette ' } });
      fireEvent.click(r.getByText('Aggiungi gruppo'));
      expect(data.value.groups).toHaveLength(1);
      expect(r.getByRole('alert').textContent).toMatch(/esiste già/i);
    });
    it('una regola assegnata a un gruppo compare lì; le altre restano nei gruppi automatici', () => {
      const d = emptyData();
      d.groups = [{ id: 'g1', name: 'Bollette' }];
      d.rules = [rule('1', 'Enel luce', { groupId: 'g1', autoDebit: true }), rule('2', 'Palestra')];
      data.value = d;
      const r = render(<Regole />);
      const titles = Array.from(r.container.querySelectorAll('details.group-rules > summary')).map((e) => e.textContent);
      expect(titles).toEqual(['Bollette · 1', 'Altre uscite · 1']);
    });
    it('il modulo assegna il gruppo e lo riapre', () => {
      const d = emptyData();
      d.groups = [{ id: 'g1', name: 'Bollette' }];
      data.value = d;
      const r = render(<Regole />);
      fireEvent.click(r.getByText('Nuova regola'));
      fireEvent.input(r.getByLabelText('Nome regola'), { target: { value: 'Gas' } });
      fireEvent.input(r.getByLabelText('Importo regola'), { target: { value: '50' } });
      fireEvent.change(r.getByLabelText('Gruppo'), { target: { value: 'g1' } });
      fireEvent.click(r.getByText('Salva regola'));
      expect(data.value.rules[0].groupId).toBe('g1');
      fireEvent.click(r.getByText('Modifica'));
      expect((r.getByLabelText('Gruppo') as HTMLSelectElement).value).toBe('g1');
    });
    it('rinomina un gruppo', () => {
      const d = emptyData();
      d.groups = [{ id: 'g1', name: 'Bollette' }];
      data.value = d;
      const r = render(<Regole />);
      fireEvent.click(r.getByLabelText('Rinomina gruppo: Bollette'));
      fireEvent.input(r.getByLabelText('Nuovo nome del gruppo'), { target: { value: 'Utenze' } });
      fireEvent.click(r.getByText('Salva nome'));
      expect(data.value.groups?.[0].name).toBe('Utenze');
    });
    it('elimina un gruppo solo dopo la conferma e le regole restano', () => {
      const d = emptyData();
      d.groups = [{ id: 'g1', name: 'Bollette' }];
      d.rules = [rule('1', 'Enel luce', { groupId: 'g1' })];
      data.value = d;
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const r = render(<Regole />);
      fireEvent.click(r.getByLabelText('Elimina gruppo: Bollette'));
      expect(data.value.groups).toHaveLength(1);
      confirm.mockReturnValue(true);
      fireEvent.click(r.getByLabelText('Elimina gruppo: Bollette'));
      expect(data.value.groups).toEqual([]);
      expect(data.value.rules).toHaveLength(1);
      expect(data.value.rules[0].groupId).toBeUndefined();
      confirm.mockRestore();
    });
  });
  describe('gruppi e ricerca', () => {
    const R = (id: string, name: string, extra: Partial<import('../../src/domain/types').Rule> = {}) => ({
      id, name, kind: 'expense' as const, amount: 1000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-01-01', active: true, ...extra,
    });
    function setupRules() {
      const d = emptyData();
      d.rules = [
        R('1', 'Tim', { autoDebit: true }),
        R('2', 'Enel luce', { autoDebit: true }),
        R('3', 'Palestra'),
        R('4', 'Dentista', { active: false }),
        R('5', 'INPS', { kind: 'income', autoDebit: true }),
      ];
      data.value = d;
    }
    it('raggruppa le regole in Entrate, Uscite con addebito automatico e Altre uscite con il conteggio', () => {
      setupRules();
      const r = render(<Regole />);
      const titles = Array.from(r.container.querySelectorAll('details.group-rules > summary')).map((e) => e.textContent);
      expect(titles).toEqual(['Entrate · 1', 'Uscite con addebito automatico · 2', 'Altre uscite · 2']);
    });
    it('le regole disattivate stanno in fondo al loro gruppo', () => {
      setupRules();
      const r = render(<Regole />);
      const altre = r.container.querySelectorAll('details.group-rules')[2];
      const names = Array.from(altre.querySelectorAll('.name')).map((e) => e.textContent?.split(' ')[0]);
      expect(names).toEqual(['Palestra', 'Dentista']);
    });
    it('la ricerca per nome filtra, ignora maiuscole e apre i gruppi', () => {
      setupRules();
      const r = render(<Regole />);
      fireEvent.input(r.getByLabelText('Cerca regola'), { target: { value: 'enel' } });
      expect(r.queryByLabelText('Attiva: Enel luce')).toBeTruthy();
      expect(r.queryByLabelText('Attiva: Tim')).toBeNull();
      const openOnes = r.container.querySelectorAll('details.group-rules[open]');
      expect(openOnes).toHaveLength(1);
      fireEvent.input(r.getByLabelText('Cerca regola'), { target: { value: 'zzz' } });
      expect(r.getByText('Nessuna regola trovata.')).toBeTruthy();
    });
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

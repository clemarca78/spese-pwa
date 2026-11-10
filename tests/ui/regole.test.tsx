import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { data } from '../../src/state/store';
import { emptyData, ensureDefaultGroups } from '../../src/storage/backup';
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
  describe('categorie delle regole', () => {
    it('il modulo salva la categoria scelta, la riapre e la riga la mostra', () => {
      const d = emptyData();
      d.categories = [{ id: 'c-bol', name: 'Bollette' }, { id: 'c-carb', name: 'Carburante' }];
      data.value = d;
      const r = render(<Regole />);
      fireEvent.click(r.getByText('Nuova regola'));
      fireEvent.input(r.getByLabelText('Nome regola'), { target: { value: 'Enel luce' } });
      fireEvent.input(r.getByLabelText('Importo regola'), { target: { value: '150' } });
      fireEvent.change(r.getByLabelText('Categoria'), { target: { value: 'c-bol' } });
      fireEvent.click(r.getByText('Salva regola'));
      expect(data.value.rules[0].categoryId).toBe('c-bol');
      expect(r.container.textContent).toContain('Bollette');
      fireEvent.click(r.getByText('Modifica'));
      expect((r.getByLabelText('Categoria') as HTMLSelectElement).value).toBe('c-bol');
      fireEvent.change(r.getByLabelText('Categoria'), { target: { value: '' } });
      fireEvent.click(r.getByText('Salva regola'));
      expect(data.value.rules[0].categoryId).toBeUndefined();
    });
  });
  describe('gruppi predefiniti come gruppi veri', () => {
    const R = (id: string, name: string, extra: object = {}) => ({
      id, name, kind: 'expense' as const, amount: 1000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-01-01', active: true, ...extra,
    });
    function seeded() {
      const d = emptyData();
      d.rules = [R('1', 'Tim', { autoDebit: true }), R('2', 'Palestra'), R('3', 'INPS', { kind: 'income' })];
      data.value = ensureDefaultGroups(d);
    }
    it('Entrate, Uscite con addebito automatico e Altre uscite sono gruppi con le loro regole', () => {
      seeded();
      const r = render(<Regole />);
      const titles = Array.from(r.container.querySelectorAll('details.group-rules > summary')).map((e) => e.textContent);
      expect(titles).toEqual(['Entrate · 1', 'Uscite con addebito automatico · 1', 'Altre uscite · 1']);
      expect((r.getByLabelText('Gruppo di INPS') as HTMLSelectElement).value).toBe('g-entrate');
      expect((r.getByLabelText('Gruppo di Tim') as HTMLSelectElement).value).toBe('g-uscite-auto');
    });
    it('anche i gruppi predefiniti si rinominano', () => {
      seeded();
      const r = render(<Regole />);
      fireEvent.click(r.getByLabelText('Rinomina gruppo: Altre uscite'));
      fireEvent.input(r.getByLabelText('Nuovo nome del gruppo'), { target: { value: 'Spese mie' } });
      fireEvent.click(r.getByText('Salva nome'));
      expect(data.value.groups?.find((g) => g.id === 'g-altre-uscite')?.name).toBe('Spese mie');
    });
    it('una regola si sposta da un gruppo predefinito a un altro', () => {
      seeded();
      const r = render(<Regole />);
      fireEvent.change(r.getByLabelText('Gruppo di Palestra'), { target: { value: 'g-uscite-auto' } });
      expect(data.value.rules.find((x) => x.id === '2')?.groupId).toBe('g-uscite-auto');
    });
    it('eliminando un gruppo e tenendo le regole, finiscono in Senza gruppo', () => {
      seeded();
      const r = render(<Regole />);
      fireEvent.click(r.getByLabelText('Elimina gruppo: Altre uscite'));
      fireEvent.click(r.getByText('Tieni le regole'));
      const titles = Array.from(r.container.querySelectorAll('details.group-rules > summary')).map((e) => e.textContent);
      expect(titles).toEqual(['Entrate · 1', 'Uscite con addebito automatico · 1', 'Senza gruppo · 1']);
    });
    it('una nuova regola propone il gruppo giusto in base al tipo', () => {
      seeded();
      const r = render(<Regole />);
      fireEvent.click(r.getByText('Nuova regola'));
      const sel = () => (r.getByLabelText('Gruppo') as HTMLSelectElement).value;
      expect(sel()).toBe('g-altre-uscite');
      fireEvent.click(r.getByLabelText('Addebito automatico sul conto'));
      expect(sel()).toBe('g-uscite-auto');
      fireEvent.change(r.getByLabelText('Tipo regola'), { target: { value: 'income' } });
      expect(sel()).toBe('g-entrate');
      fireEvent.input(r.getByLabelText('Nome regola'), { target: { value: 'Stipendio' } });
      fireEvent.input(r.getByLabelText('Importo regola'), { target: { value: '2000' } });
      fireEvent.click(r.getByText('Salva regola'));
      expect(data.value.rules.find((x) => x.name === 'Stipendio')?.groupId).toBe('g-entrate');
    });
  });
  describe('gruppi personalizzati', () => {
    const rule = (id: string, name: string, extra: object = {}) => ({
      id, name, kind: 'expense' as const, amount: 1000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-01-01', active: true, ...extra,
    });
    it('crea un gruppo e lo mostra anche vuoto', () => {
      const r = render(<Regole />);
      fireEvent.input(r.getByLabelText('Nome nuovo gruppo'), { target: { value: 'Bollette' } });
      fireEvent.click(r.getByText('Aggiungi gruppo'));
      expect(data.value.groups?.map((g) => g.name)).toEqual(['Entrate', 'Uscite con addebito automatico', 'Altre uscite', 'Bollette']);
      const titles = Array.from(r.container.querySelectorAll('details.group-rules > summary')).map((e) => e.textContent);
      expect(titles).toContain('Bollette · 0');
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
    it('una regola assegnata a un gruppo compare lì; le altre restano in Senza gruppo', () => {
      const d = emptyData();
      d.groups = [{ id: 'g1', name: 'Bollette' }];
      d.rules = [rule('1', 'Enel luce', { groupId: 'g1', autoDebit: true }), rule('2', 'Palestra')];
      data.value = d;
      const r = render(<Regole />);
      const titles = Array.from(r.container.querySelectorAll('details.group-rules > summary')).map((e) => e.textContent);
      expect(titles).toEqual(['Bollette · 1', 'Senza gruppo · 1']);
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
      data.value = ensureDefaultGroups(d);
      const r = render(<Regole />);
      fireEvent.click(r.getByLabelText('Rinomina gruppo: Bollette'));
      fireEvent.input(r.getByLabelText('Nuovo nome del gruppo'), { target: { value: 'Utenze' } });
      fireEvent.click(r.getByText('Salva nome'));
      expect(data.value.groups?.find((g) => g.id === 'g1')?.name).toBe('Utenze');
    });
    function withGroup() {
      const d = emptyData();
      d.groups = [{ id: 'g1', name: 'Bollette' }];
      d.rules = [rule('1', 'Enel luce', { groupId: 'g1' }), rule('2', 'Gas', { groupId: 'g1' })];
      d.overrides = [{ ruleId: '1', day: '2026-11-10', paid: true }];
      data.value = ensureDefaultGroups(d);
    }
    const custom = () => (data.value.groups ?? []).filter((g) => g.id === 'g1');
    it('eliminando un gruppo con regole chiede cosa farne: tenerle le mette senza gruppo', () => {
      withGroup();
      const r = render(<Regole />);
      fireEvent.click(r.getByLabelText('Elimina gruppo: Bollette'));
      expect(custom()).toHaveLength(1); // nulla finché non scegli
      expect(r.getByText(/contiene 2 regole/i)).toBeTruthy();
      fireEvent.click(r.getByText('Tieni le regole'));
      expect(custom()).toEqual([]);
      expect(data.value.rules).toHaveLength(2);
      expect(data.value.rules.every((x) => x.groupId === undefined)).toBe(true);
    });
    it('eliminando un gruppo si possono eliminare anche le sue regole', () => {
      withGroup();
      const r = render(<Regole />);
      fireEvent.click(r.getByLabelText('Elimina gruppo: Bollette'));
      fireEvent.click(r.getByText('Elimina anche le regole'));
      expect(custom()).toEqual([]);
      expect(data.value.rules).toEqual([]);
      expect(data.value.overrides).toEqual([]);
    });
    it('Annulla non cambia nulla', () => {
      withGroup();
      const r = render(<Regole />);
      fireEvent.click(r.getByLabelText('Elimina gruppo: Bollette'));
      fireEvent.click(r.getByText('Annulla'));
      expect(custom()).toHaveLength(1);
      expect(data.value.rules).toHaveLength(2);
      expect(r.queryByText('Tieni le regole')).toBeNull();
    });
    it('un gruppo vuoto si elimina con una sola conferma', () => {
      const d = emptyData();
      d.groups = [{ id: 'g1', name: 'Vuoto' }];
      data.value = ensureDefaultGroups(d);
      const r = render(<Regole />);
      fireEvent.click(r.getByLabelText('Elimina gruppo: Vuoto'));
      fireEvent.click(r.getByText('Conferma eliminazione'));
      expect((data.value.groups ?? []).some((g) => g.id === 'g1')).toBe(false);
    });
    it('sposta una regola da un gruppo all altro dall elenco', () => {
      const d = emptyData();
      d.groups = [{ id: 'g1', name: 'Bollette' }, { id: 'g2', name: 'Casa' }];
      d.rules = [rule('1', 'Enel luce', { groupId: 'g1' })];
      data.value = ensureDefaultGroups(d);
      const r = render(<Regole />);
      fireEvent.change(r.getByLabelText('Gruppo di Enel luce'), { target: { value: 'g2' } });
      expect(data.value.rules[0].groupId).toBe('g2');
      fireEvent.change(r.getByLabelText('Gruppo di Enel luce'), { target: { value: '' } });
      expect(data.value.rules[0].groupId).toBeUndefined();
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
      data.value = ensureDefaultGroups(d);
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

import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addBalance, data } from '../../src/state/store';
import { Mese, filtro, viewMonth } from '../../src/ui/Mese';
import { emptyData } from '../../src/storage/backup';

const tid = (c: Element, id: string) => c.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';
const text = (c: Element) => (c.textContent ?? '').replace(/[  ]/g, ' ');

beforeEach(() => {
  viewMonth.value = '2026-11';
  filtro.value = 'tutte';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 20, 12));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function withBalance() {
  const d = emptyData();
  d.balances = [{ value: 150000, day: '2026-11-03' }];
  d.settings.lastBackupAt = new Date().toISOString();
  d.oneOffs = [{ id: 'o1', name: 'bolletta', kind: 'expense', amount: 5000, day: '2026-11-10', paid: false }];
  data.value = d;
}

describe('Mese', () => {
  it('mostra saldo, residuo, da pagare e disponibile', () => {
    withBalance();
    const { container } = render(<Mese />);
    const t = text(container);
    expect(tid(container, 'da-pagare')).toContain('50,00'); // la bolletta non ancora pagata
    expect(tid(container, 'residuo')).toContain('1.500,00'); // nulla di pagato dopo il saldo
    expect(tid(container, 'disponibile')).toContain('1.450,00'); // saldo meno la bolletta in arrivo
    expect(t).toContain('Sul conto (stimato)');
  });
  it('la spunta "pagata" aggiorna la voce', () => {
    withBalance();
    const { getByLabelText } = render(<Mese />);
    fireEvent.click(getByLabelText('Pagata: bolletta'));
    expect(data.value.oneOffs[0].paid).toBe(true);
  });
  it('spuntare una spesa già inserita fa scendere il residuo, non risalire', () => {
    withBalance();
    const { getByLabelText, container } = render(<Mese />);
    expect(tid(container, 'residuo')).toContain('1.500,00');
    fireEvent.click(getByLabelText('Pagata: bolletta'));
    expect(tid(container, 'residuo')).toContain('1.450,00');
  });
  it('il disponibile toglie tutte le uscite non pagate fino al prossimo stipendio', () => {
    const d = emptyData();
    d.balances = [{ value: 150000, day: '2026-11-03' }];
    d.settings.lastBackupAt = new Date().toISOString();
    d.rules = [
      { id: 't', name: 'Tim', kind: 'expense', amount: 2789, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=25', start: '2026-01-01', active: true },
      { id: 'd', name: 'Dentista', kind: 'expense', amount: 8500, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=26', start: '2026-01-01', active: true },
    ];
    data.value = d;
    const { container, getByText } = render(<Mese />);
    expect(tid(container, 'residuo')).toContain('1.500,00');
    expect(tid(container, 'da-pagare')).toContain('112,89');
    expect(tid(container, 'disponibile')).toContain('1.387,11');
    expect(getByText('Da pagare prima del 10/12')).toBeTruthy();
  });
  it('spuntare oggi una rata arretrata (scadenza prima del saldo) scala dal residuo', () => {
    const d = emptyData();
    d.balances = [{ value: 150000, day: '2026-11-03' }];
    d.settings.lastBackupAt = new Date().toISOString();
    d.rules = [{ id: 'den', name: 'Dentista', kind: 'expense', amount: 8500, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', start: '2026-01-01', active: true }];
    data.value = d;
    const { getByLabelText, container } = render(<Mese />);
    expect(tid(container, 'residuo')).toContain('1.500,00');
    fireEvent.click(getByLabelText('Pagata: Dentista'));
    expect(tid(container, 'residuo')).toContain('1.415,00');
  });
  describe('arretrati', () => {
    function arretrati() {
      const d = emptyData();
      d.balances = [{ value: 150000, day: '2026-11-03' }];
      d.settings.lastBackupAt = new Date().toISOString();
      d.rules = [{ id: 'den', name: 'Dentista', kind: 'expense', amount: 8500, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', start: '2026-08-01', active: true }];
      data.value = d;
    }
    it('il mese corrente mostra in cima le voci non pagate dei mesi scorsi', () => {
      arretrati();
      const { getByText, getAllByText } = render(<Mese />);
      expect(getByText('Arretrati')).toBeTruthy();
      expect(getAllByText('Dentista')).toHaveLength(4); // ago, set, ott + il 01/11
    });
    it('gli altri mesi non mostrano arretrati', () => {
      arretrati();
      viewMonth.value = '2026-10';
      const { queryByText } = render(<Mese />);
      expect(queryByText('Arretrati')).toBeNull();
    });
    it('pagare un arretrato scala dal residuo oggi e lo toglie dagli arretrati', () => {
      arretrati();
      const { getByLabelText, container, getAllByText } = render(<Mese />);
      fireEvent.click(getByLabelText('Pagata: Dentista 01/10/2026'));
      expect(tid(container, 'residuo')).toContain('1.415,00');
      expect(getAllByText('Dentista')).toHaveLength(3);
    });
    it('Salta toglie un arretrato senza toccare il residuo', () => {
      arretrati();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { getByLabelText, container, getAllByText } = render(<Mese />);
      fireEvent.click(getByLabelText('Salta: Dentista 01/08/2026'));
      expect(tid(container, 'residuo')).toContain('1.500,00');
      expect(getAllByText('Dentista')).toHaveLength(3);
      confirm.mockRestore();
    });
    it('i filtri Pagate ed Entrate nascondono gli arretrati', () => {
      arretrati();
      const { getByText, queryByText } = render(<Mese />);
      fireEvent.click(getByText('Pagate'));
      expect(queryByText('Arretrati')).toBeNull();
      fireEvent.click(getByText('Entrate'));
      expect(queryByText('Arretrati')).toBeNull();
    });
  });
  it('spuntare un uscita lo stesso giorno in cui hai inserito il saldo la scala dal residuo', async () => {
    const d = emptyData();
    d.rules = [{ id: 'den', name: 'Dentista', kind: 'expense', amount: 8500, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', start: '2026-01-01', active: true }];
    d.settings.lastBackupAt = new Date().toISOString();
    data.value = d;
    const { getByLabelText, container } = render(<Mese />);
    await addBalance(4482); // oggi (20/11 nei test)
    fireEvent.click(getByLabelText('Pagata: Dentista'));
    // 44,82 - 85,00
    expect(tid(container, 'residuo')).toContain('-40,18');
  });
  it('una spesa Già pagata aggiunta dopo il saldo dello stesso giorno scala dal residuo', async () => {
    const d = emptyData();
    d.settings.lastBackupAt = new Date().toISOString();
    data.value = d;
    const { getByLabelText, getByText, container } = render(<Mese />);
    await addBalance(4482); // oggi
    fireEvent.input(getByLabelText('Nome voce'), { target: { value: 'supermercato' } });
    fireEvent.input(getByLabelText('Importo voce'), { target: { value: '11,07' } });
    fireEvent.click(getByLabelText('Già pagata'));
    fireEvent.click(getByText('Aggiungi'));
    expect(tid(container, 'residuo')).toContain('33,75'); // 44,82 - 11,07
  });
  it('le voci automatiche non hanno la casella, le altre sì', () => {
    const d = emptyData();
    d.balances = [{ value: 150000, day: '2026-11-03' }];
    d.settings.lastBackupAt = new Date().toISOString();
    d.rules = [
      { id: 't', name: 'Tim', kind: 'expense', amount: 2789, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=28', start: '2026-11-01', active: true, autoDebit: true },
      { id: 'i', name: 'INPS', kind: 'income', amount: 20380, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=25', start: '2026-11-01', active: true, autoDebit: true },
      { id: 'p', name: 'Palestra', kind: 'expense', amount: 4000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-11-01', active: true },
    ];
    data.value = d;
    const { queryByLabelText, getByText } = render(<Mese />);
    expect(queryByLabelText('Pagata: Tim')).toBeNull();
    expect(queryByLabelText('Incassata: INPS')).toBeNull();
    expect(queryByLabelText('Pagata: Palestra')).toBeTruthy();
    expect(getByText('addebito automatico')).toBeTruthy();
    expect(getByText('accredito automatico')).toBeTruthy();
  });
  it('l importo si modifica nell elenco solo per le regole a importo variabile', () => {
    const d = emptyData();
    d.balances = [{ value: 150000, day: '2026-11-03' }];
    d.settings.lastBackupAt = new Date().toISOString();
    d.rules = [
      { id: 't', name: 'Tim', kind: 'expense', amount: 2789, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=28', start: '2026-11-01', active: true, autoDebit: true },
      { id: 'e', name: 'Enel', kind: 'expense', amount: 6000, variable: true, rrule: 'FREQ=MONTHLY;BYMONTHDAY=27', start: '2026-11-01', active: true, autoDebit: true },
      { id: 'p', name: 'Palestra', kind: 'expense', amount: 4000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-11-01', active: true },
    ];
    d.oneOffs = [{ id: 'o1', name: 'bolletta', kind: 'expense', amount: 5000, day: '2026-11-10', paid: false }];
    data.value = d;
    const { queryByLabelText, getByText } = render(<Mese />);
    expect(queryByLabelText('Importo: Tim')).toBeNull();
    expect(getByText('27,89')).toBeTruthy();
    expect(queryByLabelText('Importo: Enel')).toBeTruthy();
    expect(queryByLabelText('Importo: Palestra')).toBeNull(); // fissa, anche senza addebito automatico
    expect(queryByLabelText('Importo: bolletta')).toBeNull(); // voce inserita a mano: si usa Modifica
  });
  it('le voci automatiche la cui data è passata spariscono dall elenco e scalano dal conto', () => {
    const d = emptyData();
    d.balances = [{ value: 150000, day: '2026-11-03' }];
    d.settings.lastBackupAt = new Date().toISOString();
    d.rules = [
      { id: 'tim', name: 'Tim', kind: 'expense', amount: 2789, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=8', start: '2026-11-01', active: true, autoDebit: true },
      { id: 'inps', name: 'INPS', kind: 'income', amount: 20380, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=9', start: '2026-11-01', active: true, autoDebit: true },
      { id: 'ass', name: 'Assicurazione', kind: 'expense', amount: 3695, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=27', start: '2026-11-01', active: true, autoDebit: true },
      { id: 'pal', name: 'Palestra', kind: 'expense', amount: 4000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=10', start: '2026-11-01', active: true },
    ];
    data.value = d;
    const { queryByText, container } = render(<Mese />); // oggi: 20/11
    expect(queryByText('Tim')).toBeNull();
    expect(queryByText('INPS')).toBeNull();
    expect(queryByText('Assicurazione')).toBeTruthy(); // 27/11: non è ancora passata
    expect(queryByText('Palestra')).toBeTruthy(); // non automatica: resta finché non la spunti
    expect(tid(container, 'residuo')).toContain('1.675,91'); // 1.500,00 - 27,89 + 203,80
  });
  it('una spesa aggiunta come Già pagata scala sempre dal conto, anche con data prima del saldo, e non ha la casella', () => {
    withBalance(); // saldo 1.500,00 al 03/11
    const { getByLabelText, getByText, container, queryByLabelText } = render(<Mese />);
    fireEvent.input(getByLabelText('Nome voce'), { target: { value: 'farmacia' } });
    fireEvent.input(getByLabelText('Importo voce'), { target: { value: '12,00' } });
    fireEvent.input(getByLabelText('Data voce'), { target: { value: '2026-11-01' } });
    fireEvent.click(getByLabelText('Già pagata'));
    fireEvent.click(getByText('Aggiungi'));
    expect(tid(container, 'residuo')).toContain('1.488,00');
    expect(queryByLabelText('Pagata: farmacia')).toBeNull();
    expect(queryByLabelText('Pagata: bolletta')).toBeTruthy(); // la voce non pagata ha ancora la casella
  });
  describe('accredito automatico arrivato prima', () => {
    function early() {
      const d = emptyData();
      d.balances = [{ value: 150000, day: '2026-11-03' }];
      d.settings.lastBackupAt = new Date().toISOString();
      d.rules = [{ id: 's', name: 'Stipendio', kind: 'income', amount: 200000, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=25', start: '2026-11-01', active: true, autoDebit: true }];
      data.value = d;
    }
    it('Non ancora nel saldo: si somma subito al conto e si può annullare', () => {
      early();
      const { getByText, getByLabelText, container, queryByText } = render(<Mese />);
      expect(tid(container, 'residuo')).toContain('1.500,00');
      fireEvent.click(getByLabelText('Già arrivata: Stipendio'));
      fireEvent.click(getByText('Non ancora nel saldo'));
      expect(tid(container, 'residuo')).toContain('3.500,00');
      expect(queryByText('Già arrivata')).toBeNull();
      fireEvent.click(getByLabelText('Annulla arrivo: Stipendio'));
      expect(tid(container, 'residuo')).toContain('1.500,00');
    });
    it('Già nel mio saldo: il conto non cambia e alla data non si somma di nuovo', () => {
      early();
      const { getByText, getByLabelText, container } = render(<Mese />);
      fireEvent.click(getByLabelText('Già arrivata: Stipendio'));
      fireEvent.click(getByText('Già nel mio saldo'));
      expect(tid(container, 'residuo')).toContain('1.500,00');
      expect(data.value.overrides[0]).toMatchObject({ paid: true, paidOn: '2026-11-03' });
    });
    it('per un addebito automatico anticipato la scritta è Già addebitata', () => {
      early();
      data.value = { ...data.value, rules: [{ ...data.value.rules[0], kind: 'expense' }] };
      const { getByLabelText } = render(<Mese />);
      expect(getByLabelText('Già addebitata: Stipendio')).toBeTruthy();
    });
  });
  it('"Già pagata" crea la voce già spuntata e il residuo scala comunque', () => {
    withBalance();
    const { getByLabelText, getByText, container } = render(<Mese />);
    fireEvent.input(getByLabelText('Nome voce'), { target: { value: 'spesa' } });
    fireEvent.input(getByLabelText('Importo voce'), { target: { value: '10,00' } });
    fireEvent.input(getByLabelText('Data voce'), { target: { value: '2026-11-12' } });
    fireEvent.click(getByLabelText('Già pagata'));
    fireEvent.click(getByText('Aggiungi'));
    const added = data.value.oneOffs.find((o) => o.name === 'spesa');
    expect(added?.paid).toBe(true);
    expect(text(container)).toContain('1.490,00'); // 1.500,00 - 10,00 già pagati
  });
  it('mostra la data completa (giorno/mese) di ogni voce', () => {
    withBalance();
    const { container } = render(<Mese />);
    expect(container.querySelector('.item .day')?.textContent).toBe('10/11');
  });
  it('i filtri Da pagare e Pagate riguardano solo le uscite, Entrate mostra solo le entrate', () => {
    withBalance();
    const d = data.value;
    data.value = {
      ...d,
      oneOffs: [
        ...d.oneOffs,
        { id: 'o2', name: 'fatta', kind: 'expense', amount: 1000, day: '2026-11-05', paid: true },
        { id: 'i1', name: 'rimborso', kind: 'income', amount: 2000, day: '2026-11-06', paid: false },
        { id: 'i2', name: 'regalo', kind: 'income', amount: 3000, day: '2026-11-07', paid: true },
      ],
    };
    const { getByText, queryByText } = render(<Mese />);
    fireEvent.click(getByText('Da pagare'));
    expect(queryByText('bolletta')).toBeTruthy();
    expect(queryByText('rimborso')).toBeNull();
    expect(queryByText('regalo')).toBeNull();
    fireEvent.click(getByText('Pagate'));
    expect(queryByText('fatta')).toBeTruthy();
    expect(queryByText('regalo')).toBeNull();
    fireEvent.click(getByText('Entrate'));
    expect(queryByText('rimborso')).toBeTruthy();
    expect(queryByText('regalo')).toBeTruthy();
    expect(queryByText('bolletta')).toBeNull();
    expect(queryByText('fatta')).toBeNull();
  });
  it('il filtro separa le voci da pagare da quelle già pagate', () => {
    withBalance();
    const d = data.value;
    data.value = { ...d, oneOffs: [...d.oneOffs, { id: 'o2', name: 'fatta', kind: 'expense', amount: 1000, day: '2026-11-05', paid: true }] };
    const { getByText, queryByText } = render(<Mese />);
    expect(queryByText('bolletta')).toBeTruthy();
    expect(queryByText('fatta')).toBeTruthy();
    fireEvent.click(getByText('Da pagare'));
    expect(queryByText('bolletta')).toBeTruthy();
    expect(queryByText('fatta')).toBeNull();
    fireEvent.click(getByText('Pagate'));
    expect(queryByText('bolletta')).toBeNull();
    expect(queryByText('fatta')).toBeTruthy();
    fireEvent.click(getByText('Tutte'));
    expect(queryByText('bolletta')).toBeTruthy();
  });
  it('per le entrate la casella si chiama "Già incassata" e aumenta il residuo', () => {
    withBalance();
    const { getByLabelText, queryByLabelText, getByText, container } = render(<Mese />);
    fireEvent.change(getByLabelText('Tipo voce'), { target: { value: 'income' } });
    expect(getByLabelText('Già incassata')).toBeTruthy();
    fireEvent.input(getByLabelText('Nome voce'), { target: { value: 'rimborso' } });
    fireEvent.input(getByLabelText('Importo voce'), { target: { value: '100,00' } });
    fireEvent.input(getByLabelText('Data voce'), { target: { value: '2026-11-12' } });
    fireEvent.click(getByLabelText('Già incassata'));
    fireEvent.click(getByText('Aggiungi'));
    expect(text(container)).toContain('1.600,00'); // 1.500,00 + 100,00 già incassati
    expect(queryByLabelText('Incassata: rimborso')).toBeNull(); // già incassata: niente casella
    expect(getByLabelText('Incassata')).toBeTruthy(); // solo il segno ✓
  });
  it('Modifica porta il modulo in vista e mette il cursore sul nome (anche per una voce già pagata)', () => {
    withBalance();
    const spy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = spy;
    const { getByLabelText, getByText } = render(<Mese />);
    fireEvent.input(getByLabelText('Nome voce'), { target: { value: 'farmacia' } });
    fireEvent.input(getByLabelText('Importo voce'), { target: { value: '12,00' } });
    fireEvent.click(getByLabelText('Già pagata'));
    fireEvent.click(getByText('Aggiungi'));
    spy.mockClear();
    fireEvent.click(getByLabelText('Modifica: farmacia'));
    expect(spy).toHaveBeenCalled();
    expect(document.activeElement).toBe(getByLabelText('Nome voce'));
    expect((getByLabelText('Già pagata') as HTMLInputElement).checked).toBe(true);
    fireEvent.input(getByLabelText('Importo voce'), { target: { value: '15,00' } });
    fireEvent.click(getByText('Salva modifiche'));
    expect(data.value.oneOffs.find((o) => o.name === 'farmacia')).toMatchObject({ amount: 1500, paid: true });
  });
  describe('categorie', () => {
    function withCats() {
      withBalance();
      data.value = {
        ...data.value,
        categories: [{ id: 'c-casa', name: 'Casa' }, { id: 'c-carb', name: 'Carburante' }, { id: 'c-stip', name: 'Stipendio' }],
        oneOffs: [
          { id: 'o1', name: 'bolletta', kind: 'expense', amount: 5000, day: '2026-11-10', paid: false, categoryId: 'c-casa' },
          { id: 'o2', name: 'benzina', kind: 'expense', amount: 4000, day: '2026-11-12', paid: false, categoryId: 'c-carb' },
          { id: 'o3', name: 'varie', kind: 'expense', amount: 700, day: '2026-11-13', paid: false },
          { id: 'o4', name: 'extra', kind: 'income', amount: 9000, day: '2026-11-14', paid: false, categoryId: 'c-stip' },
          { id: 'o5', name: 'vecchia', kind: 'expense', amount: 2500, day: '2026-03-02', paid: true, categoryId: 'c-casa' },
        ],
      };
    }
    it('si aggiunge una voce con la categoria scelta e la riga la mostra', () => {
      withCats();
      const { getByLabelText, getByText, getAllByText } = render(<Mese />);
      fireEvent.input(getByLabelText('Nome voce'), { target: { value: 'pieno' } });
      fireEvent.input(getByLabelText('Importo voce'), { target: { value: '40,00' } });
      fireEvent.change(getByLabelText('Categoria voce'), { target: { value: 'c-carb' } });
      fireEvent.click(getByText('Aggiungi'));
      expect(data.value.oneOffs.find((o) => o.name === 'pieno')?.categoryId).toBe('c-carb');
      expect(getAllByText('Carburante').length).toBeGreaterThan(0);
    });
    it('Modifica riapre la categoria e permette di toglierla', () => {
      withCats();
      const { getByLabelText, getByText } = render(<Mese />);
      fireEvent.click(getByLabelText('Modifica: bolletta'));
      expect((getByLabelText('Categoria voce') as HTMLSelectElement).value).toBe('c-casa');
      fireEvent.change(getByLabelText('Categoria voce'), { target: { value: '' } });
      fireEvent.click(getByText('Salva modifiche'));
      expect(data.value.oneOffs.find((o) => o.id === 'o1')?.categoryId).toBeUndefined();
    });
    it('il filtro per categoria mostra solo quelle voci, anche Senza categoria', () => {
      withCats();
      const { getByLabelText, queryByText } = render(<Mese />);
      fireEvent.change(getByLabelText('Filtra per categoria'), { target: { value: 'c-carb' } });
      expect(queryByText('benzina')).toBeTruthy();
      expect(queryByText('bolletta')).toBeNull();
      fireEvent.change(getByLabelText('Filtra per categoria'), { target: { value: '__none' } });
      expect(queryByText('varie')).toBeTruthy();
      expect(queryByText('benzina')).toBeNull();
      fireEvent.change(getByLabelText('Filtra per categoria'), { target: { value: '' } });
      expect(queryByText('benzina')).toBeTruthy();
    });
    it('totali per categoria del mese e dell anno', () => {
      withCats();
      const { getByText, getAllByTestId } = render(<Mese />);
      const rows = () => getAllByTestId('cat-row').map((r) => (r.textContent ?? '').replace(/\u00a0/g, ' '));
      // novembre 2026: Casa 50, Carburante 40, Senza categoria 7, Stipendio entrata 90
      expect(rows()[0]).toContain('Casa');
      expect(rows()[0]).toContain('50,00 €');
      expect(rows().find((r) => r.includes('Carburante'))).toContain('40,00 €');
      expect(rows().find((r) => r.includes('Senza categoria'))).toContain('7,00 €');
      expect(rows().find((r) => r.includes('Stipendio'))).toContain('90,00 €');
      fireEvent.click(getByText('Anno'));
      // anno 2026: Casa 50 + 25 (marzo) = 75
      expect(rows()[0]).toContain('Casa');
      expect(rows()[0]).toContain('75,00 €');
    });
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
    expect(queryByText(/sul conto/i)).toBeNull();
    expect(text(container)).not.toContain('€ 0');
  });
  it('mostra l\'avviso di backup quando è dovuto', () => {
    withBalance();
    data.value = { ...data.value, settings: { ...data.value.settings, lastBackupAt: undefined } };
    const { getByText } = render(<Mese />);
    expect(getByText(/backup/i)).toBeTruthy();
  });
});

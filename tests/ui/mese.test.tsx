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
    expect(t).toMatch(/residuo/i);
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
    const { getByLabelText, getByText, container } = render(<Mese />);
    fireEvent.change(getByLabelText('Tipo voce'), { target: { value: 'income' } });
    expect(getByLabelText('Già incassata')).toBeTruthy();
    fireEvent.input(getByLabelText('Nome voce'), { target: { value: 'rimborso' } });
    fireEvent.input(getByLabelText('Importo voce'), { target: { value: '100,00' } });
    fireEvent.input(getByLabelText('Data voce'), { target: { value: '2026-11-12' } });
    fireEvent.click(getByLabelText('Già incassata'));
    fireEvent.click(getByText('Aggiungi'));
    expect(text(container)).toContain('1.600,00'); // 1.500,00 + 100,00 già incassati
    expect(getByLabelText('Incassata: rimborso')).toBeTruthy();
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

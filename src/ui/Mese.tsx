import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { available, latestBalance, residual } from '../domain/calc';
import { addDays, endOfMonth, monthLabel, todayLocal } from '../domain/days';
import { totalsByCategory } from '../domain/categories';
import { buildItems } from '../domain/items';
import { formatEuro, parseEuro } from '../domain/money';
import type { AppData, Day, Item, Kind } from '../domain/types';
import { addBalance, addOneOff, data, deleteOneOff, paidStamp, setEarly, setItemAmount, setPaid, setSkipped, updateOneOff } from '../state/store';
import { backupDue } from '../storage/backup';
import { screen } from './Nav';

export const viewMonth = signal(todayLocal().slice(0, 7));
type Filtro = 'tutte' | 'da-pagare' | 'pagate' | 'entrate';
const FILTRI: Array<[Filtro, string]> = [['tutte', 'Tutte'], ['da-pagare', 'Da pagare'], ['pagate', 'Pagate'], ['entrate', 'Entrate']];
const passes: Record<Filtro, (i: Item) => boolean> = {
  tutte: () => true,
  'da-pagare': (i) => i.kind === 'expense' && !i.paid,
  pagate: (i) => i.kind === 'expense' && i.paid,
  entrate: (i) => i.kind === 'income',
};
export const filtro = signal<Filtro>('tutte');
/** '' = tutte le categorie, '__none' = senza categoria, altrimenti l'id della categoria */
export const categoriaFiltro = signal('');
const periodoTotali = signal<'mese' | 'anno'>('mese');
const catName = (id: string | undefined): string | undefined => (id ? (data.value.categories ?? []).find((c) => c.id === id)?.name : undefined);
const shortDate = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
/** id della voce una tantum in modifica (null = modulo di aggiunta) */
export const editingOneOff = signal<string | null>(null);

const plain = (c: number) => (c / 100).toFixed(2).replace('.', ',');

function BalanceForm({ label }: { label: string }) {
  const [v, setV] = useState('');
  const parsed = parseEuro(v);
  return (
    <form
      class="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed !== null) void addBalance(parsed).then(() => setV(''));
      }}
    >
      <input inputMode="decimal" placeholder="es. 1.500,00" aria-label="Saldo del conto" value={v} onInput={(e) => setV(e.currentTarget.value)} />
      <button type="submit" disabled={parsed === null}>{label}</button>
    </form>
  );
}

function ItemRow({ item, arretrato }: { item: Item; arretrato?: boolean }) {
  const [choosing, setChoosing] = useState(false);
  const early = !!item.autoDebit && !arretrato && item.day > todayLocal();
  const arrived = item.kind === 'income' ? 'Già arrivata' : 'Già addebitata';
  const fullDate = item.day.split('-').reverse().join('/');
  const label = arretrato ? `${item.name} ${fullDate}` : item.name;
  return (
    <li class={`item dated ${arretrato ? 'late' : ''} ${item.kind} ${item.paid ? 'done' : ''} ${item.skipped ? 'skipped' : ''}`}>
      {item.autoDebit && item.paid && early ? (
        <span class="auto-mark" role="img" aria-label={item.kind === 'income' ? 'Incassata' : 'Pagata'}>✓</span>
      ) : item.autoDebit ? (
        <span class="auto-mark" aria-hidden="true">↻</span>
      ) : item.oneOffId && item.paid ? (
        <span class="auto-mark" role="img" aria-label={item.kind === 'income' ? 'Incassata' : 'Pagata'}>✓</span>
      ) : (
        <input
          type="checkbox"
          aria-label={`${item.kind === 'income' ? 'Incassata' : 'Pagata'}: ${label}`}
          checked={item.paid}
          onChange={(e) => void setPaid(item, e.currentTarget.checked)}
        />
      )}
      <span class="day">{arretrato ? `${shortDate(item.day)}/${item.day.slice(2, 4)}` : shortDate(item.day)}</span>
      <span class="name">
        {item.name}
        {item.estimated ? <small> stima</small> : null}
        {item.autoDebit ? <small> {item.kind === 'income' ? 'accredito' : 'addebito'} automatico</small> : null}
        {catName(item.categoryId) ? <small class="cat"> · <span>{catName(item.categoryId)}</span></small> : null}
      </span>
      {item.locked ? (
        <span class="amount static">{plain(item.amount)}</span>
      ) : (
        <input
          class="amount"
          inputMode="decimal"
          aria-label={`Importo: ${label}`}
          defaultValue={plain(item.amount)}
          key={item.key + item.amount}
          onBlur={(e) => {
            const c = parseEuro(e.currentTarget.value);
            if (c !== null && c !== item.amount) void setItemAmount(item, c);
          }}
        />
      )}
      {early ? (
        <div class="actions">
          {item.paid ? (
            <button class="link" aria-label={`Annulla arrivo: ${label}`} onClick={() => void setPaid(item, false)}>Annulla arrivo</button>
          ) : choosing ? (
            <>
              <button onClick={() => { setChoosing(false); void setEarly(item, true); }}>Già nel mio saldo</button>
              <button onClick={() => { setChoosing(false); void setEarly(item, false); }}>Non ancora nel saldo</button>
              <button class="link" onClick={() => setChoosing(false)}>Annulla</button>
            </>
          ) : (
            <button class="link" aria-label={`${arrived}: ${label}`} onClick={() => setChoosing(true)}>{arrived}</button>
          )}
        </div>
      ) : item.oneOffId ? (
        <div class="actions">
          <button class="link" aria-label={`Modifica: ${item.name}`} onClick={() => (editingOneOff.value = item.oneOffId as string)}>Modifica</button>
          <button class="link danger" aria-label={`Elimina: ${item.name}`}
            onClick={() => {
              if (!window.confirm(`Eliminare "${item.name}"?`)) return;
              if (editingOneOff.value === item.oneOffId) editingOneOff.value = null;
              void deleteOneOff(item.oneOffId as string);
            }}>Elimina</button>
        </div>
      ) : item.ruleId && arretrato ? (
        <div class="actions">
          <button class="link" aria-label={`Salta: ${label}`}
            onClick={() => {
              if (!window.confirm(`Segnare "${item.name}" del ${fullDate} come non dovuta? Non comparirà più e non conta nei calcoli.`)) return;
              void setSkipped(item, true);
            }}>Salta</button>
        </div>
      ) : null}
    </li>
  );
}

/** Uscite non pagate (e non saltate) con scadenza prima di `monthStart`, dall'inizio delle regole. */
function arretrati(d: AppData, monthStart: Day): Item[] {
  const starts = [...d.rules.map((r) => r.start), ...d.oneOffs.map((o) => o.day)].sort();
  if (starts.length === 0 || starts[0] >= monthStart) return [];
  return buildItems(d, starts[0], addDays(monthStart, -1)).filter((i) => i.kind === 'expense' && !i.paid && !i.skipped);
}

function AddOneOff() {
  const editing = data.value.oneOffs.find((o) => o.id === editingOneOff.value);
  const [name, setName] = useState(editing?.name ?? '');
  const [amount, setAmount] = useState(editing ? plain(editing.amount) : '');
  const [day, setDay] = useState(editing?.day ?? todayLocal());
  const [kind, setKind] = useState<Kind>(editing?.kind ?? 'expense');
  const [paid, setAlreadyPaid] = useState(editing?.paid ?? false);
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const cents = parseEuro(amount);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  // modificando una voce il modulo sta in fondo alla pagina: lo porto in vista e metto il cursore sul nome
  useEffect(() => {
    if (!editing) return;
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    nameRef.current?.focus();
  }, []);
  return (
    <form
      ref={formRef}
      class="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || cents === null) return;
        if (editing) {
          const stamp = paid === editing.paid ? {} : paid ? paidStamp() : { paidOn: undefined, paidAt: undefined };
          void updateOneOff(editing.id, { name: name.trim(), kind, amount: cents, day, paid, categoryId: categoryId || undefined, ...stamp });
          editingOneOff.value = null;
          return;
        }
        void addOneOff({ name: name.trim(), kind, amount: cents, day, paid, ...(categoryId ? { categoryId } : {}), ...(paid ? paidStamp() : {}) }).then(() => {
          setCategoryId('');
          setAlreadyPaid(false);
          setName('');
          setAmount('');
        });
      }}
    >
      <h3>{editing ? 'Modifica la voce' : 'Aggiungi una voce'}</h3>
      <div class="row">
        <input ref={nameRef} placeholder="Nome" aria-label="Nome voce" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        <input inputMode="decimal" placeholder="Importo" aria-label="Importo voce" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
      </div>
      <div class="row">
        <label class="field">Categoria
          <select aria-label="Categoria voce" value={categoryId} onChange={(e) => setCategoryId(e.currentTarget.value)}>
            <option value="">Senza categoria</option>
            {(data.value.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <div class="row">
        <input type="date" aria-label="Data voce" value={day} onInput={(e) => setDay(e.currentTarget.value)} />
        <select aria-label="Tipo voce" value={kind} onChange={(e) => setKind(e.currentTarget.value as Kind)}>
          <option value="expense">Uscita</option>
          <option value="income">Entrata</option>
        </select>
        <label class="check"><input type="checkbox" aria-label={kind === 'income' ? 'Già incassata' : 'Già pagata'} checked={paid} onChange={(e) => setAlreadyPaid(e.currentTarget.checked)} /> {kind === 'income' ? 'Già incassata' : 'Già pagata'}</label>
        <button type="submit" disabled={!name.trim() || cents === null}>{editing ? 'Salva modifiche' : 'Aggiungi'}</button>
        {editing ? <button type="button" class="link" onClick={() => (editingOneOff.value = null)}>Annulla</button> : null}
      </div>
    </form>
  );
}

export function Mese() {
  const d = data.value;
  const start = `${viewMonth.value}-01`;
  const end = endOfMonth(start);
  const bal = latestBalance(d);
  const today = todayLocal();
  // le voci automatiche già passate sono già nel conto: non servono più nell'elenco
  const all = buildItems(d, start, end).filter((i) => !(i.autoDebit && i.paid && i.day <= today));
  const byCategory = (i: Item) => !categoriaFiltro.value || (categoriaFiltro.value === '__none' ? !i.categoryId : i.categoryId === categoriaFiltro.value);
  const items = all.filter(passes[filtro.value]).filter(byCategory);
  const res = residual(d, today, today);
  const av = available(d, today, d.settings.payDay ?? 10);
  const debitsTotal = av ? av.debits.reduce((s, i) => s + i.amount, 0) : 0;
  const late = viewMonth.value === today.slice(0, 7) && (filtro.value === 'tutte' || filtro.value === 'da-pagare') ? arretrati(d, start).filter(byCategory) : [];
  const year = viewMonth.value.slice(0, 4);
  const totals = totalsByCategory(d, periodoTotali.value === 'mese' ? start : `${year}-01-01`, periodoTotali.value === 'mese' ? end : `${year}-12-31`);
  const grand = totals.reduce((t, x) => ({ income: t.income + x.income, expense: t.expense + x.expense }), { income: 0, expense: 0 });
  const showBackup = backupDue(d.settings, new Date().toISOString());

  return (
    <main class="screen">
      {showBackup ? (
        <div class="banner">
          Fai un backup dei dati.{' '}
          <button class="link" onClick={() => (screen.value = 'impostazioni')}>Apri impostazioni</button>
        </div>
      ) : null}

      <header class="monthnav">
        <button aria-label="Mese precedente" onClick={() => (viewMonth.value = addDays(start, -1).slice(0, 7))}>‹</button>
        <h2>{monthLabel(viewMonth.value)}</h2>
        <button aria-label="Mese successivo" onClick={() => (viewMonth.value = addDays(end, 1).slice(0, 7))}>›</button>
      </header>

      {!bal ? (
        <section class="card">
          <h3>Inserisci il saldo</h3>
          <p>Serve per calcolare quanto ti resta. Leggilo dalla banca e scrivilo qui.</p>
          <BalanceForm label="Salva" />
        </section>
      ) : (
        <section class="card summary">
          <div>
            <small>Saldo al {bal.day.split('-').reverse().join('/')}</small>
            <strong>{formatEuro(bal.value)}</strong>
          </div>
          <div>
            <small>Sul conto (stimato)</small>
            <strong data-testid="residuo">{formatEuro(res ?? 0)}</strong>
          </div>
          <div>
            <small>Da pagare prima del {av ? av.upTo.split('-').reverse().slice(0, 2).join('/') : ''}</small>
            <strong data-testid="da-pagare">{formatEuro(debitsTotal)}</strong>
          </div>
          <div class={`wide ${av && av.value < 0 ? 'neg' : 'pos'}`}>
            <small>Usabile fino al {av ? av.upTo.split('-').reverse().slice(0, 2).join('/') : ''}</small>
            <strong class="big" data-testid="disponibile">{formatEuro(av?.value ?? 0)}</strong>
          </div>
          <details>
            <summary>Aggiorna saldo</summary>
            <BalanceForm label="Aggiorna" />
          </details>
        </section>
      )}

      <div class="row filters" role="group" aria-label="Filtro voci">
        {FILTRI.map(([v, l]) => (
          <button key={v} class={`chip ${filtro.value === v ? 'active' : ''}`} aria-pressed={filtro.value === v} onClick={() => (filtro.value = v)}>{l}</button>
        ))}
      </div>
      <label class="field cat-filter">Categoria
        <select aria-label="Filtra per categoria" value={categoriaFiltro.value} onChange={(e) => (categoriaFiltro.value = e.currentTarget.value)}>
          <option value="">Tutte le categorie</option>
          <option value="__none">Senza categoria</option>
          {(d.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      {late.length > 0 ? (
        <section class="late-section">
          <h3>Arretrati</h3>
          <ul class="items">
            {late.map((i) => <ItemRow key={i.key} item={i} arretrato />)}
          </ul>
        </section>
      ) : null}

      <ul class="items">
        {items.map((i) => (
          <ItemRow key={i.key} item={i} />
        ))}
        {items.length === 0 ? <li class="empty">{all.length === 0 ? 'Nessuna voce in questo mese.' : 'Nessuna voce con questo filtro.'}</li> : null}
      </ul>

      <details class="card cat-totals">
        <summary>Totali per categoria</summary>
        <div class="row" role="group" aria-label="Periodo dei totali">
          <button class={`chip ${periodoTotali.value === 'mese' ? 'active' : ''}`} aria-pressed={periodoTotali.value === 'mese'} onClick={() => (periodoTotali.value = 'mese')}>Mese</button>
          <button class={`chip ${periodoTotali.value === 'anno' ? 'active' : ''}`} aria-pressed={periodoTotali.value === 'anno'} onClick={() => (periodoTotali.value = 'anno')}>Anno</button>
        </div>
        <p class="muted">{periodoTotali.value === 'mese' ? monthLabel(viewMonth.value) : `Anno ${year}`}: comprende anche le voci previste, pagate o no.</p>
        <ul class="items">
          {totals.map((t) => (
            <li class="drop cat-row" key={t.categoryId ?? '__none'} data-testid="cat-row">
              <span>{catName(t.categoryId) ?? 'Senza categoria'}</span>
              <span class="cat-nums">
                {t.income > 0 ? <span class="pos">+{formatEuro(t.income)}</span> : null}
                {t.expense > 0 ? <span class="neg">−{formatEuro(t.expense)}</span> : null}
              </span>
            </li>
          ))}
          {totals.length === 0 ? <li class="empty">Nessuna voce nel periodo.</li> : null}
        </ul>
        {totals.length > 0 ? (
          <div class="flow-total">
            <span class="pos">Entrate {formatEuro(grand.income)}</span>
            <span class="neg">Uscite {formatEuro(grand.expense)}</span>
          </div>
        ) : null}
      </details>

      <AddOneOff key={editingOneOff.value ?? 'new'} />
    </main>
  );
}

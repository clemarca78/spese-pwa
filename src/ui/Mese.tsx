import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { latestBalance, outstandingItems, residual } from '../domain/calc';
import { addDays, endOfMonth, todayLocal } from '../domain/days';
import { buildItems } from '../domain/items';
import { formatEuro, parseEuro } from '../domain/money';
import type { Item, Kind } from '../domain/types';
import { addBalance, addOneOff, data, deleteOneOff, setItemAmount, setPaid, setPendingDebit, updateOneOff } from '../state/store';
import { backupDue } from '../storage/backup';
import { screen } from './Nav';

export const viewMonth = signal(todayLocal().slice(0, 7));
type Filtro = 'tutte' | 'da-pagare' | 'pagate';
const FILTRI: Array<[Filtro, string]> = [['tutte', 'Tutte'], ['da-pagare', 'Da pagare'], ['pagate', 'Pagate']];
export const filtro = signal<Filtro>('tutte');
const shortDate = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
/** id della voce una tantum in modifica (null = modulo di aggiunta) */
export const editingOneOff = signal<string | null>(null);

const plain = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const monthLabel = (m: string) => `${MESI[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

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

function ItemRow({ item, balanceDay }: { item: Item; balanceDay?: string }) {
  return (
    <li class={`item dated ${item.kind} ${item.paid ? 'done' : ''} ${item.skipped ? 'skipped' : ''}`}>
      <input
        type="checkbox"
        aria-label={`${item.kind === 'income' ? 'Incassata' : 'Pagata'}: ${item.name}`}
        checked={item.paid}
        onChange={(e) => void setPaid(item, e.currentTarget.checked)}
      />
      <span class="day">{shortDate(item.day)}</span>
      <span class="name">
        {item.name}
        {item.estimated ? <small> stima</small> : null}
      </span>
      {item.kind === 'expense' && balanceDay && item.day <= balanceDay ? (
        <label class="pending">
          <input type="checkbox" aria-label={`Ancora da addebitare: ${item.name}`} checked={item.pendingDebit}
            onChange={(e) => void setPendingDebit(item, e.currentTarget.checked)} />
          <small> non ancora addebitata</small>
        </label>
      ) : null}
      <input
        class="amount"
        inputMode="decimal"
        aria-label={`Importo: ${item.name}`}
        defaultValue={plain(item.amount)}
        key={item.key + item.amount}
        onBlur={(e) => {
          const c = parseEuro(e.currentTarget.value);
          if (c !== null && c !== item.amount) void setItemAmount(item, c);
        }}
      />
      {item.oneOffId ? (
        <div class="actions">
          <button class="link" aria-label={`Modifica: ${item.name}`} onClick={() => (editingOneOff.value = item.oneOffId as string)}>Modifica</button>
          <button class="link danger" aria-label={`Elimina: ${item.name}`}
            onClick={() => {
              if (!window.confirm(`Eliminare "${item.name}"?`)) return;
              if (editingOneOff.value === item.oneOffId) editingOneOff.value = null;
              void deleteOneOff(item.oneOffId as string);
            }}>Elimina</button>
        </div>
      ) : null}
    </li>
  );
}

function AddOneOff() {
  const editing = data.value.oneOffs.find((o) => o.id === editingOneOff.value);
  const [name, setName] = useState(editing?.name ?? '');
  const [amount, setAmount] = useState(editing ? plain(editing.amount) : '');
  const [day, setDay] = useState(editing?.day ?? todayLocal());
  const [kind, setKind] = useState<Kind>(editing?.kind ?? 'expense');
  const [paid, setAlreadyPaid] = useState(editing?.paid ?? false);
  const cents = parseEuro(amount);
  return (
    <form
      class="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || cents === null) return;
        if (editing) {
          void updateOneOff(editing.id, { name: name.trim(), kind, amount: cents, day, paid });
          editingOneOff.value = null;
          return;
        }
        void addOneOff({ name: name.trim(), kind, amount: cents, day, paid }).then(() => {
          setAlreadyPaid(false);
          setName('');
          setAmount('');
        });
      }}
    >
      <h3>{editing ? 'Modifica la voce' : 'Aggiungi una voce'}</h3>
      <div class="row">
        <input placeholder="Nome" aria-label="Nome voce" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        <input inputMode="decimal" placeholder="Importo" aria-label="Importo voce" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
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
  const all = buildItems(d, start, end);
  const items = all.filter((i) => (filtro.value === 'tutte' ? true : filtro.value === 'pagate' ? i.paid : !i.paid));
  const out = outstandingItems(d, end).reduce((s, i) => s + i.amount, 0);
  const res = residual(d, end, todayLocal());
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
            <small>Ancora da pagare</small>
            <strong>{formatEuro(out)}</strong>
          </div>
          <div class={res !== null && res < 0 ? 'neg' : 'pos'}>
            <small>Residuo</small>
            <strong class="big">{formatEuro(res ?? 0)}</strong>
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

      <ul class="items">
        {items.map((i) => (
          <ItemRow key={i.key} item={i} balanceDay={bal?.day} />
        ))}
        {items.length === 0 ? <li class="empty">{all.length === 0 ? 'Nessuna voce in questo mese.' : 'Nessuna voce con questo filtro.'}</li> : null}
      </ul>

      <AddOneOff key={editingOneOff.value ?? 'new'} />
    </main>
  );
}

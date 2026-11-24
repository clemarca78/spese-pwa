import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { available, latestBalance, residual } from '../domain/calc';
import { addDays, endOfMonth, monthLabel, todayLocal } from '../domain/days';
import { merchantKey } from '../domain/captures';
import { totalsByCategory } from '../domain/categories';
import { buildItems } from '../domain/items';
import { formatEuro, parseEuro } from '../domain/money';
import type { AppData, Capture, Day, Item, Kind } from '../domain/types';
import { addBalance, addOneOff, confirmCapture, data, deleteOneOff, discardCapture, paidStamp, setEarly, setItemAmount, setPaid, setSkipped, updateOneOff } from '../state/store';
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
/** Modulo di aggiunta aperto o chiuso (in alto, sotto il riepilogo). */
export const addOpen = signal(false);
/** Giorni aperti/chiusi a mano dall'utente (chiave = 'YYYY-MM-DD'); gli altri seguono la regola predefinita. */
const dayOpen = signal<Record<string, boolean>>({});
const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const dayLabel = (d: Day) => `${WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${shortDate(d)}`;
/** Giorni passati con tutto sistemato si chiudono da soli: restano aperti oggi, il futuro e le voci ancora da pagare. */
const defaultOpen = (day: Day, list: Item[], today: Day) => day >= today || list.some((i) => !i.paid && !i.skipped);

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
      {item.autoDebit && item.paid ? (
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
        {item.note ? <small class="note" data-testid="item-note">{item.note}</small> : null}
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

function CaptureRow({ c }: { c: Capture }) {
  const suggested = data.value.merchantCategories?.[merchantKey(c.name)];
  const cats = data.value.categories ?? [];
  const [name, setName] = useState(c.name);
  const [amount, setAmount] = useState(plain(c.amount));
  const [day, setDay] = useState(c.day);
  const [kind, setKind] = useState<Kind>(c.kind);
  const [categoryId, setCategoryId] = useState(suggested && cats.some((x) => x.id === suggested) ? suggested : '');
  const cents = parseEuro(amount);
  return (
    <li class="capture">
      <p class="muted">
        {c.source ? `${c.source[0].toUpperCase()}${c.source.slice(1)}` : 'Notifica'}
        {c.time ? ` · ${c.time}` : ''}{c.card ? ` · carta ${c.card}` : ''}
      </p>
      <div class="row">
        <input aria-label={`Nome della spesa: ${c.name}`} placeholder="Nome" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        <input aria-label={`Importo della spesa: ${c.name}`} inputMode="decimal" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
      </div>
      <div class="row">
        <input type="date" aria-label={`Data della spesa: ${c.name}`} value={day} onInput={(e) => setDay(e.currentTarget.value)} />
        <select aria-label={`Tipo della spesa: ${c.name}`} value={kind} onChange={(e) => setKind(e.currentTarget.value as Kind)}>
          <option value="expense">Uscita</option>
          <option value="income">Entrata</option>
        </select>
      </div>
      <div class="row">
        <select aria-label={`Categoria della spesa: ${c.name}`} value={categoryId} onChange={(e) => setCategoryId(e.currentTarget.value)}>
          <option value="">Senza categoria</option>
          {cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      <div class="row">
        <button aria-label={`Conferma: ${c.name}`} disabled={!name.trim() || cents === null || cents <= 0}
          onClick={() => void confirmCapture(c.id, { name, amount: cents as number, kind, day, ...(categoryId ? { categoryId } : {}) })}>Conferma</button>
        <button class="link" aria-label={`Scarta: ${c.name}`} onClick={() => void discardCapture(c.id)}>Scarta</button>
      </div>
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
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const cents = parseEuro(amount);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  // modificando una voce il modulo sta in fondo alla pagina: lo porto in vista e metto il cursore sul nome
  useEffect(() => {
    if (!editing) return;
    addOpen.value = true;
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    nameRef.current?.focus();
  }, []);
  return (
    <form
      ref={formRef}
      class="card add-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || cents === null) return;
        if (editing) {
          const stamp = paid === editing.paid ? {} : paid ? paidStamp() : { paidOn: undefined, paidAt: undefined };
          void updateOneOff(editing.id, { name: name.trim(), kind, amount: cents, day, paid, categoryId: categoryId || undefined, note: note.trim() || undefined, ...stamp });
          editingOneOff.value = null;
          addOpen.value = false;
          return;
        }
        void addOneOff({ name: name.trim(), kind, amount: cents, day, paid, ...(categoryId ? { categoryId } : {}), ...(note.trim() ? { note: note.trim() } : {}), ...(paid ? paidStamp() : {}) }).then(() => {
          setCategoryId('');
          setNote('');
          setAlreadyPaid(false);
          setName('');
          setAmount('');
          addOpen.value = false;
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
        <input placeholder="Descrizione (facoltativa)" aria-label="Descrizione voce" value={note} onInput={(e) => setNote(e.currentTarget.value)} />
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
  const all = buildItems(d, start, end).filter((i) => !(i.autoDebit && i.paid && i.day < today));
  const byCategory = (i: Item) => !categoriaFiltro.value || (categoriaFiltro.value === '__none' ? !i.categoryId : i.categoryId === categoriaFiltro.value);
  const items = all.filter(passes[filtro.value]).filter(byCategory);
  const res = residual(d, today, today);
  const av = available(d, today, d.settings.payDay ?? 10);
  const debitsTotal = av ? av.debits.reduce((s, i) => s + i.amount, 0) : 0;
  const groups: Array<{ day: Day; list: Item[] }> = [];
  for (const i of items) {
    const last = groups.at(-1);
    if (last && last.day === i.day) last.list.push(i);
    else groups.push({ day: i.day, list: [i] });
  }
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

      {(d.captures ?? []).length > 0 ? (
        <section class="card captures">
          <h3>Spese da confermare ({(d.captures ?? []).length})</h3>
          <p class="muted">Arrivate dalle notifiche. Controlla, scegli la categoria e conferma: la spesa conta subito come già pagata.</p>
          <ul class="items">
            {(d.captures ?? []).map((c) => <CaptureRow key={c.id} c={c} />)}
          </ul>
        </section>
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
          {av ? (
            <details class="how" data-testid="come-si-calcola">
              <summary>Come si calcola &quot;Usabile&quot;?</summary>
              <ol>
                <li>Parti dal <strong>saldo</strong> che hai inserito: {formatEuro(bal.value)} al {bal.day.split('-').reverse().join('/')}.</li>
                <li>Aggiungi o togli ciò che hai <strong>segnato come pagato o incassato dopo</strong> quel saldo ({(res ?? 0) - bal.value >= 0 ? '+' : '−'}{formatEuro(Math.abs((res ?? 0) - bal.value))}). Ottieni <strong>Sul conto (stimato)</strong>: {formatEuro(res ?? 0)}.</li>
                <li>Togli le <strong>uscite ancora da pagare</strong> con scadenza dopo il saldo e prima del {av.upTo.split('-').reverse().join('/')}: −{formatEuro(debitsTotal)}.</li>
                <li>Il risultato è <strong>Usabile</strong>: {formatEuro(av.value)}. È quanto puoi spendere senza andare in negativo prima di quella data.</li>
              </ol>
              <p class="muted">
                {d.settings.salaryRuleId && d.rules.some((r) => r.id === d.settings.salaryRuleId)
                  ? 'La data è quella della prossima entrata della regola dello stipendio che hai scelto nelle Impostazioni: da lì in poi arrivano nuovi soldi.'
                  : `La data è il giorno ${d.settings.payDay ?? 10} del mese, impostato come "Data di riferimento" nelle Impostazioni: da lì in poi arrivano nuovi soldi.`}
                {' '}Le entrate previste non vengono sommate finché non risultano incassate, e le uscite con addebito automatico entrano già nel saldo quando scatta la data.
              </p>
              {av.debits.length > 0 ? (
                <>
                  <p><strong>Uscite da pagare considerate</strong></p>
                  <ul class="items">
                    {av.debits.map((i) => (
                      <li class="drop" key={i.key}>
                        <span>{i.day.split('-').reverse().join('/').slice(0, 5)} {i.name}</span>
                        <span class="neg">−{formatEuro(i.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p class="muted">Nessuna uscita da pagare in questo periodo.</p>}
            </details>
          ) : null}
          <details>
            <summary>Aggiorna saldo</summary>
            <BalanceForm label="Aggiorna" />
          </details>
        </section>
      )}

      <details class="card add-card" open={addOpen.value || editingOneOff.value !== null} onToggle={(e) => { if (editingOneOff.value === null) addOpen.value = e.currentTarget.open; }}>
        <summary>{editingOneOff.value !== null ? 'Modifica la voce' : '+ Aggiungi una voce'}</summary>
        <AddOneOff key={editingOneOff.value ?? 'new'} />
      </details>

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

      {groups.length > 1 ? (
        <div class="row day-tools">
          <button class="link" onClick={() => (dayOpen.value = Object.fromEntries(groups.map((g) => [g.day, true])))}>Espandi tutti i giorni</button>
          <button class="link" onClick={() => (dayOpen.value = Object.fromEntries(groups.map((g) => [g.day, false])))}>Comprimi tutti i giorni</button>
        </div>
      ) : null}
      {groups.map((g) => {
        const net = g.list.reduce((t, i) => (i.skipped ? t : t + (i.kind === 'income' ? i.amount : -i.amount)), 0);
        const isOpen = dayOpen.value[g.day] ?? defaultOpen(g.day, g.list, today);
        return (
          <details class="day-group" key={g.day} open={isOpen} data-testid="day-group"
            onToggle={(e) => {
              const o = e.currentTarget.open;
              if (o !== isOpen) dayOpen.value = { ...dayOpen.value, [g.day]: o };
            }}>
            <summary>
              <span class="day-name">{dayLabel(g.day)}{g.day === today ? ' · oggi' : ''}</span>
              <span class="muted">{g.list.length} {g.list.length === 1 ? 'voce' : 'voci'}</span>
              <span class={net < 0 ? 'neg' : 'pos'}>{formatEuro(net)}</span>
            </summary>
            <ul class="items">
              {g.list.map((i) => <ItemRow key={i.key} item={i} />)}
            </ul>
          </details>
        );
      })}
      {items.length === 0 ? <p class="empty">{all.length === 0 ? 'Nessuna voce in questo mese.' : 'Nessuna voce con questo filtro.'}</p> : null}

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

      <button class="fab" aria-label="Aggiungi una voce" onClick={() => { addOpen.value = true; window.scrollTo?.({ top: 0, behavior: 'smooth' }); }}>+</button>
    </main>
  );
}

import { useState } from 'preact/hooks';
import { addDays, todayLocal } from '../domain/days';
import { formatEuro, parseEuro } from '../domain/money';
import { expandRule } from '../domain/recurrence';
import { buildRrule, parseRrule, validateSpec, type RecurrenceSpec } from '../domain/ruleBuilder';
import type { Kind, Rule } from '../domain/types';
import { data, deleteRule, mutate } from '../state/store';

const WD_LABEL = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MONTH_LABEL = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const WOM: Array<[number, string]> = [[1, '1ª'], [2, '2ª'], [3, '3ª'], [4, '4ª'], [-1, 'ultima']];
const fmtDay = (d: string) => d.split('-').reverse().join('/');

function toggle(list: number[] | undefined, v: number): number[] {
  const l = list ?? [];
  return l.includes(v) ? l.filter((x) => x !== v) : [...l, v].sort((a, b) => a - b);
}

function nextDates(rule: Rule, n: number): string[] {
  const today = todayLocal();
  const from = rule.start > today ? rule.start : today;
  return expandRule(rule, from, addDays(from, 366 * 5)).slice(0, n);
}

const EMPTY_SPEC: RecurrenceSpec = { freq: 'monthly', interval: 1, monthDay: 1 };

export function Regole() {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [variable, setVariable] = useState(false);
  const [autoDebit, setAutoDebit] = useState(false);
  const [spec, setSpec] = useState<RecurrenceSpec>(EMPTY_SPEC);
  const [start, setStart] = useState(todayLocal());
  const [end, setEnd] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cents = parseEuro(amount);
  const specError = validateSpec(spec);
  const preview: string[] = (() => {
    if (specError) return [];
    return nextDates(
      { id: 'p', name, kind, amount: 0, variable, rrule: buildRrule(spec), start, end: end || undefined, active: true },
      6,
    );
  })();

  function reset() {
    setEditingId(null); setName(''); setAmount(''); setVariable(false); setAutoDebit(false); setKind('expense');
    setSpec(EMPTY_SPEC); setStart(todayLocal()); setEnd(''); setError(null); setView('list');
  }

  function edit(r: Rule) {
    setEditingId(r.id); setName(r.name); setKind(r.kind);
    setAmount((r.amount / 100).toFixed(2).replace('.', ',')); setVariable(r.variable); setAutoDebit(r.autoDebit ?? false);
    setSpec(parseRrule(r.rrule)); setStart(r.start); setEnd(r.end ?? ''); setError(null); setView('form');
  }

  function save() {
    const problem =
      specError ?? (!name.trim() ? 'Scrivi un nome.' : cents === null ? 'Importo non valido.' : null);
    if (problem) return setError(problem);
    const rule: Rule = {
      id: editingId ?? crypto.randomUUID(),
      name: name.trim(), kind, amount: cents as number, variable,
      rrule: buildRrule(spec), start, ...(end ? { end } : {}), active: true,
      ...(autoDebit && kind === 'expense' ? { autoDebit: true } : {}),
    };
    void mutate((d) => ({
      ...d,
      rules: editingId ? d.rules.map((r) => (r.id === editingId ? { ...rule, active: r.active } : r)) : [...d.rules, rule],
    }));
    reset();
  }

  const num = (v: string) => Math.trunc(Number(v));
  const weekdayPills = () =>
    WD_LABEL.map((l, i) => (
      <label class="pill" key={l}><input type="checkbox" checked={spec.weekdays?.includes(i) ?? false}
        onChange={() => setSpec({ ...spec, weekdays: toggle(spec.weekdays, i) })} /> {l}</label>
    ));

  if (view === 'list') {
    return (
    <main class="screen">
      <h2>Regole</h2>
      <button onClick={() => setView('form')}>Nuova regola</button>
      <ul class="items">
        {data.value.rules.map((r) => (
          <li class={`item rule ${r.active ? '' : 'skipped'}`} key={r.id}>
            <input type="checkbox" aria-label={`Attiva: ${r.name}`} checked={r.active}
              onChange={(e) => {
                const active = e.currentTarget.checked;
                void mutate((d) => ({ ...d, rules: d.rules.map((x) => (x.id === r.id ? { ...x, active } : x)) }));
              }} />
            <span class="day">{r.kind === 'income' ? '+' : '−'}</span>
            <span class="name">
              {r.name}
              <small> {formatEuro(r.amount)}{r.variable ? ' (variabile)' : ''}{r.autoDebit ? ' · addebito automatico' : ''}{nextDates(r, 1)[0] ? ` · prossima ${fmtDay(nextDates(r, 1)[0])}` : ''}</small>
            </span>
            <span class="actions">
              <button class="link" onClick={() => edit(r)}>Modifica</button>
              <button class="link danger" aria-label={`Elimina: ${r.name}`}
                onClick={() => {
                  if (!window.confirm(`Eliminare la regola "${r.name}"? Spariranno anche le sue correzioni mensili.`)) return;
                  if (editingId === r.id) reset();
                  void deleteRule(r.id);
                }}>Elimina</button>
            </span>
          </li>
        ))}
        {data.value.rules.length === 0 ? <li class="empty">Nessuna regola ancora.</li> : null}
      </ul>
    </main>
    );
  }

  return (
    <main class="screen">
      <button class="link" onClick={reset}>‹ Torna alle regole</button>
      <section class="card">
        <h3>{editingId ? 'Modifica regola' : 'Nuova regola'}</h3>
        <div class="row">
          <input aria-label="Nome regola" placeholder="Nome" value={name} onInput={(e) => setName(e.currentTarget.value)} />
          <input aria-label="Importo regola" inputMode="decimal" placeholder="Importo" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
        </div>
        <div class="row">
          <select aria-label="Tipo regola" value={kind} onChange={(e) => setKind(e.currentTarget.value as Kind)}>
            <option value="expense">Uscita</option>
            <option value="income">Entrata</option>
          </select>
          <label class="check"><input type="checkbox" checked={variable} onChange={(e) => setVariable(e.currentTarget.checked)} /> Importo variabile (stima)</label>
        </div>
        {kind === 'expense' ? (
          <div class="row">
            <label class="check"><input type="checkbox" aria-label="Addebito automatico sul conto" checked={autoDebit} onChange={(e) => setAutoDebit(e.currentTarget.checked)} /> Addebito automatico sul conto <small class="muted">(alla scadenza risulta già pagata)</small></label>
          </div>
        ) : null}
        <fieldset class="group">
          <legend>Quando si ripete</legend>
          <div class="every">
            <span>Ogni</span>
            <input aria-label="Ogni N" type="number" min="1" value={spec.interval} onInput={(e) => setSpec({ ...spec, interval: num(e.currentTarget.value) })} />
            <select aria-label="Frequenza" value={spec.freq}
              onChange={(e) => {
                const freq = e.currentTarget.value as RecurrenceSpec['freq'];
                setSpec({ freq, interval: spec.interval, ...(freq === 'monthly' ? { monthDay: 1 } : freq === 'yearly' ? { monthDay: 1, months: [1] } : {}) });
              }}>
              <option value="daily">giorno/i</option>
              <option value="weekly">settimana/e</option>
              <option value="monthly">mese/i</option>
              <option value="yearly">anno/i</option>
            </select>
          </div>

          {spec.freq === 'weekly' ? (
            <div class="sub">
              <span class="sublabel">Nei giorni</span>
              <div class="pills">{weekdayPills()}</div>
            </div>
          ) : null}

          {spec.freq === 'monthly' || spec.freq === 'yearly' ? (
            <div class="sub">
              <span class="sublabel">Giorno del mese</span>
              <select aria-label="Giorno del mese" value={spec.monthDay === undefined ? '' : String(spec.monthDay)}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setSpec({ ...spec, monthDay: v === '' ? undefined : v === 'last' ? 'last' : Number(v), ...(v !== '' ? { weekOfMonth: [], weekdays: [] } : {}) });
                }}>
                <option value="">(nessun giorno fisso)</option>
                {Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                <option value="last">ultimo giorno del mese</option>
              </select>
            </div>
          ) : null}

          {spec.freq === 'monthly' ? (
            <div class="sub">
              <span class="sublabel">Oppure: ad esempio “la 2ª domenica del mese”</span>
              <div class="pills">
                {WOM.map(([v, l]) => (
                  <label class="pill" key={v}><input type="checkbox" checked={spec.weekOfMonth?.includes(v) ?? false}
                    onChange={() => { const w = toggle(spec.weekOfMonth, v); setSpec({ ...spec, weekOfMonth: w, ...(w.length ? { monthDay: undefined } : {}) }); }} /> {l}</label>
                ))}
              </div>
              {spec.weekOfMonth?.length ? <div class="pills">{weekdayPills()}</div> : null}
            </div>
          ) : null}

          {spec.freq === 'monthly' || spec.freq === 'yearly' ? (
            <div class="sub">
              <span class="sublabel">Solo nei mesi <small class="muted">(nessuno = tutti)</small></span>
              <div class="pills">
                {MONTH_LABEL.map((l, i) => (
                  <label class="pill" key={l}><input type="checkbox" checked={spec.months?.includes(i + 1) ?? false}
                    onChange={() => setSpec({ ...spec, months: toggle(spec.months, i + 1) })} /> {l}</label>
                ))}
              </div>
            </div>
          ) : null}
        </fieldset>
        <fieldset class="group">
          <legend>Periodo</legend>
          <div class="row dates">
            <label class="field">Inizio <input aria-label="Inizio" type="date" value={start} onInput={(e) => setStart(e.currentTarget.value)} /></label>
            <label class="field">Fine <small class="muted">(facoltativa)</small> <input aria-label="Fine" type="date" value={end} onInput={(e) => setEnd(e.currentTarget.value)} /></label>
          </div>
        </fieldset>
        <div>
          <small>Prossime date:</small>
          <ul class="preview">
            {preview.map((p) => <li data-testid="preview-date" key={p}>{fmtDay(p)}</li>)}
          </ul>
        </div>
        {error ? <p role="alert" class="neg">{error}</p> : null}
        <div class="row">
          <button onClick={save}>Salva regola</button>
          {editingId ? <button class="link" onClick={reset}>Annulla</button> : null}
        </div>
      </section>
    </main>
  );
}

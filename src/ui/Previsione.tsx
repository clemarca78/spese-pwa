import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { latestBalance } from '../domain/calc';
import { savingsPlan } from '../domain/savings';
import { parseEuro } from '../domain/money';
import { monthLabel } from '../domain/days';
import { biggestDrops, cumulativeFlows, firstBelow, forecast, monthlyFlows } from '../domain/forecast';
import { formatEuro } from '../domain/money';
import { data, mutate } from '../state/store';
import { LineChart } from './LineChart';

const HORIZONS: Array<[string, number]> = [['1 mese', 30], ['3 mesi', 90], ['6 mesi', 180], ['12 mesi', 365]];
export const horizonDays = signal(90);
const showIncome = signal(true);
const showExpense = signal(true);
const fmtDay = (d: string) => d.split('-').reverse().join('/');

function Accantonamento() {
  const d = data.value;
  const g = d.goal;
  const [name, setName] = useState(g?.name ?? '');
  const [amount, setAmount] = useState(g ? String(g.amount / 100).replace('.', ',') : '');
  const [day, setDay] = useState(g?.day ?? '');
  const [err, setErr] = useState('');
  const [margin, setMargin] = useState(d.settings.savingsMargin ? String(d.settings.savingsMargin / 100).replace('.', ',') : '');
  const saveMargin = (v: string) => {
    setMargin(v);
    const c = v.trim() === '' ? 0 : parseEuro(v);
    if (c === null || c < 0) return;
    void mutate((x) => ({ ...x, settings: { ...x.settings, savingsMargin: c || undefined } }));
  };
  const plan = savingsPlan(d, g ? { amount: g.amount, day: g.day } : undefined);
  const save = () => {
    const cents = parseEuro(amount);
    if (!name.trim()) return setErr('Scrivi il nome dell’obiettivo.');
    if (cents === null || cents <= 0) return setErr('Scrivi un importo valido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return setErr('Scegli la data entro cui ti serve.');
    const bal = latestBalance(d);
    if (bal && day <= bal.day) return setErr('La data deve essere dopo il giorno del saldo.');
    setErr('');
    void mutate((x) => ({ ...x, goal: { name: name.trim(), amount: cents, day } }));
  };
  return (
    <section class="card" aria-label="Accantonamento">
      <h3>Accantonamento</h3>
      <p class="muted">Quanto ti avanza davvero ogni mese (entrate meno uscite) e quanto puoi mettere da parte senza scendere sotto il margine, tenendo conto di regole, voci previste{d.settings.varieEnabled ? ' e spese varie stimate' : ''}.</p>
      {!d.settings.varieEnabled ? <p class="muted">Le spese varie (cibo e altro) non sono incluse: attiva &quot;Spese varie stimate&quot; qui sopra per un calcolo più prudente.</p> : null}
      <label>Margine da tenere sempre sul conto <input aria-label="Margine sul conto" inputMode="decimal" value={margin} placeholder="0" onInput={(e) => saveMargin(e.currentTarget.value)} /></label>
      {plan ? (
        <div data-testid="max-monthly">
          <p>{g ? 'Fino al ' + fmtDay(g.day) : 'Nei prossimi 6 mesi'}, in media, ti avanzano <strong>{formatEuro(plan.avgSurplus)}</strong> al mese (entrate meno uscite).</p>
          <p>Importo realistico da accantonare: <strong>{formatEuro(plan.realisticMonthly)}</strong> al mese. Il massimo possibile senza scendere sotto {formatEuro(d.settings.savingsMargin ?? 0)} sul conto è {formatEuro(plan.maxMonthly)}.</p>
        </div>
      ) : null}
      <div class="form">
        <label>Obiettivo <input aria-label="Nome obiettivo" value={name} placeholder="Comunione" onInput={(e) => setName(e.currentTarget.value)} /></label>
        <label>Importo da avere <input aria-label="Importo obiettivo" inputMode="decimal" value={amount} placeholder="2000" onInput={(e) => setAmount(e.currentTarget.value)} /></label>
        <label>Entro il <input aria-label="Data obiettivo" type="date" value={day} onInput={(e) => setDay(e.currentTarget.value)} /></label>
        {err ? <p role="alert" class="banner">{err}</p> : null}
        <div class="row">
          <button class="primary" onClick={save}>Salva obiettivo</button>
          {g ? <button onClick={() => { setName(''); setAmount(''); setDay(''); void mutate((x) => { const { goal: _g, ...rest } = x; return rest; }); }}>Rimuovi obiettivo</button> : null}
        </div>
      </div>
      {g && plan && plan.neededMonthly !== undefined ? (
        <div data-testid="goal-result">
          <p>Per avere <strong>{formatEuro(g.amount)}</strong> per {g.name} entro il {fmtDay(g.day)} servono <strong>{formatEuro(plan.neededMonthly)}</strong> al mese per {plan.months} {plan.months === 1 ? 'mese' : 'mesi'}.</p>
          {plan.reachable ? (
            <p class="pos">Ce la fai: versando {formatEuro(plan.neededMonthly)} al mese resti sopra il margine e ti avanza in media di più.</p>
          ) : (
            <p class="neg">Non basta: versando l&apos;importo realistico ({formatEuro(plan.realisticMonthly)} al mese) metti da parte {formatEuro(plan.savedAtMax ?? 0)} e ne mancano {formatEuro(plan.shortfall ?? 0)}.</p>
          )}
        </div>
      ) : null}
      {g && !plan ? <p class="banner">La data dell&apos;obiettivo è precedente all&apos;ultimo saldo: aggiornala.</p> : null}
    </section>
  );
}

export function Previsione() {
  const d = data.value;
  const bal = latestBalance(d);
  if (!bal) {
    return (
      <main class="screen">
        <h2>Previsione</h2>
        <section class="card"><h3>Inserisci il saldo</h3><p>Vai su Mese e scrivi quanto hai sul conto: la previsione parte da lì.</p></section>
      </main>
    );
  }
  const points = forecast(d, horizonDays.value);
  const below = firstBelow(points, 0);
  const drops = biggestDrops(points, 3);
  const flows = monthlyFlows(d, horizonDays.value);
  const cum = cumulativeFlows(d, horizonDays.value);
  const maxFlow = Math.max(1, ...flows.flatMap((m) => [m.income, m.expense + m.varie]));
  const total = flows.reduce((t, m) => ({ income: t.income + m.income, expense: t.expense + m.expense + m.varie }), { income: 0, expense: 0 });

  return (
    <main class="screen">
      <h2>Previsione</h2>
      <div class="row horizons" role="group" aria-label="Orizzonte">
        {HORIZONS.map(([label, days]) => (
          <button key={label} class={horizonDays.value === days ? 'chip active' : 'chip'} onClick={() => (horizonDays.value = days)}>
            {label}
          </button>
        ))}
      </div>
      <section class="card">
        <LineChart
          series={[
            { label: 'Saldo previsto', points },
            ...(showIncome.value ? [{ label: 'Entrate cumulate', points: cum.income, tone: 'in' as const }] : []),
            ...(showExpense.value ? [{ label: 'Uscite cumulate', points: cum.expense, tone: 'out' as const }] : []),
          ]}
        />
        <div class="legend" role="group" aria-label="Linee del grafico">
          <span class="legend-item fixed"><span class="dot s-saldo" /> Saldo previsto <span class="legend-val">{formatEuro(points.at(-1)?.balance ?? 0)}</span></span>
          <label class="legend-item">
            <input type="checkbox" aria-label="Mostra entrate" checked={showIncome.value} onChange={(e) => (showIncome.value = e.currentTarget.checked)} />
            <span class="dot s-in" /> Entrate cumulate <span class="legend-val">{formatEuro(cum.income.at(-1)?.balance ?? 0)}</span>
          </label>
          <label class="legend-item">
            <input type="checkbox" aria-label="Mostra uscite" checked={showExpense.value} onChange={(e) => (showExpense.value = e.currentTarget.checked)} />
            <span class="dot s-out" /> Uscite cumulate <span class="legend-val">{formatEuro(cum.expense.at(-1)?.balance ?? 0)}</span>
          </label>
        </div>
        <label class="check varie">
          <input type="checkbox" aria-label="Spese varie stimate" checked={d.settings.varieEnabled}
            onChange={(e) => {
              const varieEnabled = e.currentTarget.checked;
              void mutate((x) => ({ ...x, settings: { ...x.settings, varieEnabled } }));
            }} />
          Spese varie stimate
        </label>
        <p class="muted varie-hint">Aggiunge ogni giorno una spesa media, calcolata dai tuoi ultimi saldi, per quello che non registri (contanti, piccole spese).</p>
        <details class="guide">
          <summary>Come leggere il grafico</summary>
          <ul>
            <li><strong>Linea blu: saldo previsto.</strong> Parte dall&apos;ultimo saldo che hai inserito (data a sinistra) e arriva alla fine dell&apos;orizzonte (data a destra). Scende quando c&apos;è un&apos;uscita e sale quando arriva un&apos;entrata.</li>
            <li><strong>Linea orizzontale sottile: lo zero.</strong> Quando il saldo è sotto zero sei in negativo: quel tratto diventa rosso e in alto compare l&apos;avviso con il primo giorno critico.</li>
            <li><strong>Linea verde: entrate cumulate.</strong> Quanto è entrato in totale dal giorno del saldo. Sale a gradini nei giorni di accredito.</li>
            <li><strong>Linea rossa: uscite cumulate.</strong> Quanto è uscito in totale dal giorno del saldo, comprese le spese varie se le attivi. Sale a gradini nei giorni di addebito.</li>
            <li><strong>Come tornano i conti:</strong> saldo = saldo di partenza + entrate cumulate − uscite cumulate.</li>
            <li><strong>I numeri a destra</strong> sono il valore finale di ogni linea, dello stesso colore: dove arriva il saldo, quanto è entrato e quanto è uscito in totale. Gli stessi valori sono scritti nelle pillole sotto il grafico. Con le linee cumulate la scala può allargarsi: nascondile toccando le pillole se vuoi vedere meglio il saldo.</li>
            <li><strong>Sotto il grafico</strong> trovi mese per mese entrate, uscite e differenza (tocca un mese per vedere le voci) e i tre giorni critici, cioè quelli con il calo maggiore.</li>
          </ul>
        </details>
      </section>
      {below ? (
        <p class="banner">Il saldo scende sotto zero il {fmtDay(below.day)} ({formatEuro(below.balance)}).</p>
      ) : (
        <p class="muted">Nell&apos;orizzonte scelto il saldo resta sopra zero.</p>
      )}
      <section class="card">
        <h3>Entrate e uscite per mese</h3>
        <p class="muted">Dal {fmtDay(points[0].day)} per {HORIZONS.find(([, g]) => g === horizonDays.value)?.[0]}. Tocca un mese per vedere le voci.</p>
        {flows.map((m) => (
          <details class="flow" key={m.month}>
            <summary data-testid="flow-month">
              <span class="flow-head">
                <strong>{monthLabel(m.month)}</strong>
                <span class={m.income - m.expense - m.varie < 0 ? 'neg' : 'pos'}>{formatEuro(m.income - m.expense - m.varie)}</span>
              </span>
              <span class="flow-bars" aria-hidden="true">
                <span class="bar in" style={{ width: `${(m.income / maxFlow) * 100}%`, minWidth: m.income > 0 ? 2 : 0 }} />
                <span class="bar out" style={{ width: `${((m.expense + m.varie) / maxFlow) * 100}%`, minWidth: m.expense + m.varie > 0 ? 2 : 0 }} />
              </span>
              <span class="flow-nums">
                <span class="pos">Entrate {formatEuro(m.income)}</span>
                <span class="neg">Uscite {formatEuro(m.expense + m.varie)}</span>
              </span>
            </summary>
            <ul class="items">
              {m.items.map((p, i) => (
                <li class="drop" key={`${p.item.key}-${i}`}>
                  <span>{fmtDay(p.day).slice(0, 5)} <span>{p.item.name}</span></span>
                  <span class={p.item.kind === 'income' ? 'pos' : 'neg'}>{p.item.kind === 'income' ? '+' : '−'}{formatEuro(p.item.amount)}</span>
                </li>
              ))}
              {m.varie > 0 ? (
                <li class="drop"><span>Spese varie stimate</span><span class="neg">−{formatEuro(m.varie)}</span></li>
              ) : null}
              {m.items.length === 0 && m.varie === 0 ? <li class="empty">Nessuna voce prevista.</li> : null}
            </ul>
          </details>
        ))}
        <div class="flow-total">
          <span class="pos">Entrate {formatEuro(total.income)}</span>
          <span class="neg">Uscite {formatEuro(total.expense)}</span>
          <strong class={total.income - total.expense < 0 ? 'neg' : 'pos'}>Differenza {formatEuro(total.income - total.expense)}</strong>
        </div>
      </section>
      <Accantonamento />
      <section class="card">
        <h3>Giorni critici</h3>
        <ul class="items">
          {drops.map((x) => (
            <li class="drop" key={x.day}>
              <span data-testid="drop-day">{fmtDay(x.day)}</span>
              <span class="neg">{formatEuro(x.delta)}</span>
            </li>
          ))}
          {drops.length === 0 ? <li class="empty">Nessuna uscita prevista.</li> : null}
        </ul>
      </section>
    </main>
  );
}

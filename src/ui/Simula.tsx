import { useState } from 'preact/hooks';
import { latestBalance } from '../domain/calc';
import { addDays, diffDays, todayLocal } from '../domain/days';
import { forecast } from '../domain/forecast';
import { formatEuro, parseEuro } from '../domain/money';
import { findFeasible, simulateAt } from '../domain/simulator';
import type { Day } from '../domain/types';
import { addOneOff, data } from '../state/store';
import { LineChart } from './LineChart';

const WINDOW_DAYS = 90;
const fmtDay = (d: string) => d.split('-').reverse().join('/');

const VERDICT_TEXT = {
  ok: 'Puoi permettertela.',
  tight: 'Ci stai stretto: il saldo resta sopra il margine di poco.',
  below: 'Non te la puoi permettere in quella data: il saldo scende sotto il margine.',
} as const;

export function Simula({ today = todayLocal() }: { today?: Day }) {
  const [mode, setMode] = useState<'A' | 'B'>('A');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [margin, setMargin] = useState('0');
  const [dateA, setDateA] = useState<Day>(today);

  const bal = latestBalance(data.value);
  if (!bal) {
    return (
      <main class="screen">
        <h2>Simula una spesa</h2>
        <section class="card"><h3>Inserisci il saldo</h3><p>Vai su Mese e scrivi quanto hai sul conto: la simulazione parte da lì.</p></section>
      </main>
    );
  }

  const cents = parseEuro(amount);
  const marginCents = parseEuro(margin) ?? 0;
  const from = today > bal.day ? today : bal.day;
  const windowEnd = addDays(from, WINDOW_DAYS);
  const lastNeeded = mode === 'A' ? dateA : windowEnd;
  const horizon = Math.max(diffDays(bal.day, lastNeeded), 0) + WINDOW_DAYS;
  const points = forecast(data.value, horizon);

  const sim = mode === 'A' && cents !== null && cents > 0 ? simulateAt(points, cents, dateA, marginCents) : null;
  const feas = mode === 'B' && cents !== null && cents > 0 ? findFeasible(points, cents, marginCents, from, windowEnd) : null;
  const chosenDay: Day | undefined = mode === 'A' ? (sim ? dateA : undefined) : feas?.first;

  function addToList() {
    if (cents === null || !chosenDay) return;
    void addOneOff({ name: name.trim() || 'Spesa programmata', kind: 'expense', amount: cents, day: chosenDay, paid: false });
  }

  return (
    <main class="screen">
      <h2>Simula una spesa</h2>
      <div class="row chips" role="group" aria-label="Modalità">
        <button class={mode === 'A' ? 'chip active' : 'chip'} onClick={() => setMode('A')}>Posso permettermela?</button>
        <button class={mode === 'B' ? 'chip active' : 'chip'} onClick={() => setMode('B')}>Quando posso farla?</button>
      </div>

      <section class="card">
        <div class="row">
          <input aria-label="Nome spesa" placeholder="Cosa (facoltativo)" value={name} onInput={(e) => setName(e.currentTarget.value)} />
          <input aria-label="Importo spesa" inputMode="decimal" placeholder="Importo" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
        </div>
        <div class="row">
          <label>Margine di sicurezza <input aria-label="Margine di sicurezza" inputMode="decimal" value={margin} onInput={(e) => setMargin(e.currentTarget.value)} /></label>
          {mode === 'A' ? (
            <label>Data <input aria-label="Data spesa" type="date" value={dateA} onInput={(e) => setDateA(e.currentTarget.value)} /></label>
          ) : (
            <span class="muted">Cerco nei prossimi {WINDOW_DAYS} giorni.</span>
          )}
        </div>
      </section>

      {sim ? (
        <section class="card">
          <h3 class={sim.verdict === 'below' ? 'neg' : sim.verdict === 'tight' ? '' : 'pos'}>{VERDICT_TEXT[sim.verdict]}</h3>
          <p>Saldo più basso dopo la spesa: <strong>{formatEuro(sim.minBalance)}</strong> il {fmtDay(sim.minDay)}.</p>
          <p>Saldo a fine mese: <strong>{formatEuro(sim.endOfMonthBalance)}</strong>.</p>
          <LineChart threshold={marginCents} series={[
            { label: 'Previsione di base', points },
            { label: 'Con la spesa', points: sim.withPurchase, dashed: true },
          ]} />
        </section>
      ) : null}

      {feas ? (
        <section class="card">
          {feas.first ? (
            <>
              <h3 class="pos">Prima data possibile: {fmtDay(feas.first)}</h3>
              <ul>
                {feas.ranges.map(([a, b]) => <li key={a}>dal {fmtDay(a)} al {fmtDay(b)}</li>)}
              </ul>
            </>
          ) : feas.baselineBelowMargin ? (
            <h3 class="neg">La previsione è già sotto il margine, anche senza questa spesa.</h3>
          ) : feas.shortfall !== undefined ? (
            <h3 class="neg">In questi {WINDOW_DAYS} giorni la spesa dovrebbe diminuire di {formatEuro(feas.shortfall)}.</h3>
          ) : null}
        </section>
      ) : null}

      {chosenDay ? <button onClick={addToList}>Aggiungi come voce una tantum</button> : null}
      {sim || feas ? <p class="muted">La previsione è una stima: stipendio, bollette e spese varie cambiano di mese in mese.</p> : null}
    </main>
  );
}

import { signal } from '@preact/signals';
import { latestBalance } from '../domain/calc';
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
      <div class="row chips" role="group" aria-label="Orizzonte">
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
        <div class="chart-legend">
          <span><span class="dot s-saldo" /> Saldo</span>
          <label><input type="checkbox" aria-label="Mostra entrate" checked={showIncome.value} onChange={(e) => (showIncome.value = e.currentTarget.checked)} /><span class="dot s-in" /> Entrate cumulate</label>
          <label><input type="checkbox" aria-label="Mostra uscite" checked={showExpense.value} onChange={(e) => (showExpense.value = e.currentTarget.checked)} /><span class="dot s-out" /> Uscite cumulate</label>
        </div>
        <label class="switch">
          <input type="checkbox" checked={d.settings.varieEnabled}
            onChange={(e) => {
              const varieEnabled = e.currentTarget.checked;
              void mutate((x) => ({ ...x, settings: { ...x.settings, varieEnabled } }));
            }} />{' '}
          Spese varie stimate
        </label>
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

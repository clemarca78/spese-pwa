import { signal } from '@preact/signals';
import { latestBalance } from '../domain/calc';
import { biggestDrops, firstBelow, forecast } from '../domain/forecast';
import { formatEuro } from '../domain/money';
import { data, mutate } from '../state/store';
import { LineChart } from './LineChart';

const HORIZONS: Array<[string, number]> = [['1 mese', 30], ['3 mesi', 90], ['6 mesi', 180], ['12 mesi', 365]];
export const horizonDays = signal(90);
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
        <LineChart series={[{ label: 'Saldo previsto', points }]} />
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
        <h3>Giorni critici</h3>
        <ul class="items">
          {drops.map((x) => (
            <li class="item" key={x.day}>
              <span class="name" data-testid="drop-day">{fmtDay(x.day)}</span>
              <span class="amount neg">{formatEuro(x.delta)}</span>
            </li>
          ))}
          {drops.length === 0 ? <li class="empty">Nessuna uscita prevista.</li> : null}
        </ul>
      </section>
    </main>
  );
}

import { formatEuro } from '../domain/money';
import type { Cents, ForecastPoint } from '../domain/types';

export interface Series {
  label: string;
  points: ForecastPoint[];
  dashed?: boolean;
  /** Colore: verde per le entrate, rosso per le uscite. */
  tone?: 'in' | 'out';
}

const W = 340;
const H = 200;
const PAD = { l: 8, r: 8, t: 12, b: 24 };
const fmtDay = (d: string) => d.split('-').reverse().join('/');
const compact = (c: Cents) => formatEuro(Math.round(c / 100) * 100).replace(/,00/, '');

/** Grafico a linee in SVG, senza librerie. La parte sotto `threshold` è colorata in rosso. */
export function LineChart({ series, threshold = 0 }: { series: Series[]; threshold?: Cents }) {
  const all = series.flatMap((s) => s.points.map((p) => p.balance));
  const n = Math.max(0, ...series.map((s) => s.points.length));
  const lo = Math.min(threshold, ...all);
  const hi = Math.max(threshold, ...all);
  const span = hi - lo || 1;
  const x = (i: number) => PAD.l + (n <= 1 ? (W - PAD.l - PAD.r) / 2 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v: Cents) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);
  const path = (pts: ForecastPoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  const anyBelow = series.some((s) => s.points.some((p) => p.balance < threshold));
  const ty = y(threshold);
  const first = series[0]?.points[0];
  const last = series[0]?.points.at(-1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="chart" role="img" data-count={series[0]?.points.length ?? 0}
      aria-label={series.map((s) => s.label).join(' / ')}>
      <defs>
        <clipPath id="below-clip"><rect x="0" y={ty} width={W} height={Math.max(0, H - ty)} /></clipPath>
      </defs>
      <line data-testid="threshold" x1={PAD.l} x2={W - PAD.r} y1={ty} y2={ty} class="chart-zero" />
      {series.map((s, i) => (
        <path key={s.label} data-testid="series-path" d={path(s.points)} fill="none"
          class={`chart-line s${i}${s.tone ? ` tone-${s.tone}` : ''}`} stroke-dasharray={s.dashed ? '5 4' : undefined} />
      ))}
      {anyBelow
        ? series.map((s) => (
            <path key={`b-${s.label}`} data-testid="below-zero" d={path(s.points)} fill="none"
              class="chart-below" clip-path="url(#below-clip)" />
          ))
        : null}
      <text x={PAD.l} y={H - 6} class="chart-label">{first ? fmtDay(first.day) : ''}</text>
      <text x={W - PAD.r} y={H - 6} text-anchor="end" class="chart-label">{last ? fmtDay(last.day) : ''}</text>
      {all.length ? <text x={W - PAD.r} y={PAD.t - 2} text-anchor="end" class="chart-label">{compact(hi)}</text> : null}
      {all.length ? <text x={W - PAD.r} y={H - PAD.b - 4} text-anchor="end" class="chart-label">{compact(lo)}</text> : null}
    </svg>
  );
}

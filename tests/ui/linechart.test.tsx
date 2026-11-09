import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { LineChart } from '../../src/ui/LineChart';

afterEach(cleanup);

const pts = (vals: number[]) => vals.map((balance, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, balance }));

describe('LineChart', () => {
  it('disegna un path per serie e la linea di soglia', () => {
    const { container } = render(
      <LineChart series={[{ label: 'Base', points: pts([100, 50, 80]) }, { label: 'Con spesa', points: pts([100, 20, 50]), dashed: true }]} />,
    );
    expect(container.querySelectorAll('[data-testid="series-path"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="threshold"]')).not.toBeNull();
  });
  it('evidenzia la parte sotto soglia solo se esiste', () => {
    const below = render(<LineChart series={[{ label: 'Base', points: pts([100, -50, 80]) }]} />);
    expect(below.container.querySelector('[data-testid="below-zero"]')).not.toBeNull();
    cleanup();
    const fine = render(<LineChart series={[{ label: 'Base', points: pts([100, 50, 80]) }]} />);
    expect(fine.container.querySelector('[data-testid="below-zero"]')).toBeNull();
  });
  it('una serie con tono usa il colore delle entrate o delle uscite', () => {
    const { container } = render(
      <LineChart series={[{ label: 'Saldo', points: pts([1, 2]) }, { label: 'Entrate', points: pts([0, 5]), tone: 'in' }, { label: 'Uscite', points: pts([0, 3]), tone: 'out' }]} />,
    );
    expect(container.querySelector('path.tone-in')).not.toBeNull();
    expect(container.querySelector('path.tone-out')).not.toBeNull();
  });
  it('mostra il valore finale di ogni linea, senza sovrapporre le etichette', () => {
    const { container } = render(
      <LineChart series={[{ label: 'Saldo', points: pts([100000, 99000]) }, { label: 'Entrate', points: pts([0, 99500]), tone: 'in' }, { label: 'Uscite', points: pts([0, 100500]), tone: 'out' }]} />,
    );
    const labels = Array.from(container.querySelectorAll('[data-testid="end-label"]'));
    expect(labels.map((l) => (l.textContent ?? '').replace(/ /g, ' '))).toEqual(['990 €', '995 €', '1.005 €']);
    const ys = labels.map((l) => Number(l.getAttribute('y'))).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(11);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(11);
  });
  it('espone il numero di punti', () => {
    const { container } = render(<LineChart series={[{ label: 'Base', points: pts([1, 2, 3, 4]) }]} />);
    expect(container.querySelector('svg')?.getAttribute('data-count')).toBe('4');
  });
  it('non si rompe senza punti', () => {
    const { container } = render(<LineChart series={[{ label: 'Base', points: [] }]} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

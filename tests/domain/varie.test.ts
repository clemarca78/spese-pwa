import { describe, expect, it } from 'vitest';
import { estimateDailyVarie } from '../../src/domain/varie';
import { emptyTestData } from './fixtures';

describe('estimateDailyVarie', () => {
  it('stima le spese non tracciate tra due saldi', () => {
    const d = emptyTestData();
    d.balances = [{ value: 200000, day: '2026-11-01' }, { value: 150000, day: '2026-11-11' }];
    d.oneOffs = [{ id: 'o', name: 'x', kind: 'expense', amount: 30000, day: '2026-11-05', paid: false }];
    expect(estimateDailyVarie(d)).toBe(2000);
  });
  it('non è mai negativa', () => {
    const d = emptyTestData();
    d.balances = [{ value: 150000, day: '2026-11-01' }, { value: 260000, day: '2026-11-11' }];
    expect(estimateDailyVarie(d)).toBe(0);
  });
  it('con meno di 2 saldi usa il default', () => {
    const d = emptyTestData();
    d.settings.varieDailyDefault = 4600;
    d.balances = [{ value: 1, day: '2026-11-01' }];
    expect(estimateDailyVarie(d)).toBe(4600);
  });
  it('conta solo le ultime 4 coppie di saldi', () => {
    const d = emptyTestData();
    // coppie 1-2: calo enorme (500000 in 10 giorni), poi 4 coppie da 10000 (11+10+10+10 giorni)
    d.balances = [
      { value: 1000000, day: '2026-01-01' }, { value: 500000, day: '2026-01-11' }, { value: 0, day: '2026-01-21' },
      { value: -10000, day: '2026-02-01' }, { value: -20000, day: '2026-02-11' },
      { value: -30000, day: '2026-02-21' }, { value: -40000, day: '2026-03-03' },
    ];
    expect(estimateDailyVarie(d)).toBe(Math.round(40000 / 41));
  });
});

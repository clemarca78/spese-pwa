import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { emptyData } from '../../src/storage/backup';
import { openRepo } from '../../src/storage/repo';

describe('repo', () => {
  it('load su db vuoto restituisce i dati vuoti', async () => {
    const repo = await openRepo('t-empty');
    expect(await repo.load()).toEqual(emptyData());
  });
  it('save poi load restituisce gli stessi dati', async () => {
    const repo = await openRepo('t-save');
    const d = emptyData();
    d.balances = [{ value: 150000, day: '2026-11-03' }];
    await repo.save(d);
    expect(await repo.load()).toEqual(d);
  });
  it('meta di sync: round-trip', async () => {
    const repo = await openRepo('t-meta');
    expect(await repo.loadMeta()).toEqual({});
    await repo.saveMeta({ lastSyncedAt: '2026-11-03T10:00:00.000Z' });
    expect(await repo.loadMeta()).toEqual({ lastSyncedAt: '2026-11-03T10:00:00.000Z' });
  });
});

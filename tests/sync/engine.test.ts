import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { AppData } from '../../src/domain/types';
import { decideSync, runSync, type SyncAdapter } from '../../src/sync/engine';
import { emptyData } from '../../src/storage/backup';
import { openRepo } from '../../src/storage/repo';

const T1 = '2026-11-01T10:00:00.000Z';
const T2 = '2026-11-02T10:00:00.000Z';
const T3 = '2026-11-03T10:00:00.000Z';

describe('decideSync', () => {
  it('remoto assente: push', () => expect(decideSync(T2, null, undefined)).toBe('push'));
  it('nulla di cambiato: none', () => expect(decideSync(T1, T1, T1)).toBe('none'));
  it('solo locale cambiato: push', () => expect(decideSync(T2, T1, T1)).toBe('push'));
  it('solo remoto cambiato: pull', () => expect(decideSync(T1, T2, T1)).toBe('pull'));
  it('entrambi cambiati: conflict', () => expect(decideSync(T3, T2, T1)).toBe('conflict'));
  it('primo sync con dati locali diversi dal remoto: conflict', () =>
    expect(decideSync(T2, T3, undefined)).toBe('conflict'));
  it('primo sync su telefono vuoto: pull', () =>
    expect(decideSync(emptyData().updatedAt, T3, undefined)).toBe('pull'));
});

function fakeAdapter(remote: AppData | null, opts: { failPull?: boolean } = {}) {
  const state = { remote, pushed: 0 };
  const adapter: SyncAdapter = {
    async metadata() {
      return state.remote ? { updatedAt: state.remote.updatedAt } : null;
    },
    async pull() {
      if (opts.failPull) throw new Error('rete');
      return state.remote as AppData;
    },
    async push(d) {
      state.remote = d;
      state.pushed++;
    },
  };
  return { adapter, state };
}

const withTime = (updatedAt: string, value = 0): AppData => ({
  ...emptyData(),
  updatedAt,
  balances: [{ value, day: '2026-11-03' }],
});

describe('runSync', () => {
  it('push dei dati locali quando manca il remoto', async () => {
    const repo = await openRepo('s-push');
    await repo.save(withTime(T2, 1));
    const { adapter, state } = fakeAdapter(null);
    expect(await runSync(adapter, repo, async () => 'local')).toBe('pushed');
    expect(state.remote?.updatedAt).toBe(T2);
    expect((await repo.loadMeta()).lastSyncedAt).toBe(T2);
  });
  it('pull quando solo il remoto è cambiato', async () => {
    const repo = await openRepo('s-pull');
    await repo.save(withTime(T1, 1));
    await repo.saveMeta({ lastSyncedAt: T1 });
    const { adapter } = fakeAdapter(withTime(T2, 2));
    expect(await runSync(adapter, repo, async () => 'local')).toBe('pulled');
    expect((await repo.load()).balances[0].value).toBe(2);
  });
  it('conflitto: scelta remote sostituisce i dati locali', async () => {
    const repo = await openRepo('s-conf-remote');
    await repo.save(withTime(T3, 3));
    await repo.saveMeta({ lastSyncedAt: T1 });
    const { adapter } = fakeAdapter(withTime(T2, 2));
    await runSync(adapter, repo, async () => 'remote');
    expect((await repo.load()).balances[0].value).toBe(2);
  });
  it('conflitto: scelta local sovrascrive il remoto', async () => {
    const repo = await openRepo('s-conf-local');
    await repo.save(withTime(T3, 3));
    await repo.saveMeta({ lastSyncedAt: T1 });
    const { adapter, state } = fakeAdapter(withTime(T2, 2));
    await runSync(adapter, repo, async () => 'local');
    expect(state.remote?.balances[0].value).toBe(3);
  });
  it('errore di rete: propaga e lascia i dati locali intatti', async () => {
    const repo = await openRepo('s-fail');
    const local = withTime(T1, 1);
    await repo.save(local);
    await repo.saveMeta({ lastSyncedAt: T1 });
    const { adapter } = fakeAdapter(withTime(T2, 2), { failPull: true });
    await expect(runSync(adapter, repo, async () => 'local')).rejects.toThrow('rete');
    expect(await repo.load()).toEqual(local);
  });
});

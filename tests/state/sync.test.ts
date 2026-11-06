import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DriveError } from '../../src/sync/drive';
import type { SyncAdapter } from '../../src/sync/engine';
import { conflictResolver, syncNow } from '../../src/state/sync';
import { data, initStore, mutate, setPaid, syncStatus } from '../../src/state/store';
import { emptyData } from '../../src/storage/backup';
import { openRepo, type Repo } from '../../src/storage/repo';

let repo: Repo;
let n = 0;
beforeEach(async () => {
  repo = await openRepo(`sync-${n++}`);
  await initStore(repo);
  await mutate((d) => ({ ...d, balances: [{ value: 5, day: '2026-11-03' }] }));
});

const failing = (err: Error): SyncAdapter => ({
  metadata: async () => { throw err; },
  pull: async () => { throw err; },
  push: async () => { throw err; },
});

describe('syncNow', () => {
  it('errore di rete: stato offline e nessuna perdita di dati', async () => {
    const before = data.value;
    await syncNow(repo, failing(new TypeError('Failed to fetch')));
    expect(syncStatus.value).toBe('offline');
    expect(data.value).toEqual(before);
    expect(await repo.load()).toEqual(before);
  });
  it('sessione scaduta: stato error', async () => {
    await syncNow(repo, failing(new DriveError('AUTH_EXPIRED', 'scaduta')));
    expect(syncStatus.value).toBe('error');
  });
  it('pull aggiorna lo stato in memoria', async () => {
    const remote = { ...emptyData(), updatedAt: '2999-01-01T00:00:00.000Z', balances: [{ value: 77, day: '2026-11-04' }] };
    await repo.saveMeta({ lastSyncedAt: data.value.updatedAt });
    const adapter: SyncAdapter = { metadata: async () => ({ updatedAt: remote.updatedAt }), pull: async () => remote, push: async () => {} };
    await syncNow(repo, adapter);
    expect(data.value.balances[0].value).toBe(77);
    expect(syncStatus.value).toBe('idle');
  });
  it('conflitto: aspetta la scelta dell\'utente', async () => {
    const remote = { ...emptyData(), updatedAt: '2999-01-01T00:00:00.000Z' };
    await repo.saveMeta({ lastSyncedAt: '2000-01-01T00:00:00.000Z' });
    let pushed = false;
    const adapter: SyncAdapter = { metadata: async () => ({ updatedAt: remote.updatedAt }), pull: async () => remote, push: async () => { pushed = true; } };
    const p = syncNow(repo, adapter);
    await new Promise((r) => setTimeout(r, 20));
    expect(syncStatus.value).toBe('conflict');
    conflictResolver.value?.('local');
    await p;
    expect(pushed).toBe(true);
    expect(syncStatus.value).toBe('idle');
  });
  it('una modifica fatta mentre il pull è in corso non viene sovrascritta', async () => {
    await mutate((d) => ({ ...d, oneOffs: [{ id: 'o1', name: 'x', kind: 'expense', amount: 100, day: '2026-11-10', paid: false }] }));
    await repo.saveMeta({ lastSyncedAt: '2000-01-01T00:00:00.000Z' });
    const remote = { ...emptyData(), updatedAt: '2999-01-01T00:00:00.000Z' };
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const adapter: SyncAdapter = {
      metadata: async () => ({ updatedAt: remote.updatedAt }),
      pull: async () => { await gate; return remote; },
      push: async () => {},
    };
    const p = syncNow(repo, adapter);
    await new Promise((r) => setTimeout(r, 20));
    expect(syncStatus.value).toBe('conflict');
    conflictResolver.value?.('remote'); // l'utente sceglie Drive, ma intanto modifica
    await setPaid({ key: 'o1', oneOffId: 'o1', name: 'x', kind: 'expense', day: '2026-11-10', amount: 100, estimated: false, paid: false, skipped: false }, true);
    release();
    await p;
    expect(data.value.oneOffs[0]?.paid).toBe(true); // la modifica locale non è stata persa
    expect((await repo.load()).oneOffs[0]?.paid).toBe(true);
  });
  it('due sync in parallelo ne eseguono una sola', async () => {
    let pushes = 0;
    let metas = 0;
    const adapter: SyncAdapter = {
      metadata: async () => { metas++; await new Promise((r) => setTimeout(r, 20)); return null; },
      pull: async () => emptyData(),
      push: async () => { pushes++; },
    };
    await Promise.all([syncNow(repo, adapter), syncNow(repo, adapter)]);
    expect(metas).toBe(1);
    expect(pushes).toBe(1);
  });
});

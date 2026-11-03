import { openDB } from 'idb';
import type { AppData } from '../domain/types';
import { emptyData } from './backup';

export interface SyncMeta {
  lastSyncedAt?: string;
  driveConnected?: boolean;
}

export interface Repo {
  load(): Promise<AppData>;
  save(d: AppData): Promise<void>;
  loadMeta(): Promise<SyncMeta>;
  saveMeta(m: SyncMeta): Promise<void>;
}

/** Un solo record 'data' + un record 'meta' nello store 'kv'. */
export async function openRepo(dbName = 'spese-app'): Promise<Repo> {
  const db = await openDB(dbName, 1, {
    upgrade(d) {
      d.createObjectStore('kv');
    },
  });
  return {
    async load() {
      return ((await db.get('kv', 'data')) as AppData | undefined) ?? emptyData();
    },
    async save(d) {
      await db.put('kv', d, 'data');
    },
    async loadMeta() {
      return ((await db.get('kv', 'meta')) as SyncMeta | undefined) ?? {};
    },
    async saveMeta(m) {
      await db.put('kv', m, 'meta');
    },
  };
}

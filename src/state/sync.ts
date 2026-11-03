import { signal } from '@preact/signals';
import { createDriveAdapter } from '../sync/drive';
import { runSync, type ConflictChoice, type SyncAdapter } from '../sync/engine';
import { getAccessToken, signOutGoogle } from '../sync/googleAuth';
import type { Repo } from '../storage/repo';
import { applyRemote, setSyncHook, syncStatus } from './store';

export const driveConnected = signal(false);
export const lastSyncAt = signal<string | undefined>(undefined);
/** Impostato mentre c'è un conflitto in attesa della scelta dell'utente. */
export const conflictResolver = signal<((c: ConflictChoice) => void) | null>(null);

let inFlight: Promise<void> | null = null;

/** Una sola sync alla volta: le chiamate durante una sync in corso ne attendono l'esito. */
export function syncNow(repo: Repo, adapter: SyncAdapter): Promise<void> {
  inFlight ??= doSync(repo, adapter).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(repo: Repo, adapter: SyncAdapter): Promise<void> {
  syncStatus.value = 'syncing';
  try {
    const result = await runSync(
      adapter,
      repo,
      () =>
        new Promise<ConflictChoice>((resolve) => {
          syncStatus.value = 'conflict';
          conflictResolver.value = (c) => {
            conflictResolver.value = null;
            syncStatus.value = 'syncing';
            resolve(c);
          };
        }),
      applyRemote,
    );
    void result;
    lastSyncAt.value = new Date().toISOString();
    syncStatus.value = 'idle';
  } catch (e) {
    // errore di rete (fetch lancia TypeError) o offline: si resta in locale
    syncStatus.value = e instanceof TypeError || navigator.onLine === false ? 'offline' : 'error';
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let online: (() => void) | null = null;

function drive(repo: Repo) {
  const adapter = createDriveAdapter(getAccessToken);
  const run = () => void syncNow(repo, adapter);
  setSyncHook(() => {
    clearTimeout(timer);
    timer = setTimeout(run, 2000); // debounce dopo ogni modifica
  });
  if (online) window.removeEventListener('online', online);
  online = run;
  window.addEventListener('online', online);
  return run;
}

/** All'avvio: se Drive era collegato, riattiva la sync. */
export async function startSync(repo: Repo): Promise<void> {
  const meta = await repo.loadMeta();
  driveConnected.value = !!meta.driveConnected;
  if (meta.driveConnected) drive(repo)();
}

export async function connectDrive(repo: Repo): Promise<void> {
  await getAccessToken(); // popup di consenso Google
  await repo.saveMeta({ ...(await repo.loadMeta()), driveConnected: true });
  driveConnected.value = true;
  drive(repo)();
}

export async function disconnectDrive(repo: Repo): Promise<void> {
  signOutGoogle();
  clearTimeout(timer);
  setSyncHook(null);
  if (online) window.removeEventListener('online', online);
  online = null;
  const { lastSyncedAt: _drop, ...rest } = await repo.loadMeta();
  await repo.saveMeta({ ...rest, driveConnected: false });
  driveConnected.value = false;
  syncStatus.value = 'idle';
}

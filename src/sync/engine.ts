import type { AppData } from '../domain/types';
import { emptyData } from '../storage/backup';
import type { Repo } from '../storage/repo';

export interface SyncAdapter {
  /** null = nessun file remoto */
  metadata(): Promise<{ updatedAt: string } | null>;
  pull(): Promise<AppData>;
  push(d: AppData): Promise<void>;
}

export type SyncDecision = 'none' | 'push' | 'pull' | 'conflict';
export type ConflictChoice = 'local' | 'remote';

export function decideSync(
  localUpdatedAt: string,
  remoteUpdatedAt: string | null,
  lastSyncedAt?: string,
): SyncDecision {
  if (remoteUpdatedAt === null) return 'push';
  if (lastSyncedAt === undefined) {
    if (localUpdatedAt === remoteUpdatedAt) return 'none';
    // telefono mai usato (archivio vuoto): si scarica il remoto senza chiedere
    if (localUpdatedAt === emptyData().updatedAt) return 'pull';
    return 'conflict';
  }
  const localChanged = localUpdatedAt > lastSyncedAt;
  const remoteChanged = remoteUpdatedAt > lastSyncedAt;
  if (localChanged && remoteChanged) return 'conflict';
  if (localChanged) return 'push';
  if (remoteChanged) return 'pull';
  return 'none';
}

export async function runSync(
  adapter: SyncAdapter,
  repo: Repo,
  askConflict: () => Promise<ConflictChoice>,
  /** Applica i dati remoti; restituisce false se nel frattempo il locale è cambiato (nulla viene scritto). */
  applyPull?: (remote: AppData, localUpdatedAt: string) => Promise<boolean>,
): Promise<'none' | 'pushed' | 'pulled'> {
  const local = await repo.load();
  const { lastSyncedAt } = await repo.loadMeta();
  const remote = await adapter.metadata();
  let decision = decideSync(local.updatedAt, remote?.updatedAt ?? null, lastSyncedAt);
  if (decision === 'conflict') decision = (await askConflict()) === 'local' ? 'push' : 'pull';
  if (decision === 'push') {
    await adapter.push(local);
    await repo.saveMeta({ ...(await repo.loadMeta()), lastSyncedAt: local.updatedAt });
    return 'pushed';
  }
  if (decision === 'pull') {
    const data = await adapter.pull(); // se fallisce, nulla è stato scritto in locale
    const applied = applyPull ? await applyPull(data, local.updatedAt) : (await repo.save(data), true);
    if (!applied) return 'none'; // il locale è cambiato: la prossima sync lo vedrà come conflitto
    await repo.saveMeta({ ...(await repo.loadMeta()), lastSyncedAt: data.updatedAt });
    return 'pulled';
  }
  return 'none';
}

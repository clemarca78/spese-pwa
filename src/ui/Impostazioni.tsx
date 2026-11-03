import { useState } from 'preact/hooks';
import { ImportError, exportJson, mergeRules, parseImport, parseRulesFile } from '../storage/backup';
import { connectDrive, conflictResolver, disconnectDrive, driveConnected, lastSyncAt, syncNow } from '../state/sync';
import { data, getRepo, mutate, syncStatus } from '../state/store';
import { createDriveAdapter } from '../sync/drive';
import { getAccessToken } from '../sync/googleAuth';

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS: Record<string, string> = {
  idle: 'Sincronizzato',
  syncing: 'Sincronizzazione in corso…',
  offline: 'Non sincronizzato (nessuna connessione): i dati restano sul telefono',
  conflict: 'Conflitto: scegli quale versione tenere',
  error: 'Sincronizzazione non riuscita (accesso Google scaduto?): tocca Sincronizza ora',
};

export function Impostazioni() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const s = data.value.settings;

  async function exportBackup() {
    download(`spese-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJson(data.value));
    await mutate((d) => ({ ...d, settings: { ...d.settings, lastBackupAt: new Date().toISOString() } }));
    setMessage({ ok: true, text: 'Backup esportato.' });
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = parseImport(await file.text());
      if (!window.confirm('Sostituire tutti i dati attuali con quelli del backup?')) return;
      await mutate(() => parsed);
      setMessage({ ok: true, text: 'Backup importato.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ImportError ? e.message : 'Impossibile leggere il file.' });
    }
  }

  async function importRules(file: File | undefined) {
    if (!file) return;
    try {
      const { rules, varieDailyDefault } = parseRulesFile(await file.text());
      await mutate((d) => mergeRules(d, rules, varieDailyDefault));
      setMessage({ ok: true, text: `${rules.length} regole importate.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ImportError ? e.message : 'Impossibile leggere il file.' });
    }
  }

  const repo = getRepo();

  return (
    <main class="screen">
      <h2>Impostazioni</h2>

      <section class="card">
        <h3>Backup</h3>
        <button onClick={() => void exportBackup()}>Esporta backup</button>
        <div class="row">
          <label>Importa backup <input type="file" accept="application/json,.json" aria-label="Importa backup"
            onChange={(e) => void importBackup(e.currentTarget.files?.[0])} /></label>
        </div>
        <div class="row">
          <label>Promemoria backup (giorni){' '}
            <input type="number" min="1" aria-label="Promemoria backup (giorni)" value={s.backupReminderDays}
              onInput={(e) => {
                const v = Math.trunc(Number(e.currentTarget.value));
                if (v >= 1) void mutate((d) => ({ ...d, settings: { ...d.settings, backupReminderDays: v } }));
              }} /></label>
        </div>
        <p class="muted">Ultimo backup: {s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString('it-IT') : 'mai'}</p>
      </section>

      <section class="card">
        <h3>Regole da file</h3>
        <label>Importa regole <input type="file" accept="application/json,.json" aria-label="Importa regole"
          onChange={(e) => void importRules(e.currentTarget.files?.[0])} /></label>
      </section>

      <section class="card">
        <h3>Google Drive</h3>
        {driveConnected.value ? (
          <>
            <p>{STATUS[syncStatus.value]}</p>
            <p class="muted">Ultimo sync: {lastSyncAt.value ? new Date(lastSyncAt.value).toLocaleString('it-IT') : 'mai in questa sessione'}</p>
            {conflictResolver.value ? (
              <div class="banner">
                <p>I dati sul telefono e su Drive sono cambiati entrambi.</p>
                <div class="row">
                  <button onClick={() => conflictResolver.value?.('local')}>Tieni questo telefono</button>
                  <button onClick={() => conflictResolver.value?.('remote')}>Tieni Drive</button>
                </div>
              </div>
            ) : null}
            <div class="row">
              <button onClick={() => repo && void syncNow(repo, createDriveAdapter(getAccessToken))}>Sincronizza ora</button>
              <button class="chip" onClick={() => repo && void disconnectDrive(repo)}>Scollega</button>
            </div>
          </>
        ) : (
          <button onClick={() => repo && void connectDrive(repo).catch((e: Error) => setMessage({ ok: false, text: e.message }))}>
            Collega Google Drive
          </button>
        )}
      </section>

      {message ? <p role={message.ok ? 'status' : 'alert'} class={message.ok ? 'pos' : 'neg'}>{message.text}</p> : null}
    </main>
  );
}

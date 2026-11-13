import { useState } from 'preact/hooks';
import { ImportError, exportJson, exportRulesJson, mergeRules, parseImport, parseRulesFile } from '../storage/backup';
import { connectDrive, conflictResolver, disconnectDrive, driveConnected, lastSyncAt, syncNow } from '../state/sync';
import { addCategory, data, deleteCategory, getRepo, mutate, renameCategory, syncStatus } from '../state/store';
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
  const cats = data.value.categories ?? [];
  const [newCat, setNewCat] = useState('');
  const [catError, setCatError] = useState<string | null>(null);
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameCatText, setRenameCatText] = useState('');
  const catTaken = (n: string, exceptId?: string) => cats.some((c) => c.id !== exceptId && c.name.trim().toLowerCase() === n.trim().toLowerCase());
  function createCat() {
    const n = newCat.trim();
    if (!n) return setCatError('Scrivi il nome della categoria.');
    if (catTaken(n)) return setCatError('Una categoria con questo nome esiste già.');
    setCatError(null);
    setNewCat('');
    void addCategory(n);
  }
  function saveCatName(id: string) {
    const n = renameCatText.trim();
    if (!n) return setCatError('Scrivi il nome della categoria.');
    if (catTaken(n, id)) return setCatError('Una categoria con questo nome esiste già.');
    setCatError(null);
    setRenamingCat(null);
    void renameCategory(id, n);
  }

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
      const { rules, varieDailyDefault, groups, categories } = parseRulesFile(await file.text());
      await mutate((d) => mergeRules(d, rules, varieDailyDefault, groups, categories));
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
        <h3>Data di riferimento</h3>
        <div class="row">
          <label>Giorno di riferimento: quando arriva lo stipendio (1-28){' '}
            <input type="number" min="1" max="28" aria-label="Giorno di riferimento" value={s.payDay ?? 10}
              onInput={(e) => {
                const v = Math.trunc(Number(e.currentTarget.value));
                if (v >= 1 && v <= 28) void mutate((d) => ({ ...d, settings: { ...d.settings, payDay: v } }));
              }} /></label>
        </div>
        <div class="row">
          <label class="field">Regola dello stipendio (facoltativa)
            <select aria-label="Regola dello stipendio" value={s.salaryRuleId ?? ''}
              onChange={(e) => {
                const v = e.currentTarget.value;
                void mutate((d) => {
                  const { salaryRuleId: _drop, ...rest } = d.settings;
                  return { ...d, settings: v ? { ...rest, salaryRuleId: v } : rest };
                });
              }}>
              <option value="">Nessuna: uso il giorno di riferimento</option>
              {data.value.rules.filter((r) => r.kind === 'income' && r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
        <p class="muted">Se scegli la regola dello stipendio, il riferimento di "Usabile" è la sua prossima data non ancora arrivata: se lo stipendio arriva in anticipo, passa subito al mese dopo.</p>
        <p class="muted">"Usabile" è quanto hai sul conto meno le uscite non pagate prima di questo giorno: dopo quella data arrivano nuovi soldi.</p>
      </section>

      <section class="card">
        <h3>Spese dalle notifiche</h3>
        <p class="muted">Su Android un'app di automazione (Tasker o Automate) può leggere la notifica di pagamento di Intesa Sanpaolo o di Google Wallet e aprire questo link: la spesa compare in Mese, tra le "Spese da confermare".</p>
        <p><small>Link da aprire (il testo e il titolo della notifica vanno codificati per un URL):</small></p>
        <code class="link-box">{`${location.origin}${location.pathname}?testo=<testo della notifica>&app=intesa`}</code>
        <details class="guide">
          <summary>Come impostarlo</summary>
          <ul>
            <li><strong>Tasker:</strong> Profilo → Evento → UI → Notifica, con app Intesa Sanpaolo e testo "*Hai pagato*". Azione 1: Variabile → Converti, %antext, URL Encode, risultato %t. Azione 2: Rete → Apri URL con il link sopra, mettendo %t al posto del testo (per Wallet usa app=wallet e aggiungi &titolo= con %antitle codificato).</li>
            <li><strong>Automate:</strong> usa il blocco "Notification posted" per l'app, poi "Intent start" (azione VIEW) con lo stesso link; codifica testo e titolo con la funzione di codifica URL di Automate.</li>
            <li><strong>Altri campi:</strong> il link accetta anche ?importo=9,50&amp;nome=Bar&amp;data=2026-11-11&amp;ora=13:45&amp;tipo=uscita.</li>
            <li><strong>Doppioni:</strong> se Intesa e Wallet avvisano per lo stesso pagamento (stesso importo e giorno, orario vicino) ne compare una sola.</li>
            <li><strong>iPhone:</strong> iOS non permette di leggere le notifiche delle altre app. Con Apple Pay, un'automazione "Transazione" di Comandi Rapidi può aprire il link con ?importo= e ?nome=, ma il link si apre in Safari e non nell'app installata, che ha dati separati: per ora sull'iPhone le spese si inseriscono a mano.</li>
          </ul>
        </details>
      </section>

      <section class="card">
        <h3>Categorie</h3>
        <p class="muted">Servono a capire per cosa spendi o da dove entrano i soldi. Si assegnano a regole e voci, e il Mese mostra i totali per categoria. Eliminando una categoria, le sue regole e voci restano senza categoria.</p>
        <div class="row">
          <input aria-label="Nome nuova categoria" placeholder="Nuova categoria" value={newCat} onInput={(e) => setNewCat(e.currentTarget.value)} />
          <button onClick={createCat}>Aggiungi categoria</button>
        </div>
        {catError ? <p role="alert" class="neg">{catError}</p> : null}
        <ul class="items">
          {cats.map((c) => (
            <li class="group-row" key={c.id}>
              {renamingCat === c.id ? (
                <>
                  <input aria-label="Nuovo nome della categoria" value={renameCatText} onInput={(e) => setRenameCatText(e.currentTarget.value)} />
                  <button onClick={() => saveCatName(c.id)}>Salva nome categoria</button>
                  <button class="link" onClick={() => { setRenamingCat(null); setCatError(null); }}>Annulla</button>
                </>
              ) : (
                <>
                  <span class="name">{c.name}</span>
                  <span class="actions">
                    <button class="link" aria-label={`Rinomina categoria: ${c.name}`} onClick={() => { setRenamingCat(c.id); setRenameCatText(c.name); setCatError(null); }}>Rinomina</button>
                    <button class="link danger" aria-label={`Elimina categoria: ${c.name}`}
                      onClick={() => {
                        if (!window.confirm(`Eliminare la categoria "${c.name}"? Le sue regole e voci restano, senza categoria.`)) return;
                        void deleteCategory(c.id);
                      }}>Elimina</button>
                  </span>
                </>
              )}
            </li>
          ))}
          {cats.length === 0 ? <li class="empty">Nessuna categoria.</li> : null}
        </ul>
      </section>

      <section class="card">
        <h3>Regole da file</h3>
        <button onClick={() => {
          download(`spese-regole-${new Date().toISOString().slice(0, 10)}.json`, exportRulesJson(data.value));
          setMessage({ ok: true, text: `${data.value.rules.length} regole esportate.` });
        }}>Esporta regole</button>
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
      <section class="card">
        <h3>Versione dell&apos;app</h3>
        <p data-testid="app-version">Compilata il {new Date(typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : Date.now()).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </section>

      {message ? <p role={message.ok ? 'status' : 'alert'} class={message.ok ? 'pos' : 'neg'}>{message.text}</p> : null}
    </main>
  );
}

# Spese PWA: contesto del progetto

Ultimo aggiornamento: 2026-11-13.

## Cos'è
PWA personale per le spese, usata sul telefono Android dell'utente al posto di un Excel. I dati restano sul telefono (IndexedDB) con sincronizzazione/backup su Google Drive.

- Sito: https://clemarca78.github.io/spese-pwa/
- Repo pubblico: `spese-pwa` (branch `main`), cartella locale `C:\Users\aclemente\Documents\spese-pwa`
- Il repo privato `spese-app` (`feat/app`) è obsoleto: il riferimento è `spese-pwa`.
- L'utente parla italiano: UI e risposte in italiano.

## Stack
TypeScript, Vite, Preact + @preact/signals, `rrule` (UTC), `idb`, vite-plugin-pwa (service worker autoUpdate), Vitest + jsdom + fake-indexeddb + @testing-library/preact. Grafico SVG scritto a mano (`LineChart`).
Giorni = stringhe `YYYY-MM-DD`; importi = interi in centesimi (`Cents`).

## Deploy (manuale, le GitHub Actions sono bloccate dalla fatturazione)
1. `MSYS_NO_PATHCONV=1 BASE_PATH=/spese-pwa/ npm run build`
2. Copia `dist` in una cartella temporanea, aggiungi `.nojekyll`, `git init -b gh-pages`, push forzato su `origin gh-pages`.
3. `gh api -X POST repos/clemarca78/spese-pwa/pages/builds` (risponde sempre "queued").
- PATH di gh: `/c/Users/aclemente/AppData/Local/Microsoft/WinGet/Links`
- Il client ID OAuth di Google è in `.env.local` (gitignored) ed è incorporato nella build. Non committare credenziali.
- Strumento Bash: gli apostrofi nei heredoc rompono i comandi; scrivere gli script con Write e lanciare python da lì.

## Regole di calcolo (come implementate)
- **Sul conto (stimato)** (`residual`): saldo − spese pagate dopo il saldo + entrate incassate dopo il saldo. Un pagamento conta se `paidAfterBalance`: con `paidAt` si confronta `paidAt >= bal.at`; senza `at` nel saldo si usa `paidOn >= bal.day`; senza `paidAt`, `(paidOn ?? day) > bal.day`. Serve anche `when <= min(until, today)`.
- **Usabile fino al <data>** (`available`): residuo − spese non pagate dopo il saldo e prima di `upTo`. `upTo` = prossima occorrenza non pagata della regola stipendio (`settings.salaryRuleId`), altrimenti `nextPayDay(today, payDay)` (default 10, impostazione "Data di riferimento"). Le entrate non vengono sommate.
- **autoDebit** su una regola: l'occorrenza è `paid` con `paidOn = day` quando `day <= today` (un vecchio override `paid:false` è ignorato). Nell'elenco Mese sparisce quando `autoDebit && paid && day <= today`. Niente checkbox, solo il segno ↻. Importo non modificabile se `locked` (regola non variabile, o voce singola).
- **Arrivo anticipato** (`setEarly`): "Già nel mio saldo" imposta `paidOn = bal.day` senza `paidAt`; "Non ancora nel saldo" usa `paidStamp()`. "Annulla arrivo" = `setPaid(false)`.
- **Previsione**: `plannedItems`, `forecast`, `cumulativeFlows`, `monthlyFlows`. Le regole con `monthAmounts` (chiavi '1'..'12') hanno la precedenza su `amount` e sulla media dei reali.
- **Gruppi** (separati dalle categorie): gruppi standard (`g-entrate`, `g-uscite-auto`, `g-altre-uscite`) creati una volta (`ensureDefaultGroups`, flag `defaultGroupsSeeded`); le regole senza gruppo valido vanno in "Senza gruppo". Eliminando un gruppo si sceglie se tenere le regole.
- **Categorie** (per regole e voci singole): standard (`c-casa`, `c-cibo`, `c-carburante`, ...) create una volta (`ensureDefaultCategories`); eliminandone una le voci diventano "Senza categoria". Totali per categoria nel Mese (Mese/Anno).

## Funzioni consegnate
Riorganizzazione regole e separazione elenco/nuova regola; sync Google Drive; filtri Tutte/Da pagare/Pagate/Entrate; "Già pagata/Già incassata" in aggiunta; addebito/accredito automatico; voci fisse non modificabili; arretrati con "Salta"; import/export regole (JSON); bollette con importo per mese (`monthAmounts`); gruppi e ricerca per nome nelle regole; grafico Previsione con saldo + entrate/uscite cumulate, guida alla lettura, entrate/uscite per mese, giorni critici; categorie; **cattura spese dalle notifiche** (vedi `CATTURA-NOTIFICHE.md`).
Test: circa 312, in `tests/domain`, `tests/state`, `tests/storage`, `tests/ui`, `tests/capture.test.ts`.

## File principali
- `src/domain/`: `calc.ts`, `items.ts`, `forecast.ts`, `categories.ts`, `captures.ts`, `days.ts`, `types.ts`
- `src/state/store.ts`, `src/storage/backup.ts`, `src/capture.ts`, `src/main.tsx`
- `src/ui/`: `Mese.tsx`, `Regole.tsx`, `Previsione.tsx`, `Impostazioni.tsx`, `LineChart.tsx`
- Il file `C:\Users\aclemente\Downloads\spese-regole-bollette.json` contiene le regole Enel luce/gas (già importate).

## Stato e punti aperti
- Funziona (confermato dall'utente): tutte le funzioni di calcolo e interfaccia sopra, la cattura via Tasker per Intesa con `%evtprm3`/`%evtprm2`.
- Non verificato: sincronizzazione Drive su un dispositivo reale dopo la correzione OAuth; profilo Tasker Wallet con un pagamento vero; flusso Automate (blocchi scritti a memoria); uso su iPhone.
- Da fare lato utente: impostare l'addebito automatico sulle regole rimaste; rimettere il filtro app Intesa nel profilo Tasker dopo i test; eliminare le spese di prova (BAR TEST).
- Idee non richieste: accumulare più spese in un solo link per non aprire l'app a ogni pagamento; riepilogo per categoria nella Previsione.

## Accantonamento (scheda in Previsione, aggiunta il 2026-11-13)
Serve a mettere da parte soldi per un obiettivo (es. comunione, maggio 2027) senza obbligo di raggiungerlo.
- `src/domain/savings.ts` (`savingsPlan`): per ogni mese calcola l'avanzo (entrate meno uscite previste, spese varie incluse). Con un obiettivo versa solo la quota dell'avanzo che serve ad avvicinarsi (ricerca binaria sulla quota); senza, o con obiettivo troppo alto, il massimo possibile. Il saldo previsto non scende mai sotto il margine.
- Dati: `AppData.goal {name, amount, day}`; `settings.savingsMargin`, `settings.savingsSkipMonths` (mesi esclusi, 'YYYY-MM'), `settings.varieMonthly` (spese varie al mese scelte a mano, sostituisce la stima dai saldi).
- Le spese varie si stimano dai saldi: con meno di 2 saldi il valore era 0 e i mesi risultavano troppo ricchi. Per questo c'è il campo "Spese varie al mese".
- Le Impostazioni mostrano la data di compilazione (`__APP_BUILD__`, definita in `vite.config.ts`) per verificare l'aggiornamento della PWA sul telefono.
- Confermato dall'utente: l'importo consigliato risulta sostenibile.

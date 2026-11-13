# Cattura delle spese dalle notifiche

La PWA non legge le notifiche da sola. Un'app Android in background (Tasker o Automate) legge la notifica e apre un link che la PWA interpreta. La spesa finisce in "Spese da confermare" (schermata Mese); confermandola si crea una voce già pagata.

## Formato del link
Base: `https://clemarca78.github.io/spese-pwa/`

- Da testo di notifica: `?app=intesa|wallet&titolo=<titolo codificato URL>&testo=<testo codificato URL>`
- Esplicito: `?importo=9,50&nome=BAR&data=YYYY-MM-DD|DD.MM&ora=HH:MM&tipo=uscita|entrata&app=...`
- Test rapido nel browser del telefono:
  `https://clemarca78.github.io/spese-pwa/?app=intesa&testo=Hai%20pagato%209%2C50%20%E2%82%AC%20da%20BAR`

Dopo l'uso l'app ripulisce l'URL (`history.replaceState`) e apre la schermata Mese.
I doppioni (stesso importo e giorno, orari entro 15 minuti o uno mancante) vengono scartati: la stessa spesa notificata da Intesa e da Wallet compare una volta sola. La categoria è suggerita in base all'esercente già visto.
Testo Intesa riconosciuto: `Hai pagato|ricevuto <importo> € ... da <esercente>`.

## Comportamento con l'app chiusa
- Non serve tenerla aperta, ma ogni pagamento apre l'app in primo piano.
- Se Tasker/Automate non è attivo (batteria, permessi, riavvio) la spesa non viene registrata e va inserita a mano.
- Se il link si apre in Chrome invece che nella PWA installata, i dati finiscono nel browser. Verificare che la spesa compaia aprendo l'app dall'icona.
- Android 10+: Tasker ha bisogno di "Mostra sopra altre app" e di non essere limitato dalla batteria.

## Tasker (funzionante per Intesa, confermato dall'utente il 2026-11-12)
Permessi: accesso alle notifiche, batteria "senza restrizioni", "Mostra sopra altre app".

Task `Spesa Intesa`:
1. Converti variabile: Nome `%evtprm3`, Funzione **Codifica URL**, Memorizza in `%testo`
2. Converti variabile: Nome `%evtprm2`, Funzione **Codifica URL**, Memorizza in `%titolo`
3. Sfoglia URL: `https://clemarca78.github.io/spese-pwa/?app=intesa&titolo=%titolo&testo=%testo`

Profilo: Evento → UI → Notifica, app Intesa Sanpaolo, Testo `*Hai pagato*`. Per gli accrediti un secondo profilo con `*Hai ricevuto*`.

Wallet: stesso task con `app=wallet`, profilo con l'app Google Wallet e testo vuoto (da verificare con un pagamento vero).

Note emerse:
- `%antext`/`%antitle` risultavano vuote nel Tasker dell'utente; funzionano `%evtprm3` (testo) e `%evtprm2` (titolo).
- Il tasto ▶ non riempie le variabili della notifica: dà "no value". Per provare serve una notifica vera, oppure togliere temporaneamente il filtro app e inviarsi un messaggio con "Hai pagato 9,50 € da BAR TEST". Poi rimettere il filtro.
- File importabili preparati (se non importano, usare la procedura manuale): `docs/tasker/Spesa-Intesa.prf.xml`, `docs/tasker/Spesa-Wallet.prf.xml`. L'import progetto con due profili dà l'errore "l'importazione contiene più di un Profilo": si importa un profilo per volta (Importa → Profilo). Dopo l'import la Funzione di conversione risulta "Byte a Kilobyte" e va cambiata in **Codifica URL**; vanno anche sostituite `%antext`/`%antitle` con `%evtprm3`/`%evtprm2`.
- Codici interni verificati: evento Notifica 461, Converti variabile 596, Sfoglia URL 104, Imposta variabile 547.

## Automate (da verificare, nomi dei blocchi a memoria)
Non è stato preparato un file `.flo`: si costruisce a mano.
1. Flow beginning → **Notification posted** (app Intesa, filtro messaggio `Hai pagato*`; variabili in uscita `titolo` e `testo`).
2. **Variable set**: `url` = `"https://clemarca78.github.io/spese-pwa/?app=intesa&titolo=" + encodeUri(titolo) + "&testo=" + encodeUri(testo)`
3. **Content view** (o Activity start): action `android.intent.action.VIEW`, URI `url`; poi ricollegare al blocco Notification posted.
Permessi: accesso alle notifiche, batteria senza restrizioni. Non tenere attivi Tasker e Automate insieme per la stessa app.

## iPhone (collega dell'utente; non verificato su dispositivo)
- iOS non permette di leggere le notifiche di altre app.
- La PWA aggiunta alla schermata Home e Safari hanno archivi dati separati; l'accesso a Google Drive può non funzionare nella PWA installata.
- L'automazione "Transazione" di Comandi apre i link in Safari, non nella PWA installata.

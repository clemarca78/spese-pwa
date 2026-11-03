# Spese

PWA personale per tenere sotto controllo il conto corrente: saldo, spese ricorrenti, quanto resta da pagare e residuo, previsione del saldo e simulatore di una spesa futura ("posso permettermela?" / "quando posso farla?").

- **Dati sul dispositivo** (IndexedDB), nessun server. Backup su file e sincronizzazione opzionale con Google Drive (cartella privata dell'app).
- **Installabile su Android** (Chrome → "Installa app") e funzionante offline.
- TypeScript, Vite, Preact, `rrule`, Vitest.

## Sviluppo

```
npm ci
npm run dev      # sviluppo
npm test         # test
npm run build    # build di produzione
```

Per la sync con Drive serve un ID client OAuth Google (Drive API, scope `drive.appdata`): impostalo in `.env.local` come `VITE_GOOGLE_CLIENT_ID`.

Questo repository contiene solo il codice, mai dati personali.

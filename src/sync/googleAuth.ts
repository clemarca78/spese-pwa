const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GIS_URL = 'https://accounts.google.com/gsi/client';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(c: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: unknown) => void;
          }): TokenClient;
        };
      };
    };
  }
}

let loading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Impossibile caricare il login Google'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

let cached: { token: string; expiresAt: number } | null = null;

/** Token breve di Google Identity Services. Nessun refresh token salvato: alla scadenza si richiede di nuovo. */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID non configurato');
  await loadGis();
  return new Promise<string>((resolve, reject) => {
    // se Google non risponde (popup bloccato) non restiamo "in sincronizzazione" per sempre
    const timer = setTimeout(() => reject(new Error('Accesso Google non completato')), 60_000);
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        clearTimeout(timer);
        if (!r.access_token) return reject(new Error(r.error ?? 'Accesso Google negato'));
        cached = { token: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: () => {
        clearTimeout(timer);
        reject(new Error('Accesso Google annullato'));
      },
    });
    client.requestAccessToken();
  });
}

export function signOutGoogle(): void {
  cached = null;
}

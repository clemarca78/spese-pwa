import type { AppData } from '../domain/types';
import { parseImport } from '../storage/backup';
import type { SyncAdapter } from './engine';

const FILE_NAME = 'spese-app.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class DriveError extends Error {
  constructor(
    public code: 'AUTH_EXPIRED' | 'HTTP',
    message: string,
  ) {
    super(message);
  }
}

/** Adattatore Google Drive: un file JSON nella appDataFolder (non visibile nel Drive dell'utente). */
export function createDriveAdapter(getToken: () => Promise<string>, fetchFn: typeof fetch = fetch): SyncAdapter {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const res = await fetchFn(url, { ...init, headers });
    if (res.status === 401) throw new DriveError('AUTH_EXPIRED', 'Sessione Google scaduta');
    if (!res.ok) throw new DriveError('HTTP', `Drive ha risposto ${res.status}`);
    return res;
  }

  async function findId(): Promise<string | null> {
    const q = encodeURIComponent(`name='${FILE_NAME}'`);
    const res = await call(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id)`);
    const body = (await res.json()) as { files?: { id: string }[] };
    return body.files?.[0]?.id ?? null;
  }

  async function download(id: string): Promise<AppData> {
    const res = await call(`${API}/files/${id}?alt=media`);
    return parseImport(await res.text()); // valida prima di restituire
  }

  return {
    async metadata() {
      const id = await findId();
      if (!id) return null;
      return { updatedAt: (await download(id)).updatedAt };
    },
    async pull() {
      const id = await findId();
      if (!id) throw new DriveError('HTTP', 'Nessun file su Drive');
      return download(id);
    },
    async push(d) {
      const id = await findId();
      const content = JSON.stringify(d);
      if (id) {
        await call(`${UPLOAD}/files/${id}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: content,
        });
        return;
      }
      const boundary = 'spese-' + Math.random().toString(36).slice(2);
      const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
      await call(`${UPLOAD}/files?uploadType=multipart`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
    },
  };
}

import { describe, expect, it } from 'vitest';
import { emptyData } from '../../src/storage/backup';
import { DriveError, createDriveAdapter } from '../../src/sync/drive';

type Call = { url: string; init?: RequestInit };

function scripted(responses: Array<{ status?: number; json?: unknown }>) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 500 };
    return new Response(r.json === undefined ? '' : JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const getToken = async () => 'tok';
const header = (c: Call, k: string) => new Headers(c.init?.headers).get(k);
const data = { ...emptyData(), updatedAt: '2026-11-03T10:00:00.000Z' };

describe('drive adapter', () => {
  it('metadata: null se il file non esiste', async () => {
    const { calls, fetchFn } = scripted([{ json: { files: [] } }]);
    expect(await createDriveAdapter(getToken, fetchFn).metadata()).toBeNull();
    expect(calls[0].url).toContain('spaces=appDataFolder');
    expect(calls[0].url).toContain(encodeURIComponent("name='spese-app.json'"));
    expect(header(calls[0], 'Authorization')).toBe('Bearer tok');
  });
  it('metadata: legge updatedAt dal contenuto del file', async () => {
    const { calls, fetchFn } = scripted([{ json: { files: [{ id: 'F1' }] } }, { json: data }]);
    expect(await createDriveAdapter(getToken, fetchFn).metadata()).toEqual({ updatedAt: data.updatedAt });
    expect(calls[1].url).toContain('/files/F1?alt=media');
  });
  it('pull restituisce i dati', async () => {
    const { fetchFn } = scripted([{ json: { files: [{ id: 'F1' }] } }, { json: data }]);
    expect(await createDriveAdapter(getToken, fetchFn).pull()).toEqual(data);
  });
  it('pull rifiuta dati non validi senza restituirli', async () => {
    const { fetchFn } = scripted([{ json: { files: [{ id: 'F1' }] } }, { json: { schemaVersion: 2 } }]);
    await expect(createDriveAdapter(getToken, fetchFn).pull()).rejects.toThrow(/versione/);
  });
  it('push crea il file nella appDataFolder se manca', async () => {
    const { calls, fetchFn } = scripted([{ json: { files: [] } }, { json: { id: 'new' } }]);
    await createDriveAdapter(getToken, fetchFn).push(data);
    expect(calls[1].init?.method).toBe('POST');
    expect(calls[1].url).toContain('uploadType=multipart');
    expect(String(calls[1].init?.body)).toContain('"parents":["appDataFolder"]');
  });
  it('push aggiorna il file esistente con PATCH', async () => {
    const { calls, fetchFn } = scripted([{ json: { files: [{ id: 'F1' }] } }, { json: { id: 'F1' } }]);
    await createDriveAdapter(getToken, fetchFn).push(data);
    expect(calls[1].init?.method).toBe('PATCH');
    expect(calls[1].url).toContain('/files/F1?uploadType=media');
  });
  it('401 diventa AUTH_EXPIRED', async () => {
    const { fetchFn } = scripted([{ status: 401 }]);
    const err = await createDriveAdapter(getToken, fetchFn).metadata().catch((e) => e);
    expect(err).toBeInstanceOf(DriveError);
    expect(err.code).toBe('AUTH_EXPIRED');
  });
});

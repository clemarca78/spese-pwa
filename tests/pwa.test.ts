import { describe, expect, it } from 'vitest';
import { requestPersistence } from '../src/pwa';

describe('requestPersistence', () => {
  it('chiama storage.persist e restituisce il suo valore', async () => {
    let called = 0;
    const nav = { storage: { persist: async () => { called++; return true; } } } as unknown as Navigator;
    expect(await requestPersistence(nav)).toBe(true);
    expect(called).toBe(1);
  });
  it('senza storage restituisce false senza lanciare', async () => {
    expect(await requestPersistence({} as Navigator)).toBe(false);
  });
  it('se persist lancia, restituisce false', async () => {
    const nav = { storage: { persist: async () => { throw new Error('no'); } } } as unknown as Navigator;
    expect(await requestPersistence(nav)).toBe(false);
  });
});

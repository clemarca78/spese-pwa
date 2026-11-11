import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleCaptureUrl } from '../src/capture';
import { data, initStore } from '../src/state/store';
import { openRepo } from '../src/storage/repo';

let n = 0;
beforeEach(async () => {
  await initStore(await openRepo(`capture-${n++}`));
});

describe('handleCaptureUrl', () => {
  it('trasforma il link in una spesa da confermare e dice che l ha gestito', async () => {
    const now = new Date(2026, 10, 11, 14, 17);
    const handled = await handleCaptureUrl('?app=intesa&testo=' + encodeURIComponent('Hai pagato 9,50 € con la carta *2722 il 11.11 alle ore 13:45 da SFIZI & P, SANTERAMO'), now);
    expect(handled).toBe(true);
    expect(data.value.captures?.[0]).toMatchObject({ amount: 950, name: 'SFIZI & P', day: '2026-11-11' });
  });
  it('un link senza dati di spesa non fa nulla', async () => {
    expect(await handleCaptureUrl('?x=1')).toBe(false);
    expect(await handleCaptureUrl('')).toBe(false);
    expect(data.value.captures ?? []).toEqual([]);
  });
  it('lo stesso link due volte non crea un doppione ma resta gestito', async () => {
    const q = '?importo=9,50&nome=BAR&data=2026-11-11';
    expect(await handleCaptureUrl(q)).toBe(true);
    expect(await handleCaptureUrl(q)).toBe(true);
    expect(data.value.captures).toHaveLength(1);
  });
});

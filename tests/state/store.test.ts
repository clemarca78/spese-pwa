import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Item } from '../../src/domain/types';
import { addBalance, addOneOff, data, initStore, mutate, setItemAmount, setPaid } from '../../src/state/store';
import { emptyData } from '../../src/storage/backup';
import { openRepo } from '../../src/storage/repo';

let n = 0;
beforeEach(async () => {
  await initStore(await openRepo(`store-${n++}`));
});

const ruleItem: Item = {
  key: 'r1@2026-11-24', ruleId: 'r1', name: 'x', kind: 'expense', day: '2026-11-24',
  amount: 1000, estimated: false, paid: false, skipped: false, pendingDebit: false,
};

describe('store', () => {
  it('mutate aggiorna updatedAt e salva sul repo', async () => {
    const repo = await openRepo('store-persist');
    await initStore(repo);
    await mutate((d) => ({ ...d, balances: [{ value: 7, day: '2026-11-03' }] }));
    const saved = await repo.load();
    expect(saved.balances).toHaveLength(1);
    expect(saved.updatedAt).not.toBe(emptyData().updatedAt);
  });
  it('addBalance aggiunge un saldo e sostituisce quello dello stesso giorno', async () => {
    await addBalance(1000, '2026-11-03');
    await addBalance(2000, '2026-11-03');
    expect(data.value.balances).toEqual([{ value: 2000, day: '2026-11-03' }]);
  });
  it('setPaid su una voce di regola crea un override', async () => {
    await setPaid(ruleItem, true);
    expect(data.value.overrides).toEqual([{ ruleId: 'r1', day: '2026-11-24', paid: true }]);
    await setPaid(ruleItem, false);
    expect(data.value.overrides[0].paid).toBe(false);
  });
  it('setPaid su una una tantum aggiorna la voce', async () => {
    await addOneOff({ name: 'a', kind: 'expense', amount: 500, day: '2026-11-10', paid: false });
    const id = data.value.oneOffs[0].id;
    await setPaid({ ...ruleItem, ruleId: undefined, oneOffId: id }, true);
    expect(data.value.oneOffs[0].paid).toBe(true);
  });
  it('setItemAmount crea un override con importo reale', async () => {
    await setItemAmount(ruleItem, 12345);
    expect(data.value.overrides[0]).toMatchObject({ ruleId: 'r1', day: '2026-11-24', amount: 12345 });
  });
});

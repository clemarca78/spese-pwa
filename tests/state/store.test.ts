import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { todayLocal } from '../../src/domain/days';
import type { Item } from '../../src/domain/types';
import { addBalance, addGroup, addOneOff, deleteGroup, renameGroup, data, deleteOneOff, deleteRule, initStore, mutate, setItemAmount, setPaid, setSkipped, updateOneOff } from '../../src/state/store';
import { emptyData } from '../../src/storage/backup';
import { openRepo } from '../../src/storage/repo';

let n = 0;
beforeEach(async () => {
  await initStore(await openRepo(`store-${n++}`));
});

const ruleItem: Item = {
  key: 'r1@2026-11-24', ruleId: 'r1', name: 'x', kind: 'expense', day: '2026-11-24',
  amount: 1000, estimated: false, paid: false, skipped: false,
};

describe('modifica ed eliminazione', () => {
  it('updateOneOff cambia i campi della voce', async () => {
    await addOneOff({ name: 'a', kind: 'expense', amount: 500, day: '2026-11-10', paid: false });
    const id = data.value.oneOffs[0].id;
    await updateOneOff(id, { name: 'b', amount: 900, kind: 'income', day: '2026-11-12' });
    expect(data.value.oneOffs[0]).toMatchObject({ id, name: 'b', amount: 900, kind: 'income', day: '2026-11-12', paid: false });
  });
  it('deleteOneOff rimuove solo quella voce', async () => {
    await addOneOff({ name: 'a', kind: 'expense', amount: 500, day: '2026-11-10', paid: false });
    await addOneOff({ name: 'b', kind: 'expense', amount: 600, day: '2026-11-11', paid: false });
    await deleteOneOff(data.value.oneOffs[0].id);
    expect(data.value.oneOffs.map((o) => o.name)).toEqual(['b']);
  });
  it('deleteRule rimuove la regola e le sue correzioni, non quelle delle altre', async () => {
    await mutate((d) => ({
      ...d,
      rules: [
        { id: 'r1', name: 'x', kind: 'expense', amount: 1, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', start: '2026-01-01', active: true },
        { id: 'r2', name: 'y', kind: 'expense', amount: 1, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=2', start: '2026-01-01', active: true },
      ],
      overrides: [{ ruleId: 'r1', day: '2026-11-01', paid: true }, { ruleId: 'r2', day: '2026-11-02', paid: true }],
    }));
    await deleteRule('r1');
    expect(data.value.rules.map((r) => r.id)).toEqual(['r2']);
    expect(data.value.overrides.map((o) => o.ruleId)).toEqual(['r2']);
  });
});

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
    expect(data.value.balances).toEqual([{ value: 2000, day: '2026-11-03', at: expect.any(String) }]);
  });
  it('setPaid su una voce di regola crea un override', async () => {
    await setPaid(ruleItem, true);
    expect(data.value.overrides).toEqual([{ ruleId: 'r1', day: '2026-11-24', paid: true, paidOn: todayLocal(), paidAt: expect.any(String) }]);
    await setPaid(ruleItem, false);
    expect(data.value.overrides).toEqual([{ ruleId: 'r1', day: '2026-11-24', paid: false }]);
  });
  it('setPaid su una una tantum aggiorna la voce', async () => {
    await addOneOff({ name: 'a', kind: 'expense', amount: 500, day: '2026-11-10', paid: false });
    const id = data.value.oneOffs[0].id;
    await setPaid({ ...ruleItem, ruleId: undefined, oneOffId: id }, true);
    expect(data.value.oneOffs[0]).toMatchObject({ paid: true, paidOn: todayLocal(), paidAt: expect.any(String) });
    await setPaid({ ...ruleItem, ruleId: undefined, oneOffId: id }, false);
    expect(data.value.oneOffs[0].paid).toBe(false);
    expect('paidOn' in data.value.oneOffs[0]).toBe(false);
    expect('paidAt' in data.value.oneOffs[0]).toBe(false);
  });
  it('setSkipped segna una occorrenza come non dovuta e si può annullare', async () => {
    await setSkipped(ruleItem, true);
    expect(data.value.overrides).toEqual([{ ruleId: 'r1', day: '2026-11-24', skipped: true }]);
    await setSkipped(ruleItem, false);
    expect(data.value.overrides[0].skipped).toBe(false);
  });
  it('crea, rinomina ed elimina gruppi; eliminando un gruppo le sue regole restano senza gruppo', async () => {
    await mutate((d) => ({ ...d, rules: [{ id: 'r1', name: 'Tim', kind: 'expense', amount: 1, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=8', start: '2026-01-01', active: true }] }));
    await addGroup('Bollette');
    const id = (data.value.groups ?? [])[0].id;
    expect(data.value.groups).toEqual([{ id, name: 'Bollette' }]);
    await mutate((d) => ({ ...d, rules: d.rules.map((r) => ({ ...r, groupId: id })) }));
    await renameGroup(id, 'Utenze');
    expect(data.value.groups?.[0].name).toBe('Utenze');
    await deleteGroup(id);
    expect(data.value.groups).toEqual([]);
    expect('groupId' in data.value.rules[0]).toBe(false);
  });
  it('setItemAmount crea un override con importo reale', async () => {
    await setItemAmount(ruleItem, 12345);
    expect(data.value.overrides[0]).toMatchObject({ ruleId: 'r1', day: '2026-11-24', amount: 12345 });
  });
});

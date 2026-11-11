import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { todayLocal } from '../../src/domain/days';
import type { Item } from '../../src/domain/types';
import { addBalance, addCapture, confirmCapture, discardCapture, addCategory, addGroup, deleteCategory, renameCategory, setEarly, addOneOff, deleteGroup, moveRuleToGroup, renameGroup, data, deleteOneOff, deleteRule, initStore, mutate, setItemAmount, setPaid, setSkipped, updateOneOff } from '../../src/state/store';
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
    const id = (data.value.groups ?? []).find((g) => g.name === 'Bollette')?.id as string;
    expect(data.value.groups).toContainEqual({ id, name: 'Bollette' });
    await mutate((d) => ({ ...d, rules: d.rules.map((r) => ({ ...r, groupId: id })) }));
    await renameGroup(id, 'Utenze');
    expect(data.value.groups?.find((g) => g.id === id)?.name).toBe('Utenze');
    await deleteGroup(id);
    expect((data.value.groups ?? []).some((g) => g.id === id)).toBe(false);
    expect('groupId' in data.value.rules[0]).toBe(false);
  });
  it('eliminando un gruppo senza tenere le regole, spariscono anche le regole e le loro correzioni', async () => {
    const rule = (id: string, groupId?: string) => ({ id, name: id, kind: 'expense' as const, amount: 1, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=8', start: '2026-01-01', active: true, ...(groupId ? { groupId } : {}) });
    await mutate((d) => ({
      ...d,
      groups: [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }],
      rules: [rule('r1', 'g1'), rule('r2', 'g2'), rule('r3')],
      overrides: [{ ruleId: 'r1', day: '2026-11-08', paid: true }, { ruleId: 'r2', day: '2026-11-08', paid: true }],
    }));
    await deleteGroup('g1', false);
    expect(data.value.groups?.map((g) => g.id)).toEqual(['g2']);
    expect(data.value.rules.map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(data.value.overrides.map((o) => o.ruleId)).toEqual(['r2']);
  });
  it('sposta una regola da un gruppo a un altro o la toglie dal gruppo', async () => {
    await mutate((d) => ({ ...d, groups: [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }], rules: [{ id: 'r1', name: 'x', kind: 'expense', amount: 1, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=8', start: '2026-01-01', active: true, groupId: 'g1' }] }));
    await moveRuleToGroup('r1', 'g2');
    expect(data.value.rules[0].groupId).toBe('g2');
    await moveRuleToGroup('r1', undefined);
    expect('groupId' in data.value.rules[0]).toBe(false);
  });
  it('ogni modifica crea i gruppi predefiniti una volta sola', async () => {
    await mutate((d) => ({ ...d, rules: [{ id: 'r1', name: 'x', kind: 'income', amount: 1, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=8', start: '2026-01-01', active: true }] }));
    expect(data.value.groups?.map((g) => g.id)).toEqual(['g-entrate', 'g-uscite-auto', 'g-altre-uscite']);
    expect(data.value.defaultGroupsSeeded).toBe(true);
    await deleteGroup('g-altre-uscite');
    expect(data.value.groups?.some((g) => g.id === 'g-altre-uscite')).toBe(false);
  });
  it('setEarly: arrivata prima della data. Già nel saldo vale la data del saldo, altrimenti il momento di oggi', async () => {
    await addBalance(5000, '2026-11-03');
    await setEarly(ruleItem, true);
    expect(data.value.overrides[0]).toMatchObject({ ruleId: 'r1', day: '2026-11-24', paid: true, paidOn: '2026-11-03' });
    expect('paidAt' in data.value.overrides[0]).toBe(false);
    await setEarly(ruleItem, false);
    expect(data.value.overrides[0]).toMatchObject({ paid: true, paidOn: todayLocal(), paidAt: expect.any(String) });
  });
  it('le categorie standard esistono dall avvio, se ne aggiungono e rinominano', async () => {
    expect(data.value.categories?.some((c) => c.name === 'Carburante')).toBe(true);
    await addCategory('Hobby');
    const id = (data.value.categories ?? []).find((c) => c.name === 'Hobby')?.id as string;
    expect(id).toBeTruthy();
    await renameCategory(id, 'Hobby e sport');
    expect(data.value.categories?.find((c) => c.id === id)?.name).toBe('Hobby e sport');
  });
  it('eliminando una categoria, regole e voci restano senza categoria', async () => {
    await addCategory('Hobby');
    const id = (data.value.categories ?? []).find((c) => c.name === 'Hobby')?.id as string;
    await mutate((d) => ({
      ...d,
      rules: [{ id: 'r1', name: 'x', kind: 'expense', amount: 1, variable: false, rrule: 'FREQ=MONTHLY;BYMONTHDAY=8', start: '2026-01-01', active: true, categoryId: id }],
      oneOffs: [{ id: 'o1', name: 'y', kind: 'expense', amount: 1, day: '2026-11-10', paid: false, categoryId: id }],
    }));
    await deleteCategory(id);
    expect((data.value.categories ?? []).some((c) => c.id === id)).toBe(false);
    expect('categoryId' in data.value.rules[0]).toBe(false);
    expect('categoryId' in data.value.oneOffs[0]).toBe(false);
  });
  describe('spese da confermare', () => {
    const draft = { name: 'SFIZI & P', amount: 950, kind: 'expense' as const, day: '2026-11-11', time: '13:45', source: 'intesa' };
    it('aggiunge una spesa catturata e scarta i doppioni (Intesa e Wallet per lo stesso pagamento)', async () => {
      expect(await addCapture(draft)).toBe(true);
      expect(await addCapture({ ...draft, name: 'SFIZI & PARTY DI COFA', time: '13:47', source: 'wallet' })).toBe(false);
      expect(data.value.captures).toHaveLength(1);
    });
    it('confermare crea una voce già pagata con categoria, la toglie dalla casella e ricorda l esercente', async () => {
      await addCapture(draft);
      const id = (data.value.captures ?? [])[0].id;
      await confirmCapture(id, { name: 'Sfizi', amount: 950, kind: 'expense', day: '2026-11-11', categoryId: 'c-cibo' });
      expect(data.value.captures).toEqual([]);
      expect(data.value.oneOffs[0]).toMatchObject({ name: 'Sfizi', amount: 950, day: '2026-11-11', paid: true, categoryId: 'c-cibo', paidAt: expect.any(String) });
      expect(Object.values(data.value.merchantCategories ?? {})).toContain('c-cibo');
      // lo stesso pagamento non rientra dopo la conferma
      expect(await addCapture({ ...draft, source: 'wallet', time: '13:50' })).toBe(false);
    });
    it('scartare toglie la spesa e ricorda che era già stata vista', async () => {
      await addCapture(draft);
      await discardCapture((data.value.captures ?? [])[0].id);
      expect(data.value.captures).toEqual([]);
      expect(data.value.oneOffs).toHaveLength(0);
      expect(await addCapture(draft)).toBe(false);
    });
  });
  it('setItemAmount crea un override con importo reale', async () => {
    await setItemAmount(ruleItem, 12345);
    expect(data.value.overrides[0]).toMatchObject({ ruleId: 'r1', day: '2026-11-24', amount: 12345 });
  });
});

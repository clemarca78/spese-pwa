/** Chiede al browser di non cancellare i dati locali quando c'è poco spazio. */
export async function requestPersistence(nav: Navigator = navigator): Promise<boolean> {
  try {
    if (!nav.storage?.persist) return false;
    return await nav.storage.persist();
  } catch {
    return false;
  }
}

import { parseCaptureParams } from './domain/captures';
import { addCapture } from './state/store';

/**
 * Se il link che ha aperto l'app contiene una spesa (da Tasker, Automate o Comandi Rapidi),
 * la mette nelle spese da confermare. Restituisce true se il link era una spesa, anche se già vista.
 */
export async function handleCaptureUrl(search: string, now: Date = new Date()): Promise<boolean> {
  const draft = parseCaptureParams(search, now);
  if (!draft) return false;
  await addCapture(draft);
  return true;
}

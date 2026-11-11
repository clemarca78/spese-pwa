import { render } from 'preact';
import { App } from './app';
import { handleCaptureUrl } from './capture';
import { requestPersistence } from './pwa';
import { initStore } from './state/store';
import { startSync } from './state/sync';
import { openRepo } from './storage/repo';
import { screen } from './ui/Nav';
import './styles.css';

void requestPersistence();
openRepo().then(async (repo) => {
  await initStore(repo);
  if (await handleCaptureUrl(location.search)) {
    history.replaceState(null, '', location.pathname); // il link è stato usato: non rientra se ricarichi
    screen.value = 'mese';
  }
  await startSync(repo);
});
render(<App />, document.getElementById('app')!);

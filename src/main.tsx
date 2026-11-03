import { render } from 'preact';
import { App } from './app';
import { requestPersistence } from './pwa';
import { initStore } from './state/store';
import { startSync } from './state/sync';
import { openRepo } from './storage/repo';
import './styles.css';

void requestPersistence();
openRepo().then(async (repo) => {
  await initStore(repo);
  await startSync(repo);
});
render(<App />, document.getElementById('app')!);

import { ready } from './state/store';
import { Mese } from './ui/Mese';
import { Nav, screen } from './ui/Nav';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Impostazioni } from './ui/Impostazioni';
import { Previsione } from './ui/Previsione';
import { Regole } from './ui/Regole';
import { Simula } from './ui/Simula';

export function App() {
  if (!ready.value) return <main class="screen"><p>Caricamento…</p></main>;
  return (
    <>
      <ErrorBoundary key={screen.value}>
        {screen.value === 'mese' && <Mese />}
        {screen.value === 'previsione' && <Previsione />}
        {screen.value === 'simula' && <Simula />}
        {screen.value === 'regole' && <Regole />}
        {screen.value === 'impostazioni' && <Impostazioni />}
      </ErrorBoundary>
      <Nav />
    </>
  );
}

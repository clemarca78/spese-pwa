import { Component, type ComponentChildren } from 'preact';
import { screen } from './Nav';

/** Evita che un dato rovinato (es. regola importata male) renda l'app inutilizzabile. */
export class ErrorBoundary extends Component<{ children: ComponentChildren }, { error: Error | null }> {
  state = { error: null as Error | null };

  componentDidCatch(error: Error) {
    console.error(error);
    this.setState({ error });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main class="screen">
        <section class="card">
          <h3>Qualcosa non va</h3>
          <p class="neg">{this.state.error.message}</p>
          <p>Prova a importare un backup corretto dalle Impostazioni.</p>
          <button onClick={() => { this.setState({ error: null }); screen.value = 'impostazioni'; }}>Apri impostazioni</button>
        </section>
      </main>
    );
  }
}

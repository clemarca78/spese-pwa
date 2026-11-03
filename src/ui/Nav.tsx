import { signal } from '@preact/signals';

export type Screen = 'mese' | 'previsione' | 'simula' | 'regole' | 'impostazioni';
export const screen = signal<Screen>('mese');

const TABS: Array<[Screen, string]> = [
  ['mese', 'Mese'],
  ['previsione', 'Previsione'],
  ['simula', 'Simula'],
  ['regole', 'Regole'],
  ['impostazioni', 'Impostazioni'],
];

export function Nav() {
  return (
    <nav class="nav">
      {TABS.map(([id, label]) => (
        <button
          key={id}
          class={screen.value === id ? 'active' : ''}
          aria-current={screen.value === id ? 'page' : undefined}
          onClick={() => (screen.value = id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

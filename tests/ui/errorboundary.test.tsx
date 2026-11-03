import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../../src/ui/ErrorBoundary';

afterEach(cleanup);

function Boom(): never {
  throw new Error('rrule rotta');
}

describe('ErrorBoundary', () => {
  it('mostra un messaggio invece di rompere tutta l\'app', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText } = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(getByText(/Qualcosa non va/i)).toBeTruthy();
    expect(getByText(/rrule rotta/)).toBeTruthy();
  });
  it('mostra i figli quando non ci sono errori', () => {
    const { getByText } = render(<ErrorBoundary><p>tutto ok</p></ErrorBoundary>);
    expect(getByText('tutto ok')).toBeTruthy();
  });
});

import { expect, it, vi } from 'vitest';
import { chooseProfile } from '../src/browser-session.js';

const run = profiles => vi.fn(() => ({ status: 0, output: JSON.stringify({ ok: true, data: { profiles } }) }));
it('uses implicit browser default when exactly one profile is connected', () => {
  expect(chooseProfile(undefined, 'opencli', run([{ contextId: 'only', connected: true }]))).toBeUndefined();
});
it('ignores disconnected stale profiles when selecting the sole available context', () => {
  expect(chooseProfile(undefined, 'opencli', run([{ contextId: 'stale', connected: false }, { contextId: 'only', connected: true }]))).toBeUndefined();
});
it('requires explicit selection when multiple profiles are connected', () => {
  expect(() => chooseProfile(undefined, 'opencli', run([{ contextId: 'a', connected: true }, { contextId: 'b', connected: true }]))).toThrow(/profile/i);
});
it('fails before posting when no profile is connected or inventory fails', () => {
  expect(() => chooseProfile(undefined, 'opencli', run([]))).toThrow(/connect/i);
  expect(() => chooseProfile(undefined, 'opencli', () => ({ status: 1, output: 'offline' }))).toThrow(/profile/i);
});
it('preserves an explicitly chosen profile', () => {
  const runner = vi.fn(); expect(chooseProfile('chosen', 'opencli', runner)).toBe('chosen');
  expect(runner).not.toHaveBeenCalled();
});

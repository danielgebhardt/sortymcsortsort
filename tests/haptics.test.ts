import { afterEach, describe, expect, it, vi } from 'vitest';
import { haptics } from '../src/audio/haptics';

const calls = ['light', 'heavy', 'success', 'error'] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser haptics never throw', () => {
  it('when navigator.vibrate is present but undefined (iOS Home Screen web app)', () => {
    vi.stubGlobal('navigator', { vibrate: undefined });
    expect('vibrate' in navigator).toBe(true);
    for (const name of calls) expect(() => haptics[name]()).not.toThrow();
  });

  it('when navigator.vibrate throws', () => {
    const vibrate = vi.fn(() => {
      throw new TypeError('navigator.vibrate is not a function');
    });
    vi.stubGlobal('navigator', { vibrate });
    for (const name of calls) expect(() => haptics[name]()).not.toThrow();
    expect(vibrate).toHaveBeenCalledTimes(calls.length);
  });

  it('when navigator has no vibrate at all (iOS Safari tab)', () => {
    vi.stubGlobal('navigator', {});
    for (const name of calls) expect(() => haptics[name]()).not.toThrow();
  });

  it('still vibrates where the Vibration API works (Android Chrome)', () => {
    const vibrate = vi.fn((_pattern: number | number[]) => true);
    vi.stubGlobal('navigator', { vibrate });
    for (const name of calls) haptics[name]();
    expect(vibrate.mock.calls.map((c) => c[0])).toEqual([8, 25, [15, 60, 15], [30, 60, 30]]);
  });
});

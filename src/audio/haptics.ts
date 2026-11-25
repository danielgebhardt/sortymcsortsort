import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { progress } from '../storage/progress';

const ok = () => progress().haptics;
const native = () => Capacitor.isNativePlatform();

/**
 * Browsers (the web app): the Vibration API. Android Chrome has it; iOS Safari doesn't. iOS Home Screen web apps
 * report `'vibrate' in navigator` but leave it undefined, so check it's a function: haptics run inside the drag
 * handler, and a throw there stops the piece from moving.
 */
const buzz = (pattern: number | number[]) => {
  if (!ok() || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // no vibration is better than a broken drag
  }
};

/** A haptic never throws, natively or in a browser: it's feedback, not game logic. */
const safe = (run: () => unknown) => () => {
  try {
    const result = run();
    if (result instanceof Promise) result.catch(() => {});
  } catch {
    // ignore
  }
};

export const haptics = {
  light: safe(() => (native() ? ok() && Haptics.impact({ style: ImpactStyle.Light }) : buzz(8))),
  heavy: safe(() => (native() ? ok() && Haptics.impact({ style: ImpactStyle.Heavy }) : buzz(25))),
  success: safe(() => (native() ? ok() && Haptics.notification({ type: NotificationType.Success }) : buzz([15, 60, 15]))),
  error: safe(() => (native() ? ok() && Haptics.notification({ type: NotificationType.Error }) : buzz([30, 60, 30]))),
};

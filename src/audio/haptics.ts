import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { progress } from '../storage/progress';

const ok = () => progress().haptics;
const native = () => Capacitor.isNativePlatform();

/** Browsers (the web app): the Vibration API. Android Chrome has it; iOS Safari doesn't, so it's a no-op there. */
const buzz = (pattern: number | number[]) => {
  if (ok() && 'vibrate' in navigator) navigator.vibrate(pattern);
};

export const haptics = {
  light: () => (native() ? ok() && Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}) : buzz(8)),
  heavy: () => (native() ? ok() && Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}) : buzz(25)),
  success: () => (native() ? ok() && Haptics.notification({ type: NotificationType.Success }).catch(() => {}) : buzz([15, 60, 15])),
  error: () => (native() ? ok() && Haptics.notification({ type: NotificationType.Error }).catch(() => {}) : buzz([30, 60, 30])),
};

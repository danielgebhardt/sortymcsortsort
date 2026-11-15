import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { progress } from '../storage/progress';

const ok = () => progress().haptics;

export const haptics = {
  light: () => ok() && Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}),
  heavy: () => ok() && Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}),
  success: () => ok() && Haptics.notification({ type: NotificationType.Success }).catch(() => {}),
  error: () => ok() && Haptics.notification({ type: NotificationType.Error }).catch(() => {}),
};

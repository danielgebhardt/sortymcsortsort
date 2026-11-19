import { Preferences } from '@capacitor/preferences';

export interface Progress {
  /** Highest level the player may open (1-based). */
  unlocked: number;
  /** Best stars per level number. */
  stars: Record<string, number>;
  sound: boolean;
  haptics: boolean;
}

const KEY = 'progress.v1';
let state: Progress = { unlocked: 1, stars: {}, sound: true, haptics: true };

// Capacitor Preferences stores natively on Android/iOS and in localStorage in a browser
// (the web app). If the plugin fails for any reason, fall back to localStorage directly.
async function read(): Promise<string | null> {
  try {
    return (await Preferences.get({ key: KEY })).value;
  } catch {
    return localStorage.getItem(KEY);
  }
}

export async function loadProgress(): Promise<Progress> {
  try {
    const value = await read();
    if (value) state = { ...state, ...JSON.parse(value) };
  } catch {
    // first run or storage unavailable: keep defaults
  }
  return state;
}

export const progress = () => state;

function save() {
  const value = JSON.stringify(state);
  Preferences.set({ key: KEY, value }).catch(() => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // storage full or blocked: progress stays in memory for this session
    }
  });
}

export function completeLevel(n: number, stars: number) {
  state.stars[n] = Math.max(state.stars[n] ?? 0, stars);
  state.unlocked = Math.max(state.unlocked, n + 1);
  save();
}

export function setSetting(key: 'sound' | 'haptics', on: boolean) {
  state[key] = on;
  save();
}

export function totalStars() {
  return Object.values(state.stars).reduce((a, b) => a + b, 0);
}

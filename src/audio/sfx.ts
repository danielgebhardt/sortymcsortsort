import { progress } from '../storage/progress';

/** Tiny synthesized sound effects — no audio files needed. */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!progress().sound) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  // Browsers start audio suspended until a tap; iOS can also report 'interrupted' (e.g. after a call).
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (opts.at ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.2, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, from: number, to: number, vol = 0.15) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  /** Call from the first user gesture so mobile browsers allow audio. */
  unlock() {
    ac();
  },
  click: () => tone(660, 0.06, { type: 'triangle', vol: 0.12 }),
  whoosh: () => {
    noise(0.22, 600, 3200, 0.18);
    tone(520, 0.12, { type: 'triangle', vol: 0.06, slide: 1.8 });
  },
  bump: () => {
    tone(140, 0.16, { type: 'sine', vol: 0.35, slide: 0.6 });
    noise(0.06, 400, 200, 0.12);
  },
  locked: () => {
    tone(900, 0.05, { type: 'square', vol: 0.05 });
    tone(700, 0.05, { type: 'square', vol: 0.05, at: 0.07 });
  },
  unlockChime: () => {
    tone(880, 0.12, { type: 'triangle', vol: 0.12 });
    tone(1320, 0.18, { type: 'triangle', vol: 0.1, at: 0.08 });
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.14, at: i * 0.09 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.25, { type: 'sine', vol: 0.15, at: i * 0.14 })),
  star: (i: number) => tone(880 + i * 220, 0.15, { type: 'triangle', vol: 0.1 }),
};

// One-off: turn pointless sliders in the shipped levels into plain blocks, keeping every layout.
// Usage: npx tsx scripts/demote-sliders.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { chapterFor, pack, PackedLevel, unpack } from '../src/core/progression';
import { demoteUselessSliders, replay } from '../src/core/solver';

const FROZEN = 30;
const file = new URL('../src/levels/levels.json', import.meta.url);
const levels = JSON.parse(readFileSync(file, 'utf8')) as PackedLevel[];
const perChapter = new Map<string, { levels: number; sliders: number; demoted: number }>();
for (let n = FROZEN + 1; n <= levels.length; n++) {
  const level = unpack(levels[n - 1]);
  const before = level.blocks.filter((b) => b.slider).length;
  const demoted = demoteUselessSliders(level);
  if (!replay(level, level.solution!)) throw new Error(`level ${n}: solution broke after demoting sliders`);
  levels[n - 1] = pack(level);
  const name = chapterFor(n).chapter.name;
  const c = perChapter.get(name) ?? { levels: 0, sliders: 0, demoted: 0 };
  c.levels++;
  c.sliders += before;
  c.demoted += demoted;
  perChapter.set(name, c);
  if (n === 43) console.log(`level 43: demoted ${demoted} of ${before} sliders`);
}
writeFileSync(file, JSON.stringify(levels));
for (const [name, c] of perChapter) if (c.sliders) console.log(`${name.padEnd(16)} sliders ${String(c.sliders).padStart(3)}  demoted ${c.demoted}`);

import { writeFileSync } from 'node:fs';
import { buildLevel, pack, PACKED_LEVELS } from '../src/core/progression';
import { solve } from '../src/core/solver';

const out = [];
const t0 = Date.now();
for (let n = 1; n <= PACKED_LEVELS; n++) {
  const lvl = buildLevel(n);
  const s = solve(lvl);
  if (!s.solvable) throw new Error(`level ${n} is unsolvable`);
  out.push(pack(lvl));
  if (n % 25 === 0 || n <= 5) {
    const cells = lvl.blocks.reduce((a, b) => a + b.len, 0);
    console.log(
      `L${String(n).padStart(3)} ${lvl.w}x${lvl.h} blocks=${String(lvl.blocks.length).padStart(2)} fill=${(cells / (lvl.w * lvl.h)).toFixed(2)} ` +
        `rounds=${s.rounds.length} free@start=${s.initialFree} walls=${lvl.walls.length} locks=${lvl.blocks.filter((b) => b.lockedBy !== undefined).length}`,
    );
  }
}
writeFileSync(new URL('../src/levels/levels.json', import.meta.url), JSON.stringify(out));
console.log(`wrote ${out.length} levels in ${Date.now() - t0}ms`);

import { writeFileSync } from 'node:fs';
import { buildLevelWithStats, chapterFor, pack, PACKED_LEVELS } from '../src/core/progression';
import { replay } from '../src/core/solver';

// Usage: npm run levels                            → rebuild (keeps frozen levels; see generate-parallel.sh)
//        tsx scripts/generate-levels.ts            → build all 600 from scratch (ignores freezing!)
//        tsx scripts/generate-levels.ts 31 40      → just print stats for a range
//        OUT=part.json tsx scripts/generate-levels.ts 1 150   → write that range to a file (for parallel builds)
const [from, to] = process.argv[2] ? [Number(process.argv[2]), Number(process.argv[3] ?? process.argv[2])] : [1, PACKED_LEVELS];
const out = [];
const t0 = Date.now();
for (let n = from; n <= to; n++) {
  const t = Date.now();
  const { level, stats } = buildLevelWithStats(n);
  if (!level.solution || !replay(level, level.solution)) throw new Error(`level ${n}: shipped solution does not clear the board`);
  out.push(pack(level));
  const { chapter, i } = chapterFor(n);
  if (from !== 1 || i === 0 || i % 5 === 4 || n % 30 === 0) {
    const count = (f: (b: (typeof level.blocks)[number]) => unknown) => level.blocks.filter(f).length;
    console.log(
      `L${String(n).padStart(3)} ${chapter.name.padEnd(15)} ${level.w}x${String(level.h).padEnd(2)} blocks=${String(stats.blocks).padStart(2)} ` +
        `free=${String(stats.initialFree).padStart(2)} depth=${String(stats.depth).padStart(2)} sol=${String(level.solution.length).padStart(2)} ` +
        `walls=${level.walls.length} locks=${count((b) => b.lockedBy !== undefined)} slide=${count((b) => b.slider)} twin=${count((b) => b.twin !== undefined) / 2} ` +
        `bomb=${count((b) => b.fuse !== undefined)} spin=${count((b) => b.spinner)} gate=${level.gates?.length ?? 0} forced=${stats.pullbacks} win=${String(Math.round(stats.winRate * 100)).padStart(3)}% needSlide=${stats.needsSlide ? 'Y' : '-'} ${Date.now() - t}ms`,
    );
  }
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(out));
else if (from === 1 && to === PACKED_LEVELS) writeFileSync(new URL('../src/levels/levels.json', import.meta.url), JSON.stringify(out));
console.log(`built ${out.length} levels in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

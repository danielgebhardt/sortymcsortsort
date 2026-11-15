#!/usr/bin/env bash
# Rebuilds levels in 4 parallel chunks and merges them into src/levels/levels.json.
# Levels 1..FROZEN are copied unchanged from the current file: once players have finished a level,
# it must never change underneath them. Raise FROZEN as new levels ship.
set -euo pipefail
cd "$(dirname "$0")/.."
FROZEN=${FROZEN:-30}
TOTAL=600
tmp=$(mktemp -d)
# Later levels are slower to build, so the chunks get smaller.
span=$((TOTAL - FROZEN))
a=$((FROZEN + 1)); b=$((FROZEN + span * 30 / 100)); c=$((FROZEN + span * 55 / 100)); d=$((FROZEN + span * 78 / 100))
ranges=("$a $b" "$((b + 1)) $c" "$((c + 1)) $d" "$((d + 1)) $TOTAL")
i=0
for r in "${ranges[@]}"; do
  OUT="$tmp/part$i.json" npx tsx scripts/generate-levels.ts $r > "$tmp/log$i.txt" 2>&1 &
  i=$((i + 1))
done
wait
cat "$tmp"/log*.txt | grep -E "^(L|built)" | sort -k1.2n
node -e '
const fs = require("fs");
const [dir, frozen, total] = [process.argv[1], Number(process.argv[2]), Number(process.argv[3])];
const keep = JSON.parse(fs.readFileSync("src/levels/levels.json", "utf8")).slice(0, frozen);
if (keep.length !== frozen) throw new Error("current levels.json has fewer than " + frozen + " levels");
const parts = [0, 1, 2, 3].map((i) => JSON.parse(fs.readFileSync(dir + "/part" + i + ".json", "utf8")));
const all = keep.concat(parts.flat());
if (all.length !== total) throw new Error("expected " + total + " levels, got " + all.length);
fs.writeFileSync("src/levels/levels.json", JSON.stringify(all));
console.log("wrote", all.length, "levels (" + frozen + " frozen)");
' "$tmp" "$FROZEN" "$TOTAL"

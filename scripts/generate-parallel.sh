#!/usr/bin/env bash
# Builds all 600 levels in 4 parallel chunks, then merges them into src/levels/levels.json.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
ranges=("1 150" "151 300" "301 450" "451 600")
i=0
for r in "${ranges[@]}"; do
  OUT="$tmp/part$i.json" npx tsx scripts/generate-levels.ts $r > "$tmp/log$i.txt" 2>&1 &
  i=$((i + 1))
done
wait
cat "$tmp"/log*.txt | grep -E "^(L|built)" | sort -k1.2n
node -e '
const fs = require("fs");
const parts = [0, 1, 2, 3].map((i) => JSON.parse(fs.readFileSync(process.argv[1] + "/part" + i + ".json", "utf8")));
const all = parts.flat();
if (all.length !== 600) throw new Error("expected 600 levels, got " + all.length);
fs.writeFileSync("src/levels/levels.json", JSON.stringify(all));
console.log("wrote", all.length, "levels");
' "$tmp"

/**
 * ⭐ 耗魔「級別贏」—— GH#1260（2026-09-15）。
 *
 * 量到的缺陷：`tierize()` 每次都從 `manaCost[0]` 重新歸級，而原始值會跟著表一起被改寫。
 * 表連續動兩次（`ac0aa0658` 小＝112、`1bb6c3fea` 小＝150）⇒ 112 離 75 差 37、離 150 差 38
 * ⇒ **293 支掉一格**（耗魔約減半），⛔ 沒有人決定過、全套測試全綠。
 *
 * 閘：把出貨耗魔表整張縮成 0.6 倍再跑一次 `tierize()` —— 每一份手編技能的 `manaCostTier`
 * 都不可以動（值跟著表走，級別不跟）。
 * ⭐ 量尺兩個方向都驗：同一張縮過的表、拿掉級別改走「最近一格」時，一定要量得到換格
 * （否則 0.6 這個倍數對出貨內容是瞎的，這一條就是恆真式）。
 *
 * 突變紀錄：`tierize.py` 的 `authored in TIER_NAMES` 分支改回一律 `nearest_index` ⇒ 紅（逐支指名）。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const PY = String.raw`
import json, os, sys
sys.path.insert(0, "tools/skill-remake")
from tierize import Grids, tierize
import apply_tiers
g = Grids()
g.mana = {k: v * 0.6 for k, v in g.mana.items()}
gen = apply_tiers.generator_owned()
seen, moved, blind = 0, [], 0
for name in sorted(os.listdir("content/abilities")):
    if not name.endswith(".json") or name.startswith("_") or name[:-5].rpartition(".")[0] in gen:
        continue
    raw = open(os.path.join("content/abilities", name), encoding="utf-8").read()
    doc, bare = json.loads(raw), json.loads(raw)
    t = doc.get("manaCostTier")
    if not t:
        continue
    seen += 1
    tierize(doc, g, [])
    bare.pop("manaCostTier")
    tierize(bare, g, [])
    if doc.get("manaCostTier") != t:
        moved.append(name + ": " + t + " -> " + str(doc.get("manaCostTier")))
    if bare.get("manaCostTier") != t:
        blind += 1
print(json.dumps({"seen": seen, "moved": moved, "nearestWouldMove": blind}, ensure_ascii=False))
`;

describe("耗魔級別贏過原始值（GH#1260）", () => {
  it("⭐ 表整張縮 0.6 倍：手編技能的 manaCostTier 一格都不動", () => {
    const r = spawnSync("python3", ["-c", PY], { cwd: REPO, encoding: "utf8", timeout: 120_000 });
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout.trim().split("\n").pop()!) as {
      seen: number;
      moved: string[];
      nearestWouldMove: number;
    };
    expect(out.seen, "⛔ 一支帶 manaCostTier 的手編技能都沒掃到 —— 偵測壞了").toBeGreaterThan(100);
    expect(out.nearestWouldMove, "⛔ 量尺是瞎的：拿掉級別走最近一格也沒有任何一支換格").toBeGreaterThan(0);
    expect(out.moved, "⛔ 表一動級別就跟著跑 ⇒ 耗魔會掉格（見檔頭 293 支）").toEqual([]);
  });
});

/**
 * GH#667 —— 唯一的粒子重生成指令必須是**冪等**的。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼這條守衛住在 packages/shared/src/ops/
 *
 * `tools/w3x-import` 那一包的 vitest **只有在這次改動碰到那個目錄時才會跑**
 * （`ship.mjs` 的 `suiteTrim.extras` 是路徑推導的）。而這張票要防的故障
 * **不是由那個目錄的改動引發的** —— 2026-08-14 讓 `godie-gumdam-p0` 掉 `ambient`
 * 的那一次改動，是把英雄 `godie-hlgr` 搬進 `content/_legacy/champions/`。
 * 抽取器一個位元組都沒動，而它的輸出從此不一樣。
 * ⇒ 守衛要住在**每一次都會跑**的那一包，⛔ 不是住在它守的那個工具旁邊。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 它問的問題（⛔ 只有一個）
 *
 *   把 `extract_particles.py` 完整跑一次到暫存樹，出貨樹**逐位元組**有沒有變？
 *
 * ⭐ 這是「兩個名詞的關係」：`content/vfx/**` 是好的、抽取器也是好的，
 * 壞掉的是「**再跑一次它會不會還是它**」。分別檢查每一半永遠是綠的 ——
 * 而 2026-08-14 到 2026-08-27 之間，每一條既有的閘確實都是綠的。
 *
 * 量到的（2026-08-27，⛔ 不是推測）：一次重生成會
 *   · 讓 5 份文件掉 `ambient: true`（鋼彈 / 夜舞姬 —— `isSwingTrailDoc()` 認的就是它）
 *   · 讓 `imported.heroshana` 掉手加的 `godie-heroshana-r0`（**印著 preserved**）
 *   · 把 22 個綁定重新排序、把每一段中文 `note` escape 成 \uXXXX
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const TOOL = join(REPO, "tools", "w3x-import");
const RAW = join(TOOL, "out", "GoDieEX22s", "raw");

function findPython(): string | null {
  for (const c of ["python3", "/opt/homebrew/bin/python3", "/usr/bin/python3"]) {
    try {
      execFileSync(c, ["-c", "import struct, json"], { stdio: "pipe" });
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}
const PY = findPython();
// ⛔ fail-open 沒錯，**靜默**才是缺陷：跑不起來的時候要說出來，⛔ 不是安靜地全過。
const why = PY === null ? "沒有 python3" : !existsSync(RAW) ? "沒有解出來的 .mdx" : "";
if (why) console.warn(`⚠️ laneVParticlesRegenIsIdempotent 沒驗到：${why}`);

describe.skipIf(why !== "")("GH#667 · extract_particles.py 重生成一次 ⇒ 出貨逐位元組不變", () => {
  const stage = mkdtempSync(join(tmpdir(), "ggd-regen-idem-"));
  afterAll(() => rmSync(stage, { recursive: true, force: true }));

  it("★ 282 份 vfx 文件 ＋ config/ambient-vfx.json 一個位元組都沒動", () => {
    execFileSync(PY!, [join(TOOL, "extract_particles.py"), `--out-dir=${stage}`], {
      cwd: TOOL,
      encoding: "utf8",
      stdio: "pipe",
    });
    const fresh = readdirSync(join(stage, "vfx")).filter((f) => f.endsWith(".json"));
    expect(fresh.length, "重生成沒有產出東西 —— 這條守衛就白跑了").toBeGreaterThanOrEqual(280);

    const drift: string[] = [];
    for (const rel of [
      ...fresh.map((f) => join("vfx", f)),
      join("config", "ambient-vfx.json"),
    ]) {
      const shipped = join(REPO, "content", rel);
      if (!existsSync(shipped)) {
        drift.push(`${rel}: 重生成產出了一份出貨樹沒有的文件`);
        continue;
      }
      if (readFileSync(join(stage, rel), "utf8") !== readFileSync(shipped, "utf8")) {
        drift.push(rel);
      }
    }
    expect(
      drift,
      `⛔ 跑一次重生成會改掉這 ${drift.length} 份出貨檔 —— 而「產物過期就跑重生成」\n` +
        `是本 repo 每一條產物規則的前提。逐檔看：\n` +
        `  python3 tools/w3x-import/extract_particles.py --out-dir=/private/tmp/x\n` +
        `  diff -u content/vfx/<檔> /private/tmp/x/vfx/<檔>\n` +
        drift.slice(0, 12).map((d) => `  - ${d}`).join("\n"),
    ).toEqual([]);
  }, 120_000);
});

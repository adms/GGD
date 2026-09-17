/**
 * ⭐⭐【`def.radius` 的預設值只能有**一個住處**】（GH#1246）
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 抓到的：同一個「省略」在三個地方被當成三個不同的值
 * ═══════════════════════════════════════════════════════════════════════════
 * owner 2026-09-12（逐字）：
 * > 「對 要**抽象化 統一 維持一致性** 不是逐個去填」　「**這是我一貫風格**」
 *
 * 2026-09-12 量到：
 *
 * | 誰讀 `def.radius` | 省略時當成 |
 * |---|---:|
 * | `abilitySystem` 選人 | **1** |
 * | `MobSystem` 王的瞄準 | **0** |
 * | `castTimeFormula` 兇殘分數 | **0** |
 *
 * ⇒ 兩個意思各一支具名解析器（`sim/abilities/abilitySystem.ts`）：
 * `targetingRadius(def)`（選人，省略 ⇒ `TARGETING_RADIUS_WHEN_OMITTED`）與
 * `authoredAoeRadius(def)`（它是不是 AoE，省略 ⇒ 0）。⭐ 這條閘守著「⛔ 不准再長出第四個住處」。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 2026-09-15 擴到 `apps/*\/src`（GH#1246 剩餘 AC）
 * ═══════════════════════════════════════════════════════════════════════════
 * 第一版只掃 `packages/shared` ⇒ ⛔ 客戶端兩處照樣各自有預設：
 * `GameApp.ts` 按住預覽 `(ability as {…}).radius ?? 0`（省略 radius 的 ground 技不畫圈，
 * 而 sim 真的打一個圈）· `TouchInput.ts` 觸控圓盤 `ability.radius ?? 1.2`（sim 裡不存在的值）。
 * ⚠️ 前者是**型別轉型再讀**的寫法，舊正則結構上看不到它。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⚠️ 它**只管技能的** radius（⛔ 不是每一個叫 radius 的東西）
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ `transform.radius`（身體大小，`ReviveSystem` 的 `transform.get(id)?.radius ?? 0.6`）與
 * ⛔ effect 自己的 `e.radius`（`shapeTargets` 的 `?? 0`）**是不同層的東西** ⇒ ⭐ 不在範圍裡。
 * ⇒ 判準：⭐ 只認 `def` / `ab` / `ability` / `doc` 開頭的讀法（含 `?.` 與 `(ability as …).radius`）。
 * ⚠️ 所以 `).radius ??` 不可以單獨成立 —— 那會把 `transform.get(id)?.radius ?? 0.6` 算進來。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const ROOTS = [
  "packages/shared/src",
  ...readdirSync(join(REPO, "apps"))
    .map((a) => `apps/${a}/src`)
    .filter((p) => existsSync(join(REPO, p))),
];

const DOC = String.raw`(?:def|ab|ability|doc)`;
/** ⭐ 技能文件的讀法：`def.radius ??` · `def?.radius ??` · `(ability as {…}).radius ??`，後面接字面值。 */
const LITERAL = new RegExp(
  String.raw`(?:\b${DOC}\s*\??\.|\(\s*${DOC}\b[^()]*\)\s*\??\.)\s*radius\s*\?\?\s*[-\d]`,
);
const hit = (line: string): boolean =>
  LITERAL.test(line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, ""));

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!["node_modules", "__fixtures__", "dist"].includes(name)) tsFiles(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("技能 radius 的預設值只能有一個住處（GH#1246）", () => {
  const perRoot = ROOTS.map((r) => [r, tsFiles(join(REPO, r))] as const);
  const files = perRoot.flatMap(([, fs]) => fs);
  const texts = new Map(files.map((f) => [f, readFileSync(f, "utf8")] as const));

  it("⭐ 量尺自證（兩個方向）：每個根都掃到檔、壞寫法抓得到、別層的 radius 不誤報", () => {
    console.info(
      `[noLiteralRadiusDefault] 掃 ${files.length} 檔 · ${perRoot.map(([r, fs]) => `${r}=${fs.length}`).join(" · ")}`,
    );
    // ⛔ 沒有這一條，一個回空陣列的掃描會讓下面那條**結構上永遠綠**。
    // ⭐ 逐根下限從**另一個列舉器**推導（git 追蹤、磁碟上還在的同一組檔），⛔ 不寫死魔數 ——
    //   「每根 >0」看不見「某個根只掃到 1 檔」；少於 git 知道的數就是有子樹沒走到（GH#1246 修正輪補回）。
    const skip = /(^|\/)(node_modules|__fixtures__|dist)\//;
    for (const [r, fs] of perRoot) {
      const tracked = execFileSync("git", ["ls-files", "--", r], { cwd: REPO, encoding: "utf8" })
        .split("\n")
        .filter((p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) && !skip.test(p) && existsSync(join(REPO, p)));
      expect(tracked.length, `⛔ git 在 ${r} 一個檔都沒追蹤 —— 分母塌了`).toBeGreaterThan(0);
      expect(fs.length, `⛔ ${r} 只掃到 ${fs.length} 檔，git 追蹤 ${tracked.length} 檔`).toBeGreaterThanOrEqual(tracked.length);
    }
    // ⭐ 唯一住處本身要在掃描範圍裡（下一條用它當豁免；它搬出範圍 ⇒ 豁免永遠不觸發，而沒有東西會說）。
    expect(
      [...texts.values()].some((t) => t.includes("export const TARGETING_RADIUS_WHEN_OMITTED")),
      "⛔ 掃不到 `TARGETING_RADIUS_WHEN_OMITTED` 的唯一住處 —— 它搬出掃描範圍了？",
    ).toBe(true);
    for (const bad of [
      "const r = (ability as { radius?: number }).radius ?? 0;",
      "radius: ability.radius ?? 1.2,",
      "if ((def?.radius ?? 0) <= 0) return;",
    ]) expect(hit(bad), `⛔ 量尺瞎了：抓不到 ${bad}`).toBe(true);
    for (const ok of [
      "return world.transform.get(id)?.radius ?? 0.6;",
      "const r = e.radius ?? 0;",
      "radius: ab.radius ?? null,",
      " * 以前寫 `def.radius ?? 1`",
    ]) expect(hit(ok), `⛔ 量尺誤報：${ok}`).toBe(false);
  });

  it("⛔ 不准寫 `def.radius ?? <字面值>` —— ⭐ 呼叫 `targetingRadius(def)`／`authoredAoeRadius(def)`", () => {
    const hits: string[] = [];
    for (const [f, text] of texts) {
      // ⭐ **唯一合法的那一處**：定義那兩支解析器的檔案本身（判準是內容，⛔ 不是檔名 —— 搬家不失效）。
      if (text.includes("export const TARGETING_RADIUS_WHEN_OMITTED")) continue;
      text.split("\n").forEach((line, i) => {
        if (hit(line)) hits.push(`${relative(REPO, f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(
      hits,
      "⛔⛔ 這幾行為技能的 `radius` 寫了**自己的**預設值 —— ⭐ 而那個值只能有一個住處。\n" +
        "⇒ 選人用 `targetingRadius(def)`；判斷是不是 AoE 用 `authoredAoeRadius(def)`（`sim/abilities/abilitySystem.ts`）。\n" +
        "⚠️ 這條閘**不管** `transform.radius`（身體大小）與 effect 自己的 `radius`。",
    ).toEqual([]);
  });
});

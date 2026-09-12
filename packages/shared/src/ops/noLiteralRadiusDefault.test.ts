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
 * ⇒ ⭐ **907 支技能裡 626 支省略它**（`castType:"ground"` 的 51 支真的受影響）
 * ⇒ ⛔ 它們真的打一個圈，⭐ 而王不瞄人群、吟唱被當成非 AoE。
 *
 * ⇒ 預設收進 {@link TARGETING_RADIUS_WHEN_OMITTED}，三處呼叫
 * {@link authoredAbilityRadius}。⭐ 而這條閘守著「⛔ 不准再長出第四個住處」。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⚠️ 它**只管技能的** radius（⛔ 不是每一個叫 radius 的東西）
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ `transform.radius`（身體大小，`ReviveSystem` 的 `?? 0.6`）與
 * ⛔ effect 自己的 `e.radius`（`shapeTargets` 的 `?? 0`）**是不同層的東西**
 * ⇒ ⭐ 它們**不在**這條閘的範圍裡。⚠️ 我 2026-09-12 第一次掃就把它們誤算進衝突。
 * ⇒ 判準：⭐ 只認 `def.radius` / `ab.radius` / `doc.radius` 這種**技能文件**的讀法。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** ⭐ 技能文件的讀法：`def` / `ab` / `ability` / `doc` 開頭，⛔ 不含 `transform` / `e` / `t`。 */
const LITERAL = /\b(?:def|ab|ability|doc)\s*\.\s*radius\s*\?\?\s*[-\d]/g;

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__fixtures__") tsFiles(p, out);
    } else if (
      (name.endsWith(".ts") || name.endsWith(".tsx")) &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".test.tsx")
    ) {
      out.push(p);
    }
  }
  return out;
}

describe("技能 radius 的預設值只能有一個住處（GH#1246）", () => {
  const files = tsFiles(SRC);

  it("⭐ 量尺自證：真的掃到出貨原始碼，⛔ 而且掃得到那支解析器", () => {
    // ⛔ 沒有這一條，一個回空陣列的掃描會讓下面那條**結構上永遠綠**。
    expect(files.length, "⛔ 一個檔都沒掃到 —— 路徑錯了").toBeGreaterThan(300);
    const home = files.filter((f) =>
      readFileSync(f, "utf8").includes("TARGETING_RADIUS_WHEN_OMITTED"),
    );
    expect(
      home.length,
      "⛔ 掃不到 `TARGETING_RADIUS_WHEN_OMITTED` —— 那個唯一住處不在了？",
    ).toBeGreaterThan(0);
  });

  it("⛔ 不准寫 `def.radius ?? <字面值>` —— ⭐ 呼叫 `targetingRadius(def)`／`authoredAoeRadius(def)`", () => {
    const hits: string[] = [];
    for (const f of files) {
      // ⭐ **唯一合法的那一處**：定義那兩支解析器的檔案本身。
      // ⛔ 判準不是檔名，是「這個檔宣告了那個常數」—— ⭐ 搬家不會讓豁免失效。
      if (readFileSync(f, "utf8").includes("export const TARGETING_RADIUS_WHEN_OMITTED")) continue;
      const text = readFileSync(f, "utf8");
      for (const line of text.split("\n")) {
        // ⭐ 註解裡寫得出來（這個檔頭與 abilitySystem 的說明都要提到它）。
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (LITERAL.test(code)) hits.push(`${f.slice(SRC.length + 1)}: ${line.trim()}`);
        LITERAL.lastIndex = 0;
      }
    }
    expect(
      hits,
      "⛔⛔ 這幾行為技能的 `radius` 寫了**自己的**預設值 —— " +
        "⭐ 而那個值只能有一個住處（`TARGETING_RADIUS_WHEN_OMITTED`）。\n" +
        "⇒ 改成 `targetingRadius(def)`／`authoredAoeRadius(def)`。\n" +
        "⚠️ ⛔ 這條閘**不管** `transform.radius`（身體大小）與 effect 自己的 `radius` —— " +
        "那些是不同層的東西；若你撞到誤報，先確認那真的是**技能文件**的 radius。",
    ).toEqual([]);
  });
});

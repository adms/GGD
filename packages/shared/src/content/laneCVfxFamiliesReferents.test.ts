/**
 * ⭐【`vfx-families` 的每一列都要有消費端】—— GH#713。
 *
 * `content/config/vfx-families.json` 的 `abilities` 表是**以技能 id 為鍵**的索引。
 * 一列的鍵如果在 `content/abilities/` 沒有對應的出貨文件，那一列**永遠不會被查到**
 * —— 第一·五守則點名的形狀：一份**沒有消費端的宣稱**。
 *
 * 2026-08-27 量到：313 列裡 **93 列**是死的（GH#713 只點名了 `family:"mark"` 那 4 支，
 * 逐列數才發現它是整批的）。修法在**產生器來源** `tools/w3x-import/build_pitch.py`
 * （`shipped_ability_ids()`），⛔ 不是手改產物。
 *
 * ⚠️ 這條**不驗數字**（幾列、剪掉幾列都是會變的），只驗那個**關係**：
 * 「鍵 → 出貨文件」這條參照解得開。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FAMILIES = join(REPO, "content/config/vfx-families.json");
const ABILITY_DIR = join(REPO, "content/abilities");

const abilityKeys = (): string[] => {
  const doc = JSON.parse(readFileSync(FAMILIES, "utf8")) as { abilities?: Record<string, unknown> };
  return Object.keys(doc.abilities ?? {});
};

const shippedIds = (): Set<string> =>
  new Set(
    readdirSync(ABILITY_DIR)
      .filter((n) => n.endsWith(".json") && !n.startsWith("_"))
      .map((n) => n.slice(0, -".json".length)),
  );

describe("vfx-families 的 abilities 索引（GH#713）", () => {
  it("⭐ 每一個鍵都對得到 content/abilities 的一份出貨文件 —— ⛔ 沒有死列", () => {
    const shipped = shippedIds();
    const keys = abilityKeys();
    // 守衛的守衛：母體要真的是整棵樹，⛔ 不是一個空表默默地全過。
    expect(shipped.size).toBeGreaterThan(100);
    expect(keys.length).toBeGreaterThan(100);

    const dead = keys.filter((k) => !shipped.has(k));
    expect(
      dead,
      "⛔ 這幾列指向不存在的技能（死列）。修法：改 `tools/w3x-import/build_pitch.py`\n" +
        "然後 `bash scripts/genrun.sh pitch:build`，⛔ 不要手改 content/config/vfx-families.json。",
    ).toEqual([]);
  });
});

/**
 * ⭐【美術層不可以改變碰撞】—— GH#324 Phase 6 的守衛。
 *
 * 地圖分三層：Gameplay（碰撞）／Landmark（動漫辨識物）／Background（純視覺）。
 * 分層的**全部價值**就是這一條：改美術不會動到玩法。
 *
 * ⚠️ 沒有這條守衛的話，分層只是一個「我們有分層」的說法 ——
 * 而說法會腐爛（第三守則）。這一條讓它腐爛不了：
 * 只改 landmark／background 的道具，重新產生的 `obstacles` 陣列必須**位元相同**。
 *
 * ⛔ 唯一的例外是 `blocks: true` 的 landmark 道具 —— 那一格是**刻意**會影響玩法的，
 * 而它在 schema 上是**顯式**的一格（⛔ 不是預設值）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zMapDoc } from "../content/schema/map";
import { DEFAULT_MAP_SPEC } from "../content/schema/mapSpecDoc";
import { compileMap } from "../map/compile";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MAPS = join(REPO, "content", "maps");

describe("美術層不可以改變碰撞（GH#324 Phase 6）", () => {
  it("⭐ 只加 landmark / background 道具 → obstacles 位元相同", () => {
    expect(existsSync(MAPS), "content/maps/ 存在").toBe(true);
    const files = readdirSync(MAPS).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    expect(files.length, "一張地圖都沒有 —— 這條守衛會空跑").toBeGreaterThan(0);

    for (const f of files) {
      const doc = zMapDoc.parse(JSON.parse(readFileSync(join(MAPS, f), "utf8")));
      const before = compileMap(doc, DEFAULT_MAP_SPEC).arena;

      // 塞一堆美術進去 —— 兩層都塞，`blocks` 一律 false（那才是「純美術」）
      const dressed = zMapDoc.parse({
        ...doc,
        landmarkProps: [
          ...doc.landmarkProps,
          { model: "assets/models/props/biwa.glb", at: { col: 10, row: 8 }, blocks: false },
        ],
        backgroundProps: [
          ...doc.backgroundProps,
          { model: "assets/models/props/stairs.glb", at: { col: 1, row: 1 } },
          { model: "assets/models/props/abyss.glb", at: { col: 22, row: 16 } },
        ],
      });
      const after = compileMap(dressed, DEFAULT_MAP_SPEC).arena;

      expect(
        JSON.stringify(after.zones.map((z) => z.obstacles)),
        `${f}: 加了純美術道具之後碰撞變了 —— 三層分開的意義就沒了`,
      ).toBe(JSON.stringify(before.zones.map((z) => z.obstacles)));

      // 反向：裝飾**確實**多了，否則上面那條是「什麼都沒發生」而恆真（失敗形態③）
      expect(after.decor.length, `${f}: 美術根本沒有被加進去`).toBeGreaterThan(before.decor.length);
    }
  });
});

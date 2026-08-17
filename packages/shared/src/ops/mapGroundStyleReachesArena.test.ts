/**
 * GH#342 —— 作者宣告的地板**真的到得了**編出來的場地。
 *
 * 這條守的是一個具體的故障：`compileMap()` 從 GH#324 起就把 `groundStyle`
 * 寫死成 `"stone"`，於是七張動漫場地（無限城的紙門走廊、納薩力克的王座廳、
 * 世界樹的根部）**全部踩在同一張歐式地牢石板上**，而 `map@1` 連宣告的欄位
 * 都沒有 —— 作者想改也改不到。
 *
 * ⛔ 這裡刻意**不**斷言「無限城＝tatami」那種字面值：哪一張圖配哪一種地板是
 * **內容**，owner 隨時會改，抄進測試就是第四個住處（第二守則）。
 * 斷言的是兩件**機制**：
 *   ① 宣告有沒有被傳遞（把 compile.ts 那一行改回寫死 → 紅）
 *   ② 出貨的圖不是全部同一種（＝「寫死」這個故障的可觀察形狀）
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_GROUND_STYLE } from "../content/schema/groundStyle";
import { zMapDoc } from "../content/schema/map";
import { DEFAULT_MAP_SPEC } from "../content/schema/mapSpecDoc";
import { compileMap } from "../map/compile";

const MAPS = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/maps");
const files = readdirSync(MAPS).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const docs = files.map((f) => zMapDoc.parse(JSON.parse(readFileSync(join(MAPS, f), "utf8"))));

describe("map@1 groundStyle → arena@1 (GH#342)", () => {
  it("carries every map's declared groundStyle into the compiled arena", () => {
    expect(docs.length).toBeGreaterThanOrEqual(5); // guard the guard: the tree was read
    for (const doc of docs) {
      const { arena } = compileMap(doc, DEFAULT_MAP_SPEC);
      expect(arena.groundStyle, doc.id).toBe(doc.groundStyle ?? DEFAULT_GROUND_STYLE);
    }
  });

  it("does not put every shipped map on one floor", () => {
    const styles = new Set(docs.map((d) => compileMap(d, DEFAULT_MAP_SPEC).arena.groundStyle));
    expect(styles.size, `全部都是 ${[...styles].join("/")} —— 地板又被寫死了`).toBeGreaterThan(1);
  });

  it("still falls back to the default when a map declares nothing", () => {
    // ⛔ 舊圖的行為一個位元組都不變 —— 沒宣告 ≠ 換一張新地板
    const { groundStyle: _drop, ...bare } = docs[0]!;
    const { arena } = compileMap(zMapDoc.parse(bare), DEFAULT_MAP_SPEC);
    expect(arena.groundStyle).toBe(DEFAULT_GROUND_STYLE);
  });
});

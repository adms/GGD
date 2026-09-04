/**
 * ⭐⭐ 【38-002 究極暴走黑龍波】的三條黑龍 —— **餵出貨內容**，⛔ 不是自造夾具。
 *
 * ── ⛔ 修的是什麼 ─────────────────────────────────────────────────────
 * 出貨那一格原本是 `path:"radial", count:3` ⇒ ⭐ `ringPoints` 把整圈等分、
 * 起始相位**固定在世界 +x**（它自己的註解逐字說明為什麼不跟著面向轉）
 * ⇒ 畫面上是**朝三方的星爆**，⛔ 而原作 `A09I` 是三條**並排往前衝**：
 *   j:44062  中央 `PolarProjectionBJ(casterLoc, **160**, facing)`
 *   j:44068  右側 `PolarProjectionBJ(casterLoc, **200**, **45 + facing**)`
 *   j:44069  左側 `… **−45 + facing**`
 *   j:44070  `CreateNUnitsAtLoc(1,'h02F',…, point2, **GetUnitFacing(施法者)**)`
 * ⇒ ⭐ ±45 是**生成點的方位角**，而三具的 facing 是**同一個**。
 *
 * ⚠️ ⭐ 這是玩家**看得到**的改動（第〇·六階梯：JASS 贏過現況）。
 *
 * MUTATION LOG（落地前實跑，見 commit 訊息）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { modelFxInstancesFromFrame } from "@ggd/shared/sim/effects/modelFxPlacement";

const ROOT = join(__dirname, "../../../..");
const read = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, `content/abilities/${id}.json`), "utf8")) as Record<string, unknown>;

/** ⭐ 出貨文件裡那一格 —— ⛔ 不是我在測試裡編的。 */
function dragonNode(id: string): Record<string, unknown> {
  const effects = read(id)["effects"] as Record<string, unknown>[];
  const n = effects.find((e) => e["kind"] === "spawnModelFx" && e["modelKey"] === "imported.darkraor");
  expect(n, `⛔ ${id} 找不到黑龍那一格 —— 這支測試量錯東西了`).toBeDefined();
  return n!;
}

const MIRRORS = ["godie-u010.ex", "godie-uvng.ex"];

describe("38-002 三條黑龍：並排往前衝，⛔ 不是朝三方散開", () => {
  it.each(MIRRORS)("★★ ⭐ %s 的出貨節點走 `path:\"fan\"`（⛔ 不是 radial）", (id) => {
    const n = dragonNode(id);
    expect(
      n["path"],
      [
        "⛔⛔ 這一格是 `radial` ⇒ `ringPoints` 把整圈等分、起始相位固定在世界 +x",
        "  ⇒ 畫面上是**朝三方的星爆**，⛔ 而原作 j:44070 說三具 facing 是同一個。",
      ].join("\n"),
    ).toBe("fan");
    expect(n["spreadDeg"], "⛔ 缺 spreadDeg ⇒ 三具會疊在同一條線上").toBe(45);
    expect(n["offsetForwardU"], "⛔ 缺弧半徑 ⇒ 三具的起點疊在同一點（j:44068 是 200 wc3u）").toBeGreaterThan(0);
  });

  it("★★ ⭐ 餵出貨節點跑**出貨的擺位函式**：三具方向平行、起點排成弧", () => {
    const n = dragonNode("godie-u010.ex");
    const out = modelFxInstancesFromFrame(n as never, {
      origin: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
    });
    expect(out.length, "⛔ 不是 3 具").toBe(3);
    const dirs = out.map((i) => [Math.round(i.dir!.x * 1e6), Math.round(i.dir!.z * 1e6)]);
    expect(
      dirs,
      "⛔⛔ 三具方向不一樣 ⇒ 又變成方向扇，而原作 j:44070 是同一個 facing",
    ).toEqual([[1e6, 0], [1e6, 0], [1e6, 0]]);
    const at = out.map((i) => Math.round((Math.atan2(i.origin.z, i.origin.x) * 180) / Math.PI));
    expect(at, "⛔ 起點沒有排成 facing±45 的弧").toEqual([-45, 0, 45]);
  });

  it("★ ⭐ 12 個落點用的是 `o00Z` 真正的模型（⛔ 不是 tectonicfury）", () => {
    for (const id of MIRRORS) {
      const effects = read(id)["effects"] as Record<string, unknown>[];
      const ring = effects.find((e) => e["kind"] === "spawnModelFx" && e["path"] === "orbit");
      expect(
        ring?.["modelKey"],
        [
          "⛔ `imported.tectonicfury` 與 `o00Z` **沒有任何關係** ——",
          "  `OBJECTS.json` 逐字：`units.o00Z = {name:\"黑龍波\", model:\"FlameStrikeTarget.mdl\"}`。",
        ].join("\n"),
      ).toBe("w3x.stock.flamestriketarget");
    }
  });
});

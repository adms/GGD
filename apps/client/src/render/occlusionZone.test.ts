/**
 * ⭐ GH#421 —— 視野遮蔽拿的牆，必須是**觀看者自己那一區**的。
 *
 * ⚠️ 跟 `visionOcclusion.test.ts` 不重疊：那一支驗「敵人遮／隊友不遮」的規則，
 * 用自己手寫的一面牆 ⇒ 它對 GH#421 **全綠**（失敗形態⑤）。缺陷不在規則，在**取牆**。
 * 這裡驗的是兩個名詞的**關係**：玩家的 zone ↔ 拿到的牆。
 *
 * ⭐ 夾具走出貨路徑：出貨的 `content/arenas/` 文件 → `arenaDefFromDoc` →
 * `occludeArgsFor`（`GameApp.occludeArgs` 只轉發到它）。⛔ 零字面座標：牆與站位
 * 都從文件推導，場地被重畫之後這支仍然問同一個問題。
 *
 * ── 突變（2026-08-20）：`zones[viewerZone]` 改回 `zones.find(rect)`
 *    → 「zone 1」那一條紅（`blocked` 回 false）。改回來即綠。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { arenaDefFromDoc, type ObstacleBox, type ZoneDef } from "@ggd/shared/sim/world/ArenaDef";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { stripComments } from "@ggd/shared/testkit/stripComments";
import { occludeArgsFor } from "./occlusionZone";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/** 出貨的兩區矩形場地：zone 0 在 x≈0、zone 1 整個平移在 x≈+72。 */
const ARENA = arenaDefFromDoc(
  JSON.parse(read("../../../../content/arenas/arena.infinity-castle.json")) as Parameters<
    typeof arenaDefFromDoc
  >[0],
);

/** 這一區離中心最近的盒 —— 保證是**場內**的牆，不是外圍圍牆。 */
function innerWall(zone: ZoneDef): ObstacleBox {
  const d2 = (b: ObstacleBox): number =>
    (b.center.x - zone.center.x) ** 2 + (b.center.z - zone.center.z) ** 2;
  const boxes = zone.obstacles.filter((o): o is ObstacleBox => o.kind === "box");
  return boxes.reduce((a, b) => (d2(b) < d2(a) ? b : a));
}

/** 隔著那面牆對站的兩點（沿它薄的那一軸，各退開 2 單位）。 */
function acrossWall(b: ObstacleBox): [Vec2, Vec2] {
  const gap = 2;
  return b.halfD <= b.halfW
    ? [
        { x: b.center.x, z: b.center.z - b.halfD - gap },
        { x: b.center.x, z: b.center.z + b.halfD + gap },
      ]
    : [
        { x: b.center.x - b.halfW - gap, z: b.center.z },
        { x: b.center.x + b.halfW + gap, z: b.center.z },
      ];
}

describe("GH#421 遮蔽用的是觀看者那一區的牆", () => {
  it.each([0, 1])("⭐ zone %i 的角色，真的被自己這一區的牆擋住", (z) => {
    const [eye, foe] = acrossWall(innerWall(ARENA.zones[z]!));
    const args = occludeArgsFor(ARENA.zones, z, eye);
    expect(args, `zone ${z} 沒有遮蔽參數`).toBeDefined();
    expect(args!.blocked(foe.x, foe.z)).toBe(true);
  });

  it("⛔ 拿錯區的牆＝什麼都擋不住（這就是 zone 1 半場遮蔽整個消失的原因）", () => {
    const [eye, foe] = acrossWall(innerWall(ARENA.zones[1]!));
    // 缺陷原狀 `zones.find(rect)` 永遠回 zone 0，而它的牆在 48 單位外
    expect(occludeArgsFor(ARENA.zones, 0, eye)!.blocked(foe.x, foe.z)).toBe(false);
  });

  it("⛔ 同一區、中間沒牆的敵人不會被遮 —— 證明上面不是「一律遮」", () => {
    const [eye] = acrossWall(innerWall(ARENA.zones[1]!));
    expect(occludeArgsFor(ARENA.zones, 1, eye)!.blocked(eye.x + 0.5, eye.z)).toBe(false);
  });

  it("⭐ 出貨的 GameApp 真的把『這雙眼睛在哪一區』餵進去", () => {
    // GameApp headless 起不來 ⇒ 接線沿用既有做法（`GameApp.zoneCull.test.ts`）：
    // 註解先剝掉，散文滿足不了。真正的行為覆蓋在上面三條。
    expect(stripComments(read("../GameApp.ts"))).toContain(
      "occlude: this.occludeArgs(center, this.ownZoneOf(0, state)),",
    );
  });
});

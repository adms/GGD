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
import { DEFAULT_VISION_RULES, type VisionRules } from "@ggd/shared/sim/vision";
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

/**
 * ⭐ owner 2026-08-23 把預設換掉了：
 * > 「**理論上這個地圖是全視野，就算牆後也看得到**，不然現在很奇怪，
 * >  看到 bot 瘋狂隔牆打空氣敵人，但我卻看不到也打不到」
 *
 * ⇒ 出貨預設 `vision.fullVision: true` ⇒ **一格都不遮**。
 * ⚠️ 依第〇·六守則「**預設值本身改變 ⇒ 測新的預設**」，下面每一條都改成驗**新的**那一邊。
 * ⛔ 關掉開關的那一條路**不測**（同一條守則：「開關關掉的那一條（舊行為）⛔ 不測」）——
 * 它存在是為了**回頭**，⛔ 不是一個要保證品質的功能。
 *
 * ⭐ 但 GH#421 的**取牆邏輯**仍然要被守著：它是 `fullVision` 關掉之後唯一的行為，
 * 而「拿錯區的牆」那個缺陷會在關掉的那一天原封回來。⇒ 保留**一條**，顯式傳規則。
 */
const OCCLUDING: VisionRules = { ...DEFAULT_VISION_RULES, fullVision: false };

describe("GH#606 全視野是出貨預設 —— 牆後也看得到", () => {
  it.each([0, 1])("⭐ zone %i：出貨規則下**一格都不遮**（owner 2026-08-23）", (z) => {
    const [eye] = acrossWall(innerWall(ARENA.zones[z]!));
    expect(
      occludeArgsFor(ARENA.zones, z, eye, 0),
      `zone ${z} 還在遮 —— 而 owner 要的是全視野`,
    ).toBeUndefined();
  });

  it("⭐ 關掉開關之後 GH#421 的取牆邏輯仍然成立（⛔ 這是 rollback 的那條路）", () => {
    const [eye, foe] = acrossWall(innerWall(ARENA.zones[1]!));
    // 同一區的牆會擋
    expect(occludeArgsFor(ARENA.zones, 1, eye, 0, OCCLUDING)!.blocked(foe.x, foe.z)).toBe(true);
    // ⛔ 拿錯區的牆＝什麼都擋不住（zone 1 半場遮蔽整個消失的原因）
    expect(occludeArgsFor(ARENA.zones, 0, eye, 0, OCCLUDING)!.blocked(foe.x, foe.z)).toBe(false);
    // ⛔ 同一區、中間沒牆的不會被遮 —— 證明上面不是「一律遮」
    expect(occludeArgsFor(ARENA.zones, 1, eye, 0, OCCLUDING)!.blocked(eye.x + 0.5, eye.z)).toBe(false);
  });

  it("⭐ 出貨的 GameApp 真的把『這雙眼睛在哪一區』餵進去", () => {
    // GameApp headless 起不來 ⇒ 接線沿用既有做法（`GameApp.zoneCull.test.ts`）：
    // 註解先剝掉，散文滿足不了。真正的行為覆蓋在上面三條。
    expect(stripComments(read("../GameApp.ts"))).toContain(
      "occlude: this.occludeArgs(center, this.ownZoneOf(0, state), state.tick),",
    );
  });
});


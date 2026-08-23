/**
 * 🎯 **GH#622 —— 登場等級 > 1 就要一起發技能點。**
 *
 * > owner 2026-08-23：「幫我調整後台系統倍率：**英雄登場初始等級設定為6**,
 * >  生命+1200, 初始魔抗+20%, 生命倍率x12」
 *
 * ⚠️ `spawnChampion` 的 `unspentPoints: 0` 在此之前**碰巧是對的**（出生等級一直是 1，
 * 而 LV1 的那一點就是 `Q: rank 1` 那一格，⛔ 不走 `unspentPoints`）。
 * 登場等級變成 6 之後它變成謊話：英雄**帶著 LV6 的血量與屬性登場，卻只有 Q 一點可用**。
 *
 * ⭐ 判準是**與正常升級一致**：從 LV1 打到 LV6 會拿到 5 點，那麼 LV6 登場就該有 5 點。
 * ⛔ 這裡不抄 `5` —— 它從 `grantXp` 那條唯一的規則推導。
 */
import { beforeAll, describe, expect, it } from "vitest";

import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { registerSkeletonContent } from "./content/skeleton";
import { grantXp, xpToNext } from "./economy/progression";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";

beforeAll(() => registerSkeletonContent());

function spawnAt(level: number): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const id = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: 0, z: 0 },
    zone: 0,
    level,
  });
  return { world, id };
}

describe("GH#622 登場等級的技能點", () => {
  it("★ LV6 登場 = 從 LV1 打上去拿到的點數（⛔ 不是 0）", () => {
    // 參照組：真的從 1 級升到 6 級，看引擎發了幾點。
    const ref = spawnAt(1);
    let lv = 1;
    while (lv < 6) {
      grantXp(ref.world, ref.id, xpToNext(lv));
      lv += 1;
    }
    const earned = ref.world.abilities.get(ref.id)!.unspentPoints;
    expect(ref.world.champion.get(ref.id)!.level, "參照組沒有升到 6").toBe(6);
    expect(earned, "升級路徑一點都沒發 —— 參照組壞了").toBeGreaterThan(0);

    // 出貨路徑：直接 LV6 登場。
    const at6 = spawnAt(6);
    expect(
      at6.world.abilities.get(at6.id)!.unspentPoints,
      "LV6 登場的技能點與「打上去」不一致 —— 玩家帶著 LV6 的血量卻只有 Q 一點",
    ).toBe(earned);
  });

  it("LV1 登場仍然是 0 點（⛔ 不可以憑空多送）", () => {
    const one = spawnAt(1);
    expect(one.world.abilities.get(one.id)!.unspentPoints).toBe(0);
    // LV1 的那一點在別的地方：Q 出生就是 rank 1。
    expect(one.world.abilities.get(one.id)!.slots.Q.rank).toBe(1);
  });
});

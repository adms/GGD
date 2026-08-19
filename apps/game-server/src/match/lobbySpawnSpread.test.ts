/**
 * ⭐【座位 → 出生點的**對應**，與場地的出生點幾何，必須對得起來】—— GH#422 / GH#364。
 *
 * ⛔ 既有的 `arenaSpawnLegality.test.ts` 抓不到，而且它會一直是綠的：它問的是
 * **一個名詞**（每一個出生點合不合法），而壞掉的東西不在那些點上，在
 * 「**誰站哪一個點**」——`zone = 0 · side = teamId % 2 · slot = seatId % 3`
 * 把 12 個座位折到 **6 個點**上，六對身體逐位元同格。分別檢查每一半永遠是綠的
 * （「配對式後置條件」）。
 *
 * ⛔ 斷言讀 **`world.transform` 上真的被寫進去的座標**，⛔ 不是在測試裡照著公式
 * 再算一次（失敗形態⑤：被測的不是出貨的那個）。
 * ⚠️ 量在**剛生出來的那一 tick** —— 碰撞閃避會把疊在一起的身體慢慢推開，晚幾十
 * tick 量就會把缺陷蓋掉。
 * ⚠️ 下限 **2 × 身體半徑**（兩具身體剛好不相交）從 `CHAMPION_BODY_RADIUS` 推導，
 * ⛔ 不抄字面值。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { SEAT_COUNT, TEAM_SIZE } from "@ggd/shared/constants";
import { zArenaDoc } from "@ggd/shared/content";
import { CHAMPION_BODY_RADIUS } from "@ggd/shared/content/displacementTiers";
import { arenaDefFromDoc, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import { MatchController, type SeatSpec } from "./MatchController";

const ARENAS = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/arenas");
/** 短相位：只是要走到「十二個座位都生出來了」，⛔ 不是在測節奏。 */
const CFG = { champSelectTicks: 2, intermissionTicks: 4, combatMaxTicks: 30, resolutionTicks: 2 };

/** ⛔ 不是一份手打清單 —— 新場地上線會自動被納入，這才是這條守衛的價值。 */
function shippedArenas(): ArenaDef[] {
  return readdirSync(ARENAS)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => arenaDefFromDoc(zArenaDoc.parse(JSON.parse(readFileSync(join(ARENAS, f), "utf8")))));
}

/** 一場滿座（12 人 4 隊）跑到「全員已生成」的那一 tick，回傳真的被寫進去的座標。 */
function spawnedPositions(arena: ArenaDef): { seatId: number; x: number; z: number }[] {
  const specs: SeatSpec[] = Array.from({ length: SEAT_COUNT }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / TEAM_SIZE),
    isBot: true,
  }));
  const ctl = new MatchController(`gh422-${arena.id}`, 7, specs, CFG, undefined, undefined, arena);
  let guard = 0;
  const allIn = (): boolean => [...ctl.seats.values()].every((s) => s.entityId !== null);
  while (!allIn() && guard++ < 500) ctl.tick();
  expect(guard).toBeLessThan(500);
  return [...ctl.seats.values()].map((s) => {
    const t = ctl.world.transform.get(s.entityId!)!;
    return { seatId: s.seatId as number, x: t.pos.x, z: t.pos.z };
  });
}

describe("出生擺位 × 場地幾何的對帳 (GH#422 · GH#364)", () => {
  it("⭐ 每一張出貨場地：十二個座位落在十二個**不重疊**的位置", () => {
    cover("match-lobby-spawn-spread");
    const arenas = shippedArenas();
    expect(arenas.length).toBeGreaterThan(0); // 讀不到內容就不算綠
    const minGap = 2 * CHAMPION_BODY_RADIUS; // 兩具身體剛好不相交
    const bad: string[] = [];
    for (const arena of arenas) {
      const at = spawnedPositions(arena);
      for (let i = 0; i < at.length; i++) {
        for (let j = i + 1; j < at.length; j++) {
          const d = Math.hypot(at[i]!.x - at[j]!.x, at[i]!.z - at[j]!.z);
          if (d < minGap - 1e-6) {
            bad.push(
              `${arena.id} seat ${at[i]!.seatId} 與 seat ${at[j]!.seatId} 只差 ${d.toFixed(2)}` +
                `（要求 ${minGap.toFixed(2)}）@(${at[i]!.x},${at[i]!.z})`,
            );
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * ⭐ 飛行單位：**伺服器與客戶端預測走的是同一條路** (owner 2026-08-23)。
 *
 *     「特別是飛行單位（翔封界、有翼劍士等）飛行路徑是可以飛過牆，
 *       **後端計算與前端預測方法不同**」
 *
 * ── 這條守衛在守什麼 ────────────────────────────────────────────────────────
 * 兩邊本來就 import 同一支 `movementSystem`，所以「同一支函式」不是問題 ——
 * **餵給它的狀態**才是。影子從來沒跑過 `flightSystem`，`stats.sources` 又是空的，
 * 所以 `world.flight` 恆空 ⇒ 影子撞牆停住、伺服器飛過去 ⇒ 每個快照拉一次。
 *
 * ⭐ 所以斷言是**逐 tick 比對兩邊的位置序列**（第二守則失敗形態⑤的變形：
 * 「預測的不是模擬的那個」），⛔ 不是「影子有沒有 flight 元件」這種屬性。
 * 而且先釘一條前提：這具身體**真的穿過了那堵牆** —— 否則兩邊一起卡住也會「相等」。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions, Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ArenaDef, ZoneDef } from "@ggd/shared/sim/world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type SeatId } from "@ggd/shared/ids";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import type { IntentFrame, Order } from "@ggd/shared/sim/intents";
import { LocalPrediction } from "./LocalPrediction";

const FLYER = "test-flyer" as ChampionId;
const FLYER_INNATE = "test-flyer.passive" as AbilityId;
const START = { x: -10, z: 0 };
const GOAL = { x: 10, z: 0 };

/** 一堵橫在正中間、上下都沒有缺口的牆 —— 地面單位絕對過不去。 */
const ZONE: ZoneDef = {
  id: "flight-parity",
  center: { x: 0, z: 0 },
  boundaryRadius: 26,
  obstacles: [{ kind: "box", center: { x: 0, z: 0 }, halfW: 1, halfD: 25 }],
  spawns: [[START], [GOAL]],
};
const ARENA: ArenaDef = { id: "flight-parity", name: "flight parity", zones: [ZONE] };

beforeAll(() => {
  registerSkeletonContent();
  Abilities.register(FLYER_INNATE, {
    id: FLYER_INNATE,
    name: "翔封界 (fixture)",
    slot: "PASSIVE",
    innateKind: "passive",
    maxRank: 1,
    cooldown: [0],
    manaCost: [0],
    range: 0,
    effects: [],
    passive: {
      ranks: [{ flight: { hoverHeight: 0.9, ignoreUnits: true, ignoreObstacles: true, stayInsideBoundary: true } }],
    },
  } as unknown as AbilityDef);
  Champions.register(FLYER, {
    ...Champions.get("sela" as ChampionId),
    id: FLYER,
    passiveAbility: FLYER_INNATE,
  } as unknown as ChampionDef);
});

/** 伺服器與影子並排跑 `ticks` tick，回傳兩串位置。⛔ 中途不 reconcile —— 有校正就看不出分歧。 */
function race(ticks = 120): { server: { x: number; z: number }[]; shadow: { x: number; z: number }[] } {
  const sw = new SimWorld(ARENA, 1);
  const seat = asSeatId(0);
  const id = spawnChampion(sw, { championId: FLYER, seatId: seat, teamId: asTeamId(0), pos: START, zone: 0 });
  sw.step(new Map()); // 讓 stat pipeline 與 flightSystem 落定
  const pred = new LocalPrediction(ARENA);
  pred.spawn({
    seatId: 0,
    pos: { ...sw.transform.get(id)!.pos },
    zone: 0,
    moveSpeed: sw.stats.get(id)!.final[Stat.MoveSpeed],
    attackRange: sw.stats.get(id)!.final[Stat.AttackRange],
    championId: FLYER,
  });

  const order: Order = { kind: "move", point: GOAL };
  const server: { x: number; z: number }[] = [];
  const shadow: { x: number; z: number }[] = [];
  for (let t = 0; t < ticks; t++) {
    if (t === 0) pred.recordInput(1, order);
    pred.stepTick();
    const intents = new Map<SeatId, IntentFrame>();
    intents.set(seat, t === 0 ? { order, commands: [] } : { commands: [] });
    sw.step(intents);
    server.push({ ...sw.transform.get(id)!.pos });
    shadow.push({ ...pred.predictedPos! });
  }
  return { server, shadow };
}

describe("飛行單位的前後端一致性", () => {
  it("伺服器與預測影子走出**同一條**路徑（而且真的穿過了那堵牆）", () => {
    const { server, shadow } = race();
    // 前提：這一場真的發生了「飛過牆」。⛔ 少了它，兩邊一起卡在牆前也會全綠。
    expect(server[server.length - 1]!.x, "伺服器沒有讓她飛過去 —— 前提不成立").toBeGreaterThan(2);
    let maxErr = 0;
    for (let i = 0; i < server.length; i++) {
      maxErr = Math.max(maxErr, Math.hypot(server[i]!.x - shadow[i]!.x, server[i]!.z - shadow[i]!.z));
    }
    // 修正前這裡是**整段牆的寬度**：影子停在 x≈-1.6，伺服器一路飛到 x=10。
    expect(maxErr, "影子與權威對飛行的算法不同 —— 這就是那個來回拉扯").toBeLessThan(1e-6);
  });
});

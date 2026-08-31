/**
 * ⭐⭐ GH#650 的 AC①：**跑出貨鏈** —— 真 SimWorld 打一發被擋下的傷害 →
 * 真事件 → 拿到的 payload 就是客戶端那個 `case` 讀得懂的那一組。
 *
 * ── ⛔ 為什麼既有的 `blockVfxAxis.test.ts` 不夠 ────────────────────────────
 * 它的第 ② ③ 條是 `readFileSync(...)` ＋ `toContain("emitBlockVfx")`
 * —— ⭐ **失敗形態⑥：掃原始碼字串代替行為**。
 * 那條測試在「`emitBlockVfx` 被呼叫了但 `world.emit` 被改成別的事件名」、
 * 「payload 欄位改名」、「`blockLastFired` 那一行搬家但擋不中」三種情況下
 * ⛔ **全部是綠的**，而玩家一個像素都看不到。
 *
 * ⭐ 而票的 AC① 逐字要的是「走出貨鏈的守衛…⛔ 不是『事件有送』」。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `emitBlockVfx` 的 `if (b.vfxId === undefined) return;` 改成 `return;`
 *       → 「真的擋中時發得出 blockVfx」紅
 *   · payload 的 `target` 改名成 `unit` → 「欄位名與客戶端讀的是同一組」紅
 *   · `world.emit("blockVfx", …)` 改成 `world.emit("blockFx", …)` → 第一條紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { Abilities, registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type SeatId } from "../../ids";
import type { AbilityDef } from "../content/defs";
import type { IntentFrame } from "../intents";

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;

const VFX_ID = "fx.fixture.atfield";
const INNATE_ID = "fixture-blockvfx.passive" as AbilityId;
const BLOCKER = "fixture-blockvfx" as ChampionId;

/** 一支**帶著特效軸**的格擋天生技 —— 20-00 銀色甲胄的形狀 ＋ #650 的三格。 */
const INNATE: AbilityDef = {
  id: INNATE_ID,
  name: "fixture AT 力場",
  slot: "PASSIVE",
  innateKind: "passive",
  castType: "self",
  maxRank: 1,
  cooldown: [0],
  manaCost: [0],
  range: 0,
  effects: [],
  passive: {
    ranks: [
      {
        block: {
          damageTypes: ["magic"],
          chance: 1,
          fraction: 1,
          vfxId: VFX_ID,
          vfxScale: 1.6,
          vfxTint: [255, 140, 40],
        },
      },
    ],
  },
} as never;

beforeAll(() => {
  registerSkeletonContent();
  Abilities.register(INNATE_ID, INNATE);
  registerChampion({ ...THORNE, id: BLOCKER, passiveAbility: INNATE_ID });
});

function runOneBlockedHit(): { events: { type: string; data: Record<string, unknown> }[]; lost: number } {
  const world = new SimWorld(SKELETON_ARENA, 20260831);
  const blocker = spawnChampion(world, {
    championId: BLOCKER,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z + 10 },
    zone: 0,
  });
  const attacker = spawnChampion(world, {
    championId: BLOCKER,
    seatId: asSeatId(1),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x + 3, z: Z0.center.z + 10 },
    zone: 0,
  });
  world.rebuildGrid();
  const before = world.health.get(blocker)!.hp;
  world.damageQueue.push({
    source: attacker,
    target: blocker,
    amount: 300,
    type: "magic",
    crit: false,
    origin: "ability:test.block-vfx",
  });
  world.step(NO_INTENTS);
  // ⭐ `world.events` 是出貨的那一份（`SimWorld.ts:593`）——
  //   ⛔ 不是我造的通道（失敗形態⑤）。⚠️ step() 之後才讀，⛔ 不是之前。
  const events = world.events as never as { type: string; data: Record<string, unknown> }[];
  return { events, lost: before - world.health.get(blocker)!.hp };
}

describe("GH#650 AC① —— 走出貨鏈：真的擋中 ⇒ 真的發 blockVfx", () => {
  it("量尺先自證：這一發**真的被擋掉了**（⛔ 沒擋掉的話下面驗什麼都沒意義）", () => {
    const { lost } = runOneBlockedHit();
    expect(lost, "⛔ 血掉了 ⇒ 夾具沒有擋中，這條測試會變成永遠綠的").toBe(0);
  });

  it("★ ⭐ 真的擋中時**發得出 `blockVfx`**（⛔ 掃字串看不出它有沒有真的發）", () => {
    const { events } = runOneBlockedHit();
    const hit = events.filter((e) => e.type === "blockVfx");
    expect(
      hit.length,
      `⛔ 一則都沒有 —— 出貨的 emit 站沒發。看到的事件：${[...new Set(events.map((e) => e.type))].join(", ")}`,
    ).toBe(1);
  });

  it("⭐ payload 的欄位名與**客戶端那個 case 讀的**是同一組（形態⑧的解藥）", () => {
    const d = runOneBlockedHit().events.find((e) => e.type === "blockVfx")!.data;
    // ⭐ `VfxSystem.ts` 的 `case "blockVfx"` 逐字讀這五個名字；少一個那個 case
    //   的第一行就 `break` ⇒ 靜靜地什麼都不做。
    for (const k of ["target", "vfxId", "scale", "tint", "x", "z"]) {
      expect(d, `⛔ payload 沒有 \`${k}\` —— 客戶端那個 case 會 break`).toHaveProperty(k);
    }
    expect(d.vfxId, "⛔ 送的不是那一格 grant 宣告的特效").toBe(VFX_ID);
    expect(d.scale).toBe(1.6);
    expect(d.tint).toEqual([255, 140, 40]);
  });
});

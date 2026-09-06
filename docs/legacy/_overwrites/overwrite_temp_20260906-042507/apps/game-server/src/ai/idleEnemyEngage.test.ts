/**
 * GH#999 —— 「bot 會不會去打**站著不動的人**」。⭐ 這是 bot 行為，⛔ 不是自動攻擊。
 *
 * ── 這條為什麼住在這裡，而不是 `match/autoAcquireWhileMoving.test.ts` ──────────
 * 那個檔的 IDLE 控制組曾經斷言 `hits > 0`（「a seat that never touches anything still
 * fights」），而它對一個站在出生點、什麼都不按的 Saber **恆為 0** —— ⛔ 而 0 的理由
 * 全部是**別人的**行為（2026-09-06 用真的 `MatchController` 量了 7 顆種子）：
 *
 *   | 種子 | 它的隊伍 | hits | 被 bot 列為目標的 tick |
 *   |---|---|---:|---:|
 *   | 1 · 2 · 3 · 4 · 6 | **輸**（隊友全滅） | 12 · 8 · 7 · 7 · 1 | 1533–3599 |
 *   | 5 · 7919 | **贏** | **0** | **0** |
 *
 * ⇒ ⭐ **hits > 0 ⟺ 它的隊友全死了**。bot 的比較器是 kind → forced → threat → **hp** → 距離
 *   （`sim/targeting.ts::beats`），一個滿血、不出手的單位在任何一個受傷的敵人還活著時
 *   **永遠排最後**；等到它是唯一的敵人，bot 才靠 `AI_ENGAGE_RANGE = 48` 的全場掃描走過來。
 * ⇒ 那是 bot 側的兩個性質：(a) ENGAGE fallback 會不會**走過去**、(b) 站著的人排在**第幾個**。
 *   兩個都由 `Tier0Brain` 決定 ⇒ 搬到這裡，用 **bot 側的量**（腦真的送出去的 intent frame，
 *   同 `bossAggro.test.ts` 的理由），⛔ 不用受害者的 `hits` 當閘。
 *
 * ── 場景是手搭的 ────────────────────────────────────────────────────────────
 * 同 `kiting.test.ts`：`SKELETON_ARENA` zone 0、z = −14 的空走道、`probe` 英雄。
 * 「站著不動的人在 bot 的引戰半徑內、索敵半徑外」是**由構造保證**的（距離 20 u：
 * 近戰索敵地板 6 < 20 < 48），⛔ 不是等一場真比賽裡 11 個 bot 剛好走過來。
 * 站著的人 `MoveSpeed` 是 epsilon（0 會 falsy 退回預設 6），而且**沒有 driver** ——
 * 它一條指令都送不出去，任何一發它打出去的攻擊都只能來自 sim 自己的索敵。
 *
 * 突變（2026-09-06 驗過）：`Tier0Brain.ts` 的 `close ?? acquireTarget(…, AI_ENGAGE_RANGE)`
 * 改成 `close`（引戰 fallback 拿掉）⇒ 兩條都紅（bot 一次都沒點名、一發都沒打到）。
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import {
  asSeatId,
  asTeamId,
  type SeatId,
  type ChampionId,
  type AbilityId,
  type EntityId,
} from "@ggd/shared/ids";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import { zeroAttrBonus } from "@ggd/shared/sim/stats/attributes";
import type { AbilitiesComp } from "@ggd/shared/sim/stats/statsComp";
import type { IntentFrame } from "@ggd/shared/sim/intents";
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import { MELEE_ACQUIRE_FLOOR } from "@ggd/shared/sim/targeting";
import * as V from "@ggd/shared/sim/math/vec2";
import { AIDriver } from "./Tier0Brain";
import { Seat } from "../seat/Seat";

const MELEE_RANGE = 1.6;
/** `Stat.MoveSpeed` 讀到 0 會 falsy-fallback 成預設 6，所以「不動」用 epsilon。 */
const IMMOBILE = 1e-9;

function spawnFighter(
  world: SimWorld,
  seat: number,
  team: number,
  pos: V.Vec2,
  opts: { hp?: number; moveSpeed?: number } = {},
): EntityId {
  const id = world.spawn();
  world.transform.set(id, { pos: { ...pos }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  const hp = opts.hp ?? 5000;
  world.health.set(id, { hp, maxHp: 5000, mana: 100, maxMana: 100, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  world.champion.set(id, {
    championId: "probe" as ChampionId,
    level: 1,
    xp: 0,
    gold: 0,
    items: new Array(INVENTORY_SLOTS).fill(null),
    augments: [],
    statStacks: 0,
    attrBonus: zeroAttrBonus(),
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  });
  const final = zeroStats();
  final[Stat.MoveSpeed] = opts.moveSpeed ?? 5.8;
  final[Stat.AttackRange] = MELEE_RANGE;
  final[Stat.AttackSpeed] = 0.5;
  final[Stat.AttackDamage] = 5;
  world.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  world.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  return id;
}

interface Scene {
  /** ticks on which the brain's OWN intent frame named this unit as `attackTarget` */
  targetedFrames: Map<EntityId, number>;
  /** first such tick */
  firstTargeted: Map<EntityId, number>;
  /** basic-attack damage the bot landed on this unit */
  hitsOn: Map<EntityId, number>;
  /** basic-attack damage the driverless units landed on the bot */
  hitsBack: number;
}

/**
 * One melee Tier-0 bot at (−47,−14) versus driverless, immobile enemies. Only the
 * bot has a seat, so the only intents in the world are the ones its brain emits.
 */
function runScene(enemies: { pos: V.Vec2; hp?: number }[], ticks: number): Scene & { ids: EntityId[] } {
  const world = new SimWorld(SKELETON_ARENA, 999);
  world.economyOpen = false;
  const bot = spawnFighter(world, 0, 0, { x: -47, z: -14 });
  const ids = enemies.map((e, i) =>
    spawnFighter(world, 1 + i, 1, e.pos, { hp: e.hp, moveSpeed: IMMOBILE }),
  );
  const seat = new Seat(asSeatId(0), asTeamId(0), new AIDriver());
  seat.entityId = bot;
  const s: Scene = { targetedFrames: new Map(), firstTargeted: new Map(), hitsOn: new Map(), hitsBack: 0 };
  for (let k = 0; k < ticks; k++) {
    const frame = seat.produceIntent(world, world.tick);
    const o = frame.order;
    if (o?.kind === "attackTarget" && o.entity !== undefined) {
      s.targetedFrames.set(o.entity, (s.targetedFrames.get(o.entity) ?? 0) + 1);
      if (!s.firstTargeted.has(o.entity)) s.firstTargeted.set(o.entity, world.tick);
    }
    world.step(new Map<SeatId, IntentFrame>([[seat.seatId, frame]]));
    for (const e of world.events) {
      if (e.type !== "damage") continue;
      const d = e.data as { source?: EntityId; target?: EntityId; origin?: string };
      if (d.origin !== "basic") continue;
      if (d.source === bot && d.target !== undefined) s.hitsOn.set(d.target, (s.hitsOn.get(d.target) ?? 0) + 1);
      else if (d.target === bot) s.hitsBack++;
    }
  }
  return { ...s, ids };
}

describe("GH#999 — a bot goes and hits a standing-still enemy (Tier-0 ENGAGE fallback)", () => {
  it("outside the acquire radius but inside the engage range: the brain names it, walks over, connects — and the idle unit answers", () => {
    // 20 u down a clear lane: past the melee acquire floor, well inside AI_ENGAGE_RANGE.
    const IDLE_POS = { x: -27, z: -14 };
    expect(V.dist({ x: -47, z: -14 }, IDLE_POS)).toBeGreaterThan(MELEE_ACQUIRE_FLOOR);
    const r = runScene([{ pos: IDLE_POS }], 450);
    const idle = r.ids[0]!;
    // bot 側的量：腦送出去的 intent 真的點名了它（⛔ 不是受害者的 hits 當閘）
    expect(r.targetedFrames.get(idle) ?? 0, "the brain never named the idle enemy").toBeGreaterThan(0);
    // 後果 ①：它走過去並且打到了（走 20 u 的是 bot，站著的人動不了）
    expect(r.hitsOn.get(idle) ?? 0, "the bot named it but never connected — it did not walk over").toBeGreaterThan(0);
    // 後果 ②：站著不動、沒有 driver 的人**打回去**了 —— 這正是舊控制組想說的那句話
    //   （「a seat that never touches anything still fights」），⭐ 現在由構造保證，
    //   ⛔ 不靠一場真比賽裡它的隊友剛好全死。
    expect(r.hitsBack, "the idle unit never swung back — sim auto-acquire on a driverless unit is dead").toBeGreaterThan(0);
  });

  it("a full-HP idle enemy is LAST in line: a damaged one is served first, the idle one only once it is alone", () => {
    // Why the old IDLE control read 0 while its teammates lived: `beats` ranks hp before
    // distance. The damaged enemy is FARTHER (20 u) than the idle one (8.2 u); the brain
    // must still pick the damaged one first, kill it (20 hp = 4 swings), then turn to the idle one.
    const r = runScene([{ pos: { x: -27, z: -14 }, hp: 20 }, { pos: { x: -45, z: -22 } }], 900);
    const [damaged, idle] = r.ids as [EntityId, EntityId];
    expect(r.firstTargeted.get(damaged), "the damaged enemy was never named").toBeDefined();
    expect(r.firstTargeted.get(idle), "the idle enemy was never named — the bot never turned to it").toBeDefined();
    expect(r.firstTargeted.get(damaged)!).toBeLessThan(r.firstTargeted.get(idle)!);
    // …and it was the KILL that freed the bot, not a mid-approach swap
    expect(r.hitsOn.get(damaged) ?? 0).toBeGreaterThanOrEqual(4);
    expect(r.hitsOn.get(idle) ?? 0, "the bot never reached the idle enemy after the kill").toBeGreaterThan(0);
  });
});

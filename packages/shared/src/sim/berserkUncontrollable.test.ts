/**
 * ⭐ GH#574 —— 暴走「**真的不能控制**」，用跑的驗。
 *
 * owner 2026-08-23（逐字）：
 * > 「初號機 **天生技暴走門檻 5->10%** 請你**測試確定真的會暴走 不能控制**
 * >  並且身上要有**明顯冒煙特效**」
 *
 * ⚠️ 這一支刻意**不驗旗標**。`isBerserk()` 回 true 是 `berserkOwnerSpec.test.ts`
 * 已經在驗的事，而「旗標被設了」與「玩家真的失去方向盤」是兩件事：
 * `OrderSystem` 那一行 `if (berserkDropsOrders(...)) break;` 被拿掉之後，
 * 旗標照樣是 true、狀態列照樣顯示【暴走】、屬性照樣到位 —— 而玩家照樣開得動車。
 * 那是七種失敗形態⑦（掃屬性代替掃行為）逐字的樣子。
 *
 * ⇒ 下面讀的是**意圖被採納之後**的結果（`nav.order` / `nav.moveTarget`），
 * 也就是這一 tick 的方向盤到底在誰手上。
 *
 * 突變紀錄（這一批唯一的第二條，因為它守的是另一個機制）：
 *   · `systems/OrderSystem.ts` 把 `berserkDropsOrders(world, id) ||` 那一項拿掉
 *     → 第一條紅（玩家的 move 指令被採納了）。
 */
import { describe, expect, it, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { registerAll } from "../content/registries";
import { Arenas, Configs, Models, StatusEffects, VfxDefs } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { isBerserk } from "./berserk";
import { statCapsFromDoc } from "./statCaps";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
const EVA = "godie-e00r" as ChampionId;
/** 玩家點的那個地方 —— 離出生點夠遠，走得到就看得出來。 */
const WAYPOINT = { x: Z0.center.x + 6, z: Z0.center.z + 6 };

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(result.store);
});

/**
 * 一台初號機 + **一個敵人**，敵人站在 WAYPOINT 的**反方向**。
 *
 * ⚠️ 敵人不是排場。`berserkSeek` 只做「清除」（`nav.order = null`），真正決定
 * 身體往哪走的是 `autoAcquirePass` 的追擊迴圈 —— 場上一個敵人都沒有的時候，
 * 那個迴圈沒有東西可以覆蓋 `nav.moveTarget`，於是暴走前玩家點的那個路點會
 * **原地留著**，身體把它走完。⭐ 這一點實測到了（見報告），而它也正是為什麼
 * 這條守衛不可以只斷言 `nav.order === null`：那一格是空的，身體卻還在走。
 */
function arena(): { world: SimWorld; id: EntityId; seat: SeatId } {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  world.combatActive = true;
  world.statCaps = statCapsFromDoc(Configs.tryGet("stat-caps"));
  const seat = asSeatId(0);
  const id = spawnChampion(world, {
    championId: EVA,
    seatId: seat,
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  spawnChampion(world, {
    championId: EVA,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: Z0.center.x - 2.5, z: Z0.center.z - 2.5 },
    zone: 0,
  });
  return { world, id, seat };
}

/** 這一 tick 這個座位送出一條「走去 WAYPOINT」的指令。 */
function drive(world: SimWorld, seat: SeatId, ticks: number): void {
  const frame: IntentFrame = { order: { kind: "move", point: WAYPOINT }, commands: [] };
  for (let i = 0; i < ticks; i++) world.step(new Map<SeatId, IntentFrame>([[seat, frame]]));
}

/** 血打到 `pct` 再挨一發真傷，讓 `onDamageTaken` 真的發射。 */
function hurtTo(world: SimWorld, id: EntityId, pct: number): void {
  const hp = world.health.get(id)!;
  hp.hp = hp.maxHp * pct;
  world.damageQueue.push({
    source: id,
    target: id,
    amount: 0.0001,
    type: "true",
    crit: false,
    origin: "test",
  });
  for (let i = 0; i < 2; i++) world.step(new Map<SeatId, IntentFrame>());
}

/** 出貨文件上的門檻（⛔ 不抄字面值 —— owner 改成 10% 或別的值，這裡自己跟著走）。 */
function shippedHpPct(): number {
  const def = Abilities.get(Champions.get(EVA).passiveAbility! as unknown as string as never);
  const cond = def.passive?.ranks[0]?.hooks?.[0]?.condition as { value?: number } | undefined;
  expect(cond?.value, "59-00 的門檻條件不見了").toBeGreaterThan(0);
  return cond!.value!;
}

describe("59-00 暴走：真的拿走方向盤 (GH#574)", () => {
  it("暴走中，玩家送出的移動指令**真的被丟掉**（不是只有旗標亮著）", () => {
    const { world, id, seat } = arena();

    // ── 對照組：沒暴走的時候，同一條指令是**收得到**的 ──────────────────
    drive(world, seat, 1);
    const nav = world.nav.get(id)!;
    expect(nav.order?.kind, "平常玩家的 move 指令就進不來 —— 這條對照組自己壞了").toBe("move");
    expect(nav.moveTarget, "平常的 move 指令沒有變成移動目標").not.toBeNull();

    // ── 實驗組：血掉到門檻以下 → 暴走 → 同一條指令 ───────────────────────
    hurtTo(world, id, shippedHpPct() - 0.005);
    expect(isBerserk(world, id), "血掉到門檻以下卻沒有暴走").toBe(true);

    const before = { ...world.transform.get(id)!.pos };
    drive(world, seat, 30);

    // ⭐ 承重的三條：方向盤不在玩家手上、身體沒有去他點的地方、而且它自己找到人打。
    const nav2 = world.nav.get(id)!;
    expect(
      nav2.order,
      "暴走中玩家的 order 還是被採納了 —— 方向盤沒有被拿走（OrderSystem 的 berserkDropsOrders 那一項還在嗎？）",
    ).toBeNull();
    // ⚠️ 這一條讀的是**座標**，⛔ 不是旗標。GH#574 實測：`order` 是 null、
    //    `attackTarget` 是 null，而身體照樣把暴走**前**那個路點走完 ——
    //    因為它已經住進 `nav.moveTarget`（修法：`berserkSeek` 也清掉它）。
    const now = world.transform.get(id)!.pos;
    const closer =
      Math.hypot(now.x - WAYPOINT.x, now.z - WAYPOINT.z) <
      Math.hypot(before.x - WAYPOINT.x, before.z - WAYPOINT.z) - 0.5;
    expect(closer, "暴走中身體仍然朝玩家點的地方走 —— 它在聽指揮").toBe(false);
    // 「不可控制**並自動尋敵**」的後半：目標是**系統挑的**（auto），⛔ 不是玩家點的。
    expect(nav2.attackTarget, "暴走沒有自己找到敵人 —— 它只是被拔掉方向盤而已").not.toBeNull();
    expect(nav2.attackTargetAuto, "目標不是自動索敵挑的").toBe(true);

    // ⚠️ ⛔ 這裡**不**斷言「它一動也不動」：暴走是「拿走方向盤」，⛔ 不是 root
    //    （sim/berserk.ts 決策 1）。一台被釘在原地的初號機是站著被打死。
  });

  it("暴走**期間**身上一直冒煙，而且煙跟著身體走", () => {
    // ⭐ 冒煙的機制：`delayed` 排一串班表，每一發跑 `spawnVfx at:"self"` ——
    //    而 `"self"` 是**到期當下**才去讀施法者座標，⇒ 煙跟著身體。
    //    ⛔ 這裡驗的是「事件真的一發一發送出來」，不是「文件上有那一格」。
    // ⚠️ `world.events` 在每一次 `step()` 的第一行就被清空，所以逐 tick 收。
    const { world, id } = arena();
    let puffs = 0;
    hurtTo(world, id, shippedHpPct() - 0.005);
    for (let i = 0; i < 90; i++) {
      world.step(new Map<SeatId, IntentFrame>());
      puffs += world.events.filter((e) => e.type === "vfxSpawn").length;
    }
    expect(puffs, "暴走了 3 秒卻一縷煙都沒有 —— 冒煙那一串 delayed 沒有跑").toBeGreaterThan(1);
  });
});

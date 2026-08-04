/**
 * 殭屍吃得到狀態嗎 —— owner 2026-08-04「建 StatsComp 吧」的**第一段**（A3a）。
 *
 * ---------------------------------------------------------------------------
 * 這條守衛在守什麼
 * ---------------------------------------------------------------------------
 * `effects/applyStatus.ts` 的第一句是
 *
 *     const st = world.status.get(target);
 *     if (!st) continue;                      // ← 沒有 StatusComp 就靜默跳過
 *
 * 在 2026-08-04 之前 `sim/mobs.ts` 從不建 StatusComp，所以【暈眩】【定身】
 * 【減速】【詛咒】【暴走】打在殭屍身上是**靜默無效** —— 沒有錯誤、沒有 log、
 * 畫面上跟「有效但抗性很高」長得一模一樣。那是 CLAUDE.md 的失敗形態 ②，
 * 而且第 3 場之後場上大多數敵人就是殭屍，等於半個遊戲裡那五根軸不存在。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 為什麼斷言的是「位移」不是「身上有沒有那筆 status」
 * ---------------------------------------------------------------------------
 * CLAUDE.md 失敗形態 ⑦：掃屬性不等於掃行為。
 * 「`world.status.get(mob).effects.length === 1`」只證明**掛上去了**，
 * 不證明**有人讀**。這條測試跑真的 `movementSystem`，量的是身體有沒有移動 ——
 * 那才是玩家看得到的東西。
 *
 * ⚠️ 而且它**必須走 `applyStatus`**（真的效果路徑），不可以手寫
 * `st.effects.push(...)` —— 那樣就是 CLAUDE.md 失敗形態 ⑤（被測的不是出貨的
 * 那一個）：手寫的版本繞過了正在被守的那道 `if (!st) continue`。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄（實跑）
 * ---------------------------------------------------------------------------
 * M1 刪掉 `mobs.ts` 的 `world.status.set(id, { effects: [] })` 那一行
 *    → 本檔 2 紅（暈眩那條 + 減速那條）。這正是這一行存在的全部理由。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 範圍：這一段**不含屬性**
 * ---------------------------------------------------------------------------
 * StatsComp 是 A3b/A3c，而且不是一行 —— `stats/statPipeline.recomputeStats`
 * 的第一句 `if (!sc || (!champ && !sm)) return;` 會直接跳過殭屍。所以
 * 【破甲】【易傷】【虛弱】【凋零】今天對殭屍**仍然無效**，那是明示的取捨。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../ids";
import { spawnMob, type MobRules } from "./mobs";
import { runEffects } from "./effects/effectRunner";
import { movementSystem } from "./systems/MovementSystem";

const TAG = "mob-statuscomp";

beforeAll(() => registerSkeletonContent());

/**
 * 一份最小的殭屍波設定。`boss: null` + `special: null` 讓 `spawnMob`
 * **一顆 rng 都不抽** —— 這條測試的唯一變數才真的只剩「有沒有在走」。
 */
const RULES: MobRules = {
  fromRound: 3,
  firstWaveTicks: 1,
  waveIntervalTicks: 100000,
  mobsPerWaveCap: 1,
  maxAlivePerZone: 8,
  level: 3,
  maxHp: 400,
  moveSpeed: 5,
  hpRegenPerSec: 0,
  modelKey: "mob-test",
  sizeMult: 1,
  tintStrength: 0,
  attackDamage: 20,
  attackRangeSq: 1.8 * 1.8,
  attackCdTicks: 3,
  radius: 0.6,
  rewardGold: 1,
  rewardXp: 1,
  killsPerLevel: 0,
  boss: null,
  special: null,
};

/** 一隻站在區域中央的殭屍 + 一位當施法者的英雄。 */
function siege(): { world: SimWorld; mob: EntityId; hero: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 11);
  world.combatActive = true;
  world.mobRules = RULES;
  const c = SKELETON_ARENA.zones[0]!.center;
  const hero = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - 6, z: c.z },
    zone: 0,
  });
  const mob = spawnMob(world, 0, RULES, 1, 0);
  return { world, mob, hero };
}

/** 讓殭屍有個地方要去，然後跑 N tick 的真 movementSystem，回傳走了多遠。 */
function walkDistance(world: SimWorld, mob: EntityId, ticks: number): number {
  const t = world.transform.get(mob)!;
  const from = { x: t.pos.x, z: t.pos.z };
  const nav = world.nav.get(mob)!;
  nav.moveTarget = { x: from.x + 40, z: from.z };
  for (let i = 0; i < ticks; i++) {
    movementSystem(world);
    world.tick += 1;
  }
  const dx = t.pos.x - from.x;
  const dz = t.pos.z - from.z;
  return Math.sqrt(dx * dx + dz * dz);
}

describe("殭屍的狀態欄 (mob-statuscomp)", () => {
  it("★ 對殭屍施【暈眩】之後，牠必須真的走不動", () => {
    cover(TAG);
    // 對照組：沒有暈眩的同一隻殭屍會走一段路 —— 沒有這一半，
    // 「走了 0」也可能是因為牠本來就不會動（斷言方向與缺陷無關，失敗形態 ④）。
    const free = siege();
    const moved = walkDistance(free.world, free.mob, 20);
    expect(moved, "對照組沒動 —— 這條測試對任何實作都會過，先修測試").toBeGreaterThan(0.5);

    const { world, mob, hero } = siege();
    runEffects([{ kind: "applyStatus", statusId: "stun-test" as StatusId, duration: 5, stun: true }], {
      world,
      caster: hero,
      rank: 1,
      targets: [mob],
      origin: "ability:test",
      rng: world.rng,
    });
    expect(walkDistance(world, mob, 20), "被暈眩的殭屍還在走 —— StatusComp 沒建起來").toBeLessThan(0.001);
  });

  it("★ 對殭屍施【減速】之後，牠必須走得比較慢（而且不是完全停住）", () => {
    cover(TAG);
    const free = siege();
    const fast = walkDistance(free.world, free.mob, 20);

    const { world, mob, hero } = siege();
    runEffects([{ kind: "applyStatus", statusId: "slow-test" as StatusId, duration: 5, moveSpeedMult: 0.4 }], {
      world,
      caster: hero,
      rank: 1,
      targets: [mob],
      origin: "ability:test",
      rng: world.rng,
    });
    const slow = walkDistance(world, mob, 20);
    // ⛔ 斷言的是「嚴格變慢且還在動」，不是「等於 0.4 倍」——
    // 出貨倍率是內容的事，加速度斜坡也會讓比值不等於欄位值（驗機制不驗數字）。
    expect(slow, "減速後完全停住了 —— 那是暈眩不是減速").toBeGreaterThan(0);
    expect(slow, "減速對殭屍沒作用").toBeLessThan(fast);
  });
});

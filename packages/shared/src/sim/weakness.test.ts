/**
 * 【虛弱】的行為守衛（GH#301-4）—— 攻速減半 + **造成的**傷害減半。
 *
 * ⭐ 兩條都用**兩個方向**釘：
 *   ① 傷害：虛弱**攻擊者** → 打出去的變少；虛弱**被打的人** → 一點都沒變。
 *      只驗前者的話，「把倍率誤接成受傷減免」也會全綠 —— 而那個實作在單挑畫面上
 *      跟正確的一模一樣（失敗形態 ④）。
 *   ② 攻速：虛弱的人在同一段時間內揮的次數變少，而對照組真的有在揮。
 *      少了對照組，「一次都沒揮」也會讓「變少」成立。
 *
 * ⛔ 沒有任何一條在讀出貨數值（0.5 不在這一檔裡）。倍率由這一檔自己的
 * `world.weaknessRules` 夾具給，所以 owner 之後把它調成 0.7 也不會讓這一檔紅。
 * 狀態走**出貨的** `applyStatus` 掛上、tag 走**出貨的** `Statuses` 登錄表讀 ——
 * 手寫進 `StatusComp.effects` 的版本繞過正在被守的那條路（失敗形態 ⑤）。
 *
 * ── 突變紀錄（實跑）────────────────────────────────────────────────────────
 * M1 `combat/damage.ts` 刪掉 `pkt.amount *= weaknessMult(...)` 那一行
 *    → ①「虛弱的人打出去的傷害變少」FAIL；②③ 仍綠（所以①一個人扛這條線）。
 * M2 `systems/BasicAttackSystem.ts` 把 `* weaknessMult(...)` 拿掉
 *    → ②「虛弱的人揮得比較少」FAIL；①③ 仍綠。
 * 兩個改回來 → 4/4 綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA, THORNE } from "./content/skeleton";
import { Statuses } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { asSeatId, asTeamId, type EntityId, type StatusId } from "../ids";

const TAG = "weakness-mechanic";
/** 夾具：一份帶著虛弱分類的狀態，一份不帶。兩個都不是出貨 id。 */
const WEAK_TAG = "test-weak-family";
const WEAK = "test-weakening" as StatusId;
/** 夾具倍率 —— 刻意不是出貨值，這一檔不替 owner 的平衡數字上鎖。 */
const RULES = { statusTag: WEAK_TAG, attackSpeedMult: 0.25, damageDealtMult: 0.25 };
const HIT = 400;

beforeAll(() => {
  registerSkeletonContent();
  Statuses.register(WEAK, { polarity: "debuff", tags: [WEAK_TAG] });
});

const C = SKELETON_ARENA.zones[0]!.center;

/** 兩位貼在一起的敵對英雄。`gap` 給攻速那一條足夠的射程餘裕。 */
function stage(): { world: SimWorld; hero: EntityId; foe: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  world.weaknessRules = RULES;
  const hero = spawnChampion(world, {
    championId: SELA.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: THORNE.id,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 1, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return { world, hero, foe };
}

/** 走出貨的 `applyStatus` 把一份狀態掛到 `who` 身上。 */
function mark(world: SimWorld, who: EntityId, statusId: StatusId): void {
  runEffects([{ kind: "applyStatus", statusId, duration: 30 }], {
    world,
    caster: who,
    rank: 1,
    targets: [who],
    origin: "test:mark",
    rng: world.rng,
  });
}

/** hero 對 foe 送一發固定真傷，回傳 foe 真的掉了多少血。 */
function nuke(weakenWho: "attacker" | "victim" | "nobody", statusId: StatusId = WEAK): number {
  const s = stage();
  if (weakenWho === "attacker") mark(s.world, s.hero, statusId);
  if (weakenWho === "victim") mark(s.world, s.foe, statusId);
  const before = s.world.health.get(s.foe)!.hp;
  runEffects([{ kind: "damage", damageType: "true", amount: { flat: HIT } }], {
    world: s.world,
    caster: s.hero,
    rank: 1,
    targets: [s.foe],
    origin: "test:nuke",
    rng: s.world.rng,
  });
  s.world.step(new Map());
  return before - s.world.health.get(s.foe)!.hp;
}

/** 讓 hero 自動打 foe N tick，數真的揮了幾次。 */
function swings(weakened: boolean): number {
  const s = stage();
  if (weakened) mark(s.world, s.hero, WEAK);
  s.world.nav.get(s.hero)!.attackTarget = s.foe;
  let n = 0;
  for (let i = 0; i < 120; i++) {
    s.world.nav.get(s.hero)!.attackTarget = s.foe;
    s.world.step(new Map());
    if (s.world.events.some((e) => e.type === "basicAttack")) n += 1;
  }
  return n;
}

describe("虛弱 (weakness-mechanic)", () => {
  it("★ ① 虛弱的人**打出去**的傷害變少", () => {
    cover(TAG);
    const normal = nuke("nobody");
    expect(normal, "對照組一點傷害都沒進 —— 這條測試對任何實作都會過").toBeGreaterThan(0);
    expect(nuke("attacker"), "虛弱沒有讓他打出去的傷害變少").toBeLessThan(normal);
  });

  it("★ ② 虛弱**被打的人**不會少受傷 —— 它是減益不是減傷（方向）", () => {
    cover(TAG);
    expect(nuke("victim"), "虛弱被誤接成受傷減免了").toBe(nuke("nobody"));
  });

  it("★ ③ 虛弱的人在同一段時間內揮得比較少", () => {
    cover(TAG);
    const normal = swings(false);
    expect(normal, "對照組一次都沒揮 —— 先修測試").toBeGreaterThan(1);
    expect(swings(true), "虛弱沒有拖慢攻速").toBeLessThan(normal);
  });

  it("★ ④ 帶著**別的**狀態不算虛弱（閘本身）", () => {
    cover(TAG);
    // 少了這一條，「身上有任何狀態就打折」也會讓 ① 全綠 —— 而那個實作會讓
    // 中了減速的人順便少打一半傷害，畫面上完全看不出來。
    expect(nuke("attacker", "test-not-weak" as StatusId)).toBe(nuke("nobody"));
  });
});

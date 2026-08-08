/**
 * 擊退／擊飛 (`knockback`) 的行為守衛 —— lane P4 / GH#193.
 *
 * ---------------------------------------------------------------------------
 * 這裡刻意不測什麼
 * ---------------------------------------------------------------------------
 * 不測「`nav.override` 有沒有被設起來」, 不測「schema 認不認得這些欄位」, 也不測
 * 「knockbackRaw 回傳多少」。那些全是**屬性**, 不是行為 (七種失敗形態的第 ⑦ 種),
 * 而這個原語存在的唯一理由是**身體真的要移動到別的地方去**。
 *
 * 所以每一條斷言都跑真的 `SimWorld.step()`, 讀真的 `world.transform.pos`,
 * 而且多半讀的是**整條軌跡**而不是終點 —— 一個把擊退寫成瞬移的實作終點是對的,
 * 軌跡是錯的, 而玩家看到的是軌跡。
 *
 * 距離的算式走的是出貨的 `combatFeel.knockbackRaw` / `afterGap` (第 ⑤ 種失敗
 * 形態: 「被測的不是出貨的那個」), 位移的積分走的是出貨的 `movementSystem` /
 * `leapSystem`, 不是自己手寫一份。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 為什麼兩個身體是**同隊**
 * ---------------------------------------------------------------------------
 * 因為敵對的兩個身體會在 `step()` 裡互相自動索敵、互相普攻, 而普攻本身就會
 * 沿著 `combat/damage.ts` 打出**另一發**擊退 —— 量到的軌跡就不再是這個 effect
 * 造成的。這個原語根本不看隊伍 (它作用在 `ctx.targets`, 誰都可以), 所以同隊
 * 不會弱化任何一條斷言, 只會把污染源拿掉。
 *
 * 突變紀錄 (每一條都真的做過, 見 commit message):
 *   · `afterGap(raw, gap)` → `raw`                  → kb-gap 兩條全紅
 *   · `Math.max(raw, knockbackRaw(...))` → `raw`    → kb-hp-pct / kb-hp-basis 紅
 *   · `hpBasis` 分支永遠回 `hp.maxHp`               → kb-hp-basis 紅
 *   · 拿掉 `lockOut(...)`                            → kb-uncontrollable 紅
 *   · `apex > 0` 分支改成永遠走地面滑行              → kb-launch 紅
 *   · 拿掉 `cancelLeap(world, id)`                   → kb-midleap 紅
 *   · `clampKb(e.distance, KB_MAX_DISTANCE)` → `e.distance` → kb-bounds 紅
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { KB_MAX_DISTANCE } from "./knockbackLimits";
import { startLeap } from "../movement/leap";
import { DEFAULT_KNOCKBACK } from "../combatFeel";
import { currentFireRingRadius, fireRingRulesFromConfig } from "../fireRing";
import { asSeatId, asTeamId, type EntityId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";
import * as V from "../math/vec2";

const Z0 = SKELETON_ARENA.zones[0]!;
const C = Z0.center;

interface Rig {
  world: SimWorld;
  caster: EntityId;
  victim: EntityId;
  /** the victim's position the instant BEFORE the first step */
  start: V.Vec2;
}

/** Both bodies on z = 0, east of the zone centre: that corridor is obstacle-free. */
function rig(opts?: {
  gap?: number;
  maxHp?: number;
  hp?: number;
  radius?: number;
  z?: number;
  casterX?: number;
}): Rig {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const zc = opts?.z ?? 0;
  const radius = opts?.radius ?? 0.1;
  const maxHp = opts?.maxHp ?? 300;
  const place = (x: number, seat: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: zc },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius,
      zone: 0,
    });
    world.health.set(id, {
      hp: seat === 1 ? (opts?.hp ?? maxHp) : maxHp,
      maxHp,
      mana: 0,
      maxMana: 0,
      alive: true,
      shields: [],
    });
    // SAME team on purpose — see the header.
    world.team.set(id, { teamId: asTeamId(0), seatId: asSeatId(seat) });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    world.status.set(id, { effects: [] });
    return id;
  };
  const casterX = C.x + (opts?.casterX ?? 0);
  const caster = place(casterX, 0);
  const victim = place(casterX + (opts?.gap ?? 2), 1);
  world.rebuildGrid();
  return { world, caster, victim, start: { ...world.transform.get(victim)!.pos } };
}

function ctxOf(r: Rig): EffectContext {
  return {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.victim],
    origin: "ability:test.kb",
    rng: r.world.rng,
  };
}

const kb = (over: Partial<Extract<EffectDef, { kind: "knockback" }>>): EffectDef => ({
  kind: "knockback",
  distance: 6,
  speed: 12,
  ...over,
});

const moveOrder = (seat: number, point: V.Vec2): Map<SeatId, IntentFrame> =>
  new Map([[asSeatId(seat), { order: { kind: "move" as const, point }, commands: [] }]]);

/** Run the effect, then step `ticks` times, returning the victim's path. */
function shoveAndRun(r: Rig, e: EffectDef, ticks: number): V.Vec2[] {
  runEffects([e], ctxOf(r));
  const path: V.Vec2[] = [];
  for (let i = 0; i < ticks; i++) {
    r.world.step(new Map());
    path.push({ ...r.world.transform.get(r.victim)!.pos });
  }
  return path;
}

/** Straight-line displacement of the victim from where it started. */
function travelled(r: Rig): number {
  return V.dist(r.world.transform.get(r.victim)!.pos, r.start);
}

describe("knockback — 位移軌跡 (kb-trajectory)", () => {
  it("really moves the body, and SLIDES there over several ticks (not a teleport)", () => {
    cover("kb-trajectory");
    // distance 6 是 gap 0 時的下限; gap 2 → 實際推 4。speed 12 @30Hz = 0.4/tick,
    // 所以這一段要花 10 個 tick 走完。
    const r = rig({ gap: 2 });
    const path = shoveAndRun(r, kb({ distance: 6, speed: 12 }), 20);

    expect(travelled(r)).toBeCloseTo(4, 3);
    // 方向: 遠離施術者 (+x)
    expect(r.world.transform.get(r.victim)!.pos.x - r.start.x).toBeCloseTo(4, 3);
    expect(r.world.transform.get(r.victim)!.pos.z).toBeCloseTo(r.start.z, 6);

    // 軌跡, 不是終點: 第一個 tick 只能走 speed*dt, 而且一路單調前進。
    expect(V.dist(path[0]!, r.start)).toBeCloseTo(0.4, 6);
    for (let i = 1; i < 10; i++) {
      expect(path[i]!.x).toBeGreaterThan(path[i - 1]!.x);
      expect(V.dist(path[i]!, path[i - 1]!)).toBeCloseTo(0.4, 6);
    }
    // 走完之後就停住 —— 不是無限滑行。
    expect(path[19]!.x).toBeCloseTo(path[10]!.x, 6);
  });
});

describe("knockback — 減去雙方距離 (kb-gap)", () => {
  it("the SAME shove travels less the further apart the two bodies are", () => {
    cover("kb-gap");
    // 同一份 effect, 只有 gap 不同: 1 → 5, 5 → 1。差額**正好**是 gap 的差額。
    const near = rig({ gap: 1 });
    const far = rig({ gap: 5 });
    shoveAndRun(near, kb({ distance: 6, speed: 12 }), 25);
    shoveAndRun(far, kb({ distance: 6, speed: 12 }), 25);

    expect(travelled(near)).toBeCloseTo(5, 3);
    expect(travelled(far)).toBeCloseTo(1, 3);
    expect(travelled(near) - travelled(far)).toBeCloseTo(4, 3);
  });

  it("gap >= the raw distance shoves NOTHING — no slide, no lock, no override", () => {
    cover("kb-gap");
    // 遠程隔著 8.2 打出一個 6 的擊退 → 完全不推。這正是 #193 的重點:
    // 擊退是近戰的工具, 遠程不能靠推人永久風箏。
    const r = rig({ gap: 8.2 });
    shoveAndRun(r, kb({ distance: 6, speed: 12 }), 15);
    expect(travelled(r)).toBeCloseTo(0, 6);
    expect(r.world.nav.get(r.victim)!.override).toBeNull();
    expect(r.world.knockdown.get(r.victim) ?? 0).toBe(0);
  });

  it("subtractGap:false is the OPT-OUT, and it is opt-out only", () => {
    cover("kb-gap");
    const r = rig({ gap: 5 });
    shoveAndRun(r, kb({ distance: 6, speed: 12, subtractGap: false }), 25);
    expect(travelled(r)).toBeCloseTo(6, 3);
  });
});

describe("knockback — 依傷害佔生命百分比 (kb-hp-pct)", () => {
  it("the same impact shoves a 脆皮 far and a 6,000-hp 王 not at all", () => {
    cover("kb-hp-pct");
    // 出貨規則: minPct .05, maxBodies 10, bodyUnit 1.
    //   300 maxHp  → 100/300 = 33.3% → 3.333 身位 → 減 gap 1 → 2.333
    //   6000 maxHp → 100/6000 = 1.67% < 5%        → 0 身位 → 完全不推
    const squishy = rig({ gap: 1, maxHp: 300 });
    const boss = rig({ gap: 1, maxHp: 6000 });
    const e = kb({ distance: 0.01, speed: 12, impactPower: 100 });
    shoveAndRun(squishy, e, 25);
    shoveAndRun(boss, e, 25);

    expect(travelled(squishy)).toBeCloseTo(10 * (100 / 300) - 1, 3);
    expect(travelled(boss)).toBeCloseTo(0, 6);
  });

  it("impactPower deals NO damage — it only weighs the shove", () => {
    cover("kb-hp-pct");
    const r = rig({ gap: 1, maxHp: 300 });
    shoveAndRun(r, kb({ distance: 0.01, speed: 12, impactPower: 100 }), 25);
    expect(r.world.health.get(r.victim)!.hp).toBe(300);
  });

  it("the authored distance is a FLOOR, not a ceiling", () => {
    cover("kb-hp-pct");
    // 作者寫 1, 法則算出 3.333 → 取大的那個 (和 combat/damage.ts 對
    // hitFeel.knockbackMag 的處理完全同一條語意)。
    const r = rig({ gap: 1, maxHp: 300 });
    shoveAndRun(r, kb({ distance: 1, speed: 12, impactPower: 100 }), 25);
    expect(travelled(r)).toBeCloseTo(10 * (100 / 300) - 1, 3);
  });
});

describe("knockback — hpBasis 決策點 (kb-hp-basis)", () => {
  it('"current" shoves a 殘血 target further; "max" (the default) does not', () => {
    cover("kb-hp-basis");
    const mk = (hp: number, basis?: "max" | "current"): number => {
      const r = rig({ gap: 1, maxHp: 300, hp });
      shoveAndRun(
        r,
        kb({ distance: 0.01, speed: 12, impactPower: 100, ...(basis ? { hpBasis: basis } : {}) }),
        40,
      );
      return travelled(r);
    };
    // 出貨語意 (預設 max): 滿血與殘血**一樣遠** —— combat/damage.ts 明說的那條。
    expect(mk(300)).toBeCloseTo(mk(60), 6);
    // 開了 current 之後才會不一樣, 而且是殘血飛更遠。
    const full = mk(300, "current");
    const low = mk(60, "current");
    expect(low).toBeGreaterThan(full + 1);
    expect(full).toBeCloseTo(10 * (100 / 300) - 1, 3);
    // 100/60 = 1.67 → pct 夾到 1 → 10 身位, 減 gap 1 → 9
    expect(low).toBeCloseTo(9, 3);
  });
});

describe("knockback — 期間不可控制 (kb-uncontrollable)", () => {
  it("the shoved body cannot walk itself back until the lock expires", () => {
    cover("kb-uncontrollable");
    // 推 4 單位 @ 0.4/tick = 10 tick 的滑行, 之後 15 tick 的爬起來。
    const r = rig({ gap: 2 });
    runEffects([kb({ distance: 6, speed: 12, getupTicks: 15 })], ctxOf(r));
    // 滑行結束的那個 tick 之後, 玩家一直推著搖桿要往回走 (往 -x)。
    const back = { x: r.start.x - 10, z: r.start.z };
    for (let i = 0; i < 10; i++) r.world.step(moveOrder(1, back));
    const afterSlide = { ...r.world.transform.get(r.victim)!.pos };
    expect(r.world.knockdown.get(r.victim) ?? 0).toBeGreaterThan(0);

    // 鎖著的期間: 有指令、有目標, 身體一步都不動。
    for (let i = 0; i < 14; i++) r.world.step(moveOrder(1, back));
    expect(r.world.transform.get(r.victim)!.pos.x).toBeCloseTo(afterSlide.x, 6);

    // 鎖過期之後才走得動。
    for (let i = 0; i < 10; i++) r.world.step(moveOrder(1, back));
    expect(r.world.transform.get(r.victim)!.pos.x).toBeLessThan(afterSlide.x - 0.5);
  });

  it("uncontrollable:false lets the body walk the instant the slide ends", () => {
    cover("kb-uncontrollable");
    const r = rig({ gap: 2 });
    runEffects([kb({ distance: 6, speed: 12, uncontrollable: false })], ctxOf(r));
    const back = { x: r.start.x - 10, z: r.start.z };
    for (let i = 0; i < 10; i++) r.world.step(moveOrder(1, back));
    const afterSlide = { ...r.world.transform.get(r.victim)!.pos };
    expect(r.world.knockdown.get(r.victim) ?? 0).toBe(0);
    for (let i = 0; i < 10; i++) r.world.step(moveOrder(1, back));
    expect(r.world.transform.get(r.victim)!.pos.x).toBeLessThan(afterSlide.x - 0.5);
  });
});

describe("knockback — 擊飛 (kb-launch)", () => {
  it("launchHeight puts the body IN THE AIR and lands it the same distance away", () => {
    cover("kb-launch");
    const ground = rig({ gap: 2 });
    const flown = rig({ gap: 2 });
    const path = shoveAndRun(ground, kb({ distance: 6, speed: 12 }), 20);
    let apexSeen = 0;
    runEffects([kb({ distance: 6, speed: 12, launchHeight: 3 })], ctxOf(flown));
    for (let i = 0; i < 20; i++) {
      flown.world.step(new Map());
      const air = flown.world.airborne.get(flown.victim);
      if (air) apexSeen = Math.max(apexSeen, air.y);
    }

    // 垂直分量真的存在, 而且是一條弧 (最高點靠近 apexHeight)。
    expect(apexSeen).toBeGreaterThan(2.5);
    expect(apexSeen).toBeLessThanOrEqual(3);
    // 落地之後不再算在空中 —— 一個沒清掉的 airborne 會讓角色永遠浮著 (失敗形態 ①)
    expect(flown.world.airborne.has(flown.victim)).toBe(false);
    // 水平位移和地面滑行版本一樣: 高度是加上去的, 不是換掉的。
    expect(travelled(flown)).toBeCloseTo(travelled(ground), 3);
    expect(path[19]!.x).toBeCloseTo(flown.world.transform.get(flown.victim)!.pos.x, 3);
  });

  it("a 擊飛 CROSSES an obstacle the ground slide is stopped by", () => {
    cover("kb-launch");
    // 柱子在 (C.x + 9, -8), 半徑 1.8。兩個身體站在 z = -8 上, 正對著它推。
    const mk = (launch: boolean): number => {
      const r = rig({ gap: 2, z: -8, casterX: 4, radius: 0.5 });
      shoveAndRun(
        r,
        kb({ distance: 8, speed: 12, ...(launch ? { launchHeight: 4 } : {}) }),
        30,
      );
      return r.world.transform.get(r.victim)!.pos.x - C.x;
    };
    // 地面滑行撞上柱子的近側 (柱面在 x = C.x + 7.2, 身體半徑 0.5)。
    expect(mk(false)).toBeLessThan(7);
    // 擊飛整條弧都在平面物理之外, 直接落在柱子的另一邊 (6 + 6 = 12)。
    expect(mk(true)).toBeCloseTo(12, 2);
  });
});

describe("knockback — from 決策點 (kb-direction)", () => {
  it('"pull" drags the target TOWARD the caster', () => {
    cover("kb-direction");
    const r = rig({ gap: 6 });
    shoveAndRun(r, kb({ distance: 3, speed: 12, from: "pull", subtractGap: false }), 25);
    // 往 -x 走 3 → 兩人剩 3 的距離
    expect(r.world.transform.get(r.victim)!.pos.x - r.start.x).toBeCloseTo(-3, 3);
    expect(
      V.dist(r.world.transform.get(r.victim)!.pos, r.world.transform.get(r.caster)!.pos),
    ).toBeCloseTo(3, 3);
  });

  it('applyTo:"self" recoils the CASTER and leaves the target alone', () => {
    cover("kb-direction");
    // gap 6 而不是 2: 施術者往 +x 退 3, 隔得夠遠才不會撞進目標身上被
    // separation 推開 —— 那 0.06 的推擠是碰撞系統的行為, 不是這個原語的。
    const r = rig({ gap: 6 });
    const casterStart = { ...r.world.transform.get(r.caster)!.pos };
    shoveAndRun(r, kb({ distance: 3, speed: 12, from: "facing", applyTo: "self" }), 25);
    // gap 對自推是 0 (只有一個身體), 所以全額 3 —— 沿著施術者面向 (+x)。
    expect(r.world.transform.get(r.caster)!.pos.x - casterStart.x).toBeCloseTo(3, 3);
    expect(travelled(r)).toBeCloseTo(0, 6);
  });
});

describe("knockback — 上界與既有狀態 (kb-bounds / kb-midleap)", () => {
  it("a raw un-converted WC3 length is CLAMPED, not obeyed", () => {
    cover("kb-bounds");
    // 400 是 w3x 的原始長度 (toLen → GGD 的 7.33), 直接貼進來 (沒換算) 就是
    // 一個 400 單位的擊退 —— 決鬥區半徑才 24。上界把它變成 KB_MAX_DISTANCE,
    // 而 KB_MAX_DISTANCE 是照著出貨內容最大的那一支 (1000 wc3 = 18.33) 訂的,
    // 所以真的有人寫 18.33 時不會被靜默改小。見 knockbackLimits.ts。
    const r = rig({ gap: 2 });
    shoveAndRun(r, kb({ distance: 400, speed: 12 }), 60);
    expect(travelled(r)).toBeCloseTo(KB_MAX_DISTANCE - 2, 3);
    // 而且仍然待在決鬥區裡。
    expect(V.dist(r.world.transform.get(r.victim)!.pos, C)).toBeLessThan(Z0.boundaryRadius);
  });

  it("shoving a body that is mid-LEAP does not strand it in the air", () => {
    cover("kb-midleap");
    const r = rig({ gap: 2 });
    startLeap(r.world, r.victim, {
      to: { x: r.start.x, z: r.start.z + 6 },
      apexHeight: 4,
      durationSec: 1,
      casterId: r.victim,
      rank: 1,
      origin: "ability:test.jump",
    });
    r.world.step(new Map());
    expect(r.world.airborne.has(r.victim)).toBe(true);

    shoveAndRun(r, kb({ distance: 6, speed: 12 }), 20);
    // 沒有殘留的 airborne 項目 —— 有的話 digest 會 hash 它, 客戶端會把角色畫在空中。
    expect(r.world.airborne.has(r.victim)).toBe(false);
    expect(r.world.nav.get(r.victim)!.override).toBeNull();
  });
});

/**
 * ⭐ 四檔落點 (GH#301-1, owner 2026-08-09)。
 *
 * ⛔ 這裡驗的是**機制**不是數字：期望值一律從 `DEFAULT_KNOCKBACK` 推導，
 * 不抄 3 / 12（第零守則：出貨值已經有三個住處 + drift 測試在守，測試裡再抄
 * 一份就是第四個住處，而且它一定會過期）。
 *
 * 突變紀錄（都真的做過）:
 *   · `tier === "default"` 改成永遠成立（四檔整段跳過）→ kb-launch-tier /
 *     kb-launch-edge 兩條全紅（走回 distance/gap 推算，短檔量到 0.1−2 = 不推）
 *   · `tierDistance` 的 `kb.launchEdgeUsesFireRing` 分支改成永遠讀
 *     `zoneDef.boundaryRadius`                        → kb-launch-edge 紅
 */
describe("knockback — 四檔落點 (kb-launch-tier)", () => {
  it("作者選的那一檔說了算：距離來自後台，而且不再被減掉雙方距離", () => {
    cover("kb-launch-tier");
    // 同一份 effect、同一個 gap，只有 `launchDistance` 不同。
    // `distance: 0.1` 是刻意的：推算路徑在 gap 2 下會算出 0（0.1 − 2 < 0，
    // 完全不推），所以「量到的位移 > 0」本身就證明四檔繞過了那條路徑。
    const short = rig({ gap: 2 });
    const long = rig({ gap: 2 });
    shoveAndRun(short, kb({ distance: 0.1, speed: 40, launchDistance: "short" }), 40);
    shoveAndRun(long, kb({ distance: 0.1, speed: 40, launchDistance: "long" }), 40);

    expect(travelled(short)).toBeCloseTo(DEFAULT_KNOCKBACK.launchShortUnits, 3);
    expect(travelled(long)).toBeCloseTo(DEFAULT_KNOCKBACK.launchLongUnits, 3);
    expect(travelled(long)).toBeGreaterThan(travelled(short));

    // …而「預設」那一檔一格都沒變：仍然是 max(distance, hp 推算) 再減 gap。
    const dflt = rig({ gap: 2 });
    shoveAndRun(dflt, kb({ distance: 6, speed: 40, launchDistance: "default" }), 40);
    expect(travelled(dflt)).toBeCloseTo(4, 3);
  });

  it("「到底部」推到**還站得住**的邊緣 —— 火圈縮了就跟著縮", () => {
    cover("kb-launch-edge");
    const r = rig({ gap: 2 });
    // 火圈縮到一半。⚠️ 不開 `combatActive`：`fireRingSystem` 因此不會推進時鐘、
    // 也不會燒人，所以量到的軌跡只有這一個 effect 造成的（同檔頭「同隊」那段）。
    const rules = fireRingRulesFromConfig(
      { startSec: 0, shrinkSec: 20, minRadius: 0.5, maxPctPerSec: 1 },
      1 / 30,
    );
    r.world.fireRingRules = rules;
    r.world.fireRingTicks = rules.startTicks + Math.round(rules.shrinkTicks / 2);
    const rim = currentFireRingRadius(r.world, 0);
    expect(rim).toBeLessThan(Z0.boundaryRadius); // 前提：火圈真的縮了

    shoveAndRun(r, kb({ distance: 0.1, speed: 60, launchDistance: "toEdge" }), 40);
    // 落在「還能站的圓」上，整個身體都在裡面（rim − 體半徑）。
    const t = r.world.transform.get(r.victim)!;
    expect(V.dist(t.pos, C)).toBeCloseTo(rim - t.radius, 2);
    // ⛔ 而且**沒有**被推到幾何邊界去 —— 那一側會把人扔進火裡。
    expect(V.dist(t.pos, C)).toBeLessThan(Z0.boundaryRadius - 1);
  });
});

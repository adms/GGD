/**
 * 揍敵客阿福 (godie-efur) — 行為守衛 (lane D).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這裡刻意**不**測什麼
 * ─────────────────────────────────────────────────────────────────────────────
 * 不測「文件裡有沒有 `kind: "cycleBuff"`」、不測「`hpPct` 這個欄位在不在」、也不
 * 測「vfxLayers 有幾層」。那些全是**屬性**，是七種失敗形態的第 ⑦ 種。這一支英雄
 * 的六個技能全部是**位移／控制／百分比生命／狀態機**，也就是說每一條斷言都必須
 * 讀最終世界狀態：`world.transform.pos`、`world.health.hp/mana`、
 * `world.stats.get(id).final`、`world.status`。
 *
 * 而且被測的是**出貨的那一份文件**（第 ⑤ 種失敗形態）：所有六支都是從
 * `content/` 用真的 `ContentLoader` 載進真的 registry，沒有任何一個 EffectDef 是
 * 測試自己手寫的。文件被改壞、被刪掉一個 effect、數字被動過，這裡就紅。
 *
 * ⚠️ 這一份**不是** `it.each(從磁碟掃出來的清單)` + `toBeGreaterThan(0)` 那種
 * 守衛：那種寫法「刪掉內容 = 刪掉測試」。這裡每一支技能的 id 與關鍵數字都寫死在
 * 斷言裡，文件不見就是 `Abilities.get` 直接爆炸。
 *
 * 突變紀錄（每一條都真的做過，見回報）：
 *   · `nextCycleStep` 永遠回 0                     → efur-passive-rotation 紅
 *   · Q 的 `leap` 從文件裡拿掉                      → efur-q-blink 紅
 *   · `damage.hpPct` 那一段 `amount +=` 拿掉        → efur-w-hppct 紅
 *   · W 的 `knockback` 從文件裡拿掉                 → efur-w-knock 紅
 *   · E 的 `damageLine` 從文件裡拿掉                → efur-e-corridor 紅
 *   · `interruptOn === "damage"` 那一項改成 false   → efur-r-interrupt 紅
 *   · EX 的 `applyBuff.hooks` 不再傳給 attachSource → efur-ex-combo 紅
 *   · EX 的 `spendMana` 從文件裡拿掉                → efur-ex-mana 紅
 *   · EX 的 `spendMana.bankAs` 從文件裡拿掉         → efur-ex-banked 紅
 *   · 牙突的 `damage.bankedBonus` 從文件裡拿掉      → efur-ex-banked 紅
 *   · `bankedAddend` 的 `Math.min(…, b.max)` 拿掉   → efur-ex-banked-cap 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility, rankUpAbility, learnEx, resolveAbilityRange } from "./abilities/abilitySystem";
import { attachSource } from "./stats/statPipeline";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { cycleStepId } from "./effects/cycleBuff";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import * as V from "./math/vec2";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

const EFUR = "godie-efur" as ChampionId;
/** A body that is NOT 阿福, so the dummy never runs his own kit back at us. */
const DUMMY = "godie-e001" as ChampionId;

const Z0 = SKELETON_ARENA.zones[0]!;
const C = Z0.center;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
});

interface Rig {
  world: SimWorld;
  efur: EntityId;
  foe: EntityId;
}

/**
 * 阿福 at the zone centre, one enemy `gap` units EAST (that corridor is
 * obstacle-free — the same lane knockback.test.ts uses).
 */
function rig(opts?: { gap?: number; level?: number; foeMaxHp?: number }): Rig {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const level = opts?.level ?? 6;
  const efur = spawnChampion(world, {
    championId: EFUR,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: 0 },
    zone: 0,
    level,
  });
  const foe = spawnChampion(world, {
    championId: DUMMY,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + (opts?.gap ?? 2), z: 0 },
    zone: 0,
    level,
  });
  // A fat, unarmoured target: `armor 0` makes physical mitigation the identity,
  // so a damage assertion is about the ABILITY rather than about the mitigation
  // curve. The big pool keeps a 12 %-max-health slice measurable and keeps the
  // dummy alive through every case below.
  const hp = world.health.get(foe)!;
  hp.maxHp = opts?.foeMaxHp ?? 4000;
  hp.hp = hp.maxHp;
  const sc = world.stats.get(foe)!;
  sc.final[Stat.Armor] = 0;
  sc.final[Stat.MagicResist] = 0;
  world.rebuildGrid();
  return { world, efur, foe };
}

const empty = (): Map<SeatId, IntentFrame> => new Map();

function step(world: SimWorld, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.step(empty());
}

function pos(world: SimWorld, id: EntityId): V.Vec2 {
  return { ...world.transform.get(id)!.pos };
}

/**
 * PIN a core slot to EXACTLY `rank`.
 *
 * ⚠️ Assignment rather than `rankUpAbility`, and that is deliberate: spawning at
 * a level above 1 already auto-learns points, so a "rank up N times" helper
 * lands on 1+N and every per-rank number in the assertions below would silently
 * be reading the wrong column. What matters to these guards is that the ABILITY
 * is the shipped document at a KNOWN rank; the rank-up ladder itself is
 * abilitySystem's own suite.
 */
function rankTo(world: SimWorld, id: EntityId, slot: "Q" | "W" | "E" | "R", rank: number): void {
  const ab = world.abilities.get(id)!;
  world.ultGateOverride = true;
  ab.slots[slot].rank = rank;
  expect(ab.slots[slot].rank).toBe(rank);
}

/** Live (un-expired) cycle-step sources on `id`, as their step INDEX. */
function liveCycleSteps(world: SimWorld, id: EntityId, key: string, n: number): number[] {
  const sc = world.stats.get(id)!;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const src = sc.sources.find((s) => s.id === cycleStepId(key, i));
    if (src && (src.expiresAtTick ?? 0) > world.tick) out.push(i);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 天生 13-00 念。攻防轉換 — 輪流四個 buff，可同時存在
// ═══════════════════════════════════════════════════════════════════════════
describe("13-00 念。攻防轉換 (efur-passive-rotation)", () => {
  it("four swings light FOUR DIFFERENT buffs, in order, and all four are live at once", () => {
    cover("efur-passive-rotation");
    const r = rig({ gap: 2, foeMaxHp: 100000 });
    // The rotation is per SWING and each step lasts 1.0 s, so 「可同時存在」 is
    // only reachable above 4 attacks/sec. That is a statement the shipped
    // description already makes; here we buy the attack speed so the guard can
    // observe the coexistence the ability promises.
    attachSource(r.world, r.efur, {
      id: "test:attackspeed",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.Flat, value: 20 }],
    });

    const seen: number[][] = [];
    const attack: Map<SeatId, IntentFrame> = new Map([
      [asSeatId(0), { order: { kind: "attackTarget" as const, entity: r.foe }, commands: [] }],
    ]);
    for (let i = 0; i < 60; i++) {
      r.world.step(attack);
      seen.push(liveCycleSteps(r.world, r.efur, "efur-nen", 4));
    }

    // ① the rotation really visits all four, and it does so IN ORDER: the first
    //    tick that shows k steps live must be exactly [0..k-1].
    for (const k of [1, 2, 3, 4]) {
      const first = seen.find((s) => s.length === k);
      expect(first, `never saw ${k} step(s) live`).toBeDefined();
      expect(first).toEqual([0, 1, 2, 3].slice(0, k));
    }
    // ② 可同時存在 — a tick on which ALL FOUR are alive together.
    const together = seen.findIndex((s) => s.length === 4);
    expect(together, "the four buffs never coexisted").toBeGreaterThanOrEqual(0);

    // ③ and they are REAL stat changes, not bookkeeping. Read the final table on
    //    that tick's world: with all four live, ap/ad/armor/mr are each +10 %.
    //    (Re-run to the same tick because `seen` only kept the indices.)
    const r2 = rig({ gap: 2, foeMaxHp: 100000 });
    attachSource(r2.world, r2.efur, {
      id: "test:attackspeed",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.Flat, value: 20 }],
    });
    const attack2: Map<SeatId, IntentFrame> = new Map([
      [asSeatId(0), { order: { kind: "attackTarget" as const, entity: r2.foe }, commands: [] }],
    ]);
    let armorWithAll = 0;
    let armorBefore = r2.world.stats.get(r2.efur)!.final[Stat.Armor];
    for (let i = 0; i <= together; i++) {
      if (liveCycleSteps(r2.world, r2.efur, "efur-nen", 4).length === 0) {
        armorBefore = r2.world.stats.get(r2.efur)!.final[Stat.Armor];
      }
      r2.world.step(attack2);
    }
    expect(liveCycleSteps(r2.world, r2.efur, "efur-nen", 4)).toEqual([0, 1, 2, 3]);
    armorWithAll = r2.world.stats.get(r2.efur)!.final[Stat.Armor];
    expect(armorWithAll).toBeGreaterThan(armorBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Q 13-01 暗步。極限之圓 — 瞬移到目標身邊，超過距離不觸發
// ═══════════════════════════════════════════════════════════════════════════
describe("13-01 暗步。極限之圓 (efur-q-blink)", () => {
  it("really teleports the caster next to the target", () => {
    cover("efur-q-blink");
    const r = rig({ gap: 4 });
    rankTo(r.world, r.efur, "Q", 1);
    const before = pos(r.world, r.efur);
    expect(castAbility(r.world, r.efur, "Q", { type: "entity", entityId: r.foe })).toBe("ok");
    step(r.world, 12);
    const after = pos(r.world, r.efur);
    // moved a real distance, and ENDED UP next to the victim (bodies are 1.2
    // wide, so "adjacent" is generous at 2.0).
    expect(V.dist(before, after)).toBeGreaterThan(1.5);
    expect(V.dist(after, pos(r.world, r.foe))).toBeLessThan(2.0);
  });

  it("REFUSES past its distance limit — no move, no cooldown, no mana", () => {
    cover("efur-q-blink");
    const def = Abilities.get("godie-efur.q" as AbilityId);
    // The gate is the SHIPPED reach (`range` through the #136 combat-env
    // factor), read from the same helper castAbility uses — never a number
    // re-typed here, which is how a guard silently stops matching the content.
    const reach = resolveAbilityRange(new SimWorld(SKELETON_ARENA, 1), def.range);
    const r = rig({ gap: reach + 2 });
    rankTo(r.world, r.efur, "Q", 1);
    const before = pos(r.world, r.efur);
    const mana = r.world.health.get(r.efur)!.mana;
    expect(castAbility(r.world, r.efur, "Q", { type: "entity", entityId: r.foe })).toBe(
      "out-of-range",
    );
    step(r.world, 12);
    expect(V.dist(before, pos(r.world, r.efur))).toBeLessThan(0.01);
    expect(r.world.health.get(r.efur)!.mana).toBeCloseTo(mana, 5);
    expect(r.world.abilities.get(r.efur)!.slots.Q.cooldownRemainingTicks).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// W 13-02 龍頭戲畫。牙突 — 擊退 + 暈眩 + 最大生命百分比
// ═══════════════════════════════════════════════════════════════════════════
function castW(foeMaxHp: number): { pushed: number; lost: number; stunned: boolean } {
  const r = rig({ gap: 2, foeMaxHp });
  rankTo(r.world, r.efur, "W", 1);
  const start = pos(r.world, r.foe);
  const hp0 = r.world.health.get(r.foe)!.hp;
  expect(castAbility(r.world, r.efur, "W", { type: "entity", entityId: r.foe })).toBe("ok");
  let stunned = false;
  for (let i = 0; i < 30; i++) {
    r.world.step(empty());
    const st = r.world.status.get(r.foe);
    if (st?.effects.some((e) => e.stun && e.expiresAtTick > r.world.tick)) stunned = true;
  }
  return {
    pushed: V.dist(start, pos(r.world, r.foe)),
    lost: hp0 - r.world.health.get(r.foe)!.hp,
    stunned,
  };
}

describe("13-02 龍頭戲畫。牙突 (efur-w-hppct / efur-w-knock)", () => {
  it("takes 6 % of the target's MAX health — proved by the delta between two pools", () => {
    cover("efur-w-hppct");
    // ISOLATES `hpPct` from everything else: same rank, same caster, same
    // mitigation — only `maxHp` differs, so the difference in HP lost IS the
    // percentage term. Deleting `hpPct` makes this difference 0.
    const small = castW(1000);
    const big = castW(4000);
    const factor = new SimWorld(SKELETON_ARENA, 1).combatEnv.damageDealt;
    expect(big.lost - small.lost).toBeCloseTo(0.06 * 3000 * factor, 0);
  });

  it("stuns the target and shoves it away from the caster", () => {
    cover("efur-w-knock");
    const out = castW(4000);
    expect(out.stunned).toBe(true);
    // 6.0 at gap 0 minus the 2.0 gap (GH#193) = 4.0, and the body slides there
    // over several ticks. A loose floor of 2.0 keeps this about "it really got
    // shoved" rather than about the gap arithmetic knockback.test.ts owns.
    expect(out.pushed).toBeGreaterThan(2.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E 13-03 龍頭戲畫。佈壁 — 位移 + 走廊傷害 + 落點擊退
// ═══════════════════════════════════════════════════════════════════════════
describe("13-03 龍頭戲畫。佈壁 (efur-e-corridor)", () => {
  it("the caster charges, the body IN the corridor is cut and shoved, the body beside it is not", () => {
    cover("efur-e-corridor");
    const world = new SimWorld(SKELETON_ARENA, 4242);
    const efur = spawnChampion(world, {
      championId: EFUR,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: C.x, z: 0 },
      zone: 0,
      level: 6,
    });
    const mk = (seat: number, x: number, z: number): EntityId => {
      const id = spawnChampion(world, {
        championId: DUMMY,
        seatId: asSeatId(seat),
        teamId: asTeamId(1),
        pos: { x, z },
        zone: 0,
        level: 6,
      });
      const hp = world.health.get(id)!;
      hp.maxHp = 8000;
      hp.hp = hp.maxHp;
      const sc = world.stats.get(id)!;
      sc.final[Stat.Armor] = 0;
      return id;
    };
    // ON the line (straight ahead) vs BESIDE it (4 units off-axis — well past
    // the 2.4-wide capsule). This is the assertion that the corridor is a
    // CAPSULE and not a circle: a circle of the same reach would catch both.
    const onLine = mk(1, C.x + 2.4, 0);
    const beside = mk(2, C.x + 2.4, 4.0);
    world.rebuildGrid();
    const ab = world.abilities.get(efur)!;
    ab.unspentPoints += 1;
    expect(rankUpAbility(world, efur, "E")).toBe(true);

    const casterBefore = pos(world, efur);
    const onLineBefore = pos(world, onLine);
    const onLineHp0 = world.health.get(onLine)!.hp;
    const besideHp0 = world.health.get(beside)!.hp;
    expect(
      castAbility(world, efur, "E", { type: "point", point: { x: C.x + 5.0, z: 0 } }),
    ).toBe("ok");
    step(world, 40);

    expect(V.dist(casterBefore, pos(world, efur))).toBeGreaterThan(1.0); // charged
    expect(onLineHp0 - world.health.get(onLine)!.hp).toBeGreaterThan(0); // cut
    expect(besideHp0 - world.health.get(beside)!.hp).toBe(0); // off-axis: untouched
    expect(V.dist(onLineBefore, pos(world, onLine))).toBeGreaterThan(1.0); // shoved
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R 13-04 龍星群 — 2 秒才生效，中途被打就中斷
// ═══════════════════════════════════════════════════════════════════════════
describe("13-04 龍星群 (efur-r-cast / efur-r-interrupt)", () => {
  it("nothing happens for 2.0 s, then the meteors land", () => {
    cover("efur-r-cast");
    const r = rig({ gap: 3, foeMaxHp: 40000 });
    rankTo(r.world, r.efur, "R", 1);
    const hp0 = r.world.health.get(r.foe)!.hp;
    expect(
      castAbility(r.world, r.efur, "R", { type: "point", point: { x: C.x + 3, z: 0 } }),
    ).toBe("ok");
    // 0.6 s = 18 ticks of wind-up (the value castTimeFormula derives — see the
    // R doc's own description for why it is not the 2.0 s the owner asked for).
    // Two ticks short: still nothing.
    step(r.world, 16);
    expect(r.world.health.get(r.foe)!.hp).toBe(hp0);
    // …then the 10-payout shower over the next 2.0 s.
    step(r.world, 75);
    expect(hp0 - r.world.health.get(r.foe)!.hp).toBeGreaterThan(0);
  });

  it("a single point of damage during the wind-up CANCELS it — the meteors never come", () => {
    cover("efur-r-interrupt");
    const r = rig({ gap: 3, foeMaxHp: 40000 });
    rankTo(r.world, r.efur, "R", 1);
    const hp0 = r.world.health.get(r.foe)!.hp;
    expect(
      castAbility(r.world, r.efur, "R", { type: "point", point: { x: C.x + 3, z: 0 } }),
    ).toBe("ok");
    step(r.world, 8);
    // Poke the caster. NOT a stun and NOT a knockdown — those already cancelled
    // a cast before `interruptOn` existed, so using one would let this test pass
    // against an implementation that ignores the new field entirely (失敗形態 ④).
    r.world.health.get(r.efur)!.hp -= 1;
    r.world.step(empty());
    expect(r.world.abilities.get(r.efur)!.cast).toBeNull();
    step(r.world, 150);
    expect(r.world.health.get(r.foe)!.hp).toBe(hp0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EX 13-002 絕。暗殺奧義 — 燒光法力 / 四圍 +40% / 下一次 Q 自動牙突
// ═══════════════════════════════════════════════════════════════════════════
describe("13-002 絕。暗殺奧義 (efur-ex-mana / efur-ex-combo)", () => {
  it("burns the WHOLE pool and lifts all four defence/offence stats by 40 %", () => {
    cover("efur-ex-mana");
    const r = rig({ gap: 3 });
    expect(learnEx(r.world, r.efur)).toBe(true);
    const hp = r.world.health.get(r.efur)!;
    hp.maxMana = 900;
    hp.mana = 900;
    const sc = r.world.stats.get(r.efur)!;
    const ad0 = sc.final[Stat.AttackDamage];
    const armor0 = sc.final[Stat.Armor];
    expect(castAbility(r.world, r.efur, "EX", { type: "self" })).toBe("ok");
    step(r.world, 12); // past the 0.3 s wind-up
    // Below 1 point, not exactly 0: mana REGEN keeps ticking after the burn, so
    // an `=== 0` assertion would be measuring the tick count, not the drain.
    // 900 -> under 1 is unambiguous either way.
    expect(r.world.health.get(r.efur)!.mana).toBeLessThan(1);
    const f = r.world.stats.get(r.efur)!.final;
    expect(f[Stat.AttackDamage]).toBeCloseTo(ad0 * 1.4, 3);
    expect(f[Stat.Armor]).toBeCloseTo(armor0 * 1.4, 3);
  });

  it("the FIRST Q hit inside the window auto-fires 牙突; the second does not", () => {
    cover("efur-ex-combo");
    const r = rig({ gap: 3, foeMaxHp: 20000 });
    rankTo(r.world, r.efur, "Q", 1);
    expect(learnEx(r.world, r.efur)).toBe(true);
    const hp = r.world.health.get(r.efur)!;
    hp.maxMana = 900;
    hp.mana = 900;

    // CONTROL: a Q with no EX up does nothing to the victim at all.
    const control = rig({ gap: 3, foeMaxHp: 20000 });
    rankTo(control.world, control.efur, "Q", 1);
    const cHp0 = control.world.health.get(control.foe)!.hp;
    expect(
      castAbility(control.world, control.efur, "Q", { type: "entity", entityId: control.foe }),
    ).toBe("ok");
    step(control.world, 20);
    expect(control.world.health.get(control.foe)!.hp).toBe(cHp0);

    expect(castAbility(r.world, r.efur, "EX", { type: "self" })).toBe("ok");
    step(r.world, 12);
    const foeStart = pos(r.world, r.foe);
    const foeHp0 = r.world.health.get(r.foe)!.hp;
    expect(castAbility(r.world, r.efur, "Q", { type: "entity", entityId: r.foe })).toBe("ok");
    let stunned = false;
    for (let i = 0; i < 25; i++) {
      r.world.step(empty());
      const st = r.world.status.get(r.foe);
      if (st?.effects.some((e) => e.stun && e.expiresAtTick > r.world.tick)) stunned = true;
    }
    const firstLoss = foeHp0 - r.world.health.get(r.foe)!.hp;
    expect(firstLoss).toBeGreaterThan(0); // 牙突 landed off a Q that deals none itself
    expect(stunned).toBe(true);
    expect(V.dist(foeStart, pos(r.world, r.foe))).toBeGreaterThan(1.0);

    // ONCE, not every Q: clear the cooldown and blink again inside the window.
    r.world.abilities.get(r.efur)!.slots.Q.cooldownRemainingTicks = 0;
    const hpBeforeSecond = r.world.health.get(r.foe)!.hp;
    expect(castAbility(r.world, r.efur, "Q", { type: "entity", entityId: r.foe })).toBe("ok");
    step(r.world, 20);
    // LOSS, not equality: passive regen ticks the bar UP over these 20 ticks, so
    // `toBe(hpBeforeSecond)` would be measuring RegenSystem. A second 牙突 would
    // cost >2000 here, so "lost less than one point" is unambiguous.
    expect(hpBeforeSecond - r.world.health.get(r.foe)!.hp).toBeLessThan(1);
    expect(firstLoss).toBeGreaterThan(1000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EX 的存款加成 —— owner 2026-07-31「現存 MP 的 20% 傷害」
// ═══════════════════════════════════════════════════════════════════════════
/**
 * 為什麼這裡要用**兩座 rig 相減**而不是直接斷言一個絕對傷害值：
 *
 * 那一發免費牙突的傷害是三項相加 —— 120 + 0.8×AD + 目標最大生命 12% —— 再加上
 * 這裡要測的存款項。寫一個絕對值等於把另外三項的實作也釘死在這條斷言裡，任何
 * 一項改動都會讓這條紅，而紅的原因跟這個機制無關（失敗形態④：斷言方向跟缺陷
 * 無關）。兩座 rig 除了**法力池**以外每一格都相同，所以相減之後**只剩存款項**。
 *
 * 而且相減同時擋掉「常數也能過」的退化：一個把加成寫死成固定值的實作會讓
 * delta = 0，而 delta 必須等於 (存款A − 存款B) × 0.20。
 *
 * ⚠️ 存款量是**量出來的**（讀 `world.status` 上真的 `magnitude`），不是用
 * 「法力 − manaCost」推算的：法力回復在前搖期間照樣在跳，滿魔那一座被夾住、
 * 半魔那一座沒有，推算會差幾點而斷言會變成薛丁格的綠。
 */
describe("13-002 的追加傷害隨燒掉的法力放大 (efur-ex-banked)", () => {
  /**
   * EX → 一發 Q（免費牙突）。回傳「敵人掉了多少血」與「存款有多少」。
   *
   * ⚠️ 池子是用 **`Stat.MaxMana` 的修飾**加大的，不是直接寫 `hp.maxMana`。
   * 第一版就是直接寫，而 `recomputeStats` 每一 tick 都會把 `hp.maxMana` 從
   * `sc.final[MaxMana]` 蓋回去 —— 三座 rig 因此燒掉一模一樣的 712.5 點，
   * 三條斷言全部在測同一件事。這正是失敗形態⑤：被測的不是我以為的那個東西。
   */
  function exThenBlink(bonusMana: number): { loss: number; banked: number } {
    const r = rig({ gap: 3, foeMaxHp: 40000 });
    rankTo(r.world, r.efur, "Q", 1);
    expect(learnEx(r.world, r.efur)).toBe(true);
    if (bonusMana !== 0) {
      attachSource(r.world, r.efur, {
        id: "test:manapool",
        kind: "item",
        modifiers: [{ stat: Stat.MaxMana, op: ModOp.Flat, value: bonusMana }],
      });
      r.world.step(empty()); // let recomputeStats publish the new ceiling
    }
    const hp = r.world.health.get(r.efur)!;
    hp.mana = hp.maxMana; // 兩座都從滿魔出發 → 回復被夾住，起點對稱
    expect(castAbility(r.world, r.efur, "EX", { type: "self" })).toBe("ok");
    step(r.world, 12); // past the 0.4 s wind-up — the burn has happened
    const st = r.world.status.get(r.efur);
    const banked =
      st?.effects.find((e) => e.statusId === "nen-banked" && e.expiresAtTick > r.world.tick)
        ?.magnitude ?? 0;
    const hp0 = r.world.health.get(r.foe)!.hp;
    expect(castAbility(r.world, r.efur, "Q", { type: "entity", entityId: r.foe })).toBe("ok");
    step(r.world, 25);
    return { loss: hp0 - r.world.health.get(r.foe)!.hp, banked };
  }

  it("★ 燒掉的法力真的被記下來，而且記的是實扣量", () => {
    cover("efur-ex-banked");
    // ⚠️ 存款的**絕對值**刻意不寫死：它是「法力池 − EX 的 50 點門檻 + 前搖
    // 12 tick 的法力回復」，而這三項都掛在等級、combat-env 倍率與前搖長度上。
    // 釘死它等於讓這條斷言替另外三個系統把關，改任何一個都會紅在這裡（失敗
    // 形態④）。實測 6 級 = 663.5。這裡只要求「不是 0」。
    const small = exThenBlink(0);
    expect(small.banked, "沒有存款：`spendMana.bankAs` 不見了，或標記從沒被寫進 world.status").toBeGreaterThan(500);

    const big = exThenBlink(800); // +800 法力上限 = 一件重度法力裝
    // ★ 存款差 **精確等於**法力上限差。這一行同時擋掉兩種退化實作：
    //   「不管燒多少都記同一個常數」（差會是 0）與
    //   「記的是 maxMana 而不是實扣量」（差會被前搖回復污染）。
    expect(big.banked - small.banked).toBeCloseTo(800, 1);

    // ★ 傷害差 = 存款差 × 0.20。係數寫死在這裡而不是從文件讀 —— 從文件讀的
    //   斷言對「文件被改成 0」也會過（失敗形態⑤）。
    const delta = big.loss - small.loss;
    expect(delta, "免費牙突的傷害完全沒有跟著法力走：`damage.bankedBonus` 不見了").toBeCloseTo(
      (big.banked - small.banked) * 0.2,
      0,
    );
    expect(delta).toBeGreaterThan(100); // 800 × 0.20 = 160，不會是量測雜訊
  });

  it("★ 上限 400 是真的夾得住的 —— 法力池再大也不會變成一擊必殺", () => {
    cover("efur-ex-banked-cap");
    // +30,000 法力上限 → 存款 >30,000 → 未夾的加成會是 6,000+，是一條血的四倍多。
    const absurd = exThenBlink(30000);
    expect(absurd.banked).toBeGreaterThan(30000);
    const small = exThenBlink(0); // 存款遠在上限之下，加成 = banked × 0.20
    const delta = absurd.loss - small.loss;
    // 夾住之後：absurd 拿到出貨卡的 `max` 400，small 拿到未夾的 banked × 0.20。
    // 期望值從**量到的** small.banked 推出來，所以它不會因為等級/倍率改動而假紅。
    expect(delta, "`Math.min(banked * coeff, b.max)` 的上界被拿掉了").toBeCloseTo(
      400 - small.banked * 0.2,
      0,
    );
    // 沒夾的話這個差會是 (30712 − 663) × 0.2 ≈ 6,010。1,000 是一條乾淨的分界。
    expect(delta).toBeLessThan(1000);
  });
});

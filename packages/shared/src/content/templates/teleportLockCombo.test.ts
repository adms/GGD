/**
 * 瞬移貼身 (tpl-teleport) 與 鎖定連段 (tpl-lock-combo) 的行為守衛。
 * GH#244 第 3 階 · 機器組 1/3.
 *
 * ---------------------------------------------------------------------------
 * 這裡刻意不測什麼
 * ---------------------------------------------------------------------------
 * ⛔ 不寫「模板有 N 個欄位」「schema 收得下」「family 在 FAMILIES 裡」這種
 *    **屬性**斷言 (七種失敗形態 ⑦)。一個模板的問題永遠是
 *   「操作者在鑄技工坊開這張卡、直接存檔，遊戲裡到底會發生什麼」。
 * ⛔ 也不手寫 EffectDef 餵給 handler (失敗形態 ⑤)。每一條都走完整條出貨路徑：
 *      磁碟上的 template@1 doc
 *        → `defaultParamsFor`  (表單按存檔送出的東西)
 *        → `expand()`          (registry 註冊時跑的東西)
 *        → `zEffectDefUnion`   (內容 schema 真的收不收)
 *        → `runEffects()`      (模擬器真的派發的 dispatch)
 *        → `world.step()`      → 讀 health / transform
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄（每一條都真的做過，見任務回報的 mutation 欄）
 * ---------------------------------------------------------------------------
 *  tpl-teleport
 *   · expand 的 leap `mode` 由 "toPoint" 改成 "inPlace"  → tp-arrives 紅
 *   · leap 換成 `{kind:"dash", mode:"toPoint", speed:6, maxDistance:8}`
 *                                                        → tp-outruns-a-walk 紅
 *   · damage 由 `onLand` 搬到頂層 effects                 → tp-damage-after-arrival 紅
 *   · rally 分支拿掉 `dragToCaster: true`                 → tp-rally-pulls-the-ALLY 紅
 *   · rally 分支的 applyTo 由 "target" 改回 "self"        → tp-rally-pulls-the-ALLY 紅
 *   · arriveRadius.min 由 50 改回 0 (預設也改 0)          → tp-radius-cannot-silence-damage 紅
 *  tpl-lock-combo
 *   · expand 拿掉 `dot` 那一段                            → lc-hits-land-over-time 紅
 *   · finisher 由 leap.onLand 搬到頂層 effects            → lc-finisher-lands-last 紅
 *   · `lockTarget` 分支永遠不 push applyStatus            → lc-lock-stops-the-victim 紅
 *   · `casterGuard` 分支永遠不 push invulnerable          → lc-guard-protects-the-caster 紅
 *   · comboSec 由 `hitCount*interval` 改成常數 2.0        → lc-length-is-derived 紅
 *  兩者共用
 *   · tpl-teleport.castTimeSec 預設改成家族最大值 1.5     → defaults-are-not-the-family-extreme 紅
 *   · tpl-lock-combo.perHitDamage 預設改成 400            → defaults-are-not-the-family-extreme 紅
 *   · 任一 numeric slot 的 default 調到等於自己的 max      → bounds-have-headroom 紅
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cover } from "../../../testkit/cover";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { zEffectDefUnion } from "../schema/effect";
import { defaultParamsFor } from "./paramsSchema";
import { expand } from "./expand";
import { SimWorld } from "../../sim/SimWorld";
import { SKELETON_ARENA } from "../../sim/world/ArenaDef";
import { runEffects } from "../../sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "../../sim/effects/effect";
import { asSeatId, asTeamId, type EntityId } from "../../ids";
import * as V from "../../sim/math/vec2";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/ability-templates",
);

function loadTemplate(id: string): TemplateDoc {
  return zTemplateDoc.parse(JSON.parse(readFileSync(join(TEMPLATES_DIR, `${id}.json`), "utf8")));
}

const Z0 = SKELETON_ARENA.zones[0]!;
const C = Z0.center;

interface Rig {
  world: SimWorld;
  caster: EntityId;
  other: EntityId;
  casterStart: V.Vec2;
  otherStart: V.Vec2;
}

/**
 * Caster at the zone centre, one more body `gap` units east on the obstacle-free
 * z = 0 corridor.
 *
 * `friendly` exists because the two machines need OPPOSITE team setups and
 * getting it wrong is silent, not loud:
 *   · a blink-onto-an-enemy and a lock-combo need HOSTILE teams, because
 *     `LeapSystem.detonate` collects its landing payload with
 *     `enemiesInCircle(world, casterId, …)` — a same-team body is not collected
 *     at all and the arrival damage lands on nobody while every assertion about
 *     POSITION still passes;
 *   · the rally destination needs a FRIENDLY body, because that is what
 *     `targetsEnemies: false` means and an enemy would be rejected upstream.
 */
function rig(opts?: { gap?: number; friendly?: boolean }): Rig {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const place = (x: number, seat: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: 0 },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.1,
      zone: 0,
    });
    world.health.set(id, {
      hp: 5000,
      maxHp: 5000,
      mana: 0,
      maxMana: 0,
      alive: true,
      shields: [],
    });
    world.team.set(id, { teamId: asTeamId(seat), seatId: asSeatId(seat) });
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
  const caster = place(C.x, 0);
  const other = place(C.x + (opts?.gap ?? 8), opts?.friendly === true ? 0 : 1);
  world.rebuildGrid();
  return {
    world,
    caster,
    other,
    casterStart: { ...world.transform.get(caster)!.pos },
    otherStart: { ...world.transform.get(other)!.pos },
  };
}

/** template + (optionally overridden) form params → the effects the game runs. */
function effectsFor(id: string, overrides: Record<string, unknown> = {}): EffectDef[] {
  const t = loadTemplate(id);
  const params: Record<string, unknown> = { ...defaultParamsFor(t), ...overrides };
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete params[k];
  return expand(t, params).effects;
}

function fire(r: Rig, effects: EffectDef[], origin: string, point?: V.Vec2): void {
  const ctx: EffectContext = {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.other],
    ...(point !== undefined ? { point } : {}),
    origin,
    rng: r.world.rng,
  };
  runEffects(effects, ctx);
}

const pos = (r: Rig, id: EntityId): V.Vec2 => ({ ...r.world.transform.get(id)!.pos });
const hp = (r: Rig, id: EntityId): number => r.world.health.get(id)!.hp;
const stepN = (r: Rig, n: number): void => {
  for (let i = 0; i < n; i++) r.world.step(new Map());
};

// ===========================================================================
// tpl-teleport
// ===========================================================================

describe("tpl-teleport — 瞬移貼身", () => {
  it("the card an operator saves expands into schema-valid effects", () => {
    cover("tp-expands");
    const t = loadTemplate("tpl-teleport");
    expect(t.status).toBe("enabled");
    const effects = effectsFor("tpl-teleport");
    expect(effects.length).toBeGreaterThan(0);
    // The CONTENT schema is the real gate on the way into the registry —
    // TypeScript agreeing is not the same thing.
    for (const e of effects) expect(() => zEffectDefUnion.parse(e)).not.toThrow();
  });

  it("puts the CASTER on the target's own position (tp-arrives)", () => {
    cover("tp-arrives");
    const r = rig({ gap: 8 });
    // A "targeted" cast hands the expander ctx.point = the target's position;
    // that is what abilitySystem does at cast time (case "targeted").
    fire(r, effectsFor("tpl-teleport"), "ability:test.teleport", r.otherStart);
    stepN(r, 6);
    // The bodies separate on contact, so "landed on him" is a small circle, not
    // an exact coordinate. Started 8 units away; ends touching.
    expect(V.dist(pos(r, r.caster), r.otherStart)).toBeLessThan(1.5);
    expect(V.dist(pos(r, r.caster), r.casterStart)).toBeGreaterThan(6);
  });

  it("covers ground no WALK could cover in the same time (tp-outruns-a-walk)", () => {
    cover("tp-outruns-a-walk");
    // 失敗形態 ④ 的解藥: 「最後站對地方」對 dash 與 teleport 都會過。真正的
    // 主張是「它是瞬移」——2 tick 內橫跨 8 個單位。對照組是同一個世界、同樣
    // 2 tick、什麼都不放，量到的位移就是這個世界裡「不瞬移能走多遠」。
    const control = rig({ gap: 8 });
    stepN(control, 2);
    const walked = V.dist(pos(control, control.caster), control.casterStart);

    const r = rig({ gap: 8 });
    fire(r, effectsFor("tpl-teleport"), "ability:test.teleport", r.otherStart);
    stepN(r, 2); // travelSec 0.067 s @30Hz = the 2-tick MIN_LEAP_TICKS floor
    const blinked = V.dist(pos(r, r.caster), r.casterStart);

    expect(walked).toBeLessThan(1);
    expect(blinked).toBeGreaterThan(6);
  });

  it("resolves its damage AT THE ARRIVAL, not on the cast tick (tp-damage-after-arrival)", () => {
    cover("tp-damage-after-arrival");
    const r = rig({ gap: 8 });
    const withDamage = effectsFor("tpl-teleport", {
      damage: { perRank: [300], ratios: [] },
    });
    const before = hp(r, r.other);
    fire(r, withDamage, "ability:test.teleport", r.otherStart);
    // ONE tick after the cast the caster is still mid-flight (the arc is 2
    // ticks), so the arrival payload must not have been paid yet.
    stepN(r, 1);
    expect(hp(r, r.other)).toBe(before);
    stepN(r, 3);
    expect(hp(r, r.other)).toBeLessThanOrEqual(before - 300);
  });

  it("a cleared 傷害 field really means no arrival damage", () => {
    cover("tp-damage-optional");
    const r = rig({ gap: 8 });
    const before = hp(r, r.other);
    fire(r, effectsFor("tpl-teleport"), "ability:test.teleport", r.otherStart);
    stepN(r, 4);
    // The shipped default carries NO damage slot value at all, so the blink is
    // pure repositioning. (Auto-attacks need far longer than 4 ticks to wind up,
    // so this window is clean.)
    expect(hp(r, r.other)).toBe(before);
  });

  it("rally moves the ALLY to the caster, not the caster to the ally (tp-rally-pulls-the-ALLY)", () => {
    cover("tp-rally-pulls-the-ALLY");
    const r = rig({ gap: 8, friendly: true });
    fire(
      r,
      effectsFor("tpl-teleport", { destination: "rallyToCaster" }),
      "ability:test.teleport-rally",
      r.otherStart,
    );
    stepN(r, 6);
    // 84-002 我只想確定你在這裡 (j:51024) drags the ALLY in; the caster does not
    // budge. Both halves are asserted — swapping the subject passes one and
    // fails the other.
    expect(V.dist(pos(r, r.other), r.casterStart)).toBeLessThan(1.5);
    expect(V.dist(pos(r, r.caster), r.casterStart)).toBeLessThan(1.0);
  });

  it("抵達範圍 can never be 0, so a filled-in 傷害 can never silently vanish", () => {
    cover("tp-radius-cannot-silence-damage");
    // `LeapSystem.detonate` returns an EMPTY subject list at landRadius 0, so a
    // 0-radius arrival would accept damage in the form and deal none. The slot's
    // floor is the guard, and this asserts the CONSEQUENCE, not the number: the
    // smallest radius the form permits still pays out.
    const t = loadTemplate("tpl-teleport");
    const min = t.params["arriveRadius"]!.min!;
    const r = rig({ gap: 8 });
    const before = hp(r, r.other);
    fire(
      r,
      effectsFor("tpl-teleport", { arriveRadius: min, damage: { perRank: [200], ratios: [] } }),
      "ability:test.teleport",
      r.otherStart,
    );
    stepN(r, 4);
    expect(hp(r, r.other)).toBeLessThanOrEqual(before - 200);
  });
});

// ===========================================================================
// tpl-lock-combo
// ===========================================================================

/** hitCount × hitIntervalSec, in whole sim ticks, for the shipped defaults. */
function comboTicks(overrides: Record<string, unknown> = {}): number {
  const t = loadTemplate("tpl-lock-combo");
  const p = { ...defaultParamsFor(t), ...overrides };
  return Math.round((p["hitCount"] as number) * (p["hitIntervalSec"] as number) * 30);
}

interface Timeline {
  /** ticks (1-based from the cast) on which a 連段擊 (100) was paid */
  hits: number[];
  /** tick on which the ≥450 終結技 landed, or -1 */
  finisher: number;
}

/**
 * Fire the combo and watch the victim's HP for `ticks`, classifying every drop.
 *
 * The 連段 default is 100/hit and the finisher 450, so the two are separable by
 * size — no reading of the effect OBJECT, only of `world.health`.
 */
function timeline(overrides: Record<string, unknown> = {}, extraTicks = 40): Timeline {
  const r = rig({ gap: 1.5 });
  fire(r, effectsFor("tpl-lock-combo", overrides), "ability:test.lock-combo");
  const out: Timeline = { hits: [], finisher: -1 };
  let prev = hp(r, r.other);
  for (let i = 1; i <= comboTicks(overrides) + extraTicks; i++) {
    r.world.step(new Map());
    const now = hp(r, r.other);
    const d = prev - now;
    if (d >= 450) out.finisher = i;
    else if (d > 0) out.hits.push(i);
    prev = now;
  }
  return out;
}

describe("tpl-lock-combo — 鎖定連段", () => {
  it("the card an operator saves expands into schema-valid effects", () => {
    cover("lc-expands");
    const t = loadTemplate("tpl-lock-combo");
    expect(t.status).toBe("enabled");
    const effects = effectsFor("tpl-lock-combo");
    for (const e of effects) expect(() => zEffectDefUnion.parse(e)).not.toThrow();
  });

  it("pays the 連段 out one hit at a time, on the authored cadence (lc-hits-land-over-time)", () => {
    cover("lc-hits-land-over-time");
    const t = timeline();
    // EXACTLY hitCount instalments — the whole point of the machine. A single
    // lump (or a 傷害 hoisted to the top level) collapses this to 1.
    expect(t.hits.length).toBe(defaultParamsFor(loadTemplate("tpl-lock-combo"))["hitCount"]);
    // …and they are spaced by the authored interval (0.4 s @30 Hz = 12 ticks).
    for (let i = 1; i < t.hits.length; i++) {
      expect(t.hits[i]! - t.hits[i - 1]!).toBe(12);
    }
    // Nothing on the cast tick itself: the first payout is one interval away.
    expect(t.hits[0]).toBeGreaterThan(1);
  });

  it("keeps the 終結技 until after the LAST 連段擊 (lc-finisher-lands-last)", () => {
    cover("lc-finisher-lands-last");
    const t = timeline();
    expect(t.finisher).toBeGreaterThan(0);
    expect(t.finisher).toBeGreaterThan(t.hits[t.hits.length - 1]!);
    // ⚠️ MEASURED, and not what the arithmetic predicts: the finisher rides
    // `leap.onLand`, and LeapSystem FREEZES the arc while the flyer is in
    // hitstop — every 連段擊 the caster deals stops his own clock for a few
    // ticks. So the touchdown lands LATER than hitCount × interval (60 ticks of
    // combo → ~69 ticks of arc at the shipped defaults). It is deterministic
    // (hitstop is), it keeps the finisher last, and it is named here rather
    // than papered over: the victim's stun uses the exact 60, so a locked
    // victim is free for the tail of the caster's own recovery.
    expect(t.finisher).toBeGreaterThanOrEqual(comboTicks());
  });

  it("整段長度 = 次數 × 間隔, with no slot that can disagree (lc-length-is-derived)", () => {
    cover("lc-length-is-derived");
    // 陷阱 ③: the length is DERIVED. Proof is behavioural — the dot's payout
    // COUNT and its last payout's tick both track hitCount exactly (dot payouts
    // are not hitstopped, so this arm is exact arithmetic).
    const four = timeline({ hitCount: 4 });
    const eight = timeline({ hitCount: 8 });
    expect(four.hits.length).toBe(4);
    expect(eight.hits.length).toBe(8);
    expect(eight.hits[7]! - eight.hits[0]!).toBe(2 * (four.hits[3]! - four.hits[0]!) + 12);
    // and there is no second field that could contradict it
    expect(loadTemplate("tpl-lock-combo").params["durationSec"]).toBeUndefined();
  });

  it("the lock really pins the victim in place (lc-lock-stops-the-victim)", () => {
    cover("lc-lock-stops-the-victim");
    // The stun's SHIPPED consumer is `movementHold` → MovementSystem, so the
    // observable is a body that has somewhere to be and cannot get there.
    const walked = (lockTarget: string): number => {
      const r = rig({ gap: 1.5 });
      fire(r, effectsFor("tpl-lock-combo", { lockTarget }), "ability:test.lock-combo");
      const start = pos(r, r.other);
      for (let i = 0; i < comboTicks(); i++) {
        // re-issued every tick, exactly as a held movement input would be
        r.world.nav.get(r.other)!.moveTarget = { x: start.x + 20, z: 0 };
        r.world.step(new Map());
      }
      return pos(r, r.other).x - start.x;
    };
    expect(walked("none")).toBeGreaterThan(3);
    expect(walked("stun")).toBeLessThan(0.5);
    expect(walked("root")).toBeLessThan(0.5);
  });

  it("演出期間施法者真的打不到 (lc-guard-protects-the-caster)", () => {
    cover("lc-guard-protects-the-caster");
    // The victim is left UNLOCKED in both arms so the ONLY difference is the
    // caster's own 無敵. The incoming hit is a real `damage` EffectDef put
    // through the real `runEffects` dispatch from the victim's side.
    const takenMidCombo = (casterGuard: string): number => {
      const r = rig({ gap: 1.5 });
      fire(
        r,
        effectsFor("tpl-lock-combo", { lockTarget: "none", casterGuard }),
        "ability:test.lock-combo",
      );
      stepN(r, 10); // well inside the 60-tick 演出
      const before = hp(r, r.caster);
      runEffects([{ kind: "damage", damageType: "magic", amount: { perRank: [400] } }], {
        world: r.world,
        caster: r.other,
        rank: 1,
        targets: [r.caster],
        origin: "ability:test.retaliation",
        rng: r.world.rng,
      });
      stepN(r, 2);
      return before - hp(r, r.caster);
    };
    expect(takenMidCombo("none")).toBeGreaterThan(0);
    expect(takenMidCombo("all")).toBe(0);
  });
});

// ===========================================================================
// the two numeric-hygiene rules the previous round bought with real defects
// ===========================================================================

describe("兩台新機器的數值衛生", () => {
  const IDS = ["tpl-teleport", "tpl-lock-combo"] as const;

  it("no default sits on its own ceiling (bounds-have-headroom)", () => {
    cover("bounds-have-headroom");
    // The apexHeight disease: `max: 1000` while the data's own extreme was
    // EXACTLY 1000, so asking for one unit more than 原作 was a validation
    // error. A default equal to its max is the same smell one step earlier.
    for (const id of IDS) {
      for (const [name, slot] of Object.entries(loadTemplate(id).params)) {
        if (slot.type !== "number" || slot.max === undefined) continue;
        expect(slot.default, `${id}.${name} default is its own max`).not.toBe(slot.max);
      }
    }
  });

  it("defaults are the family MEDIAN, not the family extreme (defaults-are-not-the-family-extreme)", () => {
    cover("defaults-are-not-the-family-extreme");
    // Measured family extremes, re-read off war3map.j for this round:
    //   teleport.castTimeSec   max 1.50 s  (A0YA 和諧世界 sleep 1.5 before 集結)
    //   ⚠️ 這一格的母體要挑過, 而且挑法要講出來。全 11 支的中位數是 **0**,
    //   因為六支的位移根本不是「施放」觸發的 —— 82-02/13-03 是時窗內的移動
    //   指令, A0EY/A10U 是道具, A10H 是受傷結算, A0IS 是拋甩的中段。這個欄位
    //   描述的是「按下去到消失之間有多久」, 對那六支沒有意義。真正落在這個
    //   問題上的五支是 [0.10, 0.27, 0.50, 0.50, 1.50], 中位數 0.50, 同時也是
    //   眾數 (A07M 空破圓斬 / A05T 萊丁快速劍 各 TriggerSleepAction 0.50)。
    //   lock-combo.hitCount    max 9       (A0U5 52-002 射殺百頭, 9段加速連擊)
    //   lock-combo.perHitDamage max 400    (A0SG 24-002 來~快點吃吧, 5×400)
    //   lock-combo.finisherDamage max 1800 (20-04 EX ExcaliburMAX 終結斬)
    const tp = loadTemplate("tpl-teleport").params;
    expect(tp["castTimeSec"]!.default).toBeLessThan(1.5);
    const lc = loadTemplate("tpl-lock-combo").params;
    expect(lc["hitCount"]!.default).toBeLessThan(9);
    const perHit = lc["perHitDamage"]!.default as { perRank: number[] };
    expect(perHit.perRank[0]).toBeLessThan(400);
    const fin = lc["finisherDamage"]!.default as { perRank: number[] };
    expect(fin.perRank[0]).toBeLessThan(1800);
  });
});

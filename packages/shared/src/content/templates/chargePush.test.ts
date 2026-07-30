/**
 * 衝鋒推撞 (tpl-charge-push) 的行為守衛 + 「預設值不是家族極值」的數值守衛。
 *
 * ---------------------------------------------------------------------------
 * 這裡刻意不測什麼
 * ---------------------------------------------------------------------------
 * ⛔ 不寫 `expect(SIM_CAPABILITIES.knockback).toBe(true)` 這種**屬性**斷言
 *    (七種失敗形態 ⑦)。那個旗標翻成 true 之後，真正該回答的問題是
 *    「操作者在鑄技工坊開一張這個模板的卡、直接存檔，遊戲裡到底會發生什麼」，
 *    而那個問題只有跑真的 `SimWorld` 才答得出來。
 *
 * 所以下面每一條都走完整條出貨路徑：
 *    磁碟上的 template@1 doc
 *      → `defaultParamsFor` (編輯器表單按存檔時送出的東西)
 *      → `expand()`         (registry 註冊技能時跑的東西)
 *      → `zEffectDefUnion`  (內容 schema 真的收不收)
 *      → `runEffects()`     (模擬器真的派發的那個 dispatch)
 *      → `world.step()`     → 讀 `world.transform.pos`
 * 沒有一行是自己手寫 EffectDef 餵給 handler 的 (失敗形態 ⑤：被測的不是出貨的
 * 那個)。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄（每一條都真的做過，見任務回報的 mutation 欄）
 * ---------------------------------------------------------------------------
 *   · `SIM_CAPABILITIES.knockback` 改回 false            → cp-knockback-reachable 紅
 *   · expand 的 `charge-push` 分支整個刪掉                → cp-expands / cp-charge 全紅
 *   · onLand 的 knockback push 改成不 push (拿掉那一段)   → cp-knockback-reachable 紅
 *   · knockback 從 `onLand` 搬到頂層 `effects`            → cp-push-lands-at-destination 紅
 *   · tpl-single-strike.damage 改回 2300                  → defaults-not-family-max 紅
 *   · tpl-on-attack.bonusDamage 改回 9999                 → defaults-not-family-max 紅
 *   · tpl-traveling-wave.stepCount 改回 70                → defaults-not-family-max 紅
 *   · tpl-leap-strike.durationSec 改回 1.44               → defaults-not-family-max 紅
 *   · tpl-instant-blast.castTimeSec 改回 1.0              → defaults-not-family-max 紅
 *   · tpl-leap-strike.apexHeight.max 改回 1000            → bounds-have-headroom 紅
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cover } from "../../../testkit/cover";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { zEffectDefUnion } from "../schema/effect";
import { defaultParamsFor } from "./paramsSchema";
import { expand, GGD_PER_WC3 } from "./expand";
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
  victim: EntityId;
  casterStart: V.Vec2;
  victimStart: V.Vec2;
}

/**
 * Two bodies on the obstacle-free z = 0 corridor east of the zone centre.
 *
 * ⚠️ THE TEAMS MUST BE HOSTILE, and that is the opposite of what
 * knockback.test.ts does. Worth writing down, because getting it wrong produced
 * a green-looking 0.1-unit "shove" on the first run of this file:
 * `LeapSystem.detonate` re-resolves its subjects with `enemiesInCircle(world,
 * casterId, …)` at touchdown, so a same-team victim is NOT COLLECTED AT ALL and
 * the knockback silently applies to nobody. knockback.test.ts can afford same-
 * team because it hands `ctx.targets` straight to the handler; this file goes
 * through the landing-point collector, which filters by team.
 *
 * The cost of hostile teams is that `step()` lets them auto-acquire and swing,
 * and every landed basic attack fires its OWN GH#193 knockback. That pollution
 * is handled by MEASURING A DIFFERENCE (see `shoveDelta`) rather than by
 * removing it: the same brawl happens in both arms of the comparison.
 */
function rig(opts?: { victimAt?: number }): Rig {
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
      hp: 3000,
      maxHp: 3000,
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
  const victim = place(C.x + (opts?.victimAt ?? 8), 1);
  world.rebuildGrid();
  return {
    world,
    caster,
    victim,
    casterStart: { ...world.transform.get(caster)!.pos },
    victimStart: { ...world.transform.get(victim)!.pos },
  };
}

/** The effects an OPERATOR gets by opening the template and pressing save. */
function defaultEffects(id: string): EffectDef[] {
  const t = loadTemplate(id);
  return expand(t, defaultParamsFor(t)).effects;
}

function run(r: Rig, effects: EffectDef[], point: V.Vec2, ticks: number): void {
  const ctx: EffectContext = {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.victim],
    point,
    origin: "ability:test.charge-push",
    rng: r.world.rng,
  };
  runEffects(effects, ctx);
  for (let i = 0; i < ticks; i++) r.world.step(new Map());
}

const pos = (r: Rig, id: EntityId): V.Vec2 => ({ ...r.world.transform.get(id)!.pos });

/**
 * Signed eastward displacement of the victim after a full charge, with the
 * template's own push either filled in or cleared. Same seed and same geometry
 * both ways, so the two results are directly comparable and the basic-attack
 * knockback both runs generate cancels out of the difference.
 */
function shoveDelta(withPush: boolean): number {
  const t = loadTemplate("tpl-charge-push");
  const params = { ...defaultParamsFor(t) };
  if (!withPush) delete params["pushDistance"];
  const r = rig({ victimAt: 5 });
  run(r, expand(t, params).effects, { x: r.casterStart.x + 5, z: 0 }, 60);
  return pos(r, r.victim).x - r.victimStart.x;
}

// ---------------------------------------------------------------------------

describe("tpl-charge-push — the card an operator saves is a runnable skill", () => {
  it("is enabled, and its defaults expand into schema-valid effects", () => {
    cover("cp-expands");
    const t = loadTemplate("tpl-charge-push");
    expect(t.status).toBe("enabled");
    const effects = defaultEffects("tpl-charge-push");
    expect(effects.length).toBeGreaterThan(0);
    // The CONTENT schema has to accept them, not just TypeScript — this is the
    // gate a doc passes through on its way into the registry.
    for (const e of effects) expect(() => zEffectDefUnion.parse(e)).not.toThrow();
  });

  it("really moves the CASTER across the arena (cp-charge)", () => {
    cover("cp-charge");
    const r = rig();
    // Charge 5 GGD units east. dashDurationSec 0.4 @30Hz = 12 ticks, so 30 is
    // comfortably past touchdown.
    const target = { x: r.casterStart.x + 5, z: 0 };
    run(r, defaultEffects("tpl-charge-push"), target, 30);

    const moved = V.dist(pos(r, r.caster), r.casterStart);
    expect(moved).toBeGreaterThan(4);
    expect(pos(r, r.caster).x).toBeGreaterThan(r.casterStart.x + 4);
  });

  it("the charge is a TRAVEL, not a teleport — the body is somewhere in between", () => {
    cover("cp-charge-trajectory");
    // 失敗形態 ⑦ 的解藥: 終點對了不代表過程對了, 而玩家看到的是過程。
    const r = rig();
    const target = { x: r.casterStart.x + 5, z: 0 };
    const ctx: EffectContext = {
      world: r.world,
      caster: r.caster,
      rank: 1,
      targets: [r.victim],
      point: target,
      origin: "ability:test.charge-push",
      rng: r.world.rng,
    };
    runEffects(defaultEffects("tpl-charge-push"), ctx);

    const path: V.Vec2[] = [];
    for (let i = 0; i < 12; i++) {
      r.world.step(new Map());
      path.push(pos(r, r.caster));
    }
    // Strictly monotonic eastward progress, and at least one MID-flight sample
    // that is neither the origin nor the destination.
    for (let i = 1; i < path.length; i++) {
      expect(path[i]!.x).toBeGreaterThanOrEqual(path[i - 1]!.x);
    }
    const mid = path[Math.floor(path.length / 2)]!;
    expect(mid.x).toBeGreaterThan(r.casterStart.x + 0.5);
    expect(mid.x).toBeLessThan(target.x - 0.5);
  });

  it("the knockback the flipped capability unlocked actually shoves a body (cp-knockback-reachable)", () => {
    cover("cp-knockback-reachable");
    // THE POINT OF THE WHOLE CHANGE. Not 「旗標是 true」 — a real body, standing
    // where the charge lands, is measurably further away afterwards.
    //
    // Measured as a DIFFERENCE between two otherwise-identical runs (same seed,
    // same arena, same charge, same brawl) that differ only in whether the
    // template's own `pushDistance` is filled in. Anything the basic-attack
    // exchange contributes is present in BOTH arms and cancels; what is left is
    // the shove this template authored.
    const withPush = shoveDelta(true);
    const noPush = shoveDelta(false);

    expect(
      withPush - noPush,
      "filling in pushDistance changed nothing about where the victim ended up — " +
        "the authored knockback is not reaching the sim",
    ).toBeGreaterThan(2);
    // pushFrom "caster" default = away from the charger, i.e. further east.
    expect(withPush).toBeGreaterThan(noPush);
  });

  it("the shove is resolved at the DESTINATION, not at the cast origin (cp-push-lands-at-destination)", () => {
    cover("cp-push-lands-at-destination");
    // This is the assertion that makes the leap-vs-dash decision load-bearing:
    // `dash` has no arrival hook, so a dash-based expansion would have to emit
    // the shove as a TOP-LEVEL effect, which resolves on the CAST TICK against
    // `ctx.targets` — at the origin, against whoever the caster was aiming at.
    //
    // ⚠️ THIS TEST WAS WRONG ON ITS FIRST WRITING and the mutation run is what
    // said so: it passed `targets: []`, so a hoisted shove had NO SUBJECTS and
    // did nothing, and the guard stayed green with the implementation broken
    // (失敗形態 ③). `ctx.targets` MUST contain the bystander — that is the only
    // way the broken arrangement has something to grab.
    const r = rig({ victimAt: 0.6 }); // right beside the caster, at the origin
    const target = { x: r.casterStart.x + 9, z: 0 }; // charge far past it
    const ctx: EffectContext = {
      world: r.world,
      caster: r.caster,
      rank: 1,
      targets: [r.victim],
      point: target,
      origin: "ability:test.charge-push",
      rng: r.world.rng,
    };
    runEffects(defaultEffects("tpl-charge-push"), ctx);
    // Only 15 ticks: the charge itself takes 12, so this window is over before
    // the two bodies can re-acquire and start a brawl that would muddy the read.
    // A cast-time shove would already have moved the bystander ~0.6/tick here.
    for (let i = 0; i < 15; i++) r.world.step(new Map());

    expect(
      V.dist(pos(r, r.victim), r.victimStart),
      "a body standing at the CAST ORIGIN was shoved by a charge that landed 9 " +
        "units away — the knockback is resolving at cast time, not at touchdown",
    ).toBeLessThan(1);
  });

  it("clearing the optional push really drops the knockback effect", () => {
    cover("cp-push-optional");
    // 決策點做成欄位, 而且清空真的有意義 (52-04 巨神一擊 = 純衝鋒無推撞).
    const t = loadTemplate("tpl-charge-push");
    const withPush = expand(t, defaultParamsFor(t)).effects;
    const params = { ...defaultParamsFor(t) };
    delete params["pushDistance"];
    const without = expand(t, params).effects;

    const kinds = (es: EffectDef[]): string[] =>
      es.flatMap((e) => [e.kind, ...(e.kind === "leap" ? (e.onLand ?? []).map((x) => x.kind) : [])]);
    expect(kinds(withPush)).toContain("knockback");
    expect(kinds(without)).not.toContain("knockback");
  });
});

// ---------------------------------------------------------------------------
// 「預設值不是家族極值」
// ---------------------------------------------------------------------------

/**
 * Every number below is the FAMILY MAXIMUM that used to ship as the default —
 * the value an operator got by opening the form and pressing save. The band is
 * asserted as a RANGE around the re-measured representative rather than as an
 * equality, so a future re-measurement can move the default a little without
 * touching this file, while restoring the old extreme still goes red.
 *
 * Bands are generous on purpose. They are a tripwire against 「家族裡最誇張的
 * 那一組數字」, not a second copy of the numbers.
 */
const OLD_EXTREMES: {
  template: string;
  path: string[];
  wasShipping: number;
  atMost: number;
  why: string;
}[] = [
  {
    template: "tpl-traveling-wave",
    path: ["stepCount"],
    wasShipping: 70,
    atMost: 40,
    why: "70 是龍破斬 `exitwhen udg_X > 70` 的迴圈保險絲, 不是步數; 13 支的中位是 20",
  },
  {
    template: "tpl-leap-strike",
    path: ["durationSec"],
    wasShipping: 1.44,
    atMost: 1.1,
    why: "1.44 是四條真拋物線裡最長的那條; 另外三條是 0.82/0.82/0.84",
  },
  {
    template: "tpl-instant-blast",
    path: ["castTimeSec"],
    wasShipping: 1,
    atMost: 0.35,
    why: "1.0 是藤鞭 (家族最大); 16 支裡有 8 支是純瞬發",
  },
  {
    template: "tpl-single-strike",
    path: ["damage", "perRank", "0"],
    wasShipping: 2300,
    atMost: 800,
    why: "2300 是雷焰聖劍 EX 條件式終結傷害; 家族中位 (lv1 總額) 是 350",
  },
  {
    template: "tpl-on-attack",
    path: ["bonusDamage", "perRank", "0"],
    wasShipping: 9999,
    atMost: 400,
    why: "9999 是獸矛的 EX 處決常數, 藏在一個 HP<35% 的閘後面, 模板表達不了那個閘",
  },
];

function readParam(params: Record<string, unknown>, path: string[]): number {
  let cur: unknown = params;
  for (const key of path) {
    cur = Array.isArray(cur) ? cur[Number(key)] : (cur as Record<string, unknown>)[key];
  }
  expect(typeof cur, `param path ${path.join(".")} is not a number`).toBe("number");
  return cur as number;
}

describe("enabled templates: the form default is not the family's most extreme number", () => {
  it("defaults-not-family-max", () => {
    cover("defaults-not-family-max");
    for (const c of OLD_EXTREMES) {
      const t = loadTemplate(c.template);
      const v = readParam(defaultParamsFor(t), c.path);
      expect(
        v,
        `${c.template}.${c.path.join(".")} is back at/near the family extreme ` +
          `(was shipping ${c.wasShipping}). ${c.why}`,
      ).toBeLessThanOrEqual(c.atMost);
      expect(v, `${c.template}.${c.path.join(".")} must stay positive`).toBeGreaterThanOrEqual(0);
    }
  });

  it("a saved default still produces a skill that DOES something", () => {
    cover("defaults-still-live");
    // The cheap way to over-satisfy the test above is to zero everything out.
    // A zeroed damage template would be just as broken as a 9999 one, so the
    // damage-carrying defaults must stay non-trivial.
    for (const id of ["tpl-single-strike", "tpl-instant-blast", "tpl-charge-push"]) {
      const t = loadTemplate(id);
      const dmg = readParam(defaultParamsFor(t), ["damage", "perRank", "0"]);
      expect(dmg, `${id} default damage collapsed to nothing`).toBeGreaterThan(50);
    }
  });
});

describe("numeric bounds keep headroom above the measured extreme", () => {
  it("bounds-have-headroom", () => {
    cover("bounds-have-headroom");
    // CLAUDE.md 「欄位要有上界，不是只有下界」 的第二半: 上界壓在資料的極值上
    // 等於「原作做得到的, 你做不到」。measured = the largest value that family
    // actually ships in the w3x.
    const cases: { template: string; param: string; measuredMax: number }[] = [
      // 76-04 三檔.巨人迴旋彈, j:36757 — the tenth parabola, peak exactly 1000.
      { template: "tpl-leap-strike", param: "apexHeight", measuredMax: 1000 },
      // 04-03 龍破斬 — the `exitwhen udg_X > 70` fuse.
      { template: "tpl-traveling-wave", param: "stepCount", measuredMax: 70 },
      // 90-04 陽光烈焰 — 10段×100u.
      { template: "tpl-line-sweep", param: "segmentCount", measuredMax: 10 },
    ];
    for (const c of cases) {
      const slot = loadTemplate(c.template).params[c.param]!;
      expect(slot.max, `${c.template}.${c.param} has no upper bound at all`).toBeDefined();
      expect(
        slot.max!,
        `${c.template}.${c.param} max=${slot.max} sits on the measured extreme ` +
          `${c.measuredMax} — an operator cannot author anything the source map ` +
          `did not already do`,
      ).toBeGreaterThan(c.measuredMax);
    }
  });

  it("apexHeight still rejects the 5000 mis-paste it exists to catch", () => {
    cover("bounds-reject-mispaste");
    // `SetUnitFlyHeightBJ(u, height, RATE)` passes 5000 as the RATE all over the
    // map (j:9848, 25206, 49425…). Headroom must not become "no bound".
    const t = loadTemplate("tpl-leap-strike");
    expect(t.params["apexHeight"]!.max!).toBeLessThan(5000);
    expect(() => expand(t, { ...defaultParamsFor(t), apexHeight: 5000 })).toThrow();
  });

  it("the wc3h ruler really is 1/250, not the planar 11/600", () => {
    cover("apex-ruler");
    // The comment in expand.ts claimed apexHeight 600 "reaches the sim as 11.00"
    // (the PLANAR conversion). Measure it instead of believing it.
    const t = loadTemplate("tpl-leap-strike");
    const ex = expand(t, { ...defaultParamsFor(t), apexHeight: 600 });
    const leap = ex.effects.find((e) => e.kind === "leap");
    expect(leap?.kind).toBe("leap");
    const apex = (leap as Extract<EffectDef, { kind: "leap" }>).apexHeight;
    expect(apex).toBeCloseTo(2.4, 6);
    expect(apex).not.toBeCloseTo(600 * GGD_PER_WC3, 3);
  });
});

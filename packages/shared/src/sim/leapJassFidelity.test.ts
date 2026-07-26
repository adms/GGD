/**
 * TASK #247 FOLLOW-UP — the four abilities whose shipped numbers disagreed with
 * their own JASS.
 *
 * The standing rule (owner, 2026-07-26):
 *
 *   「war3 編輯器設定 設定不了 JASS 實作效果，遇到這種情形一律以 JASS 實際參數為準」
 *
 * Priority is JASS > w3a/w3u editor row > tooltip, for every field. A
 * disagreement is EXPECTED, not a data-quality accident: the WC3 object editor
 * cannot express what a trigger does, so wherever a trigger overrides the object
 * row, the object row is a stale husk. Every number below therefore quotes the
 * war3map.j LINE it was read from, and the assertion messages carry that line so
 * the next person does not have to trust this file — they can open the source.
 *
 * The four defects this pins (all found by the #247 adversarial verifier):
 *   1. godie-hart.w  A0UX — shipped wc3 300 (the editor's 範圍) vs j:33722's 250.
 *   2. godie-u00n.r / godie-u00o.r  A0RZ — shipped wc3 200 vs j:36781's 380.
 *      Its perRank was NOT wrong (see the stale-comment note below).
 *   3. godie-hpb1.e  A0G3 — the combo half of the description had no code at all.
 *   4. godie-hapm.w  A0U1 — the throw ignored the JASS's drag-to-caster phase.
 *
 * These suites read the war3map.j text itself, so a wrong line number fails the
 * test rather than silently documenting a lie.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { SimWorld } from "./SimWorld";
import { PILLAR_ARENA } from "../../testkit/arenas";
import { asSeatId, asTeamId, type EntityId, type StatusId, type ChampionId } from "../ids";
import { runEffects, bakeCastTimeConditionals } from "./effects/effectRunner";
import { leapSystem } from "./systems/LeapSystem";
import { leapTicks } from "./movement/leap";
import { TICK_HZ } from "../constants";
import type { EffectDef } from "./effects/effect";
import { Stat, zeroStats } from "./stats/statTypes";
import { GGD_PER_WC3, round2 } from "../content/templates/expand";
import * as V from "./math/vec2";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const WAR3MAP_J = join(
  HERE,
  "../../../../tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j",
);

/** war3map.j split into lines, 1-indexed via `jassLine`. */
const JASS_LINES = readFileSync(WAR3MAP_J, "utf8").split("\n");
const jassLine = (n: number): string => JASS_LINES[n - 1] ?? "";

/**
 * Assert that war3map.j line `n` really contains `needle`. Every number this
 * file pins goes through here FIRST, so a drifted line number is a red test and
 * never a comment that quietly stops being true.
 */
function pinJass(n: number, needle: string): void {
  expect(jassLine(n), `war3map.j:${n} should contain ${JSON.stringify(needle)}`).toContain(
    needle,
  );
}

type Json = Record<string, unknown>;
const readDoc = (rel: string): Json =>
  JSON.parse(readFileSync(join(CONTENT_DIR, rel), "utf8")) as Json;

/** The single `leap` effect of an ability doc (standalone or embedded shape). */
function leapEffect(doc: Json): Json {
  const effects = doc["effects"] as Json[];
  const leap = effects.find((e) => e["kind"] === "leap");
  expect(leap, `${String(doc["id"])} should still ship a leap effect`).toBeDefined();
  return leap as Json;
}

/** The champion doc's embedded copy of one slot (the MIRROR half). */
function embedded(champ: string, slot: string): Json {
  const doc = readDoc(`champions/${champ}.json`);
  return (doc["abilities"] as Record<string, Json>)[slot]!;
}

// ---------------------------------------------------------------------------
// 1. A0UX 01-02 隕石擊 — the landing blast is 250 wc3, not the editor's 300
// ---------------------------------------------------------------------------

describe("#247 fidelity — godie-hart.w (A0UX 隕石擊) lands on the JASS radius", () => {
  it("j:33722 damages GetUnitsInRangeOfLocMatching(250.00), not the w3a 範圍 300", () => {
    cover("jass-fid-a0ux-radius");
    pinJass(33722, "GetUnitsInRangeOfLocMatching(250.00, udg_P1_Sto");
    // 250 wc3 × 11/600 = 4.5833… → 4.58 at content precision.
    const expected = round2(250 * GGD_PER_WC3);
    expect(expected).toBe(4.58);

    for (const doc of [readDoc("abilities/godie-hart.w.json"), embedded("godie-hart", "W")]) {
      expect(
        leapEffect(doc)["landRadius"],
        "landRadius must be war3map.j:33722's 250 wc3 (=4.58), NOT the editor row's 300 (=5.5)",
      ).toBe(expected);
      expect(
        doc["radius"],
        "the displayed AoE must agree with the damage radius it previews (j:33722)",
      ).toBe(expected);
    }
  });

  it("the arc itself is untouched: apex 600 wc3 over 41 ticks of 0.02 s (j:33716)", () => {
    pinJass(33716, "-1.50 * Pow(( udg_StoJump_Index - 21.00 )");
    const leap = leapEffect(readDoc("abilities/godie-hart.w.json"));
    expect(leap["apexHeight"]).toBe(round2(600 * GGD_PER_WC3));
    expect(leap["durationSec"]).toBeCloseTo(41 * 0.02, 2);
  });
});

// ---------------------------------------------------------------------------
// 2. A0RZ 76-04 巨人迴旋彈 — 380 wc3 about the CASTER; the perRank was right and
//    it is the JASS's own COMMENT that is stale
// ---------------------------------------------------------------------------

describe("#247 fidelity — godie-u00n.r / godie-u00o.r (A0RZ 巨人迴旋彈)", () => {
  it("j:36781 damages 380 wc3 around udg_Luffe_three_P1 (the caster, set at j:36660)", () => {
    cover("jass-fid-a0rz-radius");
    pinJass(36781, "GetUnitsInRangeOfLocMatching(380.00, udg_Luffe_three_P1");
    pinJass(36660, "set udg_Luffe_three_P1 = GetUnitLoc(udg_Luffe_three_caster)");
    // 380 wc3 × 11/600 = 6.9666… → 6.97.
    const expected = round2(380 * GGD_PER_WC3);
    expect(expected).toBe(6.97);

    for (const [file, champ] of [
      ["abilities/godie-u00n.r.json", "godie-u00n"],
      ["abilities/godie-u00o.r.json", "godie-u00o"],
    ] as const) {
      for (const doc of [readDoc(file), embedded(champ, "R")]) {
        const leap = leapEffect(doc);
        expect(
          leap["landRadius"],
          "landRadius must be war3map.j:36781's 380 wc3 (=6.97), NOT the editor row's 200 (=3.67)",
        ).toBe(expected);
        expect(doc["radius"]).toBe(expected);
        // The blast is centred on the CASTER (j:36660), and the caster never
        // moves — the A0RZ cluster has no SetUnitPositionLoc on it — so the
        // mode must stay a vertical hop or the detonation walks off its centre.
        expect(leap["mode"], "A0RZ never moves the caster (no SetUnitPositionLoc)").toBe(
          "inPlace",
        );
      }
    }
  });

  it("perRank IS the JASS formula 300+300×level; the j:36779 comment is the stale one", () => {
    cover("jass-fid-a0rz-perrank");
    // EXECUTED code (j:36719):  300.00 + 300.00 × level  + STR × 2.00
    // COMMENT   (j:36779):      300 + (sLV*200) + (力量*3)   ← never runs
    // The rule is JASS > everything, and the JASS that RUNS is the assignment.
    // The map's own tooltip agrees with the code (「600+力量*2傷害」), which
    // makes the comment the odd one out, 2 votes to 1.
    pinJass(36719, "( 300.00 + ( 300.00 * I2R(GetUnitAbilityLevelSwapped('A0RZ'");
    pinJass(36779, "300+(sLV*200)+(力量*3)");

    const fromJass = [1, 2, 3].map((lv) => 300 + 300 * lv);
    expect(fromJass).toEqual([600, 900, 1200]);

    for (const file of ["abilities/godie-u00n.r.json", "abilities/godie-u00o.r.json"]) {
      const leap = leapEffect(readDoc(file));
      const dmg = (leap["onLand"] as Json[]).find((e) => e["kind"] === "damage")!;
      expect(
        (dmg["amount"] as Json)["perRank"],
        "war3map.j:36719 executes 300+300×level — the j:36779 comment does not run",
      ).toEqual(fromJass);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. A0G3 07-03 列、在、前 — the combo half of the description now has code
// ---------------------------------------------------------------------------

describe("#247 fidelity — godie-hpb1.e (A0G3) 者、皆、陣 combo window", () => {
  it("the JASS chain is W(A0G2) → MoonCombo=2 for 1.00 s → E(A0G3) reads it", () => {
    pinJass(34438, "set udg_MoonCombo = 2");
    pinJass(34439, "call TriggerSleepAction( 1.00 )");
    pinJass(34440, "set udg_MoonCombo = 0");
    pinJass(34189, "udg_MoonCombo == 2");
    pinJass(34214, "( 5.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI");
  });

  it("07-02 者、皆、陣 opens a 1.00 s window ON THE CASTER (j:34438-34440)", () => {
    cover("jass-fid-a0g3-window");
    for (const doc of [readDoc("abilities/godie-hpb1.w.json"), embedded("godie-hpb1", "W")]) {
      const marker = (doc["effects"] as Json[]).find(
        (e) => e["kind"] === "applyStatus" && e["statusId"] === "moon-combo",
      );
      expect(marker, "W must set the combo marker — it is what E reads (j:34438)").toBeDefined();
      expect(
        marker!["applyTo"],
        "the marker is the CASTER's; W is unit-targeted, so without applyTo it lands on the victim",
      ).toBe("self");
      expect(
        marker!["duration"],
        "war3map.j:34439 TriggerSleepAction( 1.00 ) — the window is exactly one second",
      ).toBe(1.0);
    }
  });

  it("07-03 列、在、前 pays the bonus only while that window is open (j:34189, j:34214)", () => {
    cover("jass-fid-a0g3-combo");
    for (const doc of [readDoc("abilities/godie-hpb1.e.json"), embedded("godie-hpb1", "E")]) {
      const dmg = (leapEffect(doc)["onLand"] as Json[]).find((e) => e["kind"] === "damage")!;
      const combo = dmg["comboBonus"] as Json | undefined;
      expect(
        combo,
        "the description promises a combo bonus; war3map.j:34214 implements one — so must we",
      ).toBeDefined();
      expect(combo!["statusId"]).toBe("moon-combo");
      const ratios = ((combo!["amount"] as Json)["ratios"] as Json[])[0]!;
      // JASS: +5.00 × AGI (j:34214), base 力量*2+lv*100+350 (j:34211). GGD has no agility stat (task #248 is the one that
      // rebuilds 力量/敏捷/智慧 from the w3u), so the agility term rides the same
      // carrier this doc's OWN base term uses: its `力量*2` (j:34211) ships as
      // ad × 0.5, i.e. 0.25 of ad per point of WC3 stat multiplier. 5 × 0.25 =
      // 1.25. Derived from the doc, not invented — and re-derived here so a
      // future rescale of the base term makes this test fail loudly.
      expect(ratios["stat"]).toBe("ad");
      expect(ratios["coeff"], "war3map.j:34214 is 5 × AGI, at this doc's own 0.25/point rate").toBe(
        5 * 0.25,
      );
    }
  });

  it("applyTo:self puts the marker on the CASTER, never on the victim (j:34438)", () => {
    const world = new SimWorld(PILLAR_ARENA, 7);
    const caster = spawnUnit(world, 0, { x: 0, z: 0 });
    const victim = spawnUnit(world, 1, { x: 1, z: 0 });
    runEffects([W_WINDOW], {
      world,
      caster,
      rank: 1,
      targets: [victim],
      origin: "ability:godie-hpb1.w",
      rng: world.rng,
    });
    expect(world.status.get(caster)!.effects.some((s) => s.statusId === "moon-combo")).toBe(true);
    expect(
      world.status.get(victim)!.effects.length,
      "applyTo:self must NOT put the marker on the victim",
    ).toBe(0);
    // exactly the JASS's one second (j:34439), in ticks
    expect(world.status.get(caster)!.effects[0]!.expiresAtTick).toBe(Math.round(1.0 / world.dt));
  });
});

// ---------------------------------------------------------------------------
// 3b. THE REFUTED CLAIM — cast-time vs apply-time
//
// The combo bonus was implemented, tested green, and could not fire in a real
// game. The old test applied the damage effect on its own, with no flight in
// between; the shipped ability puts a 43-tick arc between the cast and the
// damage, and the window is 30 ticks. So the tests below fly the WHOLE arc on a
// real SimWorld, both ways round.
// ---------------------------------------------------------------------------

describe("#247 combo timing — the JASS bakes at CAST and pays the baked number", () => {
  it("j:34211-34216 is inside Jump Start; j:34262 deals the pre-computed variable", () => {
    cover("jass-fid-a0g3-cast-time");
    // (a) the value is computed in the SPELL_EFFECT action of A0G3 …
    pinJass(34195, "function Trig_Jump_Start_Actions takes nothing returns nothing");
    pinJass(34211, "set udg_MoonDamage = I2R(");
    pinJass(34212, "if ( Trig_Jump_Start_Func017C() ) then"); // == the udg_MoonCombo test
    pinJass(34189, "udg_MoonCombo == 2");
    pinJass(34214, "( 5.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI"); //   non-EX branch
    pinJass(34216, "( 10.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI"); //  EX branch
    // (b) … and ONLY THEN is the arc trigger switched on, so the whole 41-tick
    //     flight happens after the number is already frozen.
    pinJass(34226, "call EnableTrigger( gg_trg_Jump_Effect )");
    // (c) the arc's landing AoE deals that variable verbatim — no re-read of
    //     udg_MoonCombo anywhere in Jump Effect.
    pinJass(34274, "udg_Jump_Index >= 41.00");
    pinJass(34262, "UnitDamageTargetBJ( udg_Jump_Caster, GetEnumUnit(), udg_MoonDamage");
    const jumpEffect = JASS_LINES.slice(34241 - 1, 34314).join("\n");
    expect(
      jumpEffect.includes("udg_MoonCombo"),
      "Trig_Jump_Effect must NOT consult the combo marker — that is the whole point",
    ).toBe(false);

    // (d) the arithmetic that makes apply-time resolution IMPOSSIBLE:
    //     41 ticks × (0.35/10) s = 1.435 s of flight against a 1.00 s window.
    pinJass(34320, "TriggerRegisterTimerEventPeriodic( gg_trg_Jump_Effect, ( 0.35 / 10.00 ) )");
    const flightSec = 41 * (0.35 / 10);
    expect(flightSec).toBeCloseTo(1.435, 6);
    expect(
      flightSec,
      "the window (j:34439) lapses mid-flight — so a bonus asked for at LANDING can never fire",
    ).toBeGreaterThan(1.0);
  });

  it("GGD keeps the same inequality: a 43-tick arc against a 30-tick window", () => {
    const leap = leapEffect(readDoc("abilities/godie-hpb1.e.json"));
    const ticks = leapTicks(leap["durationSec"] as number);
    const windowTicks = Math.round(1.0 * TICK_HZ);
    expect(ticks).toBe(43);
    expect(windowTicks).toBe(30);
    expect(
      ticks,
      "if this ever inverts the bug becomes invisible again — keep the test honest",
    ).toBeGreaterThan(windowTicks);
  });

  it("REAL FLIGHT, window OPEN at cast: the bonus survives the window closing mid-air", () => {
    cover("jass-fid-a0g3-flight-open");
    const world = new SimWorld(PILLAR_ARENA, 23);
    const { caster, victim, point } = comboFixture(world);

    // 07-02 者、皆、陣 opens the window (tick 0) …
    castW(world, caster, victim);
    // … the player presses E 10 ticks (0.33 s) later — inside the window.
    for (let i = 0; i < 10; i++) world.step(NO_INTENTS);
    expect(holdsWindow(world, caster), "precondition: the window is open at CAST").toBe(true);
    castE(world, caster, point);

    const ov = leapOverride(world, caster);
    expect(ov.ticks).toBe(43);

    // Fly every tick of the arc through the FULL pipeline.
    let windowLapsedMidFlight = false;
    let dealt: number | undefined;
    for (let k = 0; k < ov.ticks; k++) {
      world.step(NO_INTENTS);
      if (!holdsWindow(world, caster)) windowLapsedMidFlight = true;
      dealt ??= abilityDamage(world);
    }

    expect(
      windowLapsedMidFlight,
      "the window MUST have closed before touchdown — otherwise this test proves nothing",
    ).toBe(true);
    expect(holdsWindow(world, caster), "…and it is still closed when the blast lands").toBe(false);
    expect(dealt, "the landing AoE must have hit the victim").toBeDefined();
    // base 450 + ad×0.5 (=20) + combo ad×1.25 (=50) = 520, frozen at cast.
    expect(rawDamage(world, dealt!)).toBeCloseTo(BASE_DAMAGE + COMBO_BONUS, 4);
  });

  it("REAL FLIGHT, window LAPSED before the cast: no bonus (j:34440 cleared it)", () => {
    cover("jass-fid-a0g3-flight-lapsed");
    const world = new SimWorld(PILLAR_ARENA, 24);
    const { caster, victim, point } = comboFixture(world);

    castW(world, caster, victim);
    // 31 ticks > the 30-tick window: 07-02's marker is gone before E is pressed.
    for (let i = 0; i < 31; i++) world.step(NO_INTENTS);
    expect(holdsWindow(world, caster), "precondition: the window has lapsed at CAST").toBe(false);
    castE(world, caster, point);

    const ov = leapOverride(world, caster);
    let dealt: number | undefined;
    for (let k = 0; k < ov.ticks; k++) {
      world.step(NO_INTENTS);
      dealt ??= abilityDamage(world);
    }
    expect(dealt).toBeDefined();
    expect(rawDamage(world, dealt!)).toBeCloseTo(BASE_DAMAGE, 4);
  });

  it("the payload that leaves the launcher carries NO unresolved condition", () => {
    cover("jass-fid-a0g3-payload-frozen");
    const world = new SimWorld(PILLAR_ARENA, 25);
    const { caster, point } = comboFixture(world);
    castW(world, caster, null);
    castE(world, caster, point);
    const onLand = leapOverride(world, caster).onLand;
    const dmg = onLand.find((e) => e.kind === "damage");
    expect(dmg, "the arc must carry its damage payload").toBeDefined();
    expect(
      dmg!.kind === "damage" ? dmg!.comboBonus : "n/a",
      "a `comboBonus` still riding the arc would be re-asked at landing — the defect",
    ).toBeUndefined();
    // and the resolved amount travelled with it, folded into `flat`
    expect(dmg!.kind === "damage" ? dmg!.amount.flat : undefined).toBeCloseTo(COMBO_BONUS, 6);
  });

  it("CLASS GUARD: every deferred payload carrier bakes, not just leap", () => {
    cover("jass-fid-bake-carriers");
    const world = new SimWorld(PILLAR_ARENA, 26);
    const { caster, victim } = comboFixture(world);
    castW(world, caster, victim);
    const ctx = {
      world,
      caster,
      rank: 1,
      targets: [victim],
      origin: "test:bake",
      rng: world.rng,
    };
    const conditional: EffectDef = {
      kind: "damage",
      damageType: "physical",
      amount: { flat: 100 },
      comboBonus: {
        statusId: MOON_COMBO,
        amount: { ratios: [{ stat: Stat.AttackDamage, coeff: 1.25 }] },
      },
    };
    // Every EffectDef kind that carries a NESTED EffectDef[] is a gap between
    // cast and payout. Both must be baked; a new one must be added here.
    const carriers: { name: string; def: EffectDef; nested: (e: EffectDef) => EffectDef[] }[] = [
      {
        name: "leap.onLand",
        def: {
          kind: "leap",
          mode: "inPlace",
          apexHeight: 5,
          durationSec: 0.5,
          onLand: [conditional],
        },
        nested: (e) => (e.kind === "leap" ? e.onLand ?? [] : []),
      },
      {
        name: "spawnProjectile.onHit",
        def: { kind: "spawnProjectile", projectileId: "x" as never, onHit: [conditional] },
        nested: (e) => (e.kind === "spawnProjectile" ? e.onHit : []),
      },
    ];
    for (const c of carriers) {
      const baked = bakeCastTimeConditionals([c.def], ctx)[0]!;
      const inner = c.nested(baked)[0]!;
      expect(inner.kind).toBe("damage");
      expect(
        inner.kind === "damage" ? inner.comboBonus : "n/a",
        `${c.name} must resolve its conditional at CAST time`,
      ).toBeUndefined();
      expect(inner.kind === "damage" ? inner.amount.flat : undefined).toBeCloseTo(
        100 + COMBO_BONUS,
        6,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. A0U1 52-02 蹂躪編年史 — 「迅速將目標抓回」 then throw FROM THE CASTER
// ---------------------------------------------------------------------------

describe("#247 fidelity — godie-hapm.w (A0U1) drags before it throws", () => {
  it("j:51749-51765: the victim is pulled to the caster, then thrown from the CASTER's loc", () => {
    cover("jass-fid-a0u1-drag");
    pinJass(51760, "PolarProjectionBJ(udg_Buncle_P1, 50.00, udg_Buncle_trample_Angle)");
    pinJass(51749, "DistanceBetweenPoints(udg_Buncle_P3, udg_Buncle_P2) <= 50.00");
    pinJass(51765, "PolarProjectionBJ(udg_Buncle_P2, 400.00, GetUnitFacing(udg_Buncle_trample_Caster))");

    for (const doc of [readDoc("abilities/godie-hapm.w.json"), embedded("godie-hapm", "W")]) {
      const leap = leapEffect(doc);
      expect(
        leap["dragToCaster"],
        "war3map.j:51755-51763 pulls the victim in BEFORE j:51765 aims the throw from the caster",
      ).toBe(true);
      expect(leap["throwDistance"], "j:51765 throws 400 wc3").toBe(round2(400 * GGD_PER_WC3));
      expect(leap["applyTo"]).toBe("target");
    }
  });

  it("BEHAVIOUR: the landing point is measured from the CASTER, not from the victim", () => {
    const world = new SimWorld(PILLAR_ARENA, 11);
    const z0 = PILLAR_ARENA.zones[0]!;
    // Caster 4 left of the zone centre and 2 off the axis, so the whole
    // caster→landing segment clears the centre pillar (r 2.5 + body 0.6) and
    // stays well inside boundaryRadius 24 — the arc is what is under test here,
    // not resolveLandingPoint's relaxation (leap.test.ts owns that).
    const casterPos = { x: z0.center.x - 4, z: z0.center.z + 2 };
    const caster = spawnUnit(world, 0, casterPos);
    // victim standing 4 units BEHIND the caster along -x: exactly the offset
    // the pre-fix code baked into the landing point.
    const victimStart = { x: casterPos.x - 4, z: casterPos.z };
    const victim = spawnUnit(world, 1, victimStart);
    world.stats.set(caster, statsWithAd(0));
    world.transform.get(caster)!.facing = { x: 1, z: 0 };

    const throwDistance = round2(400 * GGD_PER_WC3);
    runEffects(
      [
        {
          kind: "leap",
          applyTo: "target",
          mode: "toPoint",
          apexHeight: 5.5,
          durationSec: 0.42,
          throwDistance,
          dragToCaster: true,
          landRadius: 4.95,
          onLand: [],
        },
      ],
      {
        world,
        caster,
        rank: 1,
        targets: [victim],
        direction: { x: 1, z: 0 },
        origin: "ability:godie-hapm.w",
        rng: world.rng,
      },
    );

    const ov = leapOverride(world, victim);
    // the arc STARTS at the caster (the drag), not where the victim stood
    expect(ov.from.x).toBeCloseTo(casterPos.x, 6);
    expect(ov.from.z).toBeCloseTo(casterPos.z, 6);
    // …so the landing point is caster + facing × reach. `reach` goes through the
    // #136 abilityRange factor exactly like every other length in the sim.
    const reach = throwDistance * world.combatEnv.abilityRange;
    expect(ov.to.x).toBeCloseTo(casterPos.x + reach, 4);
    // Without the drag the arc would have started at the VICTIM and landed 4
    // units short — this is the whole defect, stated as a number.
    const preFixLanding = victimStart.x + reach;
    expect(ov.to.x - preFixLanding).toBeCloseTo(4, 4);

    // fly it out and confirm the body actually arrives there
    for (let i = 0; i < ov.ticks; i++) leapSystem(world);
    const landed = world.transform.get(victim)!.pos;
    expect(landed.x).toBeCloseTo(ov.to.x, 6);
    expect(world.airborne.has(victim)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shared fixtures
// ---------------------------------------------------------------------------

function spawnUnit(world: SimWorld, seat: number, pos: V.Vec2): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 0, z: 1 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp: 5000, maxHp: 5000, mana: 50, maxMana: 50, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(seat % 2), seatId: asSeatId(seat) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  world.status.set(id, { effects: [] });
  return id;
}

/** The combo marker id, branded once. */
const MOON_COMBO = "moon-combo" as StatusId;

const NO_INTENTS = new Map<never, never>();

/**
 * The two SHIPPED effects the combo tests fly — read out of content, not
 * retyped. If a doc is re-authored these tests follow it, which is the only way
 * a fidelity test can keep meaning anything.
 */
const W_WINDOW = (readDoc("abilities/godie-hpb1.w.json")["effects"] as Json[]).find(
  (e) => e["kind"] === "applyStatus",
) as unknown as EffectDef;
const E_LEAP = leapEffect(readDoc("abilities/godie-hpb1.e.json")) as unknown as EffectDef;

/** ad on the test caster; the only stat either formula reads. */
const TEST_AD = 40;
/** perRank[0] 450 + ad×0.5 — the unconditional half (j:34211). */
const BASE_DAMAGE = 450 + TEST_AD * 0.5;
/** ad×1.25 — the combo half (j:34214, at this doc's own 0.25/point rate). */
const COMBO_BONUS = TEST_AD * 1.25;

const ORIGIN_E = "ability:godie-hpb1.e";

/**
 * Caster and victim placed so the arc is a plain 12-unit hop clear of the
 * centre pillar and well inside the boundary — `resolveLandingPoint` therefore
 * returns the requested point verbatim and the test is about TIMING, not
 * geometry (leap.test.ts owns geometry).
 */
function comboFixture(world: SimWorld): {
  caster: EntityId;
  victim: EntityId;
  point: V.Vec2;
} {
  const z0 = PILLAR_ARENA.zones[0]!;
  const point = { x: z0.center.x + 2, z: z0.center.z + 9 };
  const caster = spawnUnit(world, 0, { x: z0.center.x - 10, z: z0.center.z + 9 });
  const victim = spawnUnit(world, 1, { x: point.x, z: point.z });
  world.stats.set(caster, statsWithAd(TEST_AD));
  return { caster, victim, point };
}

/** Cast 07-02 者、皆、陣's marker half. `victim` may be null (self-only check). */
function castW(world: SimWorld, caster: EntityId, victim: EntityId | null): void {
  runEffects([W_WINDOW], {
    world,
    caster,
    rank: 1,
    targets: victim === null ? [] : [victim],
    origin: "ability:godie-hpb1.w",
    rng: world.rng,
  });
}

/** Cast 07-03 列、在、前 at `point` — the real shipped leap effect. */
function castE(world: SimWorld, caster: EntityId, point: V.Vec2): void {
  runEffects([E_LEAP], {
    world,
    caster,
    rank: 1,
    targets: [],
    point,
    origin: ORIGIN_E,
    rng: world.rng,
  });
}

/** Is the 1.00 s combo window still open on `id` RIGHT NOW? */
function holdsWindow(world: SimWorld, id: EntityId): boolean {
  const st = world.status.get(id);
  return (
    st?.effects.some((s) => s.statusId === "moon-combo" && s.expiresAtTick > world.tick) ?? false
  );
}

/** The live leap override on `id`, narrowed (a dash would be a test bug). */
function leapOverride(world: SimWorld, id: EntityId): import("./components").LeapOverride {
  const ov = world.nav.get(id)?.override;
  if (!ov || ov.kind !== "leap") throw new Error(`entity ${String(id)} is not mid-leap`);
  return ov;
}

/** This tick's 列、在、前 damage event amount, if the blast landed. */
function abilityDamage(world: SimWorld): number | undefined {
  for (const ev of world.events) {
    if (ev.type !== "damage") continue;
    if ((ev.data as { origin?: string }).origin !== ORIGIN_E) continue;
    return (ev.data as { amount: number }).amount;
  }
  return undefined;
}

/**
 * Undo the ONE global factor between the effect's number and the hp that came
 * off: `combatEnv.damageDealt` (combat/damage.ts:498). The victim carries no
 * StatsComp, so armour mitigation is the identity — nothing else is in the way.
 */
function rawDamage(world: SimWorld, dealt: number): number {
  return dealt / world.combatEnv.damageDealt;
}

/**
 * A stats component whose only NON-ZERO entry is `ad` — the only stat either
 * formula under test reads. `final` is what `resolveScaling` consults.
 *
 * It must be a COMPLETE `zeroStats()` block, not a `{ ad }` shim: the tests
 * below run the full `world.step` pipeline, and `regenSystem` reads
 * `final[HpRegen]` unconditionally — a missing key makes hp NaN on tick 1, the
 * body dies, and `leapSystem` cancels the arc. (That is exactly how a shim
 * passes a test that only calls `leapSystem` by hand and fails one that flies.)
 */
function statsWithAd(ad: number): import("./stats/statsComp").StatsComp {
  const block = zeroStats();
  block[Stat.AttackDamage] = ad;
  return {
    championId: "test" as ChampionId,
    final: block,
    dirty: false,
    sources: [],
  };
}

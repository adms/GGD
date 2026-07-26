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
import { runEffects } from "./effects/effectRunner";
import { leapSystem } from "./systems/LeapSystem";
import type { EffectDef } from "./effects/effect";
import { Stat } from "./stats/statTypes";
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

  it("BEHAVIOUR: the bonus lands only when the marker is on the caster", () => {
    const world = new SimWorld(PILLAR_ARENA, 7);
    const caster = spawnUnit(world, 0, { x: 0, z: 0 });
    const victim = spawnUnit(world, 1, { x: 1, z: 0 });
    world.stats.set(caster, statsWithAd(40));

    const dmg: EffectDef = {
      kind: "damage",
      damageType: "physical",
      amount: { perRank: [450], ratios: [{ stat: Stat.AttackDamage, coeff: 0.5 }] },
      comboBonus: {
        statusId: MOON_COMBO,
        amount: { ratios: [{ stat: Stat.AttackDamage, coeff: 1.25 }] },
      },
    };
    const ctx = {
      world,
      caster,
      rank: 1,
      targets: [victim],
      origin: "ability:godie-hpb1.e",
      rng: world.rng,
    };

    // window CLOSED -> base only: 450 + 40×0.5
    world.damageQueue.length = 0;
    runEffects([dmg], ctx);
    expect(world.damageQueue[0]!.amount).toBeCloseTo(450 + 20, 6);

    // 07-02 opens it on the CASTER
    world.damageQueue.length = 0;
    runEffects(
      [
        {
          kind: "applyStatus",
          statusId: MOON_COMBO,
          duration: 1.0,
          applyTo: "self" as const,
        },
      ],
      ctx,
    );
    expect(world.status.get(caster)!.effects.some((s) => s.statusId === "moon-combo")).toBe(true);
    expect(
      world.status.get(victim)!.effects.length,
      "applyTo:self must NOT put the marker on the victim",
    ).toBe(0);

    // window OPEN -> base + 40×1.25
    runEffects([dmg], ctx);
    expect(world.damageQueue[0]!.amount).toBeCloseTo(450 + 20 + 50, 6);

    // and it EXPIRES — the JASS clears it 1.00 s later (j:34440), it is never
    // consumed by the follow-up cast.
    const st = world.status.get(caster)!;
    expect(st.effects[0]!.expiresAtTick).toBe(0 + Math.round(1.0 / world.dt));
    st.effects[0]!.expiresAtTick = world.tick; // simulate the window closing
    world.damageQueue.length = 0;
    runEffects([dmg], ctx);
    expect(world.damageQueue[0]!.amount).toBeCloseTo(450 + 20, 6);
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

    const ov = world.nav.get(victim)!.override!;
    expect(ov.kind).toBe("leap");
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

/**
 * A stats component carrying nothing but `ad` — the only stat either formula
 * under test reads. `final` is what `resolveScaling` consults.
 */
function statsWithAd(ad: number): import("./stats/statsComp").StatsComp {
  const block = { ad } as unknown as import("./stats/statTypes").StatBlock;
  return {
    championId: "test" as ChampionId,
    final: block,
    dirty: false,
    sources: [],
  };
}

/**
 * GH#289 — the effect REGISTRY seam.
 *
 * effectRunner used to be one 500-line `switch`; it is now a `Record<kind,
 * handler>` so six parallel primitive lanes stop colliding in one hunk. Three
 * things have to be true for that to be safe, and each gets a guard here:
 *
 *   1. DISPATCH IS RIGHT. Every shipped kind still reaches ITS OWN handler.
 *      Guarded behaviourally, by driving `runEffects` on a real SimWorld and
 *      reading FINAL state (`world.health.hp`, `world.status`, `nav.override`,
 *      the damage queue) — not by asserting `EFFECT_HANDLERS.damage ===
 *      damageEffect`, which is failure shape ⑦ (掃屬性代替掃行為) and would
 *      stay green if the handler bodies were swapped wholesale. The observables
 *      are chosen to be MUTUALLY EXCLUSIVE so mis-pointing any one cell at any
 *      other cell's handler is caught.
 *
 *   2. A RESERVED KIND IS LOUD, NEVER SILENT. The five stubs must throw. A
 *      silent no-op is failure shape ② — the card shows the effect, the sim
 *      does nothing, and the only way to notice is to lose a game to it.
 *
 *   3. NOTHING DRIFTS. The Zod union, the TS union and the registry name the
 *      same set of kinds. (This one IS a property scan and is labelled as such
 *      — it is a drift alarm, not the behavioural guard.)
 *
 * Plus `shield.absorbs` (owner 2026-07-30 護盾傷害類型): the SEAM half of it —
 * the default must stay indistinguishable from the pre-#289 shield, and the
 * schema must accept exactly the spellings the sim implements. Lane P6 landed
 * the damage-side FILTER; its behavioural guards are in `shieldAbsorb.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects, bakeCastTimeConditionals } from "./effectRunner";
import { EFFECT_HANDLERS } from "./effectRegistry";
import type { EffectContext, EffectDef } from "./effect";
import { zEffectDefUnion } from "../../content/schema/effect";
import { Stat } from "../stats/statTypes";
import type { EntityId, StatusId } from "../../ids";

const C = SKELETON_ARENA.zones[0]!.center;

interface Rig {
  world: SimWorld;
  caster: EntityId;
  target: EntityId;
}

/**
 * A caster and one target, both with transform + health + status + stats, so
 * every handler under test has somewhere to write. Deliberately NO content
 * registry: these six kinds must be drivable from the bare world, which is what
 * keeps the dispatch guard independent of whatever the content lane is doing.
 */
function rig(seed = 99): Rig {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const spawn = (x: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: C.z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.5,
      zone: 0,
    });
    world.health.set(id, {
      hp: 500,
      maxHp: 1000,
      mana: 100,
      maxMana: 400,
      alive: true,
      shields: [],
    });
    world.status.set(id, { effects: [] });
    world.stats.set(id, {
      championId: "sela" as never,
      final: {} as Record<Stat, number>,
      dirty: false,
      sources: [],
    });
    // Mirrors `Navigation` in sim/components.ts. Only `override` is read (the
    // `dash` probe); the rest are the type's required fields at their idle
    // values, so a new field landing there fails THIS line at compile time
    // rather than silently defaulting to undefined inside a live nav entry.
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    return id;
  };
  const caster = spawn(C.x);
  const target = spawn(C.x + 2);
  world.rebuildGrid();
  return { world, caster, target };
}

function ctxOf(r: Rig): EffectContext {
  return {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.target],
    point: { x: C.x + 5, z: C.z },
    origin: "ability:test.registry",
    rng: r.world.rng,
  };
}

/* ═════════════════════════════════════════════════════════════════════════
 * 1. DISPATCH — each kind lands its OWN effect, and only its own.
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * One row per kind: the effect to run, and a probe that returns a distinctive
 * fingerprint of what that kind did to the world.
 *
 * The probes are pairwise DISJOINT on purpose. `damage` is the only row that
 * fills the damage queue, `heal` the only one that raises hp, `shield` the only
 * one that pushes a shield, `applyStatus` the only one that writes
 * `world.status`, `applyBuff` the only one that attaches a ModifierSource, and
 * `dash` the only one that writes `nav.override`. So if the registry points
 * `heal` at the shield handler (or at any other), the heal row's probe reads 0
 * AND the shield row's probe sees two entries — the mutation cannot hide.
 */
const DISPATCH: {
  kind: string;
  effect: EffectDef;
  probe: (r: Rig) => number;
}[] = [
  {
    kind: "damage",
    effect: { kind: "damage", damageType: "magic", amount: { flat: 40 } },
    probe: (r) => r.world.damageQueue.length,
  },
  {
    kind: "heal",
    effect: { kind: "heal", amount: { flat: 30 } },
    probe: (r) => r.world.health.get(r.target)!.hp - 500,
  },
  {
    kind: "shield",
    effect: { kind: "shield", amount: { flat: 77 }, duration: 5 },
    probe: (r) => r.world.health.get(r.target)!.shields.length,
  },
  {
    kind: "applyStatus",
    effect: {
      kind: "applyStatus",
      statusId: "test-marker" as StatusId,
      duration: 2,
      stun: true,
    },
    probe: (r) => r.world.status.get(r.target)!.effects.length,
  },
  {
    kind: "applyBuff",
    effect: {
      kind: "applyBuff",
      modifiers: [{ stat: Stat.AttackDamage, op: "flat" as never, value: 5 }],
      duration: 3,
    },
    probe: (r) => r.world.stats.get(r.target)!.sources.length,
  },
  {
    kind: "dash",
    effect: { kind: "dash", mode: "forward", speed: 10, maxDistance: 3 },
    probe: (r) => (r.world.nav.get(r.caster)!.override === null ? 0 : 1),
  },
];

describe("effect registry dispatch (gh289-registry-dispatch)", () => {
  it("each shipped kind reaches its OWN handler and no other", () => {
    cover("gh289-registry-dispatch");
    for (const row of DISPATCH) {
      const r = rig();
      runEffects([row.effect], ctxOf(r));
      // its own probe fired …
      expect(row.probe(r), `${row.kind} did not land its own effect`).toBeGreaterThan(0);
      // … and nobody else's did. THIS half is what catches a mis-pointed cell:
      // a `heal` slot wired to the shield handler leaves hp untouched (caught
      // above) AND pushes a shield (caught here).
      for (const other of DISPATCH) {
        if (other.kind === row.kind) continue;
        expect(other.probe(r), `${row.kind} also triggered ${other.kind}`).toBe(0);
      }
    }
  });

  it("runEffects still executes a LIST in authored order", () => {
    cover("gh289-registry-dispatch");
    const r = rig();
    runEffects(
      [
        { kind: "damage", damageType: "physical", amount: { flat: 1 } },
        { kind: "damage", damageType: "magic", amount: { flat: 2 } },
        { kind: "damage", damageType: "true", amount: { flat: 3 } },
      ],
      ctxOf(r),
    );
    expect(r.world.damageQueue.map((p) => p.type)).toEqual(["physical", "magic", "true"]);
    expect(r.world.damageQueue.map((p) => p.amount)).toEqual([1, 2, 3]);
  });
});

/**
 * A COVERAGE HOLE FOUND BY MUTATING THE MOVE (GH#289).
 *
 * The `damage` handler adds an IMMEDIATE combo-window term:
 *   `resolveScaling(...) + comboAdd`
 * Deleting `+ comboAdd` left the entire sim suite GREEN — including
 * leapJassFidelity.test.ts, the file that owns 蒼月潮's combo window. That file
 * guards the two OTHER halves (the authored doc's shape, and the DEFERRED path
 * where `bake` folds the bonus into `amount.flat`), and the deferred path is
 * precisely the one that does NOT run this line. So the immediate reading — an
 * instant cast, or the resolve tick of a cast time, where apply time IS cast
 * time — could be deleted and nothing would notice: CLAUDE.md 失敗形態 ③.
 *
 * The hole pre-dates this refactor; it is fixed here because this is the commit
 * that MOVED the line, and a verbatim move I cannot prove is a verbatim move I
 * should not claim.
 */
describe("damage combo window, IMMEDIATE path (gh289-combo-immediate)", () => {
  const COMBO = "moon-combo-test" as StatusId;
  const withCombo = (open: boolean): number => {
    const r = rig();
    if (open) {
      r.world.status.get(r.caster)!.effects.push({
        statusId: COMBO,
        sourceId: "test",
        // STRICTLY greater than world.tick — `hasStatus` re-checks expiry
        // inside the tick, which is what closes the window on the exact tick
        // the JASS's TriggerSleepAction(1.00) would have.
        expiresAtTick: r.world.tick + 30,
      });
    }
    runEffects(
      [
        {
          kind: "damage",
          damageType: "magic",
          amount: { flat: 100 },
          comboBonus: { statusId: COMBO, amount: { flat: 45 } },
        },
      ],
      ctxOf(r),
    );
    return r.world.damageQueue[0]!.amount;
  };

  it("pays base + bonus while the caster holds the marker, base alone without it", () => {
    cover("gh289-combo-immediate");
    expect(withCombo(false)).toBe(100);
    expect(withCombo(true)).toBe(145);
  });

  it("an EXPIRED marker pays base only (the window closes on its own tick)", () => {
    cover("gh289-combo-immediate");
    const r = rig();
    r.world.tick = 50;
    r.world.status.get(r.caster)!.effects.push({
      statusId: COMBO,
      sourceId: "test",
      expiresAtTick: 50, // == tick, i.e. already lapsed: `> world.tick` is false
    });
    runEffects(
      [
        {
          kind: "damage",
          damageType: "magic",
          amount: { flat: 100 },
          comboBonus: { statusId: COMBO, amount: { flat: 45 } },
        },
      ],
      ctxOf(r),
    );
    expect(r.world.damageQueue[0]!.amount).toBe(100);
  });

  it("every target in the blast takes the SAME boosted number", () => {
    cover("gh289-combo-immediate");
    // The JASS reads `udg_MoonCombo` once (j:34189) and bakes it into
    // `udg_MoonDamage`, so a multi-target cast pays one frozen figure.
    //
    // ⚠️ HONEST SCOPE. This pins the VALUE, not the number of reads: hoisting
    // `comboAddend` into the target loop yields identical numbers today,
    // because it is pure. Verified by mutation — that rewrite stays green, so
    // claiming this test guards "read once" would be a comment that lies. What
    // it does catch is any per-target DIVERGENCE: a bonus that decays down the
    // target list, or one that consumes the marker so only the first victim
    // gets it (the JASS marker is never consumed, it only expires).
    const r = rig();
    const second = r.world.spawn();
    r.world.health.set(second, {
      hp: 500,
      maxHp: 1000,
      mana: 0,
      maxMana: 0,
      alive: true,
      shields: [],
    });
    r.world.status.get(r.caster)!.effects.push({
      statusId: COMBO,
      sourceId: "test",
      expiresAtTick: r.world.tick + 30,
    });
    runEffects(
      [
        {
          kind: "damage",
          damageType: "magic",
          amount: { flat: 100 },
          comboBonus: { statusId: COMBO, amount: { flat: 45 } },
        },
      ],
      { ...ctxOf(r), targets: [r.target, second] },
    );
    expect(r.world.damageQueue.map((p) => p.amount)).toEqual([145, 145]);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 2. RESERVED KINDS — loud, never silent.
 * ═════════════════════════════════════════════════════════════════════════ */

// ⚠️ `dot` (lane P1) LEFT THIS LIST when its handler landed — it no longer
// throws, so keeping a row here would assert the opposite of the shipped
// behaviour. Its guards live in `effects/dot.test.ts`, which drives a real
// `SimWorld.step()` and reads the HP curve back off `world.health`. Each
// remaining lane deletes its own row the same way.
const RESERVED: { effect: EffectDef; lane: RegExp }[] = [
  // ⚠️ `summon` (lane P2) LEFT THIS LIST when its handler landed, exactly as
  // `dot` did. Its guards live in `effects/summon.test.ts`, which drives a real
  // `SimWorld.step()` and reads the BODIES back off `world.transform` /
  // `world.health` / `world.team` — plus the expiry, cap and owner-death
  // decisions, each with a recorded mutation.
  // ⚠️ `invulnerable` (lane P3) LEFT THIS LIST when its handler landed, exactly
  // as `dot` did. Its guards live in `effects/invulnerable.test.ts`, which
  // drives a real `SimWorld.step()` and reads `world.health` / `movementHold`.
  // ⚠️ `knockback` (lane P4) LEFT THIS LIST when its handler landed, exactly as
  // `dot` and `invulnerable` did. Its guards live in `effects/knockback.test.ts`,
  // which drives a real `SimWorld.step()` and reads the DISPLACEMENT TRAJECTORY
  // back off `world.transform` (plus `world.airborne` for the 擊飛 arc).
  // ⚠️ `evasion` (lane P5) LEFT THIS LIST when its handler landed, exactly as
  // `dot` and `invulnerable` did. Its guards live in `effects/evasion.test.ts`,
  // which drives a real `SimWorld.step()` and reads hp lost off `world.health`
  // — plus the seeded 4σ binomial band that makes a `1 − p` misread impossible
  // to survive.
];

describe("reserved effect kinds (gh289-reserved-loud)", () => {
  it("every reserved kind THROWS, naming its lane — never a silent no-op", () => {
    cover("gh289-reserved-loud");
    for (const row of RESERVED) {
      const r = rig();
      expect(() => runEffects([row.effect], ctxOf(r))).toThrow(row.lane);
      // …and the world is untouched, so "it threw" cannot be confused with
      // "it half-applied something".
      expect(r.world.damageQueue).toHaveLength(0);
      expect(r.world.health.get(r.target)!.hp).toBe(500);
      expect(r.world.status.get(r.target)!.effects).toHaveLength(0);
    }
  });

  it("the Zod schema ACCEPTS every reserved kind (the slot is real, not a typo)", () => {
    cover("gh289-reserved-loud");
    // The point of reserving is that a lane can author and validate documents
    // before its handler exists. If the schema rejected them the slot would be
    // decorative.
    for (const row of RESERVED) {
      expect(zEffectDefUnion.safeParse(row.effect).success, row.effect.kind).toBe(true);
    }
  });

  it("BAKING a list that merely CONTAINS a reserved kind does not throw", () => {
    cover("gh289-reserved-loud");
    // `bake` is not `apply`. A leap resolves its whole `onLand` payload at
    // TAKEOFF (#247), so if an unimplemented kind's `bake` threw, a leap would
    // detonate the moment anything reserved shared its payload — a failure at
    // the wrong seam entirely. Absent `bake` must be the identity.
    const r = rig();
    // Reads whichever kind is STILL reserved rather than naming one, so a lane
    // landing its handler deletes exactly one row above and nothing here — the
    // `dot`/`invulnerable` edits proved the hard-coded form needs touching twice.
    const still = RESERVED[0];
    if (!still) return; // every lane has landed — nothing reserved is left to bake
    const payload: EffectDef[] = [
      { kind: "damage", damageType: "magic", amount: { flat: 5 } },
      still.effect,
    ];
    const baked = bakeCastTimeConditionals(payload, ctxOf(r));
    expect(baked).toEqual(payload);
    // …and it is still LOUD when it finally runs.
    expect(() => runEffects(baked, ctxOf(r))).toThrow(still.lane);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 3. DRIFT — the three lists name the same kinds.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("registry / schema drift (gh289-registry-drift)", () => {
  it("the Zod union and the handler registry cover exactly the same kinds", () => {
    cover("gh289-registry-drift");
    // ⚠️ This is a PROPERTY scan, not a behaviour scan (CLAUDE.md 失敗形態 ⑦),
    // and it is deliberately the weakest guard in the file. Its one job is to
    // catch the half-landed change: a kind added to the sim union (which the
    // mapped type forces into the registry) but never mirrored into Zod, so
    // authors cannot write it — or the reverse, a schema kind with no handler,
    // which would crash on `EFFECT_HANDLERS[kind].apply` being undefined.
    const schemaKinds = zEffectDefUnion.options
      .map((o) => (o.shape.kind as { value: string }).value)
      .sort();
    expect(Object.keys(EFFECT_HANDLERS).sort()).toEqual(schemaKinds);
  });

  it("every registry entry exposes a callable `apply`", () => {
    cover("gh289-registry-drift");
    for (const [kind, spec] of Object.entries(EFFECT_HANDLERS)) {
      expect(typeof spec.apply, kind).toBe("function");
      // `bake` is optional; when present it must be callable, because
      // `bakeOne` calls it unconditionally once it exists.
      if (spec.bake !== undefined) expect(typeof spec.bake, kind).toBe("function");
    }
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 4. shield.absorbs — the FIELD, the SCHEMA, and the AUTHORING seam.
 *
 * The FILTER's own behavioural guards (real steps, real hp / pool readback,
 * plus the shipped 破法對咒 docs) live in `shieldAbsorb.test.ts`, lane P6's
 * file. What stays here is the seam contract this file owns: the default must
 * be indistinguishable from the pre-#289 shield, and the schema must accept
 * exactly the four spellings.
 * ═════════════════════════════════════════════════════════════════════════ */

describe("shield damage-type filter (gh289-shield-absorbs)", () => {
  it("absent and \"all\" are byte-identical to the pre-#289 shield", () => {
    cover("gh289-shield-absorbs");
    // owner's default (「吸收所有傷害」) must not change ANY shipped document's
    // meaning, so the two spellings have to produce the same pool — including
    // the ABSENCE of a stored `absorbs`, which is the canonical form of "all".
    const run = (absorbs?: "all"): Record<string, unknown> => {
      const r = rig();
      const eff: EffectDef =
        absorbs === undefined
          ? { kind: "shield", amount: { flat: 120 }, duration: 4 }
          : { kind: "shield", amount: { flat: 120 }, duration: 4, absorbs };
      runEffects([eff], ctxOf(r));
      return { ...r.world.health.get(r.target)!.shields[0]! };
    };
    expect(run(undefined)).toStrictEqual(run("all"));
    expect(run(undefined).absorbs).toBeUndefined();
    expect(run(undefined).amount as number).toBeGreaterThan(0);
  });

  it("a NON-default filter is accepted and stored on the pool", () => {
    cover("gh289-shield-absorbs");
    // The anti-② guard, now that the filter exists: a doc that says
    // 「只吸魔法傷害」 must reach the pool as a magic-only pool. (What that pool
    // then does to real damage is shieldAbsorb.test.ts's job.)
    const r = rig();
    runEffects(
      [{ kind: "shield", amount: { flat: 50 }, duration: 3, absorbs: "magic" }],
      ctxOf(r),
    );
    const pools = r.world.health.get(r.target)!.shields;
    expect(pools).toHaveLength(1);
    expect(pools[0]!.absorbs).toBe("magic");
  });

  it("the schema accepts every spelling the sim implements, and nothing else", () => {
    cover("gh289-shield-absorbs");
    for (const absorbs of ["all", "physical", "magic", "true"]) {
      expect(
        zEffectDefUnion.safeParse({ kind: "shield", amount: { flat: 1 }, duration: 1, absorbs })
          .success,
        absorbs,
      ).toBe(true);
    }
    expect(
      zEffectDefUnion.safeParse({
        kind: "shield",
        amount: { flat: 1 },
        duration: 1,
        absorbs: "ap",
      }).success,
    ).toBe(false);
  });
});

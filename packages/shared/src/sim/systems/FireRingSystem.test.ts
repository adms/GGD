/**
 * FireRingSystem — the SIM-LEVEL half of #195: only OUTSIDE the shrinking ring
 * burns, each duel zone is judged against its OWN centre, and once the ring has
 * closed nobody anywhere is safe.
 *
 * The pure law and the shipped-config lock live in ../fireRing.test.ts; this
 * file drives real worlds through real ticks, because "the formula is right"
 * and "the system applies the formula to the right champion in the right zone"
 * are different claims and #132 shipped green on the first one.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA, type ArenaDef } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { beginCombatFireRing, fireRingRulesFromConfig, type FireRingRules } from "../fireRing";
import { normalizeCombatEnv } from "../combatEnv";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;
const HZ = 30;

/**
 * The skeleton arena's geometry MINUS its pillars.
 *
 * SKELETON_ARENA parks a 2.5 u obstacle circle on each zone's centre (and the
 * guardian stands there in a real match), so "a champion at the zone centre" is
 * a position the collision system will not let anyone occupy — it pushes them
 * out to 3.1 u and they burn at t ≈ 17.3 s instead of t = 20 s. That is a fact
 * about the ARENA, not about the ring, and mixing the two would make this file
 * fail the day someone moves a pillar. Same centres, same 24 u boundary, no
 * furniture: the ring math is then the only thing under test.
 */
const OPEN_ARENA: ArenaDef = {
  id: "arena.firering-open",
  name: "Fire Ring Test Arena",
  zones: SKELETON_ARENA.zones.map((z) => ({ ...z, obstacles: [] })),
};
const ZONE0 = OPEN_ARENA.zones[0]!;
const ZONE1 = OPEN_ARENA.zones[1]!;

/** The shipped ring, but igniting IMMEDIATELY so a test is 20 s, not 80 s. */
function ringNow(): FireRingRules {
  return fireRingRulesFromConfig(
    {
      startSec: 0,
      shrinkSec: 20,
      minRadius: 0.5,
      maxPctPerSec: 1,
    },
    DT,
  );
}

function world(): SimWorld {
  const w = new SimWorld(OPEN_ARENA, 99);
  w.combatActive = true;
  // The SHIPPED maxHealth multiplier (content/config/combat-env.json, #153).
  // The burn is %-of-own-maxHealth so the TTK is invariant to it — but base
  // `healthRegen` is a FLAT per-second add, so at the neutral 1.0 table regen is
  // ~0.24 %/s against a 4 %/s burn and visibly bends the closed form. Under the
  // real table it is ~0.03 %/s, i.e. the noise the design intends it to be.
  w.combatEnv = normalizeCombatEnv({ maxHealth: 8.0 });
  return w;
}

let nextSeat = 0;
function champ(w: SimWorld, x: number, z: number, zone: number, team = 1): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(nextSeat++ % 12),
    teamId: asTeamId(team),
    pos: { x, z },
    zone,
  });
}

/**
 * Step `n` ticks WITHOUT letting anything else move the champion: nav is empty
 * and no orders are issued, but regen would otherwise mask a small burn, so
 * tests compare against the burn events, not raw HP, where it matters.
 */
const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

/** Total fire-ring damage dealt to `id` on the LAST stepped tick. */
function ringDmg(w: SimWorld, id: EntityId): number {
  let sum = 0;
  for (const ev of w.events) {
    if (ev.type === "fireRingDamage" && ev.data.id === id) sum += ev.data.amount as number;
  }
  return sum;
}

describe("only OUTSIDE the shrinking ring burns (firering-shrink)", () => {
  it("a champion at the zone CENTRE takes nothing until the ring closes on it", () => {
    cover("firering-shrink");
    const w = world();
    const id = champ(w, ZONE0.center.x, ZONE0.center.z, 0);
    beginCombatFireRing(w, ringNow());

    // The centre is the LAST place to burn: `inner` reaches 0 when the radius
    // reaches the body radius 0.6, i.e. at k = 600·(24−0.6)/23.5 = 597.4 ticks
    // (19.91 s), not at 600. Everything before that is untouched.
    let burnedEarly = 0;
    for (let t = 1; t <= 597; t++) {
      step(w);
      burnedEarly += ringDmg(w, id);
    }
    expect(burnedEarly).toBe(0);
    expect(w.health.get(id)!.hp).toBe(w.health.get(id)!.maxHp); // untouched

    // …and from the next tick even dead-centre burns: 沒有生存空間.
    step(w);
    expect(ringDmg(w, id)).toBeGreaterThan(0);
  });

  it("a champion parked at 20 u starts burning exactly when `inner` crosses 20", () => {
    cover("firering-shrink");
    const w = world();
    const id = champ(w, ZONE0.center.x + 20, ZONE0.center.z, 0);
    const rules = ringNow();
    beginCombatFireRing(w, rules);

    // inner(k) = 24 - 23.5*k/600 - 0.6 = 20  ->  k = 600*3.4/23.5 = 86.8 ticks.
    // So ticks 1..86 are safe and tick 87 is the first burn.
    let firstBurnTick = -1;
    for (let t = 1; t <= 120 && firstBurnTick < 0; t++) {
      step(w);
      if (ringDmg(w, id) > 0) firstBurnTick = t;
    }
    expect(firstBurnTick).toBe(87);
  });

  it("zones are evaluated INDEPENDENTLY against their own centres", () => {
    cover("firering-shrink");
    const w = world();
    // Both stand at their own zone's centre — zone 1's centre is 80 u from
    // zone 0's, so a system that judged everyone against zone 0 would cook
    // the zone-1 champion from the first shrink tick.
    const a = champ(w, ZONE0.center.x, ZONE0.center.z, 0, 1);
    const b = champ(w, ZONE1.center.x, ZONE1.center.z, 1, 2);
    beginCombatFireRing(w, ringNow());
    let burnA = 0;
    let burnB = 0;
    for (let t = 0; t < 10 * HZ; t++) {
      step(w);
      burnA += ringDmg(w, a);
      burnB += ringDmg(w, b);
    }
    expect(burnA).toBe(0);
    expect(burnB).toBe(0);

    // …and one standing at zone 0's centre but ASSIGNED to zone 1 is 80 u from
    // its own ring, so it burns immediately.
    const w2 = world();
    const c = champ(w2, ZONE0.center.x, ZONE0.center.z, 1, 2);
    beginCombatFireRing(w2, ringNow());
    step(w2, 2);
    expect(ringDmg(w2, c)).toBeGreaterThan(0);
  });
});

describe("burn arithmetic finishes the round (firering-kills)", () => {
  it("a full-HP champion parked at the rim dies between 11.5 s and 11.7 s", () => {
    cover("firering-kills");
    const w = world();
    // 23.4 u out is EXACTLY clampToBoundary's limit for a 0.6 body, i.e. the
    // farthest a champion can legally stand: safe on the ignition tick, burning
    // from the very first shrink tick. That is "stepped out at ignition and
    // never came back", the worst case the design budgets for.
    const id = champ(w, ZONE0.center.x + 23.4, ZONE0.center.z, 0);
    beginCombatFireRing(w, ringNow());
    let deathTick = -1;
    for (let t = 1; t <= 20 * HZ && deathTick < 0; t++) {
      step(w);
      if (!w.health.get(id)!.alive) deathTick = t;
    }
    expect(deathTick).toBeGreaterThan(0);
    // ∫(0.04 + 0.008t)dt = 1 at t ≈ 11.583 s; regen (~0.03 %/s of an 8x maxHp)
    // is three orders of magnitude below the burn, so the closed form holds.
    expect(deathTick / HZ).toBeGreaterThan(11.5);
    expect(deathTick / HZ).toBeLessThan(11.7);
  });

  it("parked at the centre, death lands 3.69 ± 0.05 s after the ring closes", () => {
    cover("firering-kills");
    const w = world();
    const id = champ(w, ZONE0.center.x, ZONE0.center.z, 0);
    beginCombatFireRing(w, ringNow());
    let deathTick = -1;
    for (let t = 1; t <= 30 * HZ && deathTick < 0; t++) {
      step(w);
      if (!w.health.get(id)!.alive) deathTick = t;
    }
    expect(deathTick).toBeGreaterThan(0);
    // Burning starts when the ring closes ON the centre (k = 597.4, see above).
    //
    // ⚠️ WHY THIS EXPECTATION MOVED 5.0 → 3.69 (owner 2026-08-02, 「隨秒數越高
    // 越燒越痛」). The old number was 「20 %/s → 5.0 s from full HP」, and 20 %/s
    // was the rate FOREVER once the ring closed, because the retired ramp's x
    // axis saturated at `shrinkSec`. The burn now keeps climbing past the close
    // (20 s → 20 %/s, 40 s → 100 %/s), so the same champion is eaten by an
    // accelerating rate instead of a flat one: 3.687 s, measured.
    //
    // The NEW value is the correct one because the OLD one was a restatement of
    // the very saturation the owner asked to remove — a guard that still
    // demanded 5.0 s would be pinning the defect (第三守則 / 失敗形態 ④).
    // Cross-checked in `fireRingBurnCurve.test.ts`, which pins the same event as
    // an absolute tick (709 past ignition) rather than a window.
    const secAfterClose = deathTick / HZ - 597.4 / HZ;
    expect(secAfterClose).toBeGreaterThan(3.64);
    expect(secAfterClose).toBeLessThan(3.74);
  });

  it("the burn is environmental: no attacker, no kill credit", () => {
    cover("firering-kills");
    const w = world();
    const id = champ(w, ZONE0.center.x + 23.5, ZONE0.center.z, 0);
    beginCombatFireRing(w, ringNow());
    let death: Record<string, unknown> | null = null;
    for (let t = 1; t <= 20 * HZ && !death; t++) {
      step(w);
      const ev = w.events.find((e) => e.type === "death" && e.data.id === id);
      if (ev) death = ev.data as Record<string, unknown>;
    }
    expect(death).not.toBeNull();
    expect(death!.killerId ?? null).toBeNull();
  });
});

/**
 * FireRingSystem — the shrinking round-pacing ring (火圈 / 火環, tasks #132/#195).
 *
 * Runs right after combatResolveSystem and BEFORE deathSystem: it directly
 * removes HP (a pure environmental burn — no attacker, so no kill credit, no
 * bounty, no lifesteal, and it bypasses armor/MR AND the combat-env damage
 * knob), then this tick's deathSystem picks up any champion it dropped to 0 and
 * resolves the death exactly like any other (killer = null → environmental).
 *
 * #195 — ONLY OUTSIDE THE RING BURNS. From ignition the ring contracts
 * continuously (see `fireRing.ts`'s shrink law); a champion whose WHOLE BODY is
 * inside its OWN zone's ring takes nothing, everyone else burns at a rate that
 * ramps with the shrink progress. Zones are evaluated INDEPENDENTLY against
 * their own centres — a duel in zone 1 is not judged against zone 0's geometry.
 * Once the ring is fully closed the inside test is false for everybody, so the
 * last seconds are 「沒有生存空間」 without a second code path.
 *
 * GATES (all must hold, else a pure no-op):
 *   - `world.fireRingRules` armed (host called beginCombatFireRing on entry)
 *   - `world.fireRingTicks >= 0`
 *   - `world.combatActive` — LIVE combat only. The instant a round settles
 *     (task #100 flips combatActive false) the ring stops burning AND its
 *     counter stops advancing, so the replicated radius freezes with the
 *     mechanic instead of shrinking over a settled round.
 *
 * PER-ZONE GATE (task #216). `combatActive` is GLOBAL and only drops once EVERY
 * pairing is decided, so the survivors of a duel that ended EARLY kept burning
 * while the other zone fought on — and, because a player knocked out this round
 * is already in the shop, that read as 「回到商店…血量會降低」. A zone listed in
 * `world.settledZones` (written by the host the instant it records that zone's
 * duel winner) is COMBAT-OVER: its champions are skipped here, and skipped
 * identically by `isBurnedByFireRing` so the BURNING flag / red wash can never
 * claim a burn that no longer happens. The ring's CLOCK and RADIUS stay global
 * — the live zone still needs them, and the snapshot replicates only one radius.
 *
 * The combat-elapsed counter (`fireRingTicks`) is incremented FIRST — mirroring
 * FlowerSystem — so the ring ignites exactly `startTicks` combat ticks in, and
 * the shrink's tick 0 is that same tick (radius still == the zone boundary,
 * hence nobody burns on the ignition tick itself).
 */
import type { SimWorld } from "../SimWorld";
import type { EntityId } from "../../ids";
import { distSq } from "../math/vec2";
import { fireRingIsSafe, fireRingRadius, fireRingRatePerSec } from "../fireRing";
import { summonBurnsInFireRing } from "../summonRules";
import { applyEnvironmentalBurn } from "../combat/environmentalBurn";

export function fireRingSystem(world: SimWorld): void {
  const rules = world.fireRingRules;
  if (!rules) return;
  if (world.fireRingTicks < 0) return;
  if (!world.combatActive) return; // live combat only (task #100 coordination)

  // combat-elapsed counter: incremented first so ignition lands exactly
  // startTicks into combat and the shrink clock starts on that same tick.
  world.fireRingTicks++;
  const elapsed = world.fireRingTicks;
  if (elapsed < rules.startTicks) return; // dormant — the ring has not closed in yet

  const ticksSinceStart = elapsed - rules.startTicks;
  // one-shot ignition beat (the 火圈 scene / BGM cue) exactly when it begins.
  if (ticksSinceStart === 0) world.emit("fireRingStart", { atTick: world.tick });

  const ratePerSec = fireRingRatePerSec(rules, ticksSinceStart);
  // Telegraph carries the RADIUS too now: it is the one number a server-side
  // consumer (replay tooling, the sim harness) needs to reason about the ring
  // without re-deriving the law. Still SERVER-ONLY — see eventFanout.ts.
  world.emit("fireRingTick", {
    ratePerSec,
    ticksSinceStart,
    radius: fireRingRadius(rules, ticksSinceStart, world.arena.zones[0]?.boundaryRadius ?? 0),
  });
  if (ratePerSec <= 0) return; // degenerate config: telegraph only, no damage

  const dt = world.dt;
  // GH#287 攔截層規則, hoisted ONCE per tick rather than rebuilt per body: the
  // burn closure below runs for every champion AND every burning 召喚物.
  const envRules = { lethalSaveApplies: rules.lethalSaveApplies ?? false };

  /**
   * One body's burn. Extracted so the champion pass and the 召喚物 pass below
   * cannot drift on the geometry, the rate or the event shape — three places
   * that must agree exactly or the client's flame outruns the damage.
   */
  const burn = (id: EntityId): void => {
    const hp = world.health.get(id);
    if (!hp || !hp.alive) return;
    const t = world.transform.get(id);
    if (!t) return;
    // #216: this zone's duel is already decided — the round is OVER here, so the
    // ring must not keep eating its survivors while another zone fights on.
    if (world.settledZones.has(t.zone)) return;
    // per-zone geometry: each duel's ring closes on ITS OWN centre.
    const zoneDef = world.arena.zones[t.zone] ?? world.arena.zones[0];
    if (!zoneDef) return;
    const radius = fireRingRadius(rules, ticksSinceStart, zoneDef.boundaryRadius);
    // WHOLE BODY inside = safe. At the closed radius `radius - t.radius < 0`,
    // so this is false for every champion at every position.
    if (fireRingIsSafe(radius, t.radius, distSq(t.pos, zoneDef.center))) return;
    const dmg = hp.maxHp * ratePerSec * dt;
    if (dmg <= 0) return;
    // GH#287 —— ⛔ NOT `hp.hp -= dmg` any more. That bare write bypassed EVERY
    // interception on the damage queue (無敵 / 免死), silently, for a year: the
    // ring is the round's most common cause of death, so 「受到致命傷害時…」
    // content was buying a card the game did not honour (失敗形態 ②).
    // `applyEnvironmentalBurn` is the ONE place those gates live; it still skips
    // armour/MR, shields and `combatEnv.damageDealt` on purpose (see its ③).
    const dealt = applyEnvironmentalBurn(world, id, dmg, envRules);
    if (dealt <= 0) return; // refused — no HP moved, so no burn to telegraph
    world.emit("fireRingDamage", {
      id,
      amount: dealt,
      dmgType: "true",
      origin: "fireRing",
      x: t.pos.x,
      z: t.pos.z,
    });
  };

  // champion store iterates in ascending-id insertion order — deterministic.
  for (const id of world.champion.keys()) burn(id);

  // 保底 also covers 召喚物 (owner 2026-07-30 「所有場上玩家、bot、各種殭屍」).
  // A summon's body is a hero doc with a hero's HP, so a permanent one standing
  // outside the closed ring would be the only thing on the field the round
  // cannot remove. Per-ability switchable — 37-03 災難之牆's wall units are
  // scenery, not combatants — see sim/summonRules.ts.
  //
  // STRICT no-op while nothing has summoned (`world.summon` empty), and the ids
  // are SORTED: `world.summon` is a Map whose iteration order is insertion
  // order, and this loop emits events that land in `world.events` — an unsorted
  // walk would make the event order depend on spawn history rather than on id.
  if (world.summon.size > 0) {
    for (const id of [...world.summon.keys()].sort((a, b) => a - b)) {
      const sm = world.summon.get(id);
      if (sm === undefined || !summonBurnsInFireRing(sm)) continue;
      burn(id);
    }
  }
}

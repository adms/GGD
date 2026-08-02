/**
 * Fire ring (火圈 / 火環) — the round-pacing hazard.
 *
 * REDESIGNED (task #195, owner directive):
 *
 *   「火圈出現時間變成 戰鬥開始 60秒，而且是漸漸縮圈，只有在不斷縮小的圈圈才
 *     不會扣血，圈圈外會有激烈火焰，角色被火燒到畫面會變半透明紅，圈圈會花
 *     20秒時間縮到最小沒有生存空間」
 *
 * so the mechanic is now a BATTLE-ROYALE RING, not a global burn timer:
 *
 *   • it ignites 60 s of combat-ELAPSED time in (`startSec`, unchanged in kind
 *     — see THE TRIGGER below, nothing inverted);
 *   • from that instant the ring radius CONTRACTS CONTINUOUSLY from the zone
 *     boundary (24) to `minRadius` (0.5) over `shrinkSec` (20 s) — 0.0392 u per
 *     30 Hz tick, i.e. visually smooth, never a staircase;
 *   • a champion whose WHOLE BODY is inside the ring takes nothing; anyone
 *     outside burns with a %-of-own-maxHealth true-damage rate that ramps with
 *     the shrink progress (4 %/s at ignition → 20 %/s at the end);
 *   • at the end `minRadius - bodyRadius < 0`, so the "inside" test is false for
 *     every champion at every position — 「沒有生存空間」 falls out of the same
 *     arithmetic instead of needing a second rule.
 *
 * WHY minRadius = 0.5 AND NOT 0. A champion's collision radius is 0.6
 * (`spawnChampion.ts`). The safety predicate is WHOLE-BODY-INSIDE:
 * `inner = radius - body.radius; inner > 0 && distSq <= inner*inner`. At 0.5,
 * `inner = -0.1 < 0` → false for everyone, everywhere, with no special case. At
 * 0 the visual would collapse to a point AND "dist exactly 0" would be a
 * measure-zero safe spot; 0.5 leaves a renderable flame cauldron that is
 * provably narrower than a body. Symmetrically, at t = 0 `inner = 23.4`, which
 * is EXACTLY `clampToBoundary`'s `boundaryRadius - body.radius`, so ignition
 * burns nobody — the ring only starts biting as it moves.
 *
 * THE TRIGGER: `startSec` is combat-ELAPSED seconds and always was
 * (`FireRingSystem` counts up from combat entry). #195 changes its VALUE from
 * 180 to 60; it does NOT invert the client's cue derivation
 * (`apps/client/src/audio/fireRingWindow.ts` still derives
 * `combatMaxSec - startSec` seconds-LEFT). `combatMaxSec` comes down to 100
 * with it so the bed swap stays coincident with ignition and the `combat` bed's
 * B-section still gets to play.
 *
 * WHY THE BURN IS NOT SCALED BY combat-env `damageDealt`. The rate is a
 * fraction of the victim's OWN maxHealth, so it is already invariant to the
 * `maxHealth` multiplier and to every stat knob; folding `damageDealt` in would
 * turn a global tuning dial into a silent retiming of the round. The ring is
 * ROUND PACING, not combat — it must keep its 20 s clock whatever the operator
 * does to combat numbers. (It also bypasses armor/MR, shields, the damage queue
 * and kill credit — unchanged from #132, deliberately.)
 *
 * SINGLE SOURCE OF TRUTH: the ring's schedule is `config.match@1`'s
 * `match.fireRing` block. `combatMaxSec` is only the hard phase backstop and
 * must be >= `startSec + shrinkSec` (schema-enforced), so the ring can always
 * finish closing before the phase force-ends.
 *
 * 回合硬上限 — 不管什麼條件 (#248, owner 2026-08-01):
 *
 *   「時間延長太久了，不管什麼條件，每回合最長上限就是 5 分鐘出現火圈準備收場，
 *     不會無限增加時間」
 *
 * `roundHardCapSec` (300 s shipped) is a CEILING on the ignition tick, enforced
 * by {@link applyRoundHardCap} on the STATE rather than at any call site — see
 * that function for why that is the only way it can honour 「不管什麼條件」. What
 * it actually bounds is `extendRoundForBoss`, which the shipped
 * `arena-rules.json` lets fire again on every 100th zombie PER CHAMPION
 * (`boss.repeatable: true`), each time adding another 180 s to BOTH deadlines.
 * The `.max(3600)` bounds on those two knobs bound one summon; nothing bounded
 * the total until this.
 *
 * 保底 — EVERY UNIT BURNS, NOT JUST CHAMPIONS (owner 2026-07-30):
 *
 *   「火圈百分比真實傷害是所有場上玩家、bot、各種殭屍都會百分比真實傷害燒死，
 *     所以還是有個保底結果」
 *
 * #132/#195/#270 built the burn as a CHAMPION-ONLY loop (`FireRingSystem`
 * iterates `world.champion`), which was fine while a round ended on 「一隊全滅」.
 * The moment a round also waits on the field being CLEAR, one zombie wedged in a
 * corner can hold the round open forever, because nothing else in the sim is
 * guaranteed to reach it. {@link fireRingBurnMobs} closes that: the same radius,
 * the same rate, the same %-of-own-maxHealth true damage, applied to 一般殭屍 /
 * 特殊殭屍 / 殭屍王 as well. PERCENT is what makes it a backstop at all — a flat
 * number is a rounding error against a 276,944 hp king.
 *
 * Lifecycle (mirrors flowers/revives): combat-phase only. The match host arms
 * it on combat entry (`beginCombatFireRing`) and disarms it on round exit
 * (`endCombatFireRing`). The tick loop additionally gates every burn on
 * `world.combatActive`, so the instant a round SETTLES (task #100) the ring
 * stops — it is a LIVE-combat accelerator, never a post-settle grinder — and,
 * per zone, on `world.settledZones` (task #216), so a duel that finished EARLY
 * stops burning its CHAMPIONS instead of grinding them down while the other
 * zone is still fighting (that grind is what the owner saw from the shop).
 *
 * ⚠️ THE settledZones SKIP IS CHAMPION-ONLY SINCE 2026-07-30. It was written
 * when the ring only ever touched champions, so 「a settled zone does not burn」
 * and 「a settled zone does not burn PLAYERS」 were the same sentence; they are
 * not any more. {@link fireRingBurnMobs} keeps eating zombies in a settled zone
 * on purpose — the reason is written at that function, and
 * {@link isBurnedByFireRing} forks identically so the flag never outruns the
 * damage.
 *
 * PURITY: no rng, no trig, no transcendentals, no wall-clock. The radius is a
 * pure function of the tick COUNTER (never accumulated `r -= step`, which would
 * be a function of tick HISTORY and could drift), built from one subtract, one
 * divide, one multiply and one add — all IEEE-correctly-rounded, hence
 * byte-identical across replicas.
 */
import type { SimWorld } from "./SimWorld";
import type { EntityId } from "../ids";
import { distSq } from "./math/vec2";

/** Fire-ring rules in TICKS (converted from the config doc's seconds). */
export interface FireRingRules {
  /**
   * The ABSOLUTE combat-elapsed tick the ring ignites on — the round-length
   * knob, and (since #L1) the ring half of the ROUND CLOCK below.
   *
   * ⚠️ NOT a constant any more. `extendRoundForBoss` moves this DEADLINE
   * outward when the 殭屍王 walks in. It is still an absolute threshold
   * compared against the up-counter `world.fireRingTicks` — never a countdown
   * that gets topped up — so 「延後 180 秒」 is one add on one number and the
   * radius stays a pure function of (rules, tick). See THE ROUND CLOCK below.
   *
   * ⚠️ AND IT IS BOUNDED ABOVE by {@link hardCapTicks} since #248: every write
   * to it goes through {@link applyRoundHardCap}, so no caller — present or
   * future — can push the ring past 回合硬上限.
   */
  startTicks: number;
  /** ticks the ring takes to contract from the zone boundary to `minRadius`. */
  shrinkTicks: number;
  /** the fully-closed radius. Below a champion's body radius, on purpose. */
  minRadius: number;
  /** per-second burn (fraction of maxHealth) the instant the ring ignites. */
  burnPctPerSecStart: number;
  /** per-second burn (fraction of maxHealth) once the ring is fully closed. */
  burnPctPerSecEnd: number;
  /** hard cap on the per-second rate (fraction of maxHealth). */
  maxPctPerSec: number;

  /* ── THE ROUND CLOCK (#L1) ─────────────────────────────────────────────
   *
   * owner 2026-07-30: 「殭屍王出現回合結束時間延長 3 分鐘(火圈時間也延後),
   * 除非全死不然不會提前結束,避免打到一半結果回合結束」
   *
   * WHY THE DEADLINE LIVES HERE AND NOT IN A COUNTDOWN. `PhaseMachine` runs
   * combat off `ticksLeft--`, a DECREMENTING counter; extending a round that
   * way means `ticksLeft += 5400`, which is exactly the pattern CLAUDE.md
   * forbids (「到期一律用絕對 tick,不是遞減計數器」) because two hosts that
   * decrement a different number of times disagree about when the round ends.
   * `combatMaxTicks` is the same deadline as an ABSOLUTE combat-elapsed tick,
   * compared against the very counter (`world.fireRingTicks`) the ring already
   * uses — so the two halves of 「延長 3 分鐘」 can never drift apart, and
   * extending is one add on one number rather than a re-based countdown.
   *
   * WHY ON THE RING'S RULES. `world.fireRingTicks` IS the combat-elapsed clock
   * (FireRingSystem increments it, and only while `combatActive`), and the ring
   * schedule is already armed/disarmed per combat entry by the match host. A
   * second per-combat clock would have to be armed by the same host at the same
   * moment and could then be armed at a DIFFERENT moment — which is how two
   * round timers end up disagreeing. One clock, two thresholds.
   */

  /**
   * ABSOLUTE combat-elapsed tick at which the combat phase is over — the hard
   * backstop `match.combatMaxSec` names, in the sim's own units.
   *
   * `Number.POSITIVE_INFINITY` = the caller armed the ring without telling the
   * sim the backstop (`fireRingRulesFromConfig`'s third argument omitted:
   * fixtures, the client's prediction shadow, any pre-#L1 caller). Then
   * {@link isCombatTimeUp} is false forever, i.e. the sim asserts no deadline
   * at all — byte-identical to the behaviour before #L1, where the deadline
   * existed only inside the game-server's PhaseMachine.
   */
  combatMaxTicks: number;
  /** ticks ONE 殭屍王 summon adds to `combatMaxTicks` (0 = the knob is off). */
  bossExtendTicks: number;
  /** ticks ONE 殭屍王 summon adds to `startTicks` (0 = the knob is off). */
  bossDelayTicks: number;
  /**
   * running total actually added to `combatMaxTicks` so far this combat.
   *
   * ⚠️ 「ACTUALLY」 IS LOAD-BEARING SINCE #248. This is what the host mirrors
   * onto `PhaseMachine.ticksLeft` (the countdown on the wire) and what
   * `mobBossSpawn.extendedTicks` broadcasts. Once the hard cap starts eating
   * extensions, the AUTHORED `bossExtendTicks` and the APPLIED delta stop being
   * the same number, and a countdown seeded from the authored one would show
   * the player three minutes the sim has no intention of giving.
   */
  bossExtendedTicks: number;
  /** running total actually added to `startTicks` so far this combat. */
  bossDelayedTicks: number;

  /* ── THE HARD CAP (#248) ───────────────────────────────────────────────
   *
   * owner 2026-08-01: 「時間延長太久了，不管什麼條件，每回合最長上限就是 5 分鐘
   * 出現火圈準備收場，不會無限增加時間」
   *
   * WHY A CEILING AND NOT A THIRD CLOCK. Everything that lengthens a round today
   * does it by ADDING to one of the two numbers above (`extendRoundForBoss` is
   * the only mutator, and `arena-rules.json`'s `boss.repeatable: true` at
   * `killThreshold: 100` is what makes it unbounded — 100, 200, 300 … zombies,
   * per champion, +180 s each time). A cap expressed as a CEILING ON THOSE TWO
   * NUMBERS therefore binds every such path by construction, including ones
   * written later, because the thing being capped is the state, not the caller.
   * A separate 「hard stop」 timer would have to be armed by somebody, and could
   * then be armed at the wrong moment or not at all — the exact failure the
   * ROUND CLOCK note above rejects a second clock for.
   *
   * BOTH ARE ABSOLUTE TICKS, per CLAUDE.md 「到期一律用絕對 tick」.
   */

  /**
   * Ceiling on {@link startTicks}: the ring's closing sequence begins here no
   * matter what deferred it. `Number.POSITIVE_INFINITY` = no cap authored
   * (`FireRingConfigLike.roundHardCapSec` omitted — fixtures, the client's
   * prediction shadow, any pre-#248 caller), which is byte-identical to the
   * behaviour before this field existed.
   */
  hardCapTicks: number;
  /**
   * Ceiling on {@link combatMaxTicks}. Derived ONCE at arm time as
   * `hardCapTicks + tail`, where `tail` is the gap the operator authored between
   * ignition and the backstop (`combatMaxSec - startSec`, floored at
   * `shrinkTicks`). So the cap moves the whole authored shape forward instead of
   * inventing a second 「多久之後才真的結束」 number the operator never wrote:
   * on the shipped 60/20/100 the tail is 40 s, so a capped round ignites at
   * 5:00, is fully closed at 5:20 and force-settles at 5:40.
   */
  hardDeadlineTicks: number;
}

/** Seconds-based fire-ring config (mirror of config.match@1 `match.fireRing`). */
export interface FireRingConfigLike {
  startSec: number;
  shrinkSec?: number;
  minRadius?: number;
  burnPctPerSecStart?: number;
  burnPctPerSecEnd?: number;
  maxPctPerSec?: number;
  /**
   * 殭屍王在場時的回合延長 (#L1) — mirror of `match.fireRing.boss`.
   *
   * It rides INSIDE the ring block, not beside it, for one reason: the match
   * host resolves `match.fireRing` (`resolveFireRing()`) and hands exactly that
   * object to `fireRingRulesFromConfig`. A sibling block would need a second
   * channel through the host, and a knob that needs new plumbing before it does
   * anything is a knob the operator can turn with no effect.
   *
   * ABSENT ⇒ both 0 ⇒ a king changes nothing, the pre-#L1 behaviour.
   */
  boss?: {
    /** seconds added to the combat deadline per summon (owner: 180) */
    extendCombatSec?: number;
    /** seconds the ring's ignition is pushed back per summon (owner: 180) */
    delayFireRingSec?: number;
  };
  /**
   * 回合硬上限 (#248) — the combat-elapsed second the ring's closing sequence
   * begins at NO MATTER WHAT. Mirror of `match.fireRing.roundHardCapSec`.
   *
   * ABSENT ⇒ NO CAP, deliberately asymmetric with the schema's `.default(300)`,
   * exactly like `boss` above and for the same reason: a doc that went through
   * the loader always has one, while a hand-built fixture or the client's
   * prediction shadow stays byte-identical to pre-#248.
   */
  roundHardCapSec?: number;
}

/**
 * Convert the seconds-based config block into tick-based sim rules. The
 * seconds→ticks conversion happens ONCE, here, at arm time — never per tick, so
 * no per-tick division can round differently on a different host.
 *
 * `combatMaxSec` is `config.match@1`'s `match.combatMaxSec`, passed in rather
 * than mirrored into the ring block: the doc must keep exactly one home for
 * that number (the schema's own refine already couples them). Omit it and the
 * sim simply asserts no deadline — see {@link FireRingRules.combatMaxTicks}.
 */
export function fireRingRulesFromConfig(
  cfg: FireRingConfigLike,
  dt: number,
  combatMaxSec?: number,
): FireRingRules {
  // Seconds→ticks for the two extension knobs. `Math.max(0, …)` and not
  // `Math.max(1, …)`: 0 seconds must mean 「這個開關關掉」, and a phase-minimum
  // of one tick would turn 「不要延長」 into 「延長一格」.
  const extTicks = (sec: number | undefined): number =>
    sec === undefined || !(sec > 0) ? 0 : Math.round(sec / dt);
  const startTicks = Math.max(0, Math.round(cfg.startSec / dt));
  const shrinkTicks = Math.max(1, Math.round((cfg.shrinkSec ?? 20) / dt));
  const combatMaxTicks =
    combatMaxSec === undefined || !Number.isFinite(combatMaxSec) || combatMaxSec <= 0
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.round(combatMaxSec / dt));
  // #248 — the two ceilings, resolved ONCE here so no per-tick arithmetic can
  // round them differently on a different host (same rule as the two above).
  const hardCapTicks =
    cfg.roundHardCapSec === undefined ||
    !Number.isFinite(cfg.roundHardCapSec) ||
    cfg.roundHardCapSec <= 0
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.round(cfg.roundHardCapSec / dt));
  // The tail the operator authored between ignition and the backstop. Floored at
  // one full close so a cap can never force-end combat with the ring still
  // shrinking — the promise is 「出現火圈準備收場」, and a 收場 nobody gets to see
  // is failure mode ① one layer up.
  const authoredTail = Number.isFinite(combatMaxTicks)
    ? Math.max(shrinkTicks, combatMaxTicks - startTicks)
    : shrinkTicks;
  const rules: FireRingRules = {
    startTicks,
    shrinkTicks,
    minRadius: cfg.minRadius ?? 0.5,
    burnPctPerSecStart: cfg.burnPctPerSecStart ?? 0.04,
    burnPctPerSecEnd: cfg.burnPctPerSecEnd ?? 0.2,
    // absent cap = no cap (a very large finite factor keeps min() deterministic).
    maxPctPerSec: cfg.maxPctPerSec ?? 1e9,
    combatMaxTicks,
    bossExtendTicks: extTicks(cfg.boss?.extendCombatSec),
    bossDelayTicks: extTicks(cfg.boss?.delayFireRingSec),
    bossExtendedTicks: 0,
    bossDelayedTicks: 0,
    hardCapTicks,
    hardDeadlineTicks: Number.isFinite(hardCapTicks)
      ? hardCapTicks + authoredTail
      : Number.POSITIVE_INFINITY,
  };
  // Arm-time clamp. A no-op on any doc the schema validated (its refine already
  // requires `startSec + shrinkSec <= roundHardCapSec`), but `FireRingConfigLike`
  // is also hand-built by fixtures and by the MatchController's per-round
  // substitutions — and 「不管什麼條件」 has to include 「the round started that
  // way」, not only 「something extended it」.
  applyRoundHardCap(rules);
  return rules;
}

/**
 * 回合硬上限 (#248) — clamp both round deadlines back under the cap. IDEMPOTENT
 * and total: it reads only `rules`, so calling it after ANY mutation of
 * `startTicks` / `combatMaxTicks` restores the invariant.
 *
 * owner 2026-08-01: 「不管什麼條件，每回合最長上限就是 5 分鐘出現火圈準備收場，
 * 不會無限增加時間」
 *
 * ⚠️ THIS IS THE ONLY PLACE THE CAP IS ENFORCED, ON PURPOSE. `startTicks` is
 * read directly by four consumers (`fireRingSystem`, `fireRingBurnMobs`,
 * `currentFireRingRadius`, `isBurnedByFireRing`) plus two accessors. Clamping
 * the STATE at write time keeps all six correct with no second copy of the rule;
 * clamping at READ time would need six identical edits and the first one missed
 * would put the client's flame on a different clock from the damage — the exact
 * drift the #216 note above spent a paragraph avoiding.
 *
 * NO CAP AUTHORED ⇒ IMMEDIATE RETURN, so a fixture / prediction-shadow world is
 * byte-identical to pre-#248 and every existing recorded digest still replays.
 *
 * ⚠️ 「A CAPPED ROUND ALWAYS FINISHES CLOSING」 IS AN INVARIANT OF THE TWO
 * CEILINGS, NOT A THIRD CLAMP. `hardDeadlineTicks - hardCapTicks` is the
 * authored tail, which `fireRingRulesFromConfig` floors at `shrinkTicks`. So:
 *
 *   · both clamps fire  → gap = authoredTail            >= shrinkTicks ✔
 *   · only the deadline → gap = hardDeadline - startTicks, and startTicks is
 *                         already <= hardCapTicks, so gap >= authoredTail   ✔
 *   · neither fires     → nothing changed; whatever gap the config had is the
 *                         pre-#248 behaviour, not this feature's business    ✔
 *
 * An extra `startTicks = min(startTicks, combatMaxTicks - shrinkTicks)` line
 * was written here first and then DELETED: against `hardDeadlineTicks` it can
 * never fire (proof above), and against the AUTHORED deadline it fires only on
 * a config the schema already rejects (`startSec + shrinkSec > combatMaxSec`) —
 * where it would silently re-time a deliberately degenerate fixture and pretend
 * to have fixed an authoring bug. A guard that cannot fire is a comment
 * pretending to be code (CLAUDE.md 第三守則).
 *
 * PURITY: two comparisons and two assignments. No rng, no clock, no iteration.
 */
export function applyRoundHardCap(rules: FireRingRules): void {
  if (!Number.isFinite(rules.hardCapTicks)) return;
  if (rules.combatMaxTicks > rules.hardDeadlineTicks) {
    rules.combatMaxTicks = rules.hardDeadlineTicks;
  }
  if (rules.startTicks > rules.hardCapTicks) rules.startTicks = rules.hardCapTicks;
}

/**
 * THE 殭屍王 ROUND EXTENSION (#L1). Called from `summonMobBoss` — the one place
 * a king actually enters the world — the instant the king is spawned.
 *
 * Moves BOTH deadlines outward by the authored amounts:
 *   • `combatMaxTicks += bossExtendTicks`  ── 「回合結束時間延長 3 分鐘」
 *   • `startTicks     += bossDelayTicks`   ── 「火圈時間也延後」
 *
 * BOTH, ALWAYS, TOGETHER. Extending only the phase would leave the ring closing
 * on its original schedule, so the king fight would still end with everyone
 * burned out of the arena — which is the exact 「打到一半結果回合結束」 the
 * owner asked to stop. Delaying only the ring would run the round into the hard
 * backstop instead. They are one instruction and this is the one function.
 *
 * IF THE RING HAS ALREADY IGNITED it RE-OPENS: `startTicks` moves past
 * `world.fireRingTicks`, so `fireRingRadius` is asked for a negative
 * `ticksSinceStart` and returns the full zone boundary again, FireRingSystem
 * goes dormant, and `isBurnedByFireRing` reports false — all three off the same
 * comparison, so no consumer can disagree with another. That is deliberate: the
 * king is a 100-kill payoff and the owner's rule is that it must be fightable,
 * not that the fire keeps its place in the queue. The visible cost is a radius
 * pop and a second `fireRingStart` beat when the delayed ignition comes round;
 * both are honest 「火圈延後了」 signals.
 *
 * Returns the ticks ADDED to the combat deadline this call (0 when the ring is
 * disarmed or both knobs are 0), so the caller can put the real number on the
 * wire instead of re-deriving it from config.
 *
 * PURITY: two adds on two numbers, no rng, no clock, no iteration order.
 */
export function extendRoundForBoss(world: SimWorld): number {
  const rules = world.fireRingRules;
  // No armed ring ⇒ no combat-elapsed clock to hang a deadline on. The knob is
  // authored inside the ring block precisely so this can never be a silent
  // half-state: no ring, no round clock, no extension.
  if (!rules || world.fireRingTicks < 0) return 0;
  const extend = rules.bossExtendTicks;
  const delay = rules.bossDelayTicks;
  if (extend <= 0 && delay <= 0) return 0;

  // ⛔ THE HALF-STATE GATE. `combatMaxTicks` is `Infinity` whenever the host
  // armed the ring WITHOUT a backstop — which is what ships today:
  // `MatchController` calls `fireRingRulesFromConfig(ring, dt)` with TWO args,
  // so the deadline that actually force-ends combat is `PhaseMachine.ticksLeft`
  // (100 s × 30 Hz = 3000 ticks) and nothing here can move it.
  //
  // Applying only the delay in that world is STRICTLY WORSE THAN NOT APPLYING
  // ANYTHING: ignition slides 1800 → 7200 while the round still ends at 3000,
  // so summoning a 殭屍王 does not extend the round — it SILENTLY CANCELS THE
  // FIRE RING for the whole round. That also removes the 保底 that
  // `fireRingBurnMobs` provides, in exactly the rounds a ~276k-HP king is up.
  // Measured on the shipped 2-arg wiring at the last combat tick (2999):
  // with a king `radius = 24.0` (full boundary) and `burning = false`;
  // without one `radius = 0.5`, `burning = true`.
  //
  // So: no enforceable deadline ⇒ no delay either. Both halves or neither —
  // which is what this function's own contract said all along, and what the
  // previous revision violated. Once the host passes `combatMaxSec` through,
  // this gate opens on its own and both halves apply. Do NOT "fix" this by
  // deleting the guard; fix the host wiring (see the 3-arg overload).
  if (!Number.isFinite(rules.combatMaxTicks)) return 0;

  // #248 — APPLY, THEN CAP, THEN BOOK WHAT SURVIVED. The running totals and the
  // return value are measured as DELTAS across the clamp, never taken from the
  // authored knobs, because the host mirrors this number onto the player's
  // round countdown (`MatchController.combatTimeUp`) and `summonMobBoss` puts it
  // on the wire as 「回合延長 N 秒」. Booking the authored 180 while the cap gave
  // 60 would be a countdown the player can catch out with a stopwatch — the
  // same lie the 「read the REAL number back out」 note in mobs.ts already names.
  const startBefore = rules.startTicks;
  const deadlineBefore = rules.combatMaxTicks;
  rules.startTicks += delay;
  rules.combatMaxTicks += extend;
  applyRoundHardCap(rules);
  const appliedDelay = rules.startTicks - startBefore;
  const appliedExtend = rules.combatMaxTicks - deadlineBefore;
  rules.bossDelayedTicks += appliedDelay;
  rules.bossExtendedTicks += appliedExtend;
  return appliedExtend;
}

/**
 * The ignition tick IN FORCE right now — post-extension, which is the whole
 * point: a consumer that reads `match.fireRing.startSec` off the config doc is
 * reading the value the round STARTED with, not the one the ring will actually
 * fire on. -1 when the ring is disarmed.
 */
export function fireRingIgnitionTick(world: SimWorld): number {
  const rules = world.fireRingRules;
  return rules && world.fireRingTicks >= 0 ? rules.startTicks : -1;
}

/**
 * The combat deadline IN FORCE right now, as an absolute combat-elapsed tick —
 * post-extension. `Number.POSITIVE_INFINITY` when the ring is disarmed or the
 * host armed it without a backstop (see {@link FireRingRules.combatMaxTicks}).
 */
export function combatDeadlineTick(world: SimWorld): number {
  const rules = world.fireRingRules;
  return rules && world.fireRingTicks >= 0 ? rules.combatMaxTicks : Number.POSITIVE_INFINITY;
}

/**
 * Has the combat phase run out of time? THE predicate a match host should
 * force-end combat on, replacing a `ticksLeft--` countdown: it is absolute, it
 * is the same clock the ring reads, and it already accounts for every 殭屍王
 * extension applied this round.
 *
 * 「除非全死不然不會提前結束」 — the OTHER half of the owner's instruction — is
 * the host's early-settle path (`concludeCombat` / `settledZones`), which this
 * predicate deliberately says nothing about: a round can still end the instant
 * one side is wiped. This only governs the TIMER.
 */
export function isCombatTimeUp(world: SimWorld): boolean {
  return world.fireRingTicks >= combatDeadlineTick(world);
}

/**
 * How many ticks the 殭屍王 has pushed this round's deadline out by, total.
 * The number a HUD should show as 「回合延長 N 秒」 — read off the live rules,
 * never recomputed from config, so it cannot claim an extension that a disarmed
 * or knob-off ring never applied.
 */
export function bossRoundExtensionTicks(world: SimWorld): number {
  const rules = world.fireRingRules;
  return rules && world.fireRingTicks >= 0 ? rules.bossExtendedTicks : 0;
}

/**
 * THE SHRINK LAW. Ring radius `ticksSinceStart` ticks past ignition, closing
 * from `zoneRadius` to `rules.minRadius` over `rules.shrinkTicks`.
 *
 * `zoneRadius` is the ZONE's `boundaryRadius` — arena geometry, NOT an ability
 * radius, so it is deliberately not multiplied by `combatEnv.abilityRange`.
 *
 * `k` is the clamped progress in TICKS. Pure and monotonic non-increasing, with
 * no transcendentals: an eased curve (pow/exp) is the one thing that would pass
 * the purity gate today and still be genuinely platform-variable.
 */
export function fireRingRadius(
  rules: FireRingRules,
  ticksSinceStart: number,
  zoneRadius: number,
): number {
  if (ticksSinceStart <= 0) return zoneRadius;
  const k = ticksSinceStart < rules.shrinkTicks ? ticksSinceStart : rules.shrinkTicks;
  return zoneRadius + (rules.minRadius - zoneRadius) * (k / rules.shrinkTicks);
}

/**
 * The safety predicate: is a body of radius `bodyRadius`, sitting
 * `distSqToCenter` (SQUARED) from the zone centre, WHOLLY inside a ring of
 * `radius`?
 *
 * `inner <= 0` is the fully-closed case — false for everyone, no special case,
 * which is literally 「沒有生存空間」. The comparison is exact (`<=`) on both
 * replicas: no hysteresis, because hysteresis would make the answer depend on
 * history rather than on the tick.
 */
export function fireRingIsSafe(
  radius: number,
  bodyRadius: number,
  distSqToCenter: number,
): boolean {
  const inner = radius - bodyRadius;
  return inner > 0 && distSqToCenter <= inner * inner;
}

/**
 * The per-SECOND burn rate (fraction of a victim's maxHealth) at
 * `ticksSinceStart` ticks past ignition — for champions OUTSIDE the ring only.
 *
 * Ramps LINEARLY with the shrink progress (not a step staircase), so the punish
 * for standing outside grows exactly as fast as the space runs out: 4 %/s at
 * ignition → 20 %/s once closed. Step out at ignition and never come back and
 * ∫(0.04 + 0.008t)dt reaches 1 at t ≈ 11.6 s; a 3-second panic detour costs
 * ~13 % HP. Pure + branch-only.
 */
export function fireRingRatePerSec(rules: FireRingRules, ticksSinceStart: number): number {
  if (ticksSinceStart < 0) return 0;
  const p =
    rules.shrinkTicks > 0 ? Math.min(1, Math.max(0, ticksSinceStart / rules.shrinkTicks)) : 1;
  const rate = rules.burnPctPerSecStart + (rules.burnPctPerSecEnd - rules.burnPctPerSecStart) * p;
  return Math.min(rules.maxPctPerSec, rate);
}

/**
 * The ring radius RIGHT NOW for `zone`, DERIVED — never stored. A disarmed or
 * dormant ring reads as the full zone boundary, so a client that renders this
 * unconditionally draws the un-shrunk rim rather than a phantom hazard.
 *
 * Snapshot encoding and the replay host-digest both call this, so the number on
 * the wire is the same number the burn was evaluated against.
 */
export function currentFireRingRadius(world: SimWorld, zone = 0): number {
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0];
  const zoneRadius = zoneDef?.boundaryRadius ?? 0;
  const rules = world.fireRingRules;
  if (!rules || world.fireRingTicks < 0) return zoneRadius;
  return fireRingRadius(rules, world.fireRingTicks - rules.startTicks, zoneRadius);
}

/**
 * Is entity `id` being burned by the ring THIS tick? The exact predicate
 * `fireRingSystem` applies, exported so the snapshot's `ENTITY_FLAG.BURNING`
 * (which drives the client's red screen wash) can never drift from the damage
 * that justifies it.
 */
export function isBurnedByFireRing(world: SimWorld, id: EntityId): boolean {
  const rules = world.fireRingRules;
  if (!rules || world.fireRingTicks < 0 || !world.combatActive) return false;
  if (world.fireRingTicks < rules.startTicks) return false;
  const t = world.transform.get(id);
  if (!t) return false;
  // #216: a zone whose duel is already decided does not burn (FireRingSystem
  // skips it), so the BURNING flag must not claim it does.
  //
  // …EXCEPT FOR MOBS, which `fireRingBurnMobs` deliberately keeps burning there
  // (see its 「為什麼小怪不吃 settledZones」 note). This predicate exists to make
  // the client's flame/wash agree with the damage TICK FOR TICK, so it has to
  // fork exactly where the damage forks — a shared `settledZones` line here
  // would paint a settled zone's zombies as un-burnt while they cook.
  if (world.settledZones.has(t.zone) && !world.mob.has(id)) return false;
  const zoneDef = world.arena.zones[t.zone] ?? world.arena.zones[0];
  if (!zoneDef) return false;
  const radius = fireRingRadius(
    rules,
    world.fireRingTicks - rules.startTicks,
    zoneDef.boundaryRadius,
  );
  return !fireRingIsSafe(radius, t.radius, distSq(t.pos, zoneDef.center));
}

/**
 * 保底 — THE RING EATS THE ZOMBIES TOO (owner 2026-07-30).
 *
 * 「火圈百分比真實傷害是所有場上玩家、bot、各種殭屍都會百分比真實傷害燒死，
 *   所以還是有個保底結果」
 *
 * The champion half of this is `FireRingSystem`'s loop over `world.champion`;
 * this is the SAME burn applied to `world.mob` (一般殭屍 / 特殊殭屍 / 殭屍王).
 * Split out here rather than folded into that loop because MobSystem is what
 * owns the mob lifecycle end-to-end — spawn, AI, death payout, despawn — and a
 * mob that the ring kills has to flow through that payout exactly like one a
 * champion killed (it already does: `MobSystem`'s death scan explicitly names
 * 「the fire ring」 as a no-killer source, and `payMobBounty` runs BEFORE the
 * killer gate so a king/特殊殭屍 that drowns in the ring still pays its 分紅).
 *
 * WHY PERCENT IS THE WHOLE POINT. A shipped 殭屍王 carries ~276,944 hp. Any flat
 * environmental tick is a rounding error against that; `hp.maxHp * ratePerSec *
 * dt` closes it on exactly the same 20 s clock as a 3,000 hp champion, which is
 * what makes this a BACKSTOP rather than a nuisance. Nothing here reads
 * `combatEnv`, armour, MR or shields — same deliberate bypass as the champion
 * burn (#132/#270), so the mechanic cannot be tuned into impotence by accident.
 *
 * ⚠️ 為什麼小怪不吃 `settledZones`。 The #216 skip exists for a PLAYER-facing
 * complaint: a knocked-out player is already looking at the shop and must not
 * watch his team-mates' bars drain behind it. A zombie has no shop and no bar to
 * protect — and a zone that settled while a zombie is still standing is exactly
 * the 「一隻卡在角落的殭屍讓回合永遠不結束」 hole this whole function exists to
 * close. So the ring keeps burning mobs everywhere, and `isBurnedByFireRing`
 * forks on the same condition so the flame the client paints still matches the
 * damage tick for tick.
 *
 * WHY THERE IS NO `burnMobs` ADMIN SWITCH. Everything tunable about this burn —
 * ignition, shrink length, the 4 %/s → 20 %/s ramp and its cap — is ALREADY the
 * operator's, in `match.fireRing`, and every one of those knobs applies to mobs
 * unchanged because the damage is a fraction of the victim's own maxHealth. The
 * only thing left to make switchable would be 「保底 off」, and a round that can
 * no longer be guaranteed to end is not a setting anyone wants shipped.
 *
 * PURITY / DETERMINISM: reads `world.fireRingTicks` — which `fireRingSystem`
 * has ALREADY advanced this tick at step 8b — so a mob is judged against the
 * exact same radius as the champions beside it, never a one-tick-stale one. Ids
 * are sorted before iteration, so the event order in the digest cannot depend on
 * Map internals. No rng, no wall-clock, no trig.
 */
export function fireRingBurnMobs(world: SimWorld): void {
  const rules = world.fireRingRules;
  if (!rules) return;
  if (world.fireRingTicks < 0) return;
  if (!world.combatActive) return; // live combat only — mirrors fireRingSystem
  const ticksSinceStart = world.fireRingTicks - rules.startTicks;
  if (ticksSinceStart < 0) return; // dormant — the ring has not ignited yet
  const ratePerSec = fireRingRatePerSec(rules, ticksSinceStart);
  if (ratePerSec <= 0) return; // degenerate config: no damage, same as champions
  const dt = world.dt;
  for (const id of [...world.mob.keys()].sort((a, b) => a - b)) {
    const hp = world.health.get(id);
    if (!hp || !hp.alive) continue;
    const t = world.transform.get(id);
    if (!t) continue;
    // per-zone geometry, exactly like the champion loop: a mob in zone 1 is
    // judged against zone 1's centre, never zone 0's.
    const zoneDef = world.arena.zones[t.zone] ?? world.arena.zones[0];
    if (!zoneDef) continue;
    const radius = fireRingRadius(rules, ticksSinceStart, zoneDef.boundaryRadius);
    // WHOLE BODY inside = safe. A 殭屍王's body is wider than a champion's, so
    // it stops being safe EARLIER — which is the correct reading of 「沒有生存
    // 空間」 for something that big, not a special case.
    if (fireRingIsSafe(radius, t.radius, distSq(t.pos, zoneDef.center))) continue;
    const dmg = hp.maxHp * ratePerSec * dt;
    if (dmg <= 0) continue;
    hp.hp -= dmg; // %-HP TRUE burn: no armour/MR, no shields, no combat-env
    world.emit("fireRingDamage", {
      id,
      amount: dmg,
      dmgType: "true",
      origin: "fireRing",
      x: t.pos.x,
      z: t.pos.z,
    });
  }
}

/**
 * Combat entry: arm the fire-ring schedule. Clears any stale state and starts
 * the combat-elapsed tick counter at 0. The ring stays at the full zone
 * boundary (and burns nobody) until the counter reaches `startTicks`.
 */
export function beginCombatFireRing(world: SimWorld, rules: FireRingRules): void {
  world.fireRingRules = rules;
  world.fireRingTicks = 0;
}

/**
 * Combat exit (round end / phase leave): disarm the ring. Idempotent. The
 * counter resets to -1 so a disarmed world's fireRingSystem is a pure no-op
 * (client prediction shadow world, unit tests, legacy boots).
 */
export function endCombatFireRing(world: SimWorld): void {
  world.fireRingRules = null;
  world.fireRingTicks = -1;
}

/**
 * 火圈灼燒曲線的出貨預設 —— **唯一的一份字面值**。
 *
 * `sec` 是**點燃之後**的秒數（不是回合第幾秒），所以它跟著 `startSec` 一起移動 ——
 * 那正是它該綁的東西：把它綁在「回合第幾秒」的話，一改 `startSec` 這條曲線的
 * 語意就悄悄變了。
 *
 * ⚠️ **為什麼是 export 而不是各自寫一份**：`content/schema/config.ts` 的
 * `burnCurve` 用它當 Zod 的 `.default()`，而 sim 這一側在欄位缺席時也要退回同一份。
 * 抄第二份就是兩個「沒填的話燒多少」，而它們遲早會分岔（這個專案已經有
 * `maxPctPerSec` 一個 Zod 說 `.max(1)`、sim 填 `Infinity` 的前例，差九個數量級）。
 *
 * ⚠️ 2026-08-02：這個 export **本來就該在這一版**，是我把 `schema/config.ts`
 * 的 import 提前 commit 了卻沒帶上它（`da082822` 掃進了平行工作流的半成品）——
 * 結果 `packages/shared` 在乾淨 checkout 上編譯不過，host 的 deploy build 直接失敗。
 * 教訓：commit 一個檔之前要確認它 import 的每一樣東西都在版控裡。
 */
export const DEFAULT_BURN_CURVE: readonly { sec: number; pctPerSec: number }[] = Object.freeze([
  Object.freeze({ sec: 0, pctPerSec: 0.04 }),
  Object.freeze({ sec: 20, pctPerSec: 0.2 }),
  Object.freeze({ sec: 40, pctPerSec: 1 }),
]);

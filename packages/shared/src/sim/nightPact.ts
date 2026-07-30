/**
 * 71-00 暗夜契約 (`godie-u00k.passive`, w3a rawcode `A0HH`) — 死之王's 天生技,
 * re-designed by the owner because GGD HAS NO DAY/NIGHT CYCLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE SOURCE MAP ACTUALLY CONTAINS — measured, not assumed
 *
 * The ubertip (`OBJECTS.json` → `A0HH.ubertip`, identical to the shipped
 * `content/abilities/godie-u00k.passive.json` description) promises four things:
 *
 *   夜間 ms +100% · 夜間 hp regen +30 · 夜間施法有額外效果 ·
 *   附近敵方施法 12% 機率魔力全失並受到傷害
 *
 * NONE of it is implemented in the map. Two independent reads say so:
 *
 *   1. OBJECT DATA. `A0HH` is based on `Aegr` (Elune's Grace, stock code
 *      `AIdd`, a DAMAGE-REDUCTION passive — `STOCK_ABILITIES.json` gives it
 *      `DataA1 = 0.65`). The map overrides exactly two fields, and they are the
 *      base ability's own reduction columns: `Def1 = 1.0` and `Def5 = 1.0`
 *      (raw mods dumped from `war3map.w3a`; the importer renders them as
 *      `data: {"1":{"1":1.0},"5":{"1":1.0}}`). ×1.0 is NO reduction — the base
 *      was deliberately NEUTERED. ⚠️ Those two 1.0s are therefore NOT a damage
 *      number and must never be read as one.
 *   2. JASS. `grep 'A0HH' war3map.j` → 0 hits. `EFFECT_AUDIT.json` agrees
 *      (`jass_triggers: []`, damage verdict `N/A`). The hero rawcode `U00K`
 *      appears five times, all in unrelated hero-pick/type plumbing.
 *
 * So 71-00 was a TOOLTIP with a dead ability underneath it. There is no
 * fidelity to preserve here, which is why the owner replaced the design.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OWNER'S DESIGN (2026-07-30), IMPLEMENTED LITERALLY
 *
 * 「可以是有該技能英雄在場上的時候,敵我英雄死亡會生成一個旗子,具備黑夜靈氣 buff,
 *   帶來暗夜效果,回合結束則一起被清除」
 *
 *   · a 暗夜契約 carrier is alive in the zone  →  ANY champion death there
 *     (friend OR foe — the owner said 敵我) raises a FLAG where the body fell;
 *   · the flag radiates 黑夜靈氣: ms +100 %, hp regen +30 (the ubertip's own
 *     numbers, now real);
 *   · every flag is destroyed at combat exit.
 *
 * The flag deliberately SIDESTEPS the corpse-lifetime problem: it is a durable
 * object of its own, so #220 (3 s ascend) and #84 (revive-circle exception)
 * have no bearing on it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 1 — THE FLAG IS THE AURA CARRIER PATTERN, BUT NOT `auraSystem`.
 *
 *   `sim/auraCarrier.ts` established the shape: a body that exists only to be a
 *   position with an aura payload, kept out of the broad-phase so it is
 *   structurally untargetable, reconciled from state so teardown cannot be
 *   forgotten. This module copies all three.
 *
 *   It does NOT route the payload through `auraSystem`, and that is forced by
 *   two of the owner-facing knobs rather than chosen for convenience:
 *
 *     · STACKING. `auraSystem` projects ONE source PER EMITTER
 *       (`auraSourceId(emitter, …)`), so N flags necessarily stack N times.
 *       `stacking: "max"` — 「多個旗子取最大」 — is not expressible there at all.
 *     · BENEFICIARY. `AuraAffects` is enemy/ally/all. 「只給死之王」 is none of
 *       those: it is 「只給帶著這支天生技的單位」, which no team predicate can say.
 *
 *   Both are real gameplay decisions the owner will want to flip, so per the
 *   first project rule they are FIELDS — and a field that the shared machinery
 *   cannot express is a field that needs its own reconcile. The radius still
 *   goes through {@link resolveAuraRadius} so #136's global range budget applies
 *   to this aura exactly as it does to every other one.
 *
 * DECISION 2 — RECONCILED FROM STATE EVERY TICK, NEVER SUBSCRIBED.
 *   {@link nightPactSystem} recomputes "who should be under 黑夜靈氣 right now"
 *   from (live flags, live carriers, positions, zones) and diffs it against the
 *   attached sources. Walking out, dying, the flag being cleaned up, the round
 *   ending, `world.destroy` — all the same case: not in the desired set, source
 *   removed. This is `aura.ts` DECISION 2 and `auraCarrier.ts` DECISION 1, for
 *   the same reason: a subscription model needs a teardown path per failure
 *   mode and every missing one is a permanent +100 % move speed.
 *
 * DECISION 3 — COMBAT-SCOPED, AND `endCombatNightPact` IS THE PROMPT SEAM.
 *   Flags are only raised while `world.combatActive` and the zone is not
 *   settled (#216: 「這一區的戰鬥已經結束」). {@link endCombatNightPact} is called
 *   beside `endCombatCoins` / `endCombatRevives` so 「回合結束則一起被清除」 lands
 *   on the exact tick the host decides.
 *
 * DECISION 4 — THE MANA-BURN HALF IS NOT ABOUT THE FLAG.
 *   The ubertip's second sentence is about standing near 死之王 HIMSELF, so it
 *   is implemented against the living carriers, not against flags. It reads
 *   THIS TICK's `abilityCast` events, which are emitted at commandSystem (3) /
 *   castResolveSystem (2b), i.e. strictly before this system's slot.
 *
 *   ⚠️ THE DAMAGE NUMBER DOES NOT EXIST IN THE SOURCE. See the header: the only
 *   two numbers on `A0HH` are neutered Elune's-Grace reduction columns, and
 *   there is no JASS. `manaBurn.damage` therefore SHIPS AT 0 — 「魔力全失」
 *   happens, 「並且受到傷害」 waits for the owner. A default of 0 is the honest
 *   encoding of "unknown"; inventing a number would launder a guess into the
 *   balance table. It is a field with an upper bound, so the answer is one
 *   admin save, not a deploy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 *
 * The only rng draw in this file is the mana-burn proc, and it is drawn from
 * `world.rng` (never `Math.random` — `sim/purity.test.ts` bans it) AFTER every
 * cheap gate has passed, so a match with no 死之王 in it draws nothing and every
 * existing recording is bit-identical. Events are iterated in emission order,
 * carriers and flags in EXPLICITLY SORTED ascending-id order (Map iteration is
 * insertion order, and a re-spawned entity lands at the end). No clock, no trig,
 * no `**`. Flags ride the existing `for (const [id, t] of this.transform)` term
 * of `SimWorld.digest()`, so a replica that raised one on a different tick
 * diverges on that tick.
 */
import type { EntityId, TeamId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { Stat } from "./stats/statTypes";
import { ModOp, type ModifierSource } from "./stats/modifiers";
import { attachSource, detachSource } from "./stats/statPipeline";
import { resolveAuraRadius } from "./aura/aura";
import { Champions } from "./content/registry";

/** `EntityState.key` / model doc id a 暗夜旗 publishes under. */
export const NIGHT_FLAG_MODEL_KEY = "prop.night-flag";

/**
 * The ONE `ModifierSource.id` 黑夜靈氣 is ever attached under. A single id (not
 * one per flag) is what makes `stacking: "max"` expressible: the whole payload
 * is one source whose `stacks` the reconcile rewrites.
 */
export const NIGHT_PACT_AURA_SOURCE_ID = "nightPact:黑夜靈氣";

/** Who 黑夜靈氣 reaches. Owner did not rule; default `owner` (see openQuestions). */
export type NightPactBeneficiary = "owner" | "team";

/** How several flags combine. A real gameplay decision, hence a field. */
export type NightPactStacking = "max" | "add";

/** A raised flag. Keyed by the FLAG's own entity id. */
export interface NightFlagComp {
  /** the duel zone it stands in — flags never reach across zones */
  zone: number;
  /** the team of the carrier it was raised for (presentation / team mode) */
  teamId: TeamId;
  /** the champion whose death raised it (presentation + tests) */
  victim: EntityId;
}

/** 附近敵方施法 proc. Absent numbers are the owner's, not invented — see DECISION 4. */
export interface NightPactManaBurnRules {
  enabled: boolean;
  /** planar distance from a LIVING carrier within which an enemy cast is at risk */
  radius: number;
  /** 0..1 proc chance — the ubertip's 12 % */
  chance: number;
  /** TRUE damage on a successful proc. 0 = 「並且受到傷害」 not yet numbered. */
  damage: number;
}

/** Sim-side rules. Copied from the config doc so the doc stays frozen. */
export interface NightPactRules {
  /** which 天生技 doc ids count as 暗夜契約 (a list so a re-id cannot orphan it) */
  abilityIds: readonly string[];
  /** BASE aura radius in sim units, before the #136 `abilityRange` factor */
  auraRadius: number;
  beneficiary: NightPactBeneficiary;
  stacking: NightPactStacking;
  /** hard cap on simultaneously standing flags PER ZONE */
  maxFlagsPerZone: number;
  /** 移動速度提升 100% → 1.0 as a PercentAdd */
  msPercent: number;
  /** 生命回復速度提升 30 點 → a flat healthRegen */
  healthRegenFlat: number;
  manaBurn: NightPactManaBurnRules;
}

/** Config-doc mirror (`config.arena-rules@1` → `nightPact`). */
export interface NightPactConfigLike {
  abilityIds: readonly string[];
  auraRadius: number;
  beneficiary: NightPactBeneficiary;
  stacking: NightPactStacking;
  maxFlagsPerZone: number;
  msPercent: number;
  healthRegenFlat: number;
  manaBurn: NightPactManaBurnRules;
}

/** Convert the config block into sim rules (a COPY — the doc stays frozen). */
export function nightPactRulesFromConfig(cfg: NightPactConfigLike): NightPactRules {
  return {
    abilityIds: [...cfg.abilityIds],
    auraRadius: cfg.auraRadius,
    beneficiary: cfg.beneficiary,
    stacking: cfg.stacking,
    maxFlagsPerZone: cfg.maxFlagsPerZone,
    msPercent: cfg.msPercent,
    healthRegenFlat: cfg.healthRegenFlat,
    manaBurn: { ...cfg.manaBurn },
  };
}

/**
 * Is this entity a LIVING 暗夜契約 carrier right now?
 *
 * Resolved through `ChampionComp.championId` → `passiveAbility`, i.e. through
 * the body the entity is WEARING this tick, not through `AbilitiesComp
 * .passiveSlot` (which is pinned to the base hero at spawn). That is the same
 * reading `auraCarrier.specFor` documents, and it is what makes a 變身 of 死之王
 * behave correctly for free.
 */
export function isNightPactCarrier(world: SimWorld, id: EntityId, rules: NightPactRules): boolean {
  const champ = world.champion.get(id);
  if (!champ) return false;
  const hp = world.health.get(id);
  if (!hp?.alive) return false;
  const def = Champions.tryGet(champ.championId);
  const passiveId = def?.passiveAbility;
  if (passiveId === undefined) return false;
  return rules.abilityIds.includes(passiveId);
}

/** Every living carrier, ascending id. Small N (≤ 12 champions). */
function carriers(world: SimWorld, rules: NightPactRules): EntityId[] {
  const out: EntityId[] = [];
  for (const id of world.champion.keys()) if (isNightPactCarrier(world, id, rules)) out.push(id);
  return out.sort((a, b) => a - b);
}

/** Flags standing in `zone`. */
function flagsInZone(world: SimWorld, zone: number): number {
  let n = 0;
  for (const f of world.nightFlag.values()) if (f.zone === zone) n++;
  return n;
}

/** Squared planar distance — no `Math.sqrt`, no trig (purity gate). */
function distSq(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * Raise one flag. NOT exported: a flag nobody asked for is a leak by definition,
 * and the ONE caller is the death pass below.
 */
function spawnNightFlag(
  world: SimWorld,
  args: { zone: number; pos: { x: number; z: number }; teamId: TeamId; victim: EntityId },
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: args.pos.x, z: args.pos.z },
    vel: { x: 0, z: 0 },
    // fixed facing: nothing reads it, and a copied one would put a corpse's
    // rotation into `digest()` for no information.
    facing: { x: 0, z: 1 },
    // RADIUS 0 — a banner is not a body. `MovementSystem`'s soft-separation walks
    // `world.transform` directly, so a real radius would shove every entity with
    // a higher id; at 0 the push test is `dist < 0 + other.radius` around a point
    // a corpse just vacated. Same argument as auraCarrier's radius 0.
    radius: 0,
    zone: args.zone,
  });
  // NO TeamComp and NO Health, deliberately, exactly like a dropped coin: a team
  // would corrupt `teamAliveInZone` and duel resolution, and health would make
  // the flag attackable and inject hp into `SimWorld.digest`. The owning team is
  // kept as PLAIN DATA on the marker instead.
  world.nightFlag.set(id, { zone: args.zone, teamId: args.teamId, victim: args.victim });
  world.emit("nightFlagSpawn", {
    id,
    zone: args.zone,
    teamId: args.teamId,
    victim: args.victim,
    x: args.pos.x,
    z: args.pos.z,
  });
  return id;
}

/** The flag following nobody — every live flag id, ascending. Tests + HUD. */
export function nightFlagIds(world: SimWorld): EntityId[] {
  return [...world.nightFlag.keys()].sort((a, b) => a - b);
}

/**
 * PASS 1 — a champion died this tick and a carrier is standing in that zone:
 * raise a flag on the body.
 *
 * ⚠️ THE CARRIER GATE IS THE MECHANIC. With it removed every hero death in every
 * match would raise a flag, which is the mutation the guard suite is written
 * against.
 */
function raiseFlagsForDeaths(world: SimWorld, rules: NightPactRules): void {
  // snapshot: spawnNightFlag emits, and `world.events` is the array we walk.
  const events = [...world.events];
  for (const ev of events) {
    if (ev.type !== "death") continue;
    const victim = ev.data.id as EntityId;
    // 敵我英雄 — a champion on EITHER side. Mobs, guardians and flowers raise
    // nothing (the owner said 英雄死亡).
    if (!world.champion.has(victim)) continue;
    const t = world.transform.get(victim);
    if (!t) continue;
    if (world.settledZones.has(t.zone)) continue; // #216: this duel is over
    if (flagsInZone(world, t.zone) >= rules.maxFlagsPerZone) continue;
    // 「有該技能英雄在場上的時候」 — read as "alive, in THIS zone", the same
    // zone-scoping every other combat mechanic uses. A carrier fighting in
    // another duel cannot raise flags in a battle it is not in.
    const carrier = carriers(world, rules).find((c) => world.transform.get(c)?.zone === t.zone);
    // ⚠️ HONEST NOTE: this line is UNFALSIFIABLE on its own — mutation-tested,
    // deleting it leaves the suite green, because `world.team.get(undefined!)`
    // returns undefined and the next line skips anyway. What ACTUALLY carries
    // the gate is `carriers()` filtering on `isNightPactCarrier`; swap that for
    // "any living champion" and two tests go red. Kept because it states the
    // intent where a reader looks for it, in the same spirit as auraCarrier.ts's
    // two documented belt-and-braces lines.
    if (carrier === undefined) continue;
    const team = world.team.get(carrier);
    if (!team) continue;
    spawnNightFlag(world, { zone: t.zone, pos: t.pos, teamId: team.teamId, victim });
  }
}

/** How many flags cover `id` right now, after the #136 range factor. */
function flagsCovering(world: SimWorld, id: EntityId, rules: NightPactRules): number {
  const t = world.transform.get(id);
  if (!t) return 0;
  const r = resolveAuraRadius(world, rules.auraRadius);
  const rSq = r * r;
  let n = 0;
  for (const [fid, f] of world.nightFlag) {
    if (f.zone !== t.zone) continue;
    const ft = world.transform.get(fid);
    if (!ft) continue;
    if (distSq(ft.pos, t.pos) <= rSq) n++;
  }
  return n;
}

/**
 * PASS 2 — reconcile 黑夜靈氣 on every champion.
 *
 * Reads the FINAL desired stack count and diffs it against what is attached, so
 * enter / leave / flag-cleanup / death / round-end all collapse into one path.
 */
function reconcileNightAura(world: SimWorld, rules: NightPactRules): void {
  for (const id of [...world.champion.keys()].sort((a, b) => a - b)) {
    const sc = world.stats.get(id);
    if (!sc) continue;
    const existing = sc.sources.find((s) => s.id === NIGHT_PACT_AURA_SOURCE_ID);

    let want = 0;
    const hp = world.health.get(id);
    if (hp?.alive) {
      // BENEFICIARY — the decision the owner has not made. `owner` = only the
      // unit that carries 暗夜契約; `team` = its whole team. Both are one field.
      const eligible =
        rules.beneficiary === "owner"
          ? isNightPactCarrier(world, id, rules)
          : teamHasLivingCarrier(world, id, rules);
      if (eligible) {
        const covered = flagsCovering(world, id, rules);
        // STACKING — 「疊加還是取最大」. `max` collapses any number of overlapping
        // flags to one dose; `add` is the WC3-ish literal sum.
        want = rules.stacking === "max" ? Math.min(1, covered) : covered;
      }
    }

    if (want <= 0) {
      if (existing) detachSource(world, id, NIGHT_PACT_AURA_SOURCE_ID);
      continue;
    }
    if (existing) {
      if (existing.stacks !== want) {
        existing.stacks = want;
        sc.dirty = true;
      }
      continue;
    }
    attachSource(world, id, nightAuraSource(rules, want));
  }
}

/** True when `id` shares a team with at least one LIVING carrier in its zone. */
function teamHasLivingCarrier(world: SimWorld, id: EntityId, rules: NightPactRules): boolean {
  const mine = world.team.get(id);
  const t = world.transform.get(id);
  if (!mine || !t) return false;
  for (const c of carriers(world, rules)) {
    const ct = world.team.get(c);
    const ctf = world.transform.get(c);
    if (ct?.teamId === mine.teamId && ctf?.zone === t.zone) return true;
  }
  return false;
}

/** The 黑夜靈氣 payload. `stacks` is what `recomputeStats` multiplies by. */
function nightAuraSource(rules: NightPactRules, stacks: number): ModifierSource {
  return {
    id: NIGHT_PACT_AURA_SOURCE_ID,
    // "passive", not "buff": there is no `expiresAtTick`, so `buffExpirySystem`
    // must never own it — the reconcile above is the only thing that may remove
    // it. And not "aura": `aura.ts` DECISION 5 skips `kind: "aura"` when
    // collecting emitters, and reserves that kind for sources IT owns.
    kind: "passive",
    stacks,
    modifiers: [
      { stat: Stat.MoveSpeed, op: ModOp.PercentAdd, value: rules.msPercent },
      { stat: Stat.HealthRegen, op: ModOp.Flat, value: rules.healthRegenFlat },
    ],
  };
}

/**
 * PASS 3 — 「在死之王附近想施展技能的敵方單位有 12% 的機率魔力全失,並且受到傷害」.
 *
 * Nothing to do with flags (DECISION 4). Reads this tick's `abilityCast`.
 */
function resolveManaBurn(world: SimWorld, rules: NightPactRules): void {
  const burn = rules.manaBurn;
  if (!burn.enabled || burn.chance <= 0) return;
  const live = carriers(world, rules);
  if (live.length === 0) return; // no draw, no perturbation of the rng stream
  // `**` is banned by the purity gate — square by multiplication.
  const r = resolveAuraRadius(world, burn.radius);
  const radiusSq = r * r;

  const events = [...world.events];
  for (const ev of events) {
    if (ev.type !== "abilityCast") continue;
    const caster = ev.data.caster as EntityId;
    const casterTeam = world.team.get(caster);
    const ct = world.transform.get(caster);
    const chp = world.health.get(caster);
    if (!casterTeam || !ct || !chp?.alive) continue;
    // ENEMY only, and never the 死之王 itself.
    const near = live.find((c) => {
      if (c === caster) return false;
      const cteam = world.team.get(c);
      const cpos = world.transform.get(c);
      if (!cteam || !cpos) return false;
      if (cteam.teamId === casterTeam.teamId) return false;
      if (cpos.zone !== ct.zone) return false;
      return distSq(cpos.pos, ct.pos) <= radiusSq;
    });
    if (near === undefined) continue;
    // LAST: the rng is only touched once every gate above has passed.
    if (world.rng.next() >= burn.chance) continue;
    const drained = chp.mana;
    chp.mana = 0; // 魔力全失 —全失 means to zero, not "a fraction"
    if (burn.damage > 0) chp.hp -= burn.damage;
    world.emit("nightPactBurn", {
      id: caster,
      source: near,
      manaLost: drained,
      damage: burn.damage,
      x: ct.pos.x,
      z: ct.pos.z,
    });
  }
}

/**
 * Reconcile 暗夜契約 for this tick. Runs AFTER `deathSystem`/`reviveSystem` so it
 * sees THIS tick's deaths (the reviveSystem slot rationale, verbatim).
 *
 * The aura it attaches is folded in by the NEXT tick's `statRecomputeSystem` —
 * the same one-tick latency `aura.ts` DECISION 4 documents for every aura that
 * reacts to a late-tick event. Uniform, deterministic, identical on replicas.
 */
export function nightPactSystem(world: SimWorld): void {
  const rules = world.nightPactRules;
  // STRICT no-op when the mechanic is off — except that a world which is
  // DISARMED mid-round must still shed the aura it already handed out, which is
  // what `endCombatNightPact` is for. Nothing here runs for the 118 heroes that
  // are not 死之王.
  if (!rules) return;
  if (world.combatActive) raiseFlagsForDeaths(world, rules);
  reconcileNightAura(world, rules);
  resolveManaBurn(world, rules);
}

/**
 * Combat entry: arm the rules and clear any stale flag. Idempotent, and shaped
 * exactly like `beginCombatCoins` / `beginCombatRevives`.
 */
export function beginCombatNightPact(world: SimWorld, rules: NightPactRules): void {
  endCombatNightPact(world);
  world.nightPactRules = rules;
}

/**
 * Combat exit — 「回合結束則一起被清除」. EVERY flag is destroyed and every
 * 黑夜靈氣 source is stripped, so nothing survives into resolution, the shop or
 * the next round. Idempotent and safe when none exist.
 *
 * Both halves are load-bearing. Destroying the flags alone would leave the aura
 * attached for one more tick — and if the host disarms `nightPactRules` in the
 * same breath, `nightPactSystem` returns early and it would NEVER be removed:
 * a permanent +100 % move speed carried into the next round.
 */
export function endCombatNightPact(world: SimWorld): void {
  for (const id of [...world.nightFlag.keys()].sort((a, b) => a - b)) world.destroy(id);
  for (const id of [...world.stats.keys()].sort((a, b) => a - b)) {
    detachSource(world, id, NIGHT_PACT_AURA_SOURCE_ID);
  }
  world.nightPactRules = null;
}

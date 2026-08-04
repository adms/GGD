/**
 * AURAS (靈氣) — radius-based, team-filtered modifier projection.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * 108 innate (天生技) docs were recovered and the 6th ability slot renders
 * in-game, but a large share of the `innateKind: "passive"` ones ship EMPTY
 * modifier blocks — zero combat effect. One measured reason was the missing
 * `evasion` stat (closed by sim/combat/evasion.ts). The OTHER one is this: a
 * `ModifierSource` could only ever modify THE UNIT THAT CARRIES IT. There was
 * no way to say 「範圍 R 內的敵人」, so every `[靈氣]` innate was written
 * honest-empty. The clearest case is the ability this module was built against:
 *
 *   79-00 靈壓 (content/abilities/godie-h01n.passive.json, 黑崎一護)
 *   「初始法力值較一般人高，且此靈力產生的強大靈壓能降低範圍500內敵人攻擊速度25%」
 *   → `"radius": 9.17`, `"targetsEnemies": true`, `"passive.ranks[0].modifiers": []`
 *
 * The bonus starting mana half was ALREADY expressible (a plain self
 * `maxMana` modifier). The 「範圍500內敵人 −25% 攻擊速度」 half is what this file
 * adds. This lane writes NO content doc — it builds the machinery and proves it
 * on fixtures; a later content lane authors the `auras` blocks.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MODEL, AND WHY
 *
 * DECISION 1 — AN AURA IS A PROJECTED `ModifierSource`, NOT A NEW MECHANIC.
 *   Membership is recomputed every tick; a unit that is inside gets a REAL
 *   `ModifierSource` (`kind: "aura"`) pushed onto its own `StatsComp.sources`,
 *   exactly like an item or a buff. So an aura rides the existing stat pipeline
 *   (layer order, clamps, combat-env factors), the existing hook dispatch, the
 *   existing expiry sweep, and the existing client stat panel. Nothing new has
 *   to be kept in sync at damage time. `modifiers.ts` calls itself "THE
 *   unifier"; an aura that invented its own application path would break that
 *   promise for the sake of one ability.
 *
 * DECISION 2 — RECONCILED STATELESSLY FROM POSITIONS, NOT TRACKED.
 *   {@link auraSystem} builds the DESIRED membership from scratch each tick and
 *   diffs it against the aura sources actually present, attaching what is
 *   missing and removing what is stale. There is no enter/leave subscription and
 *   no side table of "who is in whose aura".
 *
 *   That is not a shortcut, it is the correctness argument. Every failure mode
 *   the task names — the emitter dies, the emitter is `world.destroy()`ed
 *   mid-tick, the target dies, either one teleports/dashes/knockbacks out, an
 *   arena swap moves everybody — is the SAME case here: the entry is simply not
 *   in the desired set this tick, so the source is removed. A subscription model
 *   needs a separate teardown path for each of those, and every one of them is a
 *   place to leak a permanent −25 % attack speed onto a unit that walked away.
 *   It also means the aura state has no independent existence that could desync:
 *   it is a pure function of (transforms, teams, alive-flags, sources), all of
 *   which are already deterministic world state.
 *
 * DECISION 3 — THE RADIUS FLOWS THROUGH `abilityRange` (#136 / #125).
 *   {@link resolveAuraRadius} delegates to `resolveAbilityRadius`, the single
 *   seam every ability AoE already reads through, rather than re-deriving
 *   `radius * combatEnv.abilityRange` locally. An aura IS an ability's area of
 *   effect — it is authored on `ability@1.passive`, its number came out of the
 *   same w3x `Area` column as every other AoE (500 WC3 units → 9.17 sim units),
 *   and it must shrink with the operator's 60 % range budget like everything
 *   else. Delegating (rather than copying the one-liner) is deliberate: when
 *   #136's rule changes, an aura cannot be the one place that silently kept the
 *   old behaviour. The client tooltip shows the same post-multiplier number via
 *   `displayFinal(radius, "abilityRange")` (#125).
 *
 * DECISION 4 — MEMBERSHIP IS EVALUATED BEFORE ANYTHING MOVES OR ACTS.
 *   `auraSystem` runs in `SimWorld.step` immediately after `rebuildGrid()` and
 *   immediately BEFORE `statRecomputeSystem`. Two consequences, both wanted:
 *     · it queries the SAME broad-phase grid every other spatial system will use
 *       this tick, so membership can never disagree with what an ability sees;
 *     · it only marks `dirty`, and the recompute that already runs one line
 *       later folds the change in — so an aura entered this tick affects THIS
 *       tick's movement, wind-up, cast and damage, with no second recompute
 *       inserted into the fixed system order.
 *   The cost is one tick of latency against events that resolve later in the
 *   tick (a death at step 9 drops its auras at the top of the next tick). That
 *   is uniform, deterministic and identical on every replica.
 *
 * DECISION 5 — AN AURA CANNOT RE-BROADCAST. Sources with `kind: "aura"` are
 *   skipped when collecting emitters, and the projected source deliberately
 *   does not carry the `auras` array. Without that, an ally aura that granted an
 *   aura would spread across the map by contact and the tick cost would be
 *   quadratic in the worst case. If content ever wants a relay, it must be
 *   written as one, knowingly.
 *
 * DECISION 6 — `lingerSec` IS OPTIONAL AND DEFAULTS TO 0 (instant drop).
 *   WC3's aura family applies a short-duration buff that is REFRESHED while you
 *   stand in it, so walking out of Endurance Aura leaves you buffed for a beat.
 *   `lingerSec` reproduces that, and it is also the anti-flicker knob: a unit
 *   oscillating across the boundary would otherwise attach/detach (and emit
 *   `auraApply`/`auraEnd`) on alternate ticks. It is expressed by setting
 *   `expiresAtTick` on the projected source, i.e. the SAME field `buffExpirySystem`
 *   and `recomputeStats` already honour — no second timer. Default 0 keeps the
 *   mechanism a pure in/out test unless content asks for the WC3 tail.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 *
 * This module draws NOTHING from `world.rng` — there is no roll to make. It
 * iterates `world.stats` (insertion order == ascending entity id), then each
 * entity's `sources` array in order, then each `auras` entry in authored order,
 * and `queryOverlap` returns ascending ids. Every list it builds is therefore
 * in a fixed order on every replica, so the projected `sources` arrays are in
 * the same order too — which matters, because source order decides `Override`
 * resolution and hook firing order.
 *
 * The aura state is NOT folded into `SimWorld.digest()`, and that is a
 * deliberate call rather than an omission: it is derived, within one tick, from
 * transforms + health + team + sources, and every one of its observable effects
 * (hp/mana maxima, attack cadence, movement) already lands in the digest. A
 * replica that got membership wrong diverges in the digest on the very next
 * tick through the stat it changed. Adding a term would also perturb the hash of
 * every existing world for zero new information.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { HookDef, ModifierSource, StatModifier } from "../stats/modifiers";
import { queryOverlap } from "../collision/queries";
import { circle } from "../collision/shapes";
import { resolveAbilityRadius } from "../abilities/abilitySystem";

/**
 * Who an aura reaches, relative to its emitter.
 *
 * A unit with NO `TeamComp` (healing flowers, neutral guardians, revive
 * circles) is neither an ally nor an enemy: only `"all"` can touch it. That is
 * stricter than `enemiesInCircle`, which treats a teamless unit as hostile so
 * that an AoE nuke can break a flower — right for a one-shot hit, wrong for a
 * permanent debuff aura that would otherwise silently apply to arena furniture.
 */
export type AuraAffects = "enemy" | "ally" | "all";

/**
 * One aura projected by a `ModifierSource`. Authored on
 * `ability@1.passive.ranks[N].auras` (see `AbilityPassiveRank`), so it is
 * rank-indexed exactly like the self-modifier block next to it.
 */
export interface AuraDef {
  /**
   * Stable name, unique within the emitting source. Only used to build the
   * projected source's id, so it must not change between ranks or the rank-up
   * would read as "old aura left, new aura entered". Optional: defaults to the
   * entry's index in the `auras` array.
   */
  key?: string;
  /**
   * BASE radius in sim units, BEFORE the combat-env `abilityRange` factor
   * (see {@link resolveAuraRadius}). The w3x `Area` column converts at the same
   * rate as every other imported distance — 500 WC3 units → 9.17 here.
   */
  radius: number;
  affects: AuraAffects;
  /**
   * Whether the emitter is inside its own aura. Default: TRUE for `"ally"` and
   * `"all"`, FALSE for `"enemy"`.
   *
   * The default is the WC3 behaviour rather than a uniform `false`, and it is
   * MEASURED off the retail MPQs (war3 + War3x + War3Patch merged), not
   * assumed: the stock FRIENDLY aura rows in `Units\AbilityData.slk` carry
   * `self` in `targs1` (`air,ground,friend,self,vuln,invu` —
   * Command / Endurance / Devotion / Brilliance / Trueshot / Thorns / Unholy /
   * Vampiric, plus every `ItemAura*`). A uniform `false` would make every
   * ported ally aura wrong-by-default and the mistake would be invisible.
   *
   * The exceptions are what `includeSelf: false` exists for. Blizzard omits
   * `self` on exactly the emplacement regen auras — `Aoar` "Aura -
   * Regeneration (Ward)" and `Aabr` "(Statue)" are `…,friend,neutral` with no
   * `self`, while `AIgx`, the same aura carried by a HERO as an item, adds
   * `self` back. So 70-00 芬多精 (`A0GM`, base `Aoar`, `targets_allowed` not
   * overridden by the map) heals 白木卡迪那's ALLIES and not 白木 itself, and
   * `content/abilities/godie-e010.passive.json` says so with `includeSelf:
   * false`.
   *
   * On an `"enemy"` aura the default flips to `false`, but the field is NOT
   * ignored: an explicit `true` still includes the emitter, which is the map's
   * own `enemies,self` shape (e.g. `ACba` 87-00 威嚇). Do not "simplify" the
   * `??` into an ally-only branch.
   */
  includeSelf?: boolean;
  /** stat modifiers granted to every unit inside (the 靈壓 −25 % `as` block) */
  modifiers?: StatModifier[];
  /** event hooks granted to every unit inside — they fire on the AFFECTED unit */
  hooks?: HookDef[];
  /**
   * Seconds the effect lingers on a unit that has left the radius (WC3 aura-buff
   * tail). Default 0 = it drops on the tick it leaves. See DECISION 6.
   */
  lingerSec?: number;
}

/** Runtime provenance stamped on a projected source (never authored). */
export interface AuraOrigin {
  emitter: EntityId;
  key: string;
  /** `lingerSec` converted once, so removal needs no lookup back to the def */
  lingerTicks: number;
}

/**
 * Id of the source an aura projects onto ONE affected unit. Carries the emitter
 * AND the emitting source, so two champions running the same innate, or one
 * champion running two auras, never collide — and so the diff in
 * {@link auraSystem} is a plain string lookup.
 */
export function auraSourceId(emitter: EntityId, sourceId: string, key: string): string {
  return `aura:${emitter}:${sourceId}#${key}`;
}

/**
 * Aura radius after the global combat-env `abilityRange` factor (#136).
 * Delegates to the ability seam on purpose — see DECISION 3.
 */
export function resolveAuraRadius(world: SimWorld, radius: number): number {
  return resolveAbilityRadius(world, radius);
}

/** True when `target` is in scope for an aura of `affects` emitted by `emitter`. */
function affectsTarget(
  world: SimWorld,
  emitter: EntityId,
  target: EntityId,
  affects: AuraAffects,
): boolean {
  if (affects === "all") return true;
  const a = world.team.get(emitter);
  const b = world.team.get(target);
  // teamless = neutral furniture; only "all" reaches it (see AuraAffects).
  if (!a || !b) return false;
  return affects === "ally" ? a.teamId === b.teamId : a.teamId !== b.teamId;
}

/** Every aura source currently applied to `id` (HUD / tests / debugging). */
export function activeAuraSources(world: SimWorld, id: EntityId): ModifierSource[] {
  const sc = world.stats.get(id);
  if (!sc) return [];
  return sc.sources.filter((s) => s.kind === "aura");
}

interface Wanted {
  emitter: EntityId;
  def: AuraDef;
  key: string;
  stacks: number;
  lingerTicks: number;
}

/**
 * Reconcile every aura in the world with current positions, teams and
 * alive-flags. Runs once per tick, right after `rebuildGrid()` and right before
 * `statRecomputeSystem` (see DECISION 4). Draws no rng.
 */
export function auraSystem(world: SimWorld): void {
  // ── PASS 1: what SHOULD be applied, in a fixed order ──────────────────────
  // target -> (projected source id -> what it should carry)
  const wanted = new Map<EntityId, Map<string, Wanted>>();

  for (const [emitter, sc] of world.stats) {
    const t = world.transform.get(emitter);
    if (!t) continue;
    // A corpse projects nothing. (A unit with no Health component — none today
    // among aura emitters — counts as alive rather than being silently dropped.)
    const hp = world.health.get(emitter);
    if (hp && !hp.alive) continue;
    // WHO 「self」 IS for the {@link AuraDef.includeSelf} test. Normally the
    // emitter. But a 虛擬蝗蟲群 (sim/auraCarrier.ts) is a STAND-IN standing on
    // its host's exact coordinates, and `rebuildGrid` keeps carriers out of the
    // broad phase — so `target === emitter` is unreachable for one and the host
    // would fall through to the `ally` branch instead. That would make
    // `includeSelf: false` silently do nothing on every carried aura, which is
    // exactly the shape 70-00 芬多精 needs (w3a `A0GM` inherits `Aoar`'s
    // `targs1 = ground,air,organic,vuln,invu,friend,neutral` — NO `self`, unlike
    // all 25 hero/creep/item auras Blizzard ships).
    const selfId = world.auraCarrier.get(emitter)?.host ?? emitter;

    for (const src of sc.sources) {
      if (!src.auras?.length) continue;
      // DECISION 5: an aura may not re-broadcast an aura.
      if (src.kind === "aura") continue;
      // A lapsed buff stops emitting the same tick it stops applying — this is
      // the identical guard `recomputeStats`/`fireHooks` use.
      if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;

      const stacks = src.stacks ?? 1;
      for (let i = 0; i < src.auras.length; i++) {
        const def = src.auras[i]!;
        const key = def.key ?? String(i);
        const radius = resolveAuraRadius(world, def.radius);
        // A non-positive radius (authored 0, or an operator abilityRange of 0)
        // is an aura that reaches nobody — including the emitter. Skipping the
        // query entirely is what makes that literally true.
        if (!(radius > 0)) continue;
        if (!def.modifiers?.length && !def.hooks?.length) continue;

        const lingerTicks = def.lingerSec ? Math.round(def.lingerSec / world.dt) : 0;
        const sourceId = auraSourceId(emitter, src.id, key);

        for (const target of queryOverlap(world, circle(t.pos, radius), {
          // PairedDuels: an aura never crosses into another duel's zone, for
          // the same reason no ability does.
          zone: t.zone,
          aliveOnly: true,
        })) {
          // Only units that can hold modifiers. Flowers/guardians/revive
          // circles have no StatsComp, so they are skipped here rather than
          // being handed a source that nothing would ever read.
          if (!world.stats.has(target)) continue;
          if (target === selfId) {
            const self = def.includeSelf ?? def.affects !== "enemy";
            if (!self) continue;
          } else if (!affectsTarget(world, emitter, target, def.affects)) continue;

          let bucket = wanted.get(target);
          if (!bucket) wanted.set(target, (bucket = new Map()));
          bucket.set(sourceId, { emitter, def, key, stacks, lingerTicks });
        }
      }
    }
  }

  // ── PASS 2: diff against what IS applied ──────────────────────────────────
  for (const [target, sc] of world.stats) {
    const bucket = wanted.get(target);
    let dirty = false;

    for (let i = sc.sources.length - 1; i >= 0; i--) {
      const s = sc.sources[i]!;
      if (s.kind !== "aura") continue;
      const want = bucket?.get(s.id);

      if (want) {
        // Still inside. Consume the entry so PASS 3 only sees NEW ones.
        bucket!.delete(s.id);
        // Cancel a linger armed on a previous tick — re-entering the radius
        // must restore the buff, not let it expire while standing in it.
        if (s.expiresAtTick !== undefined) {
          s.expiresAtTick = undefined;
          dirty = true;
        }
        // A rank-up (or a swapped item) replaces the authored arrays wholesale;
        // reference identity is the cheapest exact test, because content arrays
        // come straight out of the registry and are stable per rank.
        if (s.modifiers !== want.def.modifiers) {
          s.modifiers = want.def.modifiers;
          dirty = true;
        }
        if (s.hooks !== want.def.hooks) {
          s.hooks = want.def.hooks;
          // hookLastFired is indexed by hook position — a different hooks array
          // invalidates it, and fireHooks rebuilds it lazily.
          s.hookLastFired = undefined;
          // …and so is the per-slot ledger (`internalCooldownScope:
          // "perAbilitySlot"`), which is indexed by the SAME positions. Leaving
          // it behind would carry one hook's cooldown onto whatever hook lands
          // at that index next.
          s.hookLastFiredBySlot = undefined;
          dirty = true;
        }
        if ((s.stacks ?? 1) !== want.stacks) {
          s.stacks = want.stacks;
          dirty = true;
        }
        continue;
      }

      // Out of scope: left the radius, changed zone, died, or the emitter died /
      // was destroyed / had the emitting source detached.
      const linger = s.auraOrigin?.lingerTicks ?? 0;
      if (linger > 0 && s.expiresAtTick === undefined) {
        // Arm the WC3 tail. Still applying until it lapses (recomputeStats and
        // fireHooks both treat `expiresAtTick > tick` as live), so nothing is
        // marked dirty here.
        s.expiresAtTick = world.tick + linger;
        continue;
      }
      if (s.expiresAtTick !== undefined && s.expiresAtTick > world.tick) continue;

      sc.sources.splice(i, 1);
      dirty = true;
      world.emit("auraEnd", {
        emitter: s.auraOrigin?.emitter ?? 0,
        target,
        key: s.auraOrigin?.key ?? "",
        sourceId: s.id,
      });
    }

    // ── PASS 3: attach the ones that are new this tick ──────────────────────
    if (bucket) {
      for (const [sourceId, want] of bucket) {
        const src: ModifierSource = {
          id: sourceId,
          kind: "aura",
          auraOrigin: { emitter: want.emitter, key: want.key, lingerTicks: want.lingerTicks },
        };
        // Only the payload crosses — never `auras` (DECISION 5) and never the
        // emitter's presentation flags.
        if (want.def.modifiers) src.modifiers = want.def.modifiers;
        if (want.def.hooks) src.hooks = want.def.hooks;
        if (want.stacks !== 1) src.stacks = want.stacks;
        sc.sources.push(src);
        dirty = true;
        const tt = world.transform.get(target);
        world.emit("auraApply", {
          emitter: want.emitter,
          target,
          key: want.key,
          sourceId,
          x: tt?.pos.x ?? 0,
          z: tt?.pos.z ?? 0,
        });
      }
    }

    // Marking dirty is enough: statRecomputeSystem runs on the very next line
    // of SimWorld.step, so the change lands this tick (DECISION 4).
    if (dirty) sc.dirty = true;
  }
}

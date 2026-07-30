/**
 * 隱形 / 真視 (invisibility & true sight) — THE ONE "can A see B" rule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SCOPE — owner 2026-07-30, 「選小的就好」
 *
 * This is the SMALL version, on the owner's explicit ruling. The snapshot still
 * carries an invisible unit's COORDINATES to every client; what changes is that
 * the sim will not let an enemy AUTO-ACQUIRE / CLICK / AGGRO onto it, and the
 * client fades the body out and draws no health bar for it.
 *
 * ⚠️ So this is NOT an anti-cheat feature and must never be described as one. A
 * modified client can read the position out of the snapshot. The owner knows and
 * accepts that trade for a家用局: the alternative — per-team snapshot filtering —
 * turns one O(1) broadcast into O(seats) divergent patch streams, which is a
 * structural change to the netcode for a threat model that does not exist here.
 * If that ever becomes wanted it is a SEPARATE task; nothing in this file
 * assumes it, and nothing here has to be undone to add it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY ONE PREDICATE AND NOT A CHECK AT EACH TARGETING SITE
 *
 * `sim/targeting.ts` documents, at length, how 召喚物 became invisible to the
 * whole game because the "what may be targeted" question was answered
 * INDEPENDENTLY in three places and one of them was never updated. Invisibility
 * is the same shape of question asked by the same call sites, so it gets the
 * same treatment: {@link canSee} is the only answer, and `targeting.ts` routes
 * `isAutoTargetable` / `isMobTargetable` / `isManuallyTargetable` through it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECISION POINTS ARE FIELDS (第一守則), AND THE DEFAULTS ARE WC3
 *
 * 「隱形擋自動索敵？擋手動點選？擋技能 AoE？」 are three different questions with
 * three different right answers, and the owner has overruled his own defaults on
 * every comparable knob so far. They are three booleans on {@link StealthRules}
 * (`config.stealth@1`), not three `if`s:
 *
 *   blocksAutoAcquire   true   WC3: a permanently invisible unit is not
 *                              auto-acquired and cannot be right-clicked by the
 *                              enemy. This is the whole mechanic.
 *   blocksMobAggro      true   Same rule for PvE. Split from the above because
 *                              「殭屍還是會撞到你」 is a legitimate design the
 *                              owner may want, and it is not the same decision.
 *   blocksManualTarget  true   WC3: the enemy cannot click what it cannot see.
 *   blocksAbilityAoe    FALSE  WC3: a blizzard/flame-strike DOES burn an
 *                              invisible unit standing in it — invisibility is
 *                              un-targetability, not immunity. Shipping `false`
 *                              is therefore both the faithful port AND the
 *                              behaviour-preserving default.
 *
 * and three more for the break rule:
 *
 *   breaksOnBasicAttack true   WC3 永久隱形: attacking reveals you.
 *   breaksOnCast        true   …and so does casting.
 *   breaksOnDamaged     FALSE  WC3: TAKING damage does not reveal you. (It is a
 *                              field because "you got hit, you should pop" is a
 *                              defensible modern read and the owner may prefer
 *                              it; the shipped value is the source's.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PURITY / DETERMINISM
 *
 * No `Math.random`, no `Date.now`, no trig, no `**` (sim/purity.test.ts). Every
 * deadline is an ABSOLUTE tick (`hiddenFromTick`), never a decrementing counter,
 * so a system that skips a tick cannot drift. Distances stay squared. The one
 * map this file iterates is walked over SORTED keys.
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { distSq } from "./math/vec2";

/** The config doc that carries {@link StealthRules}. */
export const STEALTH_SCHEMA = "config.stealth@1";

/**
 * 隱形規則 —— every decision point invisibility settles, as a field.
 *
 * See the module doc for the per-field WC3 justification. NOTHING in the sim
 * reads a hard-coded answer to any of these questions.
 */
export interface StealthRules {
  /** 隱形擋自動索敵 (`targeting.isAutoTargetable`) */
  blocksAutoAcquire: boolean;
  /** 隱形擋小怪 aggro (`targeting.isMobTargetable`) */
  blocksMobAggro: boolean;
  /** 隱形擋玩家手動點名 (`targeting.isManuallyTargetable`) */
  blocksManualTarget: boolean;
  /** 隱形擋技能 AoE (`abilities/abilitySystem.enemiesInCircle`) */
  blocksAbilityAoe: boolean;
  /** 普攻破隱 */
  breaksOnBasicAttack: boolean;
  /** 施法破隱 */
  breaksOnCast: boolean;
  /** 被打破隱 */
  breaksOnDamaged: boolean;
  /**
   * GLOBAL multiplier on every grant's own fade delay. 1 = use the ability's
   * authored seconds verbatim (27-00 永久性的隱形術 = 4.0 s, straight off the
   * w3x `Dur`/`HeroDur` column). It exists so the operator can make the whole
   * mechanic snappier or slower WITHOUT editing每一支技能文件, the same shape as
   * `combatEnv`'s global factors. Upper bound is 10 rather than unbounded: a
   * mis-typed 40 would mean "this hero never goes invisible again" and would
   * look exactly like the feature being broken (#277's failure shape).
   */
  fadeDelayMult: number;
  /**
   * 己方看到的隱形隊友不透明度 (0..1). NOT 0: you must be able to see your own
   * invisible champion or you cannot play it. WC3 draws your own invisible unit
   * at ~50 % with a shimmer; 0.35 reads as "clearly there, clearly not solid" on
   * the voxel bodies at this camera pitch.
   */
  allyAlpha: number;
  /**
   * 敵方（沒有真視）看到的不透明度 (0..1). 0 = gone. A non-zero value here is a
   * legitimate 「半透明鬼影」 design and is why this is a field rather than a
   * `setEnabled(false)`.
   */
  enemyAlpha: number;
  /** 隱形時畫不畫血條（敵方視角）。true = 不畫。 */
  hideEnemyHealthBar: boolean;
}

/**
 * SHIPPING VALUES. Every one is either the WC3 behaviour or (for the two render
 * numbers, which WC3 cannot answer for a voxel arena at this camera) a stated
 * choice. **缺文件 = 這一組**, not an empty object — an empty rules object would
 * silently mean "nothing blocks anything", i.e. the whole feature off with no
 * error anywhere.
 */
export const DEFAULT_STEALTH_RULES: StealthRules = {
  blocksAutoAcquire: true,
  blocksMobAggro: true,
  blocksManualTarget: true,
  blocksAbilityAoe: false,
  breaksOnBasicAttack: true,
  breaksOnCast: true,
  breaksOnDamaged: false,
  fadeDelayMult: 1,
  allyAlpha: 0.35,
  enemyAlpha: 0,
  hideEnemyHealthBar: true,
};

/** The doc id inside the `config` collection. */
export const STEALTH_DOC_ID = "stealth";

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Clamp to [lo, hi]; anything non-finite falls back to the shipping value. */
function num(v: unknown, fallback: number, lo: number, hi: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Normalise whatever the operator/document gave us into a COMPLETE rules table.
 *
 * NEVER throws and never returns a partial: a missing or garbage field falls
 * back to its shipping value. The reason is the same one `normalizeShieldRules`
 * gives — a partial table here would read `undefined` (falsy) for every
 * `blocks*`, i.e. invisibility would silently become render-only while the page
 * still showed the operator's saved values.
 */
export function normalizeStealthRules(raw: unknown): StealthRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_STEALTH_RULES;
  return Object.freeze({
    blocksAutoAcquire: bool(r.blocksAutoAcquire, d.blocksAutoAcquire),
    blocksMobAggro: bool(r.blocksMobAggro, d.blocksMobAggro),
    blocksManualTarget: bool(r.blocksManualTarget, d.blocksManualTarget),
    blocksAbilityAoe: bool(r.blocksAbilityAoe, d.blocksAbilityAoe),
    breaksOnBasicAttack: bool(r.breaksOnBasicAttack, d.breaksOnBasicAttack),
    breaksOnCast: bool(r.breaksOnCast, d.breaksOnCast),
    breaksOnDamaged: bool(r.breaksOnDamaged, d.breaksOnDamaged),
    fadeDelayMult: num(r.fadeDelayMult, d.fadeDelayMult, 0, 10),
    allyAlpha: num(r.allyAlpha, d.allyAlpha, 0, 1),
    enemyAlpha: num(r.enemyAlpha, d.enemyAlpha, 0, 1),
    hideEnemyHealthBar: bool(r.hideEnemyHealthBar, d.hideEnemyHealthBar),
  });
}

/**
 * Read a `config.stealth@1` doc. No doc / wrong schema → the shipping table.
 * 缺文件 = 出貨預設, never an empty object (see {@link normalizeStealthRules}).
 */
export function stealthRulesFromDoc(doc: unknown): StealthRules {
  if (!doc || typeof doc !== "object") return DEFAULT_STEALTH_RULES;
  const d = doc as { schema?: unknown };
  if (d.schema !== STEALTH_SCHEMA) return DEFAULT_STEALTH_RULES;
  return normalizeStealthRules(d);
}

/**
 * A unit's live stealth state. Created by {@link syncVisionGrants} for anybody
 * carrying a stealth grant, destroyed when the grant leaves.
 *
 * `hiddenFromTick` is an ABSOLUTE tick, never a countdown: the fade deadline is
 * re-armed by writing `world.tick + delay` at the moment of the break, so a
 * system that runs late, or a replay that resumes mid-round, computes the same
 * answer as a system that ran on time.
 */
export interface StealthState {
  /** the grant's fade delay in TICKS, already through `fadeDelayMult` */
  fadeDelayTicks: number;
  /** absolute tick at or after which this body is hidden */
  hiddenFromTick: number;
}

/** A unit's true-sight radius (sim units, centre-to-centre). */
export interface TrueSightState {
  radius: number;
}

/**
 * What an ability's passive rank block may grant. Rides `ModifierSource.vision`
 * exactly the way `evasionScope` rides the source that grants evasion, and for
 * the same reason: the capability belongs to the BUFF, not to the unit, so two
 * sources cannot be confused for one aggregated number.
 */
export interface VisionGrant {
  /**
   * 永久隱形: seconds of no stealth-breaking action before the body fades.
   * The w3x number for 27-00 永久性的隱形術 (`Apiv`) is 4.0 — the `Dur`/`HeroDur`
   * column, which for Permanent Invisibility is the FADE TIME, not a buff
   * duration. Matches the map's own prose 「在4秒內不做任何攻擊或施法動作」.
   */
  stealthFadeDelaySec?: number;
  /**
   * 真視: radius (sim units) inside which this unit sees invisible enemies.
   * 16-00 通靈能力 (`Atru`) ships 500 WC3 units → 9.17 here (the /54.5 rate
   * every other ported length uses).
   */
  trueSightRadius?: number;
}

/** ticks, from seconds, on the world's own dt. Never a float tick count. */
function ticksOf(world: SimWorld, sec: number): number {
  const t = Math.round(sec / world.dt);
  return t > 0 ? t : 0;
}

/**
 * Reconcile `world.stealth` / `world.trueSight` against the vision grants
 * currently attached to `id`.
 *
 * Called from the stealth system every tick rather than only at attach time,
 * because a grant can arrive from anywhere the stat pipeline reaches (innate,
 * item, augment, aura, 變身) and there is no single "a source was attached"
 * event to hang off. The scan is over `sc.sources`, an ARRAY — insertion
 * ordered and identical on every replica, so no ordering normalisation is owed.
 *
 * MAX-NOT-SUM for both numbers: two true-sight sources give you the wider eye,
 * not the sum, and two stealth grants give you the SHORTEST fade (the more
 * generous one wins), which is the WC3 rule for non-stacking passives.
 */
function syncVisionGrants(world: SimWorld, id: EntityId): void {
  const sc = world.stats.get(id);
  let fadeSec = -1;
  let sight = 0;
  if (sc) {
    for (const src of sc.sources) {
      if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
      const v = src.vision;
      if (!v) continue;
      if (v.stealthFadeDelaySec !== undefined && v.stealthFadeDelaySec >= 0) {
        if (fadeSec < 0 || v.stealthFadeDelaySec < fadeSec) fadeSec = v.stealthFadeDelaySec;
      }
      if (v.trueSightRadius !== undefined && v.trueSightRadius > sight) sight = v.trueSightRadius;
    }
  }

  if (sight > 0) world.trueSight.set(id, { radius: sight });
  else world.trueSight.delete(id);

  if (fadeSec < 0) {
    world.stealth.delete(id);
    return;
  }
  const mult = world.stealthRules.fadeDelayMult;
  const delayTicks = ticksOf(world, fadeSec * (mult > 0 ? mult : 0));
  const prev = world.stealth.get(id);
  if (!prev) {
    // FIRST ARM. The clock starts NOW, not at tick 0 — a hero must walk out of
    // the spawn ring before he disappears, exactly like WC3's fade-in.
    world.stealth.set(id, {
      fadeDelayTicks: delayTicks,
      hiddenFromTick: world.tick + delayTicks,
    });
    return;
  }
  if (prev.fadeDelayTicks !== delayTicks) {
    // The delay changed under us (operator re-tuned `fadeDelayMult`, or a
    // second grant landed). Re-anchor from the START of the current wait rather
    // than from now, so shortening the delay does not push the deadline out.
    const waitedFrom = prev.hiddenFromTick - prev.fadeDelayTicks;
    prev.fadeDelayTicks = delayTicks;
    prev.hiddenFromTick = waitedFrom + delayTicks;
  }
}

/**
 * A stealth-breaking action happened. Re-arms the fade clock; the body is
 * visible again from THIS tick until the delay elapses.
 *
 * `kind` is checked against the rules HERE, at the one place that knows what
 * happened, so the two call sites (`BasicAttackSystem` swing commit,
 * `abilitySystem` cast commit) carry no policy of their own.
 *
 * A no-op — and cheap — for the ~117 champions who carry no stealth grant.
 */
export function breakStealth(
  world: SimWorld,
  id: EntityId,
  kind: "attack" | "cast" | "damaged",
): void {
  const st = world.stealth.get(id);
  if (!st) return;
  const r = world.stealthRules;
  if (kind === "attack" && !r.breaksOnBasicAttack) return;
  if (kind === "cast" && !r.breaksOnCast) return;
  if (kind === "damaged" && !r.breaksOnDamaged) return;
  st.hiddenFromTick = world.tick + st.fadeDelayTicks;
}

/** Is `id` hidden RIGHT NOW? False for everyone with no grant, and for corpses. */
export function isHidden(world: SimWorld, id: EntityId): boolean {
  const st = world.stealth.get(id);
  if (!st) return false;
  if (world.tick < st.hiddenFromTick) return false;
  // A CORPSE IS NOT INVISIBLE. The revive circle, the gold drop and the #220
  // dissolve are all things the enemy must be able to see happen.
  const hp = world.health.get(id);
  return hp?.alive === true;
}

/** Does `viewer` have true sight reaching `target`'s position this tick? */
export function hasTrueSightOn(world: SimWorld, viewer: EntityId, target: EntityId): boolean {
  const ts = world.trueSight.get(viewer);
  if (!ts || !(ts.radius > 0)) return false;
  const a = world.transform.get(viewer);
  const b = world.transform.get(target);
  if (!a || !b || a.zone !== b.zone) return false;
  return distSq(a.pos, b.pos) <= ts.radius * ts.radius;
}

/**
 * THE rule: may `viewer` perceive `target` this tick?
 *
 * True for everything that is not hidden (i.e. for essentially the whole game),
 * so this is the cheap path. Three ways to still see a hidden body:
 *   1. it is YOU (a stealthed hero always sees itself — it has to be playable);
 *   2. it is a TEAMMATE (你的隊友躲起來，你還是看得到他);
 *   3. you have TRUE SIGHT in range of it.
 *
 * `viewer` may be -1 for "no particular observer" (the AoE gate), in which case
 * only rule 3 is unavailable and a hidden body is simply unseen.
 */
export function canSee(world: SimWorld, viewer: EntityId, target: EntityId): boolean {
  if (!isHidden(world, target)) return true;
  if (viewer === target) return true;
  const va = world.team.get(viewer);
  const vb = world.team.get(target);
  if (va && vb && va.teamId === vb.teamId) return true;
  return hasTrueSightOn(world, viewer, target);
}

/**
 * Advance every stealth clock and reconcile the grant maps. Slot 0c in
 * `SimWorld.step` — BEFORE targeting (OrderSystem/MobSystem/BasicAttackSystem)
 * so the answer they all read was computed this tick, and AFTER the stat
 * recompute that could have attached the grant in the first place.
 *
 * Iteration is over a SORTED id list, not Map insertion order (sim purity).
 */
export function stealthSystem(world: SimWorld): void {
  // Candidates = everything that can carry a StatsComp source. Champions and
  // 召喚物 both can; mobs carry no StatsComp so `syncVisionGrants` finds nothing
  // for them and they are skipped by the early-out below.
  const ids: EntityId[] = [];
  for (const id of world.stats.keys()) ids.push(id);
  ids.sort((a, b) => a - b);
  for (const id of ids) syncVisionGrants(world, id);
  // Bodies that lost their StatsComp (destroyed, or a summon that despawned)
  // leave `removeEntity` to clean up; nothing to do per tick.
}

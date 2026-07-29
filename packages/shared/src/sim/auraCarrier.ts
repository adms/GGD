/**
 * AURA CARRIERS (虛擬蝗蟲群) — the dummy unit that lets a SECOND FORM carry an
 * aura the champion itself has no authorization surface for.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HOLE THIS FILLS, MEASURED RATHER THAN ASSUMED
 *
 * 70-00 紮根 (`A0O6`) toggles 白木卡迪那 between `godie-e00s` (本體) and
 * `godie-e010` (紮根形態). The ROOTED body's own WC3 ability list also carries
 * `A0GM` 芬多精 (`Aoar`, a real Aura): `area{1}=250` → 250·11/600 = 4.58 sim
 * units, `data{1}{1}=0.05` → +5 % `healthRegen`, to ALLIES.
 *
 * There is today NO seam that can make a modifier or an aura exist "only while
 * in form X". All three candidates were read, not guessed:
 *
 *   · `setBody` (systems/ChampionFormSystem.ts) writes ONLY
 *     `ChampionComp.championId` + `StatsComp.championId`. It never touches
 *     `AbilitiesComp` and never calls `syncAbilityPassives`.
 *   · `AbilitiesComp.passiveSlot` is bound ONCE, in `spawnChampion`, from the
 *     BASE champion doc — so a rooted 白木's passive slot still says
 *     `godie-e00s.passive` and the alternate's innate doc is never consulted.
 *   · `syncAbilityPassives` (abilities/abilityPassives.ts) `continue`s on
 *     `isActiveInnate(def)`, and 紮根 MUST be `innateKind: "active"` to stay a
 *     pressable toggle. So even the doc it does read would be skipped.
 *
 * owner, 2026-07-29:「既然是光環,那就是範圍效果,你可以運用編輯器技巧,創造一個
 * 虛擬看不到也點不到的蝗蟲群,身上有光環回血 5% 技能,每秒鐘跟隨角色調整座標就好,
 * 只是記得結束要清除相關資源跟變數,每場開始要重新打開設定」
 *
 * That is the classic WC3 map-author dummy-unit trick, and it is the right one
 * here for a reason beyond fidelity: the aura machinery (sim/aura/aura.ts) is
 * already a per-tick reconcile over `world.stats` emitters, so a carrier needs
 * to do exactly ONE thing — exist, at the host's coordinates, with the right
 * `auras` on its `sources` — and every other behaviour (radius, team filter,
 * enter/leave, emitter death, zone change, `abilityRange`) is inherited.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VERIFIED, NOT ASSUMED: WHAT `auraSystem` ACTUALLY EATS
 *
 * The claim handed to this lane was "auraSystem already eats any non-aura
 * source's `auras`". Read against the code (aura.ts PASS 1) it is TRUE, with
 * four preconditions this module must satisfy — every one of them is asserted
 * in auraCarrier.test.ts rather than trusted:
 *
 *   1. the emitter is a key of `world.stats`      → carriers get a `StatsComp`;
 *   2. the emitter is a key of `world.transform`  → carriers get a `Transform`;
 *   3. the emitting source's `kind !== "aura"`    → carriers use `"passive"`;
 *   4. `world.health.get(emitter)` is absent OR alive → carriers have NO
 *      Health at all, which aura.ts explicitly documents as "counts as alive".
 *
 * A fifth is implicit and is the reason the carrier carries a `TeamComp`:
 * `affectsTarget` resolves `affects: "ally"` through `world.team.get(emitter)`,
 * so a teamless carrier would emit an ally aura that reaches NOBODY (and would
 * do it silently). The carrier's `seatId` is the `-1` sentinel — see below.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 1 — RECONCILED FROM STATE, NEVER SUBSCRIBED TO EVENTS.
 *   {@link auraCarrierSystem} rebuilds "who should own a carrier right now"
 *   from (form index, current championId, alive, combatActive, settledZones)
 *   every tick and diffs it against `world.auraCarrier`. It is NOT called from
 *   `applyChampionForm` / `revertToBaseForm`.
 *
 *   This is the same argument aura.ts makes in its DECISION 2, and here it is
 *   load-bearing for a specific reason: `endCombatChampionForms` EXISTS but is
 *   called by NOBODY — grep the tree, the only callers are its own tests. A
 *   carrier torn down from a form-exit callback would therefore leak on exactly
 *   the path the owner called out (「結束要清除相關資源跟變數」). Reconciling
 *   means the teardown is a consequence of the state, so death, expiry, revert,
 *   `world.destroy`, round end and combat end all collapse into ONE code path
 *   that cannot be forgotten for a new one.
 *
 * DECISION 2 — COMBAT-SCOPED BY CONSTRUCTION.
 *   A carrier is wanted only while `world.combatActive` AND the host's zone is
 *   not in `world.settledZones`. That is the owner's 「每場開始要重新打開設定」
 *   and 「結束要清除」 expressed as an invariant instead of as two callbacks:
 *   `enterCombat` sets `combatActive = true` and clears `settledZones`, so the
 *   first combat tick re-creates every carrier; `concludeCombat` sets
 *   `combatActive = false`, so the next tick destroys every carrier. The
 *   settled-zone half is the #216 rule verbatim ("combat is over HERE"): a
 *   decided duel must not keep regenerating its winner while the shop is up.
 *   {@link endCombatAuraCarriers} exists for a host that wants the teardown to
 *   land on the exact tick it decides, but nothing depends on it being called.
 *
 * DECISION 3 — THE CARRIER IS STRUCTURALLY UNTARGETABLE, NOT FILTERED.
 *   `SimWorld.rebuildGrid` skips `world.auraCarrier` exactly as it skips revive
 *   circles and dropped coins. EVERY targeting path in the sim goes through the
 *   broad-phase (`queryOverlap` walks `world.grid`), so one line makes it
 *   invisible to ability AoE, projectiles, `acquireTarget`, the bot brain and
 *   the mob AI at once. `targeting.isAutoTargetable` also requires a
 *   ChampionComp or a MobComp, which a carrier has neither of — two independent
 *   reasons, which is what makes the guard hard to break by accident.
 *
 * DECISION 4 — IT IS NOT ON THE WIRE.
 *   `projectSnapshot` iterates `world.transform`, so a carrier WOULD otherwise
 *   be published as a `kind: 0` champion with `key: ""` — and the client's
 *   EntityViewRegistry falls entities with kind 0 through to `new ChampionView`
 *   unconditionally, i.e. it would build a modelless voxel stand-in and paint
 *   it on the floor. The snapshot therefore skips carriers before it touches
 *   `state.entities` at all (one guard, alongside the loop's existing kind
 *   dispatch), and `auraCarrier.test.ts` pins BOTH halves: the carrier is in
 *   `world.transform` (so aura.ts can find it) and is NOT in the projected
 *   entity ids.
 *
 * DECISION 5 — POSITION IS COPIED EVERY TICK, NOT EVERY SECOND.
 *   owner said 「每秒鐘跟隨角色調整座標」; this does it every tick. At 30 Hz a
 *   1 s timer would let a champion moving at the 14 u/s cap drift up to 14
 *   units from its own aura — three times the aura's own 4.58 radius — and a
 *   timer is also one more piece of state to keep deterministic. A copy is two
 *   float writes and needs no state at all.
 *
 *   The copy happens IMMEDIATELY BEFORE `auraSystem` in `SimWorld.step`, i.e.
 *   before anything moves this tick. So the carrier sits exactly where the host
 *   stood when membership is evaluated — the same instant every NATIVE emitter
 *   is evaluated at. There is no lag relative to a champion-carried aura.
 *
 * DECISION 6 — THE PAYLOAD IS `auras` ONLY.
 *   The rank block may also carry `modifiers` and `hooks`. Neither crosses:
 *   nothing ever reads a carrier's `final` stats (it has no ChampionComp, so
 *   `recomputeStats` returns early), and a hook on a body that never attacks,
 *   is never hit and never kills can never fire. Copying them would be dead
 *   state that a future reader could mistake for a live effect.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM
 *
 * No `world.rng` draw, no clock, no trig. Both passes iterate an EXPLICITLY
 * SORTED ascending-id key list rather than Map insertion order — which matters
 * here and is not ceremony: a champion that transforms, reverts and transforms
 * again is re-inserted at the END of `world.championForm`, so insertion order
 * is NOT id order, and creation order decides which `EntityId` each carrier
 * gets. Sorting is what makes two replicas hand out the same ids.
 *
 * Carriers ARE folded into `SimWorld.digest()` — not by a new term, but by the
 * existing `for (const [id, t] of this.transform)` loop, which mixes their id
 * and position. That is deliberate and free: a replica that created, skipped or
 * destroyed a carrier on a different tick diverges on that tick instead of
 * minutes later through an hp curve. A world where nobody transforms creates no
 * carriers and hashes byte-identically to a pre-feature world.
 */
import { asSeatId, type AbilityId, type ChampionId, type EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { AuraDef } from "./aura/aura";
import type { AbilityDef } from "./content/defs";
import { Abilities, Champions } from "./content/registry";
import { abilityPassiveSourceId, isActiveInnate } from "./abilities/abilityPassives";
import { championFormIndex } from "./systems/ChampionFormSystem";
import { zeroStats } from "./stats/statTypes";

/**
 * A live aura carrier. Keyed by the CARRIER's own entity id.
 *
 * `championId` is the body the carrier was created FOR, not the host's base
 * hero: it is re-checked every tick so a host that swapped to a *different*
 * alternate (or was force-reverted and re-transformed) gets a fresh carrier
 * with that body's aura rather than silently keeping the old one.
 */
export interface AuraCarrierComp {
  /** the champion entity whose coordinates this carrier tracks */
  host: EntityId;
  /** the FORM (alternate champion id) whose innate doc supplied the aura */
  championId: ChampionId;
  /** the innate ability doc the `auras` block came from */
  abilityId: AbilityId;
}

/** `ModifierSource.id` a carrier emits under. Mirrors the ability-passive id. */
export function auraCarrierSourceId(abilityId: string): string {
  return `auraCarrier:${abilityPassiveSourceId(abilityId)}`;
}

/** What a form wants carried, or null when it wants nothing. */
interface CarrierSpec {
  championId: ChampionId;
  abilityId: AbilityId;
  auras: AuraDef[];
}

/**
 * The aura block the entity's CURRENT body wants projected, or null.
 *
 * Reads through `ChampionComp.championId` — the body the entity is resolving
 * through RIGHT NOW — and never through `AbilitiesComp.passiveSlot`, which is
 * pinned to the base hero at spawn and is exactly why this module exists.
 *
 * Rank: a 天生技 is rank 1 from spawn and can never be ranked (see
 * `AbilitiesComp.passiveSlot`), so `ranks[0]` IS the block.
 */
function specFor(world: SimWorld, host: EntityId): CarrierSpec | null {
  const champ = world.champion.get(host);
  if (!champ) return null;
  const championId = champ.championId as ChampionId;
  const def = Champions.tryGet(championId);
  const passiveId = def?.passiveAbility;
  if (passiveId === undefined) return null;
  const ability = Abilities.tryGet(passiveId) as AbilityDef | undefined;
  const ranks = ability?.passive?.ranks;
  if (!ability || !ranks?.length) return null;
  // A PASSIVE-kind innate is delivered by `syncAbilityPassives` on the champion
  // itself; a carrier for it would DOUBLE the aura. Only the active kind — the
  // kind that lane skips, and the kind a toggle must be — is served here.
  if (!isActiveInnate(ability)) return null;
  // RANK 0, literally — `AbilitiesComp.passiveSlot` documents that a 天生技 is
  // rank 1 from spawn and can never be ranked, so `ranks[0]` IS the block. Not
  // dressed up as a clamp: an index expression that always evaluates to 0 would
  // read as "this varies by rank" and it does not.
  const auras = ranks[0]?.auras;
  if (!auras?.length) return null;
  // Belt to the braces above: if this exact ability's passive source is ALREADY
  // attached to the host (a pair whose two halves share one innate doc), the
  // host is emitting it and a carrier would be a second copy.
  const attachedId = abilityPassiveSourceId(passiveId);
  if (world.stats.get(host)?.sources.some((s) => s.id === attachedId)) return null;
  return { championId, abilityId: passiveId, auras };
}

/** True while the zone this entity fights in is still contesting a live round. */
function combatLiveFor(world: SimWorld, zone: number): boolean {
  return world.combatActive && !world.settledZones.has(zone);
}

/**
 * Should `host` own a carrier this tick? The single predicate every create AND
 * destroy decision reads, so the two can never disagree.
 */
function wantedFor(world: SimWorld, host: EntityId): CarrierSpec | null {
  const t = world.transform.get(host);
  if (!t) return null;
  // ⚠️ DEFENCE IN DEPTH, NOT THE MECHANISM — and mutation-testing says so: with
  // this line deleted the whole suite still passes. What ACTUALLY makes owner's
  // 「本體身上沒有光環、生根形態身上有」 true is `specFor` resolving the aura
  // through `ChampionComp.championId`, i.e. through the body the entity is
  // WEARING (swap that to `championForm.baseId` and 9 tests go red). This line
  // is kept because it states the intent at the top of the predicate and would
  // catch a future direct-spawn of an alternate body as a pickable champion.
  if (championFormIndex(world, host) !== 1) return null;
  // ⚠️ Also unfalsifiable today, same reason: `championFormSystem` runs at slot
  // 0a and force-reverts every corpse, so a dead host has no form left by the
  // time this runs. It is the belt to that braces — if the death revert ever
  // moved or was made conditional, a corpse would otherwise keep regenerating
  // its team from beyond the grave.
  const hp = world.health.get(host);
  if (hp && !hp.alive) return null;
  if (!combatLiveFor(world, t.zone)) return null;
  return specFor(world, host);
}

/** The carrier following `host`, or undefined. O(carriers); tests + HUD only. */
export function auraCarrierFor(world: SimWorld, host: EntityId): EntityId | undefined {
  for (const [id, c] of world.auraCarrier) if (c.host === host) return id;
  return undefined;
}

/**
 * Create one carrier for `host` from `spec`. NOT exported: a carrier that was
 * not asked for by {@link wantedFor} is a leak by definition.
 */
function createCarrier(world: SimWorld, host: EntityId, spec: CarrierSpec): EntityId {
  const ht = world.transform.get(host)!;
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: ht.pos.x, z: ht.pos.z },
    vel: { x: 0, z: 0 },
    // A fixed facing, never turned: nothing reads it, and a copied facing would
    // put the host's rotation into `digest()` twice for no information.
    facing: { x: 0, z: 1 },
    // RADIUS 0 — it is not a body, and this is load-bearing rather than tidy.
    // `MovementSystem`'s soft-separation pass walks `world.transform` DIRECTLY
    // (only its inner loop reads the grid), so a carrier with a real radius
    // would shove every entity with a higher id — i.e. every mob spawned after
    // the toggle. At radius 0 the push test is `dist < 0 + other.radius` (≈0.6),
    // and the host's own separation already holds everybody at ≥ 1.2 from the
    // point the carrier sits on, so the push is unreachable by construction.
    // MovementSystem carries an explicit skip as well; this is why that skip
    // cannot be mutation-killed, and why it must not be "simplified away"
    // together with this line.
    radius: 0,
    zone: ht.zone,
  });
  // TEAM, SEAT -1. The team is what `affects: "ally"` resolves through; the
  // `-1` seat is the same neutral sentinel mobs use (sim/mobs.ts), and it is
  // what keeps the carrier out of the two systems that iterate `world.team` by
  // seat — `orderSystem` (also needs a Navigation, which a carrier has not) and
  // `commandSystem` (also needs a ChampionComp, which a carrier has not).
  const ht2 = world.team.get(host);
  if (ht2) world.team.set(id, { teamId: ht2.teamId, seatId: asSeatId(-1) });
  world.stats.set(id, {
    // Never dereferenced — `recomputeStats` returns early without a
    // ChampionComp — but set to a REGISTERED id anyway, because `Champions.get`
    // THROWS and a future reader must not be the one to discover that.
    championId: spec.championId,
    final: zeroStats(),
    // Never dirty: nothing reads a carrier's final stats, so a recompute would
    // be pure waste on every tick of the toggle.
    dirty: false,
    sources: [
      {
        id: auraCarrierSourceId(spec.abilityId),
        // NOT "aura": aura.ts DECISION 5 skips `kind: "aura"` sources when
        // collecting emitters, so a carrier tagged that way would emit nothing.
        kind: "passive",
        // DECISION 6 — the aura block ONLY. The array reference is shared with
        // the content registry on purpose: aura.ts diffs `s.modifiers !==
        // want.def.modifiers` by IDENTITY, and a fresh copy per tick would make
        // every projected source look changed on every tick.
        auras: spec.auras,
      },
    ],
  });
  world.auraCarrier.set(id, { host, championId: spec.championId, abilityId: spec.abilityId });
  // NO `world.emit`, deliberately. A carrier is INFRASTRUCTURE, not an event:
  // its whole observable footprint is the aura it projects, and `auraSystem`
  // already emits `auraApply` / `auraEnd` per affected unit for exactly that.
  // A `auraCarrierSpawn` echo would have no consumer, would have to be
  // classified in `apps/game-server/src/net/eventFanout.ts` (which proves the
  // sim's emit set is fully decided), and would put a dummy unit's lifecycle on
  // a channel the client has no business seeing.
  return id;
}

/** Destroy one carrier. The ONLY teardown path. */
function destroyCarrier(world: SimWorld, id: EntityId): void {
  world.destroy(id);
}

/**
 * Reconcile every aura carrier against the current forms, then re-seat the
 * survivors on their hosts. Runs once per tick, immediately BEFORE
 * `auraSystem` (see DECISION 5). Draws no rng.
 */
export function auraCarrierSystem(world: SimWorld): void {
  // The common case, and the reason this system is free for 111 of 113 heroes:
  // no transformed body and no live carrier means there is nothing to do.
  if (world.auraCarrier.size === 0 && world.championForm.size === 0) return;

  // ── PASS 1: drop the carriers that are no longer wanted, follow the rest ──
  // ASCENDING ID, explicitly: `world.auraCarrier` insertion order is creation
  // order, and a re-created carrier lands at the end (see DETERMINISM).
  const covered = new Set<EntityId>();
  for (const id of [...world.auraCarrier.keys()].sort((a, b) => a - b)) {
    const c = world.auraCarrier.get(id)!;
    const want = wantedFor(world, c.host);
    // A carrier survives only while the SAME body still wants the SAME
    // ability. A different alternate (or a different innate doc under it) is
    // a different aura, so the old carrier goes and PASS 2 makes a new one.
    if (
      want === null ||
      want.championId !== c.championId ||
      want.abilityId !== c.abilityId ||
      covered.has(c.host) // duplicate for one host: unreachable today, dropped anyway
    ) {
      destroyCarrier(world, id);
      continue;
    }
    covered.add(c.host);
    // FOLLOW. The host's transform exists — `wantedFor` just read it.
    const ht = world.transform.get(c.host)!;
    const t = world.transform.get(id)!;
    t.pos = { x: ht.pos.x, z: ht.pos.z };
    t.zone = ht.zone;
  }

  // ── PASS 2: create the ones that are missing ─────────────────────────────
  // Iterating `championForm` (not `champion`) is what keeps this O(transformed)
  // rather than O(champions): the map is EMPTY in every match where nobody
  // transforms, which is the overwhelming majority.
  for (const host of [...world.championForm.keys()].sort((a, b) => a - b)) {
    if (covered.has(host)) continue;
    const want = wantedFor(world, host);
    if (want === null) continue;
    createCarrier(world, host, want);
  }
}

/**
 * Combat exit: every carrier despawns. Idempotent and safe to call when none
 * exist, exactly like `endCombatMobs` / `endCombatCoins` / `endCombatGuardians`.
 *
 * The per-tick reconcile would reach the same state one tick later on its own
 * (DECISION 2), so this is a PROMPTNESS seam, not the correctness one — which
 * is why nothing breaks in the current tree, where no host calls it yet.
 */
export function endCombatAuraCarriers(world: SimWorld): void {
  for (const id of [...world.auraCarrier.keys()].sort((a, b) => a - b)) {
    destroyCarrier(world, id);
  }
}

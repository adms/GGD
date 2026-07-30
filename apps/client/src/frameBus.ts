/**
 * frameBus — a PLAIN shared mutable store bridging the imperative render loop
 * and the DOM world-anchor layer. The render loop writes projected screen
 * coordinates here every frame; ui/WorldAnchorLayer reads them in its own rAF
 * and patches DOM styles imperatively. Nothing here touches React state or
 * Zustand — per-frame data never passes through React (client-08).
 */
import {
  COALESCE_MS,
  MAX_COMBAT_TEXT,
  MAX_STAGGER_STEPS,
  SPAWN_STAGGER_MS,
  combatTextCategory,
  combatTextStyle,
  overflowOnTargetIndex,
  scopeAllows,
  worstEntryIndex,
  type CombatTextCategory,
  type CombatTextKind,
  type CombatTextRelation,
  type CombatTextScope,
} from "./ui/combatText";

export interface AnchorPose {
  sx: number;
  sy: number;
  visible: boolean;
}

/** Over-head cast-bar state (null when the entity isn't casting). */
export interface CastBar {
  /** 0..1 fill */
  fraction: number;
  /** "cast" = ability channel, "windup" = basic-attack wind-up */
  kind: "cast" | "windup";
}

export interface ChampionAnchor {
  entityId: number;
  /**
   * The authoritative `EntityState.kind` this anchor was built from
   * (render/overheadAnchors KIND_*). Optional so a hand-built anchor (tests)
   * stays valid, and because for a CHAMPION — the overwhelming majority — the
   * default of `KIND_CHAMPION` is the truth.
   *
   * It exists because `teamId < 0` was doing this job by accident: it meant
   * "healing flower" back when the flower was the only team-less anchor, and
   * then the neutral GUARDIAN (#89) started encoding seatId -1 as well and
   * silently inherited the flower's minimap pip and the flower's small blob
   * shadow. Reading the kind makes each consumer say which neutral it means.
   */
  kind?: number;
  name: string;
  teamId: number;
  /**
   * Content id of the champion this entity is playing ("" for neutrals and
   * until the seat's pick is known) — the minimap resolves the w3x portrait
   * from it (ui/icons.ts), exactly like the shop/champ-select do.
   */
  championId: string;
  isLocal: boolean;
  alive: boolean;
  hpPct: number;
  shieldPct: number;
  manaPct: number;
  /** planar world position (interpolated), for the minimap overlay */
  worldX: number;
  worldZ: number;
  pose: AnchorPose;
  /** over-head cast bar; null when not casting */
  cast: CastBar | null;
  /**
   * Explicit bar color for NEUTRAL entities (healing flowers, kind 2).
   * Absent for champions — the UI derives their color from teamId
   * (`anchor.color ?? teamCss(anchor.teamId)`).
   */
  color?: string;
}

/**
 * One live floating combat-text node (task #92). POOLED: the array is
 * pre-allocated to `MAX_COMBAT_TEXT` at module load and entries are claimed and
 * released in place — `active` is the only liveness flag. Nothing is ever
 * pushed or spliced at runtime, so a teamfight allocates zero objects here and
 * ui/WorldAnchorLayer can keep one DOM node per slot for the whole session.
 */
export interface CombatTextEntry {
  /** pool slot; stable for the life of the node it drives */
  readonly slot: number;
  /** bumped every time the slot is re-claimed — the renderer's "this is a new number" key */
  id: number;
  active: boolean;
  category: CombatTextCategory;
  /** accumulated amount (a same-tick coalesce adds into this) */
  amount: number;
  crit: boolean;
  killingBlow: boolean;
  /** entity the number belongs to — drives the per-target cap and coalescing */
  targetId: number;
  /** admission priority, lower = kept (see combatText.worstEntryIndex) */
  rank: number;
  /** lane index on that body, so stacked numbers fan instead of overlapping */
  lane: number;
  worldX: number;
  worldZ: number;
  /** world-space Y this category projects from */
  anchorY: number;
  /** may be in the FUTURE — RO's multi-hit stagger releases numbers in sequence */
  bornMs: number;
  lifeMs: number;
  pose: AnchorPose;
}

/** LOCAL player's current cast, for the ability-icon fill overlay. */
export interface LocalCast {
  /** ability slot index 0..3 (Q/W/E/R); -1 for a basic-attack wind-up */
  slot: number;
  fraction: number;
  kind: "cast" | "windup";
}

/** A blocking obstacle of a zone, flattened to plain numbers for the minimap. */
export type MinimapObstacle =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "segment"; ax: number; az: number; bx: number; bz: number };

/**
 * One circular arena zone (planar) plus the STATIC terrain inside it. The
 * minimap paints zone disc + obstacles + spawn pads ONCE into an offscreen
 * canvas and blits that as its base layer, so the per-frame cost stays at
 * "markers only" (see ui/hud/minimapTerrain).
 */
export interface ArenaZoneCircle {
  x: number;
  z: number;
  r: number;
  /** blocking pillars/walls the sim collides against (terrain layer) */
  obstacles?: readonly MinimapObstacle[];
  /** spawn pads by side (0/1), each a list of points (terrain layer) */
  spawns?: readonly (readonly { x: number; z: number }[])[];
}

/**
 * The primary camera's ground-plane view, published every frame by
 * render/CameraRig (`groundView()`). The minimap derives its viewport box and
 * its orientation from THESE numbers — never from a hardcoded rectangle or a
 * magic yaw. Null until the first rendered frame.
 */
export interface CameraGroundView {
  /** ground point the camera looks at (world x/z) */
  targetX: number;
  targetZ: number;
  /** eye distance from the target along the sightline (world units) */
  dolly: number;
  /** pitch below horizontal (radians) */
  pitchRad: number;
  /** ground-plane yaw of camera-forward (radians; 0 = looking along +Z) */
  yawRad: number;
  /** vertical field of view (radians) */
  fovRad: number;
  /** viewport aspect (width / height) */
  aspect: number;
}

/**
 * One live revive circle (task #84), published every frame by the game loop.
 *
 * A circle is NOT a champion anchor: it carries no HP bar and no name, and it
 * must not be swept up by anything that iterates `frameBus.champions`. It gets
 * its own list so the minimap and the HUD banner can read it without either of
 * them growing a special case on the anchor type.
 */
export interface ReviveCircleMarker {
  entityId: number;
  /** seat of the DEAD OWNER this circle would bring back */
  ownerSeatId: number;
  /** owning team (already resolved from the seat table) */
  teamId: number;
  /** duel zone — task #67 scopes the minimap to the local player's zone */
  zone: number;
  worldX: number;
  worldZ: number;
  /** ring radius in world units (authoritative, off the wire) */
  radius: number;
  /** channel fill 0..1 */
  progress: number;
  // No lifetime fields: the ring lasts until the round ends (task #196), so
  // there is no countdown for the HUD or the world view to render.
  /** at least one ally is channelling right now */
  channelling: boolean;
  /** an enemy stands inside, holding progress */
  contested: boolean;
}

/**
 * The live 殭屍王 (task #262), published every frame while one is on the field.
 *
 * WHY IT NEEDS ITS OWN CHANNEL. Mobs are `KIND_MOB` and `hasOverheadBar()`
 * excludes them, so no zombie — king included — ever becomes a `ChampionAnchor`.
 * That is correct for the RANK AND FILE: at the round-9 peak there are 50 alive
 * per zone, and 50 pips would turn the minimap into noise. But it also meant the
 * one entity the whole 戰場任務 is about was invisible on the map, while the map
 * this is ported from pinged its own minimap for 3 seconds on the king's spawn
 * (war3map.j:11824 `PingMinimapLocForForce`). One king is not fifty zombies, so
 * it gets one slot — not a relaxation of the mob cull.
 *
 * WHICH ENTITY IS THE KING comes from the `mobBossSpawn` event (RoomStore's
 * `mobBoss.bossId`), because the wire carries no boss BIT — `ENTITY_FLAG` has
 * two free values left and spending one on something an event already answers
 * would be the expensive way round.
 */
export interface MobBossMarker {
  entityId: number;
  /** duel zone — task #67 scopes the minimap to the local player's zone */
  zone: number;
  worldX: number;
  worldZ: number;
  /** 0..1, so the marker can read as "nearly dead" at a glance */
  hpPct: number;
}

export interface FrameBus {
  /** per-champion world anchors (healthbars/names), written by the game loop */
  champions: Map<number, ChampionAnchor>;
  /**
   * The 殭屍王 while one is alive (task #262), else null. See
   * {@link MobBossMarker} for why the king is not just another anchor.
   */
  mobBoss: MobBossMarker | null;
  /**
   * Floating combat-text pool (task #92) — FIXED LENGTH, never resized.
   * Iterate it and skip `!active`; do not push, splice or filter.
   */
  combatText: CombatTextEntry[];
  /** live revive circles (task #84), rebuilt each frame from the snapshot */
  reviveCircles: ReviveCircleMarker[];
  /** world→screen projection registered by the render layer (CSS px) */
  project: ((x: number, y: number, z: number) => AnchorPose) | null;
  /** local player's active cast (ability-icon overlay); null when idle */
  localCast: LocalCast | null;
  /** circular zones of the ACTIVE arena (written by GameApp.applyArena) */
  arenaZones: ArenaZoneCircle[] | null;
  /**
   * Id of the arena `arenaZones` came from — the minimap's terrain-cache key,
   * so the baked background is rebuilt exactly when the map changes.
   */
  arenaId: string | null;
  /** primary camera's ground-plane view (written by the render loop) */
  cameraView: CameraGroundView | null;
  /**
   * Duel zone the primary player is currently SPECTATING (task #208): set when
   * the combat camera is pointed at another zone, else null (follow your own
   * zone). The minimap (#67) reads it so the scoped map follows the fight you
   * are actually watching, not your finished/empty zone.
   *
   * ⚠️ SINCE #269 THIS IS ONLY EVER SET BY AN EXPLICIT PLAYER ACTION
   * (`hudActions.spectateGoTo`). #208 used to write it from the camera's own
   * auto-redirect; the owner's ruling — 「不要跳去看別人的競技場，但可以跳出
   * 按鈕前往/返回」 — makes the jump a button, so nothing in the frame loop
   * moves the camera off your own arena any more.
   */
  spectateZone: number | null;
  /**
   * The duel zone the primary player COULD go and watch right now, or null.
   *
   * This is what is left of #208's auto-redirect after #269 turned it into a
   * button: the same pure decision (`render/spectateFocus.pickSpectateZone` —
   * your own duel is decided AND another zone is still live) is still computed
   * every frame, but its answer is now an OFFER the HUD renders as 「前往觀戰」
   * instead of a camera move. Kept OUT of `spectateZone` deliberately: 「有得看」
   * and 「正在看」 are different states and the banner says different things
   * about each, and conflating them is exactly how the camera would start
   * moving on its own again.
   */
  spectateOffer: number | null;
}

/** Pre-allocated, never resized: the pool IS the store (see CombatTextEntry). */
const combatTextPool: CombatTextEntry[] = Array.from({ length: MAX_COMBAT_TEXT }, (_, slot) => ({
  slot,
  id: 0,
  active: false,
  category: "other" as CombatTextCategory,
  amount: 0,
  crit: false,
  killingBlow: false,
  targetId: -1,
  rank: Number.POSITIVE_INFINITY,
  lane: 0,
  worldX: 0,
  worldZ: 0,
  anchorY: 1.3,
  bornMs: 0,
  lifeMs: 0,
  pose: { sx: 0, sy: 0, visible: false },
}));

export const frameBus: FrameBus = {
  champions: new Map(),
  mobBoss: null,
  combatText: combatTextPool,
  reviveCircles: [],
  project: null,
  localCast: null,
  arenaZones: null,
  arenaId: null,
  cameraView: null,
  spectateZone: null,
  spectateOffer: null,
};

let nextCombatTextId = 1;
/** live density cap — a graphics setting; the POOL is always MAX_COMBAT_TEXT. */
let combatTextCap = 48;
/** how much of the fight gets numbered — a graphics setting (see CombatTextScope). */
let combatTextScope: CombatTextScope = "team";

/** Set the max concurrent floating numbers (graphics "damage-number density"). */
export function setDamageNumberCap(cap: number): void {
  combatTextCap = Math.max(4, Math.min(MAX_COMBAT_TEXT, Math.round(cap)));
  // Shrinking mid-fight retires the LEAST IMPORTANT live numbers, not the
  // first ones in the array — same policy as admission.
  for (;;) {
    let live = 0;
    for (const e of combatTextPool) if (e.active) live++;
    if (live <= combatTextCap) break;
    const worst = worstEntryIndex(combatTextPool, -Infinity, performanceNowSafe());
    if (worst < 0) break;
    combatTextPool[worst]!.active = false;
  }
}

/** Set how much of the fight is numbered (graphics "combat text"). */
export function setCombatTextScope(scope: CombatTextScope): void {
  combatTextScope = scope;
  if (scope === "off") for (const e of combatTextPool) e.active = false;
}

/** `performance.now()` where available; the pure fallback keeps node tests happy. */
function performanceNowSafe(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

export interface CombatTextInput {
  kind: CombatTextKind;
  amount: number;
  sourceRel: CombatTextRelation;
  targetRel: CombatTextRelation;
  crit: boolean;
  blocked: boolean;
  killingBlow: boolean;
  targetId: number;
  worldX: number;
  worldZ: number;
  nowMs: number;
}

/**
 * Admit one combat-text event. Order of operations (each step documented at its
 * definition in ui/combatText):
 *   1. category + scope — drop what this player asked not to see;
 *   2. same-tick coalesce on (target, category) — kills the one-tick AoE spike
 *      without a merge window;
 *   3. per-target overflow — no body carries a pile;
 *   4. free slot, else PRIORITY admission — the newcomer displaces the least
 *      important, most-faded live entry, or is dropped if it is the least
 *      important thing on screen;
 *   5. RO multi-hit stagger — simultaneous spawns on one body are released in
 *      sequence rather than stacked.
 */
export function pushCombatText(input: CombatTextInput): void {
  const category = combatTextCategory({
    kind: input.kind,
    amount: input.amount,
    sourceRel: input.sourceRel,
    targetRel: input.targetRel,
    crit: input.crit,
    blocked: input.blocked,
    killingBlow: input.killingBlow,
  });
  if (!category || combatTextScope === "off") return;
  // With NO local player resolved — spectating, pre-match, or before the seat
  // is known — there is no "you" for anything to be relative to, so every event
  // lands in the third-party band and a self/team scope would blank the screen
  // silently. A spectator wants to see the whole fight anyway, so the scope gate
  // is skipped exactly in that case (and only that case).
  const noLocalPlayer = input.sourceRel === "unknown" && input.targetRel === "unknown";
  if (!noLocalPlayer && !scopeAllows(combatTextScope, category)) return;

  const mods = { crit: input.crit, killingBlow: input.killingBlow };
  const style = combatTextStyle(category, mods);
  const now = input.nowMs;

  // 2) same-tick coalesce. A crit or a killing blow NEVER merges: those are the
  // numbers you most want to see, and burying one inside a running total
  // destroys it.
  if (!input.crit && !input.killingBlow) {
    for (const e of combatTextPool) {
      if (!e.active || e.targetId !== input.targetId || e.category !== category) continue;
      if (e.crit || e.killingBlow) continue;
      if (now - e.bornMs > COALESCE_MS || now < e.bornMs) continue;
      e.amount += input.amount;
      e.worldX = input.worldX;
      e.worldZ = input.worldZ;
      return;
    }
  }

  // 3) per-target overflow
  let slot = overflowOnTargetIndex(combatTextPool, input.targetId, now);

  // 4) a free slot within the live cap, else priority admission
  if (slot < 0) {
    let live = 0;
    let free = -1;
    for (let i = 0; i < combatTextPool.length; i++) {
      const e = combatTextPool[i]!;
      if (e.active) live++;
      else if (free < 0) free = i;
    }
    slot =
      live < combatTextCap && free >= 0 ? free : worstEntryIndex(combatTextPool, style.rank, now);
  }
  if (slot < 0) return; // every live number outranks this one — drop it

  // 5) RO multi-hit stagger: how many numbers this body already got THIS frame
  let bornThisFrame = 0;
  let lane = 0;
  for (const e of combatTextPool) {
    if (!e.active || e.targetId !== input.targetId || e.slot === slot) continue;
    lane++;
    if (e.bornMs >= now - COALESCE_MS) bornThisFrame++;
  }
  const stagger = Math.min(MAX_STAGGER_STEPS, bornThisFrame) * SPAWN_STAGGER_MS;

  const entry = combatTextPool[slot]!;
  entry.id = nextCombatTextId++;
  entry.active = true;
  entry.category = category;
  entry.amount = input.amount;
  entry.crit = input.crit;
  entry.killingBlow = input.killingBlow;
  entry.targetId = input.targetId;
  entry.rank = style.rank;
  entry.lane = lane;
  entry.worldX = input.worldX;
  entry.worldZ = input.worldZ;
  entry.anchorY = style.anchorY;
  entry.bornMs = now + stagger;
  entry.lifeMs = style.lifeMs;
  entry.pose.visible = false;
}

// ---------------------------------------------------------------------------
// 迴避 (task #92b)
// ---------------------------------------------------------------------------

/**
 * How an entity relates to the LOCAL player, resolved from the champion anchor
 * table this bus already maintains.
 *
 * The other combat-text producer resolves this from injected `localEntityId` /
 * `teamOf` lookups. This one cannot: `evade` is ingested at the network seam,
 * which has no content/seat context. It does not need one — `frameBus.champions`
 * is written every frame with `isLocal` and `teamId` for exactly the entities
 * that can appear on screen, and it is the same table the renderer projects
 * from, so a relation resolved here can never disagree with what is drawn.
 *
 * "unknown" is the honest answer in three real cases and they all matter:
 * before the local seat exists (pre-match / 觀戰), and for a source that is not
 * a champion at all — a guardian's attack has no anchor entry, and it must NOT
 * be mistaken for yours.
 */
export function relationToLocal(entityId: number | undefined): CombatTextRelation {
  if (entityId === undefined) return "unknown";
  const them = frameBus.champions.get(entityId);
  let local: ChampionAnchor | undefined;
  for (const a of frameBus.champions.values()) {
    if (a.isLocal) {
      local = a;
      break;
    }
  }
  if (!local) return "unknown";
  if (local.entityId === entityId) return "self";
  if (!them) return "unknown";
  return them.teamId === local.teamId ? "ally" : "enemy";
}

/**
 * Admit one 迴避 — the defender's stat ate a basic attack whole
 * (packages/shared/src/sim/combat/evasion.ts `rollEvade`).
 *
 * Deliberately a thin adapter over `pushCombatText` rather than a second
 * spawner: the dodge then inherits, for free and by construction, every policy
 * task #92 established — the scope gate, the same-tick coalesce (a champion
 * dodging two attackers on one tick gets ONE 「閃避」, not a stack), the
 * per-target cap, priority admission, the RO multi-hit stagger, the pooled node,
 * the lob, and the runtime-probed gradient fill that fixed #164. An evade has no
 * magnitude, so `amount` is 0 and the label comes from the word table; `crit`
 * and `killingBlow` are false because `rollEvade` returns before any of that is
 * computed (evasion.ts DECISION 3 — a dodge is a total miss, not mitigation).
 *
 * The text is anchored on the DEFENDER's body in both readings. That is the
 * point: 「閃避」 over your own head and "MISS" over theirs is the same fact
 * told from two seats, and the position is what tells you which seat you are in.
 */
export function pushEvadeText(input: {
  /** attacker entity id (may be a non-champion, e.g. a guardian) */
  source: number | undefined;
  /** defender entity id — the body the text is anchored on */
  target: number;
  worldX: number;
  worldZ: number;
  nowMs: number;
}): void {
  pushCombatText({
    kind: "evade",
    amount: 0,
    sourceRel: relationToLocal(input.source),
    targetRel: relationToLocal(input.target),
    crit: false,
    blocked: false,
    killingBlow: false,
    targetId: input.target,
    worldX: input.worldX,
    worldZ: input.worldZ,
    nowMs: input.nowMs,
  });
}

/** Release every entry whose life has run out. Called once per frame. */
export function expireCombatText(nowMs: number): void {
  for (const e of combatTextPool) {
    if (e.active && nowMs - e.bornMs > e.lifeMs) e.active = false;
  }
}

/** Release everything (match teardown / round reset). */
export function clearCombatText(): void {
  for (const e of combatTextPool) e.active = false;
}

/**
 * Drop every WORLD-ANCHORED datum (task #216) — the frame's way of saying
 * "there is no arena on screen right now".
 *
 * THE BUG. The world-anchored layer (HP bars, names, cast bars, revive rings,
 * floating numbers) is DOM painted at projected world positions, so it only
 * means anything while the arena canvas UNDER it is actually being drawn. The
 * intermission/shop scene suppresses that draw
 * (`hudActions.setArenaRenderSuppressed`) while `GameApp` kept feeding this bus
 * every frame regardless — which is why the owner saw 「戰場上的血條」 hovering
 * over the shop with nothing behind them.
 *
 * `WorldAnchorLayer`'s rAF removes a champion's node the moment its anchor
 * leaves `champions`, and skips a combat-text slot that is not `active`, so
 * emptying the bus IS the teardown. Idempotent and cheap: once cleared, every
 * subsequent suppressed frame is a handful of empty checks.
 *
 * NOT cleared: `project` / `arenaZones` / `arenaId` / `cameraView` /
 * `spectateZone` are the arena's DESCRIPTION, not per-frame combat state. The
 * minimap and the projection must survive an intermission so the next combat
 * frame has geometry to draw against instead of one blank frame.
 */
export function clearWorldAnchors(): void {
  frameBus.champions.clear();
  // The king is per-frame combat state like every anchor: a teardown that left
  // it set would paint a skull on the intermission map at the last position it
  // held, for as long as nobody started another round.
  frameBus.mobBoss = null;
  frameBus.reviveCircles.length = 0;
  frameBus.localCast = null;
  clearCombatText();
}

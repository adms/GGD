/**
 * Colyseus schema — the RELIABLE state channel. Lives in shared so the client
 * can decode patches with identical class definitions. Low-frequency,
 * correctness-critical state (phase/economy/level) rides here; entity
 * transforms also ride here in the skeleton (binary channel is a deferred
 * optimization behind net/snapshot.ts).
 *
 * IMPORTANT — field-declaration pattern: @colyseus/schema v3 installs
 * per-instance tracking accessors in the Schema constructor. Class-field
 * INITIALIZERS compiled with ES2022 [[Define]] semantics (tsx does this
 * regardless of tsconfig's useDefineForClassFields) create own data properties
 * that SHADOW those accessors — the server then crashes on encode the moment a
 * client joins. Therefore every field here is `declare`d (emits nothing) and
 * defaults are assigned in the constructor (assignment = [[Set]] = hits the
 * accessor). Do NOT convert these back to field initializers.
 * Regression: apps/game-server/src/net/encode.test.ts (match-13).
 */
import { Schema, MapSchema, ArraySchema, defineTypes } from "@colyseus/schema";

export class OfferState extends Schema {
  declare offerId: string;
  declare tier: string;
  declare choices: ArraySchema<string>;

  constructor() {
    super();
    this.offerId = "";
    this.tier = "";
    this.choices = new ArraySchema<string>();
  }
}
defineTypes(OfferState, {
  offerId: "string",
  tier: "string",
  choices: ["string"],
});

export class SeatState extends Schema {
  declare seatId: number;
  declare teamId: number;
  declare displayName: string;
  declare accountId: string;
  declare connected: boolean;
  declare driver: string; // "human" | "ai"
  declare championId: string;
  declare entityId: number;
  declare level: number;
  declare gold: number;
  declare xp: number;
  declare ready: boolean;
  declare lastAckSeq: number;
  declare items: ArraySchema<string>;
  declare augments: ArraySchema<string>;
  declare offers: ArraySchema<OfferState>;
  declare abilityRanks: ArraySchema<number>; // Q W E R
  declare cooldowns: ArraySchema<number>; // remaining ticks Q W E R
  declare unspentPoints: number;
  // per-hero "EX 技能" (5th slot). exAbilityId "" = this hero has no EX skill;
  // exRank 0 = locked (pre-unlock), 1 = unlocked. exCooldown in remaining ticks.
  declare exAbilityId: string;
  declare exRank: number;
  declare exCooldown: number;
  /**
   * 天生技 (the SIXTH slot) remaining cooldown, in ticks.
   *
   * The innate needs no id/rank field beside it: WHICH innate a champion owns is
   * a pure function of `championId` (`champion.passiveAbility`, resolved by the
   * client through `ui/passiveSlot`), and its rank is 1 from spawn and never
   * moves. The COOLDOWN is the one fact the client cannot derive — and the ~60
   * `innateKind: "active"` innates carry real ones (40 s, 60 s…). Without this
   * the sixth tile would paint "ready" through its entire cooldown and every
   * press in that window would be refused by a server the player never heard
   * from — the sixth slot's own version of the silence this campaign deletes.
   *
   * 0 for a permanent 被動 innate and for the 3 heroes that own no NN-00, so a
   * legacy/unprojected snapshot reads exactly as "nothing on cooldown".
   */
  declare passiveCooldown: number;
  /**
   * 能力屬性強化 progress (task #82). `statStacks` is the CONSECUTIVE stat-tick
   * count — the "N / 20" the shop shows — and it drops to 0 the instant the
   * player buys any real item, so the UI must be able to warn BEFORE the click
   * that a purchase is about to destroy 19 stacks. `statCapstonePct` is 0 until
   * 傳說·萬象強化 is earned, then the rolled 10..100 magnitude.
   * Two uint8s rather than a derived boolean: the client needs the numbers
   * themselves to render progress, and "path still live" is exactly
   * `statCapstonePct === 0`.
   */
  declare statStacks: number;
  declare statCapstonePct: number;
  /**
   * WHAT the 能力屬性強化 ticks actually rolled — one count per entry of
   * `STAT_TICK_ROLLS` (economy/itemTiers), same order, same length.
   *
   * Without this the client could not show a player what their own purchases
   * DID. `statStacks` above is a bare streak counter, and the rolled sources
   * (`stat:<N>`, economy/statPath) were the ONE stat source that never rode the
   * wire — so ui/panels/statPreview reconstructed the champion from items +
   * augments + capstone only, came out short by every tick ever bought, and
   * shipped an 「≈ 屬性強化未同步，實際以戰鬥面板為準」 disclaimer instead of a
   * number. The owner's report was the direct consequence: 「購買屬性看不到加多少
   * 屬性跟次數」 — you paid 375g and the panel did not move.
   *
   * COUNTS, not modifiers: the rolls are a fixed 9-entry table both sides
   * already import, so an index count reconstructs the exact StatModifier list.
   * Nine uint8s beat shipping 15 floats of resolved block, and they only change
   * on a purchase — Colyseus sends nothing on the other ~30 ticks per second.
   *
   * It also outlives `statStacks`: buying a real item ZEROES the streak while
   * the rolled sources stay attached (the reset rule is about the capstone, not
   * about confiscating stats), so after a dabble-then-buy this array is the only
   * honest account of what the champion is carrying.
   */
  declare statRollCounts: ArraySchema<number>;
  /**
   * YOUR OWN ACTIVE STATUS EFFECTS — the doc ids, and when each expires.
   *
   * owner, 2026-07-27: 「我也看不出來自己暈眩還是發生什麼事情，應該要有提示
   * 自己的負面/正面 buff」. Until this existed the wire carried ONLY
   * `EntityState.flags`, a bitmask with four negative bits, ZERO positive-buff
   * bits, no effect identity and no remaining time — so the HUD could not have
   * drawn a status bar even if someone had written one. It was not a missing
   * panel; the data was never sent.
   *
   * TWO PARALLEL ARRAYS, index-aligned, exactly like `statRollCounts` above:
   * Colyseus encodes primitive arrays far more cheaply than a nested Schema,
   * and a status is only two facts.
   *
   * ⚠️ POLARITY AND DISPLAY NAME ARE NOT ON THE WIRE ON PURPOSE. Both live on
   * the `status-effect@1` content doc (`polarity: "buff" | "debuff"`, `name`,
   * `description`), which the client already loads. Sending them too would put
   * the same truth in two places and let them drift; the client looks the id up.
   *
   * PER-SEAT, not per-entity: this is 「自己身上的」 by construction, so an
   * enemy's cooldowns never leak into a client that should not see them.
   */
  declare statusIds: ArraySchema<string>;
  /**
   * TICKS REMAINING on each entry in `statusIds`, index-aligned.
   *
   * RELATIVE, not an absolute expiry tick — the client has no `serverTick` and
   * every other timer on the wire (ability cooldowns, EX, 天生技) is already
   * sent this way. An absolute tick would be a number the receiver cannot
   * interpret, which is a decorative field.
   */
  declare statusRemainTicks: ArraySchema<number>;
  /**
   * How many buy/sell steps of THIS shopping session can still be undone (task
   * #121) — the depth of the champion's undo stack. The client shows the
   * 「↩ 復原上一步」 button exactly when this is > 0, so its visibility is exact
   * (never a heuristic off the last shop event). Resets to 0 when combat commits
   * the session.
   */
  declare undoDepth: number;
  /**
   * PER-ROUND kill/death tally for this seat — reset to 0 at every combat entry
   * (MatchController.enterCombat), NOT cumulative. This is the authoritative
   * input for the round-end MVP presentation (task #143 model + #142 VO): the
   * client picks the leading team's best performer OF THAT ROUND, so a different
   * round genuinely presents a different champion. Cumulative totals would just
   * re-freeze on the match's overall best killer, and a client-side tally from
   * death events is unreliable for a late/reconnecting client — so it rides the
   * schema, where every client decodes the SAME numbers and therefore computes
   * the SAME champion. uint8 (clamped on projection); a round can't realistically
   * exceed 255 kills, and a clamp only affects an already-decided MVP.
   */
  declare roundKills: number;
  declare roundDeaths: number;
  /**
   * 陣亡投幣 throws still available THIS ROUND (task #191), 0..10. The HUD's
   * 「丟金幣 n/10」 counter reads it directly.
   *
   * It rides the schema rather than being counted client-side off `coinDropped`
   * events for the same reason `roundKills` does: a late or RECONNECTING client
   * has no event history, and a dead player's one remaining action must not be
   * greyed out (or, worse, offered and then refused) because their socket
   * blinked. Authoritative, reset by the server at every combat entry.
   */
  declare coinsLeft: number;

  constructor() {
    super();
    this.seatId = 0;
    this.teamId = 0;
    this.displayName = "";
    this.accountId = "";
    this.connected = false;
    this.driver = "ai";
    this.championId = "";
    this.entityId = 0;
    this.level = 1;
    this.gold = 0;
    this.xp = 0;
    this.ready = false;
    this.lastAckSeq = 0;
    this.items = new ArraySchema<string>();
    this.augments = new ArraySchema<string>();
    this.offers = new ArraySchema<OfferState>();
    this.abilityRanks = new ArraySchema<number>();
    this.cooldowns = new ArraySchema<number>();
    this.unspentPoints = 0;
    this.exAbilityId = "";
    this.exRank = 0;
    this.exCooldown = 0;
    this.passiveCooldown = 0;
    this.statStacks = 0;
    this.statCapstonePct = 0;
    this.statRollCounts = new ArraySchema<number>();
    this.statusIds = new ArraySchema<string>();
    this.statusRemainTicks = new ArraySchema<number>();
    this.undoDepth = 0;
    this.roundKills = 0;
    this.roundDeaths = 0;
    this.coinsLeft = 0;
  }
}
defineTypes(SeatState, {
  seatId: "uint8",
  teamId: "uint8",
  displayName: "string",
  accountId: "string",
  connected: "boolean",
  driver: "string",
  championId: "string",
  entityId: "uint32",
  level: "uint8",
  gold: "uint32",
  xp: "uint32",
  ready: "boolean",
  lastAckSeq: "uint16",
  items: ["string"],
  augments: ["string"],
  offers: [OfferState],
  abilityRanks: ["uint8"],
  cooldowns: ["uint16"],
  unspentPoints: "uint8",
  exAbilityId: "string",
  exRank: "uint8",
  exCooldown: "uint16",
  passiveCooldown: "uint16",
  statStacks: "uint8",
  statCapstonePct: "uint8",
  statRollCounts: ["uint8"],
  undoDepth: "uint8",
  roundKills: "uint8",
  roundDeaths: "uint8",
  // APPEND-ONLY: Colyseus encodes fields by declaration index — never reorder.
  coinsLeft: "uint8",
  statusIds: ["string"],
  statusRemainTicks: ["uint16"],
});

/**
 * TeamState.roundOutcome — what a team DID in the round that just ran. Ordered
 * from "did nothing" upward so a selector can simply prefer the higher value.
 *
 *   NONE   — did not fight this round: drew the BYE, is eliminated, or the round
 *            is not settled yet (mid-combat / fault path). The DEFAULT, so an
 *            un-projected or legacy snapshot reads as "nobody fought" and the
 *            presentation degrades to exactly the pre-#173 standings pick.
 *   FOUGHT — was placed into a duel zone this round, outcome not (yet) decided.
 *   LOST   — fought and lost its duel.
 *   WON    — fought and won its duel.
 *
 * One uint8 rather than two booleans: it cannot express the impossible
 * "won but did not fight".
 */
export const ROUND_OUTCOME = {
  NONE: 0,
  FOUGHT: 1,
  LOST: 2,
  WON: 3,
} as const;

export class TeamState extends Schema {
  declare teamId: number;
  declare lives: number;
  declare eliminated: boolean;
  declare placement: number; // 0 = still playing; 1..4 final placement
  declare roundWins: number;
  /**
   * What this team DID in the round that just ran — a ROUND_OUTCOME value, reset
   * to NONE at every combat entry and then written as the round progresses:
   * FOUGHT the moment enterCombat places the team's seats into a duel zone, then
   * WON/LOST when settleRound resolves the duel. It rides the wire because the
   * round-end presentation (winner model #143 + quote VO #142) MUST be able to
   * tell 「輪空」 (bye) apart from 「被團滅」, and nothing else on the snapshot can:
   * enterCombat parks a bye team's seats dead (hp.alive = false, hp = 0) without
   * ever emitting a death, so a bye team reads exactly like an instantly-wiped
   * one — alive:false, roundKills:0, roundDeaths:0 on every seat. That ambiguity
   * is what made the standings leader's bye round fall back to the lowest seatId
   * and re-present 「每回合都是同一個英雄」.
   *
   * Team-level, not seat-level: a bye is a property of the TEAM (every seat of it
   * shares the fate), and the presentation's first decision — which team to
   * present — is itself team-level, so putting it on the seat would only force
   * the client to re-derive the team's state. 4 bytes instead of 12.
   *
   * NONE also covers "not yet settled" (mid-combat) and the fault path
   * (forceAdvanceOnFault skips settleRound), where the presentation correctly
   * degrades to a pure standings pick — there is no winner to name.
   */
  declare roundOutcome: number;

  constructor() {
    super();
    this.teamId = 0;
    this.lives = 3;
    this.eliminated = false;
    this.placement = 0;
    this.roundWins = 0;
    this.roundOutcome = ROUND_OUTCOME.NONE;
  }
}
defineTypes(TeamState, {
  teamId: "uint8",
  lives: "int8",
  eliminated: "boolean",
  placement: "uint8",
  roundWins: "uint8",
  // APPEND-ONLY: Colyseus encodes fields by declaration index — never reorder.
  roundOutcome: "uint8",
});

/**
 * DuelState — one PAIRED DUEL of the current combat round (task #208), mirroring
 * the server's `pairings` + `duelWinners`. It rides the wire for one reason the
 * rest of the snapshot cannot serve: a spectator whose OWN duel is already
 * decided needs to know which OTHER zones are still LIVE so the client can jump
 * its combat camera to a fight that is still happening, instead of leaving the
 * player staring at their own finished/empty zone.
 *
 * A duel is LIVE (still being fought) exactly while `winner < 0`. The instant a
 * side is wiped, MatchController.checkCombatEnd records a winner for that zone —
 * so the client learns a duel is decided the same tick the server does, without
 * re-deriving it from champion alive-counts (which the client CAN approximate,
 * but which is fragile across the exact tick a wipe completes; this is the
 * authoritative signal).
 *
 * WHY THIS AND NOT ROUNDOUTCOME. `TeamState.roundOutcome` only becomes WON/LOST
 * at settleRound — i.e. when the WHOLE round concludes. Mid-round, while your
 * duel is decided but another zone still fights, every team is still FOUGHT, so
 * roundOutcome cannot tell "your duel is over" from "the round is over". This
 * per-zone winner does, and it is empty outside combat (pairings is cleared).
 *
 * BYE CORRECTNESS (#173): a bye team is in NO pairing, so it appears in no
 * DuelState — exactly as the server models it.
 */
export class DuelState extends Schema {
  declare zone: number;
  declare teamA: number;
  declare teamB: number;
  /** winning teamId once decided; -1 while the duel is still LIVE. */
  declare winner: number;

  constructor() {
    super();
    this.zone = 0;
    this.teamA = 0;
    this.teamB = 0;
    this.winner = -1;
  }
}
defineTypes(DuelState, {
  zone: "uint8",
  teamA: "uint8",
  teamB: "uint8",
  winner: "int8",
});

export class EntityState extends Schema {
  declare id: number;
  declare kind: number; // 0 champion, 1 projectile, 2 flower, 3 revive circle, 4 guardian, 5 gold coin, 6 mob (ENTITY_KIND)
  declare seatId: number;
  /** visual key: champion modelKey or projectileId */
  declare key: string;
  declare x: number;
  declare z: number;
  /** facing (unit vector) */
  declare fx: number;
  declare fz: number;
  declare zone: number;
  declare hp: number;
  declare maxHp: number;
  declare mana: number;
  declare maxMana: number;
  declare shield: number;
  declare alive: boolean;
  /** bitmask: 1 dashing, 2 rooted, 4 stunned, 8 slowed */
  declare flags: number;
  /**
   * AIRBORNE HEIGHT above the arena floor, GGD units (task #247). 0 = grounded,
   * which is the overwhelming case — and because Colyseus patches are DELTA-
   * ENCODED (a field only reaches the wire on the ticks its value changes), a
   * match in which nobody leaps pays EXACTLY ZERO bytes for this field. The
   * cost is bounded by actual leap-seconds: one 蒼月潮 E is 43 ticks × ~5 B ≈
   * 215 B for the whole ability.
   *
   * Not folded into an existing float slot the way a revive circle borrows
   * `shield`/`hp`: a circle has no health component at all, whereas a leaping
   * CHAMPION is using every one of those slots for real HP/mana/shield. 4 bytes
   * of honest field beats a shield bar that flickers during a jump.
   */
  declare h: number;
  /*
   * NO `sc` (temporary model scale) FIELD — deliberately removed, #247
   * follow-up. #247 shipped a uint8 `sc` percent channel end to end (wire →
   * interpolation → ChampionView) for godie-hapm.r 巨神一擊, but the sim never
   * wrote anything but 1: the whole lane was dead weight with a green test that
   * hand-fed it fabricated numbers, so the test proved nothing about the game.
   *
   * WHY IT WAS NOT SIMPLY WIRED UP. 巨神一擊 (JASS rawcode A0U8,
   * `Trig_Gigantomakhia_*`, war3map.j j:51866-52040) IS the only ability in the
   * map that scales the CASTER, and its real numbers are: absolute
   * SetUnitScalePercent 130 → 190 in 10-point steps over 7 ticks of a 0.04 s
   * timer (j:51931-51932, `Size = 190 - Color*2` with `Color` counting 30→0),
   * held through the charge, then restored to 120 at the blast (j:52028) —
   * which is the hero's own base scale (`Hapm.scale = 1.2` in OBJECTS.json), so
   * as a multiplier over GGD's #150-normalised size the ramp is 1.083 → 1.583
   * and back to 1.0.
   *
   * But that ability is NOT a leap — it is a paused grow-then-charge with no
   * `SetUnitFlyHeightBJ` anywhere in its cluster — so `LeapSystem`, the only
   * thing that owns `world.airborne`, cannot drive it. Wiring it needs a new
   * EffectDef kind, a new per-entity ramp store, its own death/round-reset
   * teardown and a digest fold: a new sim feature, not the completion of a
   * wire, and out of scope for a follow-up fix. It belongs with #249 (變身系統)
   * / #50 (per-invocation art params), which own unit scaling; the JASS numbers
   * are recorded here so whoever picks it up does not have to re-derive them.
   */

  constructor() {
    super();
    this.id = 0;
    this.kind = 0;
    this.seatId = -1;
    this.key = "";
    this.x = 0;
    this.z = 0;
    this.fx = 1;
    this.fz = 0;
    this.zone = 0;
    this.hp = 0;
    this.maxHp = 0;
    this.mana = 0;
    this.maxMana = 0;
    this.shield = 0;
    this.alive = true;
    this.flags = 0;
    this.h = 0;
  }
}
defineTypes(EntityState, {
  id: "uint32",
  kind: "uint8",
  seatId: "int8",
  key: "string",
  x: "float32",
  z: "float32",
  fx: "float32",
  fz: "float32",
  zone: "uint8",
  hp: "float32",
  maxHp: "float32",
  mana: "float32",
  maxMana: "float32",
  shield: "float32",
  alive: "boolean",
  flags: "uint16",
  h: "float32",
});

export class MatchState extends Schema {
  declare matchId: string;
  /** selected arena id (Arenas registry key); client renders this map */
  declare mapId: string;
  declare phase: string; // champSelect | intermission | combat | resolution | matchEnd
  declare round: number;
  declare tick: number;
  /** ticks remaining in the current phase (client renders countdown via TICK_MS) */
  declare phaseTicksLeft: number;
  declare seed: number;
  declare contentVersion: string;
  /**
   * The ACTIVE combat-environment multiplier table for this match, as JSON
   * (serialized CombatEnvMultipliers — see sim/combatEnv.ts). Set ONCE by
   * MatchRoom.onCreate next to `seed` and never changed mid-match; the client
   * decodes it with `parseCombatEnvJson` ("", malformed, or missing keys all
   * degrade to the neutral all-1.0 table) and feeds the moveSpeed factor into
   * LocalPrediction so predicted movement matches the authority. A JSON blob
   * (not per-key fields) keeps the wire schema stable while the key set grows.
   */
  declare combatEnvJson: string;
  /**
   * True once the MATCH outcome is decided (one team left standing) — set at the
   * end of the final combat, so it flips during the last `resolution` phase, a
   * few seconds BEFORE phase becomes matchEnd. The server FREEZES all input from
   * this point (champions idle for the settlement front-view); the client mirrors
   * it by disabling input + starting the settlement camera. See MatchController
   * .outcomeDecided / freezeControls.
   */
  declare outcomeDecided: boolean;
  /**
   * FIRE RING (火圈 / 火環, task #195) — REPLICATED, never re-derived.
   *
   * `fireRingTicks` is the sim's combat-elapsed ring counter (-1 = disarmed),
   * `fireRingRadius` the world-unit radius of the ring RIGHT NOW.
   *
   * The client cannot compute these from `phaseTicksLeft`: the ring's counter
   * FREEZES the instant a round settles (task #100 flips `combatActive`) while
   * the phase clock keeps running, so a `phaseTicksLeft`-derived ring would go
   * on shrinking over a hazard that has already stopped burning. Sending the
   * authority's own numbers also makes a mid-shrink reconnect correct for free
   * — the one-shot `fireRingStart` event never re-fires, so nothing about the
   * ring may be event-derived.
   */
  declare fireRingTicks: number;
  declare fireRingRadius: number;
  declare seats: MapSchema<SeatState>;
  declare teams: ArraySchema<TeamState>;
  declare entities: MapSchema<EntityState>;
  /**
   * The current combat round's paired duels (task #208) — one entry per active
   * pairing, empty outside combat. The client reads it to find a still-LIVE zone
   * to spectate once its own duel is decided. See DuelState.
   */
  declare duels: ArraySchema<DuelState>;

  constructor() {
    super();
    this.matchId = "";
    this.mapId = "arena.skeleton";
    this.phase = "champSelect";
    this.round = 0;
    this.tick = 0;
    this.phaseTicksLeft = 0;
    this.seed = 0;
    this.contentVersion = "";
    this.combatEnvJson = "";
    this.outcomeDecided = false;
    // `declare` + constructor assignment, never a field initializer: a class
    // field would run AFTER Schema's own constructor and clobber the encoder's
    // change tracking, so the field would never be sent on join.
    this.fireRingTicks = -1;
    this.fireRingRadius = 0;
    this.seats = new MapSchema<SeatState>();
    this.teams = new ArraySchema<TeamState>();
    this.entities = new MapSchema<EntityState>();
    this.duels = new ArraySchema<DuelState>();
  }
}
defineTypes(MatchState, {
  matchId: "string",
  mapId: "string",
  phase: "string",
  round: "uint8",
  tick: "uint32",
  phaseTicksLeft: "uint32",
  seed: "uint32",
  contentVersion: "string",
  combatEnvJson: "string",
  outcomeDecided: "boolean",
  // APPEND-ONLY (Colyseus encodes by declaration index — never reorder).
  fireRingTicks: "int32",
  fireRingRadius: "float32",
  seats: { map: SeatState },
  teams: [TeamState],
  entities: { map: EntityState },
  // APPEND-ONLY: Colyseus encodes fields by declaration index — never reorder.
  duels: [DuelState],
});

/**
 * EntityState.kind values. Flowers (kind 2) are neutral server entities with
 * key "prop.flower": seatId -1, hp/maxHp populated (healthbars), interpolated
 * on the client like projectiles — never predicted.
 *
 * REVIVE CIRCLES (kind 3, key "prop.revive-circle", task #84) reuse the same
 * float slots for their own state rather than growing the wire schema, since
 * every existing field would otherwise sit unused on them:
 *
 *   seatId  = the DEAD OWNER's seat (team tint + "who am I saving" in the HUD;
 *             the client resolves teamId from the seats map, as elsewhere)
 *   hp      = channel progress in ticks,  maxHp   = ticks needed  → fill 0..1
 *   mana    = lifetime ticks remaining,   maxMana = total lifetime → burn-down
 *   shield  = ring radius in world units (so the ring is drawn from the
 *             authoritative config, never a client-side magic number)
 *   flags   = ENTITY_FLAG.CHANNELLING / CONTESTED
 *
 * They are server entities, interpolated like flowers and NEVER predicted; a
 * circle carries no health component sim-side, so nothing here implies one.
 *
 * GUARDIANS (kind 4, task #89/#105) are the NEUTRAL duel-zone objective. Like
 * flowers they are team-less server entities carrying only transform + health +
 * a StructureComp, but they are a DISTINCT kind so the client stops treating
 * them as a fall-through champion (kind 0 = grey untinted humanoid, seatId -1 →
 * team-0 tint). seatId is -1 (neutral: no team owns it, so #85's death-spectator
 * desaturation never keeps it in colour as a teammate and all four teams may
 * target it); hp/maxHp ride along so a neutral health bar renders; `key` is the
 * PER-ARENA model doc id (#105) — 樹人 / 石頭人 / 巨獸人 — resolved through the
 * same modelDocFor seam ChampionView/FlowerView use. Interpolated like flowers,
 * never predicted.
 */
export const ENTITY_KIND = {
  CHAMPION: 0,
  PROJECTILE: 1,
  FLOWER: 2,
  REVIVE_CIRCLE: 3,
  // APPEND-ONLY: the wire encodes kind by value; never renumber an existing
  // kind (a running client would desync). New kinds get the next integer.
  GUARDIAN: 4,
  /**
   * A DROPPED GOLD COIN (task #191 陣亡投幣, key "prop.gold-coin"). Loot lying
   * on the floor: no team, no health, not targetable — so like the revive circle
   * it reuses the float slots rather than growing the wire schema:
   *
   *   seatId = the DEAD THROWER's seat (so the HUD can say whose purse it was;
   *            it is NOT a team marker — nothing about ownership gates who may
   *            pick the coin up, which is any living champion, friend or foe)
   *   shield = the coin's gold VALUE (100), so the client renders the authored
   *            number instead of a hard-coded one
   *   hp/maxHp/mana/maxMana = 0; a coin has no health component sim-side, and
   *            `hasOverheadBar` returns false for it, so no bar is drawn.
   */
  GOLD_COIN: 5,
  /**
   * A ROGUELITE MOB (task #215 喪標麥可, key = the voxel-zombie standin). A
   * NEUTRAL combat entity like the guardian — transform + health + a marker —
   * but it MOVES and is on the sentinel MONSTER team, so it needs its own kind
   * (falling through to the champion default would paint it as a grey team-0
   * teammate). seatId = -1 (neutral, no player seat); key = MOB_MODEL_KEY; hp/
   * maxHp/alive ride along so a neutral health bar renders. Interpolated like
   * the guardian/flower, NEVER client-predicted.
   */
  MOB: 6,
} as const;

export const ENTITY_FLAG = {
  DASHING: 1,
  ROOTED: 2,
  STUNNED: 4,
  SLOWED: 8,
  /** channeling an ability with cast time (drives the cast bar) */
  CASTING: 16,
  /** winding up a basic attack (drives attack-animation timing) */
  WINDUP: 32,
  /** revive circle only: >=1 living ally is channelling it this tick */
  CHANNELLING: 64,
  /** revive circle only: an enemy stands inside, holding progress */
  CONTESTED: 128,
  /**
   * champion only: standing OUTSIDE the fire ring and burning THIS tick
   * (task #195). Drives the client's translucent-red screen wash for the seat
   * that owns this entity — 「角色被火燒到畫面會變半透明紅」. Composed from the
   * sim's own burn predicate, so the wash can never disagree with the damage.
   */
  BURNING: 256,
  /**
   * GROWTH TIER 1 (task #244 黑泥吞噬): this champion has accrued at least
   * `GROWTH_TIER_STACKS[0]` VISIBLE stacks. The client swells the body slightly
   * and deepens its palette.
   */
  MUD_SWELL: 512,
  /**
   * GROWTH TIER 2: at least `GROWTH_TIER_STACKS[1]` visible stacks — visibly one
   * size larger plus the black-mud ring at the feet. MUD_SWELL is set too, so a
   * client that only knows tier 1 degrades gracefully.
   *
   * WHY TWO FLAG BITS AND NOT A COUNT. `flags` is a uint16 already present in
   * every champion patch and bits 512/1024 were free, so the whole feature costs
   * ZERO extra bytes on the wire — a new EntityState field would cost a byte per
   * entity per change plus an append-only schema index forever. The client only
   * ever needs the THRESHOLD (there are exactly two visual states), a raw uint8
   * count would clip at 255 while ~900 kills is reachable at high farm rates, and
   * a flag on the ENTITY is legible to spectators and enemies with no seat
   * lookup (EntityViewRegistry is deliberately walled off from the seat table).
   */
  MUD_BOSS: 1024,
  /**
   * champion only: MID-LEAP this tick (task #247) — the body is out of the
   * planar physics world and its `h` is authoritative.
   *
   * Preferred over `h > 0` by every render consumer because it is ALSO true on
   * the takeoff and landing ticks, where the height is exactly 0. That matters:
   * locomotion must be suppressed for the whole flight, and a champion covering
   * ~0.33 u/tick planar would otherwise RUN THROUGH THE AIR with its legs
   * cycling. Costs zero extra bytes — it rides the existing uint16 `flags`.
   *
   * BIT ASSIGNMENT (integration batch A): #247 originally authored this as 512,
   * but #244 黑泥吞噬 had already shipped MUD_SWELL=512 / MUD_BOSS=1024 to main.
   * Both features are load-bearing, so the UNMERGED side moved: AIRBORNE is
   * 2048, the next free bit. Nothing persists a raw flags word, so no migration
   * is owed — but every producer/consumer and every test asserting the literal
   * was re-pointed in the same commit.
   */
  AIRBORNE: 2048,
} as const;

/**
 * The two visible-stack thresholds behind `ENTITY_FLAG.MUD_SWELL` / `MUD_BOSS`
 * (owner-approved, task #244). Lives here so the server that SETS the bits and
 * the client that READS them share one literal.
 *
 * They land on the story beats for free: at the honest ~20 kills/round farm rate
 * 20 stacks is the end of round 3 (one round BEFORE he overtakes the reference
 * bruiser) and 50 is mid round 5 (just after).
 */
export const GROWTH_TIER_STACKS = [20, 50] as const;

/** 0 / 1 / 2 from an EntityState.flags word — the client's only growth read. */
export function growthTierFromFlags(flags: number): 0 | 1 | 2 {
  if (flags & ENTITY_FLAG.MUD_BOSS) return 2;
  if (flags & ENTITY_FLAG.MUD_SWELL) return 1;
  return 0;
}

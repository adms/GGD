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
    this.undoDepth = 0;
    this.roundKills = 0;
    this.roundDeaths = 0;
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
  undoDepth: "uint8",
  roundKills: "uint8",
  roundDeaths: "uint8",
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

export class EntityState extends Schema {
  declare id: number;
  declare kind: number; // 0 champion, 1 projectile, 2 flower, 3 revive circle, 4 guardian (ENTITY_KIND)
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
  declare seats: MapSchema<SeatState>;
  declare teams: ArraySchema<TeamState>;
  declare entities: MapSchema<EntityState>;

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
    this.seats = new MapSchema<SeatState>();
    this.teams = new ArraySchema<TeamState>();
    this.entities = new MapSchema<EntityState>();
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
  seats: { map: SeatState },
  teams: [TeamState],
  entities: { map: EntityState },
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
} as const;

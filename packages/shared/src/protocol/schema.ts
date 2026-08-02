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
   * WHAT the 能力屬性強化 purchases actually bought — the three 三圍 totals
   * (力 / 敏 / 智), index-aligned with `ATTR_KEYS` (sim/stats/attributes).
   *
   * Without this the client could not show a player what their own purchases
   * DID. `statStacks` above is a bare streak counter, and the bought attributes
   * live on `ChampionComp.attrBonus` — server-side state the client has no other
   * view of. Before the pre-#260 version of this field existed, ui/panels/
   * statPreview reconstructed the champion from items + augments + capstone
   * only, came out short by every tick ever bought, and shipped an
   * 「≈ 屬性強化未同步，實際以戰鬥面板為準」 disclaimer instead of a number.
   *
   * ⚠️ It replaced `statRollCounts` (nine uint8 roll counts) IN PLACE, keeping
   * the declaration index, because #260 replaced what a tick grants: nine fixed
   * stat modifiers became a 力/敏/智 三選一 whose payload is an ATTRIBUTE. Three
   * float32s carry it exactly, and they only change on a pick — Colyseus sends
   * nothing on the other ~30 ticks per second.
   *
   * It outlives `statStacks`: buying a real item ZEROES the streak while the
   * bought attributes stay (the reset rule is about the capstone, not about
   * confiscating what was paid for), so after a dabble-then-buy this array is
   * the only honest account of what the champion is carrying.
   */
  declare attrBonus: ArraySchema<number>;
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
  /**
   * 殭屍擊殺數 — `world.mobKills` for this seat's champion (task #258).
   *
   * ⚠️ THIS FIELD IS THE WHOLE OF #258's FIRST HALF. `world.mobKills` has
   * existed since #215 and drives real mechanics (every 30th kill grants a
   * LEVEL, `sim/systems/MobSystem`), but it reached a client through exactly
   * ONE path: `RoundStatDelta.mobKills`, assembled at ROUND SETTLE for the
   * settlement progress chart. Mid-combat there was no field on the wire at
   * all, so 「戰鬥中即時已擊殺數」 was not a missing panel — the number was
   * never sent, and no amount of HUD work could have shown it.
   *
   * MATCH-CUMULATIVE, deliberately, because the counter it mirrors is: #215's
   * owner decision is that the tally CARRIES OVER between rounds (it is the
   * path past the round-grant level ceiling), and `MobSystem`'s round teardown
   * explicitly does not clear it. A per-round number here would disagree with
   * the levels the player is actually being granted.
   *
   * uint16, not uint8: 30 kills = 1 level, the intended path runs to LV99, and
   * the alive cap is 30 per zone with a wave every 2 s — 255 is reachable in a
   * long match, and a counter that silently stops at 255 is worse than none.
   */
  declare mobKills: number;
  /**
   * 這一回合**最後一次**陣亡的絕對 sim tick;`0` = 這一回合沒有被記過陣亡
   * (還活著、輪空被停在場邊、或還沒生成實體)。GH#257 的頒獎台就靠它排名次。
   *
   * ⚠️ 「存活順序」這個資料在這個欄位之前**全 repo 都不存在**。實測 grep:
   * `deathOrder` / `survivalOrder` / `eliminationOrder` / `diedAtTick` 一個都
   * 沒有。快照上原本只有 `alive`(布林)、`roundKills`、`roundDeaths`(次數),
   * 三個都答不出「誰是倒數第二個倒下的」—— 所以這不是一個少畫的面板,
   * 是**這個數字從來沒有被送出去過**(失敗形態 ②)。
   *
   * 為什麼是「最後一次」而不是第一次:#84 的復活圈會把人拉起來,被拉起來又
   * 再倒下的人真正離場的時間是後面那一次。
   *
   * 為什麼上線而不是讓客戶端從 death 事件自己數:和 `roundKills` 同一個理由 ——
   * 一個中途加入或**重連**的客戶端沒有事件歷史,而每個客戶端都必須算出同一份
   * 金銀銅,否則同一場比賽在兩個螢幕上會頒給不同的人。
   *
   * uint32 而不是 uint16:這是**絕對** tick(不是回合相對),一場比賽跑滿
   * 30Hz × 數十分鐘會輕鬆越過 65535,而一個靜默停在 65535 的名次會把所有
   * 後續陣亡者排成平手。它只在有人死掉的那一格改變,所以其餘 ~30 tick/s
   * Colyseus 一個 byte 都不會送。
   *
   * ⚠️ `0` 同時是「沒死」的哨兵值。world tick 0 是 champSelect,戰鬥不可能在
   * 那一格活著,所以真實的陣亡 tick 永遠 ≥ 1 —— 投影端(net/snapshot)仍然
   * 明文夾在 `>= 1`,不靠這個推論。
   */
  declare roundDeathTick: number;

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
    this.attrBonus = new ArraySchema<number>();
    this.statusIds = new ArraySchema<string>();
    this.statusRemainTicks = new ArraySchema<number>();
    this.undoDepth = 0;
    this.roundKills = 0;
    this.roundDeaths = 0;
    this.coinsLeft = 0;
    this.mobKills = 0;
    this.roundDeathTick = 0;
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
  attrBonus: ["float32"],
  undoDepth: "uint8",
  roundKills: "uint8",
  roundDeaths: "uint8",
  // APPEND-ONLY: Colyseus encodes fields by declaration index — never reorder.
  coinsLeft: "uint8",
  statusIds: ["string"],
  statusRemainTicks: ["uint16"],
  // APPEND-ONLY (see above): 殭屍擊殺數, task #258. LAST, because it is the
  // newest field — @colyseus/schema encodes by DECLARATION INDEX, so inserting
  // it anywhere else would silently re-number every field after it and desync
  // any client built against the old order.
  mobKills: "uint16",
  // APPEND-ONLY (見上):回合存活順序,GH#257。**放在最後**,因為它是最新的欄位 ——
  // @colyseus/schema 用宣告索引編碼,插在任何別的位置都會靜默地把它後面每一個
  // 欄位重新編號,讓任何用舊順序建出來的客戶端整個對不上。
  roundDeathTick: "uint32",
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
   * 基礎加成 table (`config.base-bonus@1`) as JSON — the FLAT per-stat grants the
   * sim adds AFTER the combat-env multiplier (sim/baseBonus.ts). On the wire for
   * the same reason `combatEnvJson` is: the HUD, the shop preview and the champ
   * profile must show the number the player actually has, and the grant is not
   * derivable from the champion doc. Empty string = the shipped default table.
   */
  declare baseBonusJson: string;
  /**
   * 屬性上限表 (`config.stat-caps@1`, GH#286) as JSON — 每條屬性的一般上限 /
   * 解鎖上限 (sim/statCaps.ts)。上線的理由和 `baseBonusJson` 一字不差:面板要顯示
   * 「這位英雄的攻速天花板」時,那個數字既不在英雄卡裡、也不是常數 —— 後台改得動。
   * 少了這條線,操作者把一般上限調成 5.0 之後,伺服器夾在 5.0 而商店/選角面板繼續
   * 印 4.0(失敗形狀 ②)。空字串 = 出貨預設表,**不是空表**。
   */
  declare statCapsJson: string;
  /**
   * 殭屍外觀表 (`mobWaves` 的視覺部分, GH#192) as JSON — today exactly
   * `{"tintStrength":0.65}`, decoded by `parseMobVisualJson`.
   *
   * ON THE WIRE for the same reason `combatEnvJson` is, and not for a different
   * one: 染黑強度 is an ADMIN knob (data/ overlay, changed between matches
   * without a redeploy), the client is the only thing that can apply it, and it
   * is not derivable from any doc the client already holds. A client that read
   * its own content mount instead would paint last-deploy's colour over this
   * match's zombies the moment the operator changed it — the exact
   * 「後台改了但玩家那場沒變」 shape this repo keeps hitting.
   *
   * The mob's SIZE is deliberately NOT here: it is per-entity (一般 / 特殊 / 王
   * differ) and rides `EntityState.mana`; see ENTITY_KIND below.
   *
   * "" / malformed = the shipped default, never "no tint".
   */
  declare mobVisualJson: string;
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
    this.baseBonusJson = "";
    this.statCapsJson = "";
    this.mobVisualJson = "";
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
  // APPEND-ONLY (v0.9.9): 基礎加成 table. Declared LAST on purpose — putting it
  // next to `combatEnvJson`, where it belongs by meaning, would shift every
  // later field's index and desync any client that is still running.
  baseBonusJson: "string",
  // APPEND-ONLY (v0.9.11): 屬性上限表 (GH#286). 同樣宣告在**最後一格** —— 放在
  // `baseBonusJson` 旁邊(語意上它們是一對)會把 `duels` 之後每一格的索引往後推,
  // 讓還沒重新整理的客戶端整份解碼錯位。append-only 不是建議,是編碼格式。
  statCapsJson: "string",
  // APPEND-ONLY (GH#192): 殭屍外觀表. 又一次宣告在**最後一格** —— 理由同上,
  // Colyseus 用宣告順序當欄位索引,插在中間會讓所有舊客戶端整份解碼錯位。
  mobVisualJson: "string",
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
   *
   * SLOT REUSE (GH#192), same convention as the revive circle and the coin:
   *
   *   mana    = 體型倍率 — the RENDERED size multiplier for this mob's kind
   *             (一般 1 / 特殊 1.8 / 王 10 on the shipped arena), applied on top
   *             of the model doc's own scale. `maxMana` stays 0, which is what
   *             makes this slot free: `manaPct` is computed as
   *             `maxMana > 0 ? mana / maxMana : 0`, so nothing draws a mana bar
   *             from it and no other reader looks at `mana` alone.
   *
   * WHY A PER-ENTITY CHANNEL AT ALL, when GH#262 got the size across through
   * `key`: since GH#192 the mesh is resolved FROM THE CHAMPION, so all three
   * kinds normally share ONE model key — the key can no longer imply a size,
   * and a king that reused the zombie's key rendered as a zombie. `shield` was
   * not used instead because `shieldPct = shield / maxHp` IS read for a mob and
   * would paint a phantom shield sliver on its health bar.
   */
  MOB: 6,
  /**
   * A 暗夜旗 (71-00 暗夜契約, key "prop.night-flag"). GROUND FURNITURE like the
   * revive circle: no team, no health, structurally untargetable (kept out of
   * `rebuildGrid`). It is on the wire for ONE reason — the owner asked for a
   * black circle whose size IS the aura radius, so players can see where the
   * effect reaches instead of only that "something is happening".
   *
   * SLOT REUSE, the same convention as REVIVE_CIRCLE and GOLD_COIN:
   *
   *   seatId = -1 (neutral furniture; ownership is presentation-only and the
   *            team tint rides `mana` below rather than a seat lookup)
   *   shield = the POST-`abilityRange` aura radius in world units. The client
   *            draws the ring at exactly this number, so the circle can never
   *            disagree with the radius the sim actually tests — which is the
   *            whole point of drawing it. `t.radius` is 0 on a banner (it is
   *            not a body), so this slot is the only honest channel for it.
   *   mana   = the owning teamId, for the tint. `maxMana` stays 0, which is
   *            what keeps the slot free: `manaPct` is `maxMana > 0 ? … : 0`,
   *            so nothing draws a mana bar from it.
   *   hp/maxHp = 0 → `hasOverheadBar` false → no health bar.
   */
  NIGHT_FLAG: 7,
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
  /**
   * 變身 FORM INDEX, low bit (task #249). Together with {@link ENTITY_FLAG
   * .FORM_B} these two bits carry a 0..3 form ordinal — 0 = the base `Eme1`
   * body the player picked, 1 = the alternate `Emeu` body, 2/3 reserved for a
   * hero the map ever gives three or four bodies. Decode with
   * {@link formIndexFromFlags}, never by testing the bits by hand.
   *
   * WHY A FLAG PAIR AND NOT A NEW `EntityState` FIELD. `defineTypes` is
   * APPEND-ONLY and irreversible: a new field costs a schema index forever plus
   * a byte per entity per change, and it cannot be taken back once a client in
   * the wild has parsed it. `flags` is a uint16 already present in every
   * champion patch, so this costs ZERO extra bytes on the wire.
   *
   * WHY NOT REUSE `EntityState.key`. `key` is `Champions.get(championId)
   * .modelKey`, and 44 champions share four stand-in model docs — including
   * BOTH HALVES of all four shipped transform pairs (godie-e00s/e010,
   * harf/h00w, nman/n01b, orkn/o030 — verified against content/champions/*.json,
   * every pair identical). So `key` cannot answer "is this body transformed":
   * for the shipped roster it is byte-identical in both forms. The bits are the
   * ONLY channel that can.
   */
  FORM_A: 4096,
  /** 變身 FORM INDEX, high bit — see {@link ENTITY_FLAG.FORM_A}. */
  FORM_B: 8192,
  /**
   * 隱形中 (task 隱形原語, owner 2026-07-30 「選小的就好」): this body is HIDDEN
   * as of this tick — the sim will not let an enemy auto-acquire, click or
   * aggro onto it (`sim/stealth.ts`), and the client must fade the model and
   * suppress the health bar for anyone who is not an ally.
   *
   * ⚠️ THIS IS A PRESENTATION + TARGETING BIT, NOT A PRIVACY ONE. The entity's
   * x/z stay in the snapshot for every seat, so a modified client can still see
   * where an invisible hero is. That is the owner's explicit, informed trade —
   * the alternative is per-team snapshot filtering, an O(1)→O(seats) netcode
   * change. Nobody may describe this flag as anti-cheat.
   *
   * WHY A FLAG BIT AND NOT AN `EntityState` FIELD: `defineTypes` is APPEND-ONLY
   * and irreversible, and `flags` is a uint16 already present in every champion
   * patch — so this costs ZERO extra bytes. It takes 16384, the first of the two
   * bits the #249 budget note left; ONE (32768) remains after this.
   */
  INVISIBLE: 16384,
} as const;

/**
 * BIT BUDGET FOR `ENTITY_FLAG` — read this before adding a flag.
 *
 * `EntityState.flags` is a **uint16** (`defineTypes` above), so there are
 * EXACTLY 16 bits and they are not extensible. After 隱形原語:
 *
 *   used  (15): 1 DASHING · 2 ROOTED · 4 STUNNED · 8 SLOWED · 16 CASTING ·
 *               32 WINDUP · 64 CHANNELLING · 128 CONTESTED · 256 BURNING ·
 *               512 MUD_SWELL · 1024 MUD_BOSS · 2048 AIRBORNE ·
 *               4096 FORM_A · 8192 FORM_B · 16384 INVISIBLE
 *   FREE   (1): 32768
 *
 * This is the FOURTH feature to collide here (#244 vs #247 fought over 512,
 * #249 took the comfortable pair, 隱形原語 took 16384), so the count is written
 * down rather than recounted by eye. **ONE BIT IS LEFT.** When it is gone the
 * next feature must WIDEN the field or claim its own channel — silently reusing
 * an occupied bit desyncs a live client with no error anywhere.
 */
export const ENTITY_FLAG_FREE_BITS = [32768] as const;

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

/**
 * 0 / 1 / 2 / 3 from an EntityState.flags word — the client's only 變身 read
 * (task #249). 0 is the base body, 1 the alternate; 2 and 3 are reserved and
 * unreachable until some hero ships more than two bodies.
 *
 * Written as an OR of the two bits (not a `if (B) return 2` ladder like
 * `growthTierFromFlags`) because the form ordinal is a NUMBER, not a threshold:
 * FORM_B alone must read 2, not "1 with extra". Unrelated bits are masked out,
 * so a burning, airborne, tier-2 alternate body still decodes to exactly 1.
 */
export function formIndexFromFlags(flags: number): 0 | 1 | 2 | 3 {
  const lo = (flags & ENTITY_FLAG.FORM_A) !== 0 ? 1 : 0;
  const hi = (flags & ENTITY_FLAG.FORM_B) !== 0 ? 2 : 0;
  return (lo + hi) as 0 | 1 | 2 | 3;
}

/**
 * The two flag bits that encode `index` — the inverse of
 * {@link formIndexFromFlags}, for whoever writes the snapshot. Kept next to the
 * decoder so the two can never drift apart; an out-of-range index clamps to the
 * base body rather than emitting a bit pattern the decoder cannot name.
 */
export function formFlagsForIndex(index: number): number {
  if (!Number.isInteger(index) || index < 1 || index > 3) return 0;
  return (index & 1 ? ENTITY_FLAG.FORM_A : 0) | (index & 2 ? ENTITY_FLAG.FORM_B : 0);
}

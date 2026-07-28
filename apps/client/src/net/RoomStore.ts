/**
 * RoomStore — projects the Colyseus schema into a Zustand store for the React
 * HUD. DISCRETE-RATE ONLY: phase/round/timer-seconds, economy (gold/level/xp),
 * cooldowns, lives, offers, picks, K/D tallies. Entity transforms NEVER pass
 * through here — they flow schema → InterpolationBuffer → Babylon transforms
 * imperatively. Every write is change-guarded so snapshot patches that don't
 * alter HUD-visible values cause zero re-renders.
 */
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { TICK_HZ } from "@ggd/shared/constants";
import { KILL_COMBO_EVENT } from "@ggd/shared/sim/combat/killCombo";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { ENTITY_KIND } from "@ggd/shared/protocol/schema";
import type { EventMessage, MatchSettlement } from "@ggd/shared/protocol/messages";

export interface OfferView {
  offerId: string;
  tier: string;
  choices: string[];
}

/**
 * The outcome of the LOCAL champion's last shop action (task #38/#60). The sim
 * emits `itemBought` / `itemSold` / `buyRejected` / `sellRejected`; this is the
 * raw projection of one of those, deliberately WITHOUT any user-facing text —
 * turning a reason into a sentence is `ui/panels/shopFeedback`'s job, so the
 * net layer never owns UI copy.
 *
 * `seq` increments on every recorded event so the HUD can re-show an identical
 * outcome (clicking a too-expensive item twice must beep twice).
 */
export interface ShopEventView {
  kind: "bought" | "sold" | "buyRejected" | "sellRejected" | "undone" | "undoRejected";
  itemId: string;
  /** inventory slot for a sale / a completed purchase; -1 when not applicable */
  slot: number;
  /** rejection reason from the sim; "" on success */
  reason: string;
  /** gold AFTER the transaction; -1 when the event carried none */
  gold: number;
  /**
   * WHICH transaction an `undone` event reversed — the sim's `shopUndone`
   * carries the popped entry's own `kind` ("buy" | "sell") so the toast can say
   * 「已復原賣出」 rather than a generic "undone". "" for every other event.
   */
  undoneKind: string;
  seq: number;
}

export interface SeatView {
  seatId: number;
  teamId: number;
  displayName: string;
  connected: boolean;
  driver: string;
  championId: string;
  entityId: number;
  level: number;
  gold: number;
  xp: number;
  /**
   * Vitals of THIS seat's champion entity, derived from the snapshot entities
   * map (the same source the overhead HP bars read) — NOT a separate schema
   * field. 0 / false / -1 while the seat has no live entity (champ-select,
   * pre-spawn). Snapshot-rate, same as `cooldowns`; the top-left enemy panel
   * (EnemyTeamPanel) reads them so it needs no server change.
   */
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  shield: number;
  alive: boolean;
  /** duel zone of this seat's entity (-1 = no entity); duel enemies share the local seat's zone */
  zone: number;
  ready: boolean;
  unspentPoints: number;
  items: string[];
  augments: string[];
  abilityRanks: number[];
  /** remaining cooldown ticks Q W E R */
  cooldowns: number[];
  /** per-hero EX skill: id ("" = hero has none), rank (0 locked / 1 unlocked), cd ticks */
  exAbilityId: string;
  exRank: number;
  exCooldown: number;
  /**
   * 天生技 (6th slot) remaining cooldown ticks. No id/rank beside it: which
   * innate the hero owns follows from `championId` (ui/passiveSlot) and its rank
   * is 1 from spawn. 0 for a permanent 被動 innate and for the 3 heroes with none.
   */
  passiveCooldown: number;
  /**
   * 能力屬性強化 progress (task #82). `statStacks` is the CONSECUTIVE stat-tick
   * count the shop renders as "N / 20"; it drops to 0 the moment the player
   * buys any real item, so the shop MUST be able to warn before that click.
   * `statCapstonePct` is 0 until 傳說·萬象強化 is earned, then the rolled
   * 10..100 magnitude — so "the path is still live" is `statCapstonePct === 0`.
   * The shop scene (#38) owns how this is drawn; this is the state it reads.
   */
  statStacks: number;
  statCapstonePct: number;
  /**
   * WHAT those ticks bought — the three 三圍 totals 力/敏/智, in `ATTR_KEYS`
   * order (#260). `statStacks` alone is a streak counter and answers nothing
   * about what you actually bought; this is what lets the shop panel print a
   * real 三圍 row and a real (+xxx), and drop its 「≈ 屬性強化未同步」 disclaimer.
   * Empty on a legacy snapshot or a seat with no champion — both mean "nothing
   * bought". OPTIONAL so the many hand-built SeatView fixtures across the test
   * suite stay valid: a fixture that omits it is asserting "no attributes
   * bought", which is exactly what an absent array means on the wire too.
   */
  attrBonus?: number[];
  /**
   * YOUR OWN active status effects — doc ids, and TICKS REMAINING on each.
   * Index-aligned. OPTIONAL for the same reason `attrBonus` is: a hand-built
   * fixture that omits them is asserting 「沒有任何狀態」, which is exactly what
   * an absent array means on the wire.
   */
  statusIds?: string[];
  statusRemainTicks?: number[];
  /**
   * How many buy/sell steps of THIS shopping session can still be reversed
   * (task #121) — the server's own `champ.undoStack.length`.
   *
   * WHY IT IS READ HERE AND NOT INFERRED. The shop used to decide whether to
   * show 「↩ 復原上一步」 from the LAST SHOP EVENT ("was it a bought/sold?"),
   * which is a heuristic and was wrong in both directions: it kept the button
   * lit after the stack had been emptied (so the third press was a silent
   * no-op), and it would have hidden a still-undoable step the moment any other
   * shop event — a rejection — landed on top. The server has always projected
   * the exact depth; this is the field that makes the button's visibility a
   * FACT. 0 while the seat has no champion, and 0 again the instant combat
   * commits the session.
   */
  undoDepth: number;
  /**
   * Kills/deaths this seat scored IN THE CURRENT ROUND — server-authoritative
   * (SeatState.roundKills/roundDeaths), zeroed at every combat entry. NOT the
   * cumulative `kills`/`deaths` records below, which are a local tally off death
   * events and are therefore incomplete for a late/reconnecting client. The
   * round-end presentation (winner model #143 + quote VO #142) ranks the leading
   * team's survivors by these, so every client names the same round MVP.
   */
  roundKills: number;
  roundDeaths: number;
  /**
   * 陣亡投幣 throws left this round (task #191), 0..10. Server-authoritative
   * (SeatState.coinsLeft) for the same reason `undoDepth` is: a dead player's
   * only remaining action must read the same number after a reconnect, and a
   * client-side tally off `coinDropped` events has no history to count.
   */
  coinsLeft: number;
  /**
   * 殭屍擊殺數 — server-authoritative (`SeatState.mobKills`, task #258),
   * MATCH-cumulative, the same counter that grants a level every 30 kills.
   *
   * OPTIONAL for the same reason `statRollCounts` is: the many hand-built
   * SeatView fixtures across the suite omit it, and omitting it asserts 「零隻」,
   * which is exactly what an absent field means on the wire too.
   */
  mobKills?: number;
  offers: OfferView[];
}

export interface TeamView {
  teamId: number;
  lives: number;
  eliminated: boolean;
  placement: number;
  /**
   * What this team did in the round that just ran — a protocol ROUND_OUTCOME
   * value (NONE / FOUGHT / LOST / WON), server-authoritative and reset at every
   * combat entry. NONE means it did not fight: it drew the BYE, is eliminated,
   * or the round is not settled yet. The round-end presentation (winner model
   * #143 + quote VO #142) needs this because a bye team is parked dead and
   * scores nothing, so it is otherwise indistinguishable from a wiped one.
   */
  roundOutcome: number;
}

/** One couch player of THIS machine (player 0 = the owner/primary). */
export interface LocalPlayerView {
  player: number;
  accountId: string;
  seatId: number;
  entityId: number | null;
  teamId: number;
  displayName: string;
  /** integers, snapshot-rate (mini-HUD bars) */
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  shield: number;
}

export interface HudState {
  connected: boolean;
  matchId: string;
  phase: string;
  round: number;
  phaseSecondsLeft: number;
  localSeatId: number | null;
  localEntityId: number | null;
  /**
   * The match's active combat-env multiplier table as JSON (MatchState
   * .combatEnvJson, task #28). The shop's stat preview decodes it with
   * `parseCombatEnvJson` so a hypothetical item is resolved through the SAME
   * env the sim uses — a preview under a non-neutral table must not silently
   * fall back to the all-1.0 defaults. "" = neutral.
   */
  combatEnvJson: string;
  /**
   * FIRE RING (#195), replicated straight off `MatchState` — the sim's
   * combat-elapsed ring counter (-1 = disarmed) and the ring's CURRENT world
   * radius. The minimap's danger rim is drawn at this radius rather than at the
   * zone boundary, so the map shows the hazard that exists instead of a rim
   * that pulses over nothing. Deliberately NOT derived from `phaseSecondsLeft`:
   * the ring freezes on round settle while the phase clock keeps running.
   */
  fireRingTicks: number;
  fireRingRadius: number;
  seats: SeatView[];
  teams: TeamView[];
  /** client-side K/D tally from death events (not in the schema) */
  kills: Record<number, number>;
  deaths: Record<number, number>;
  /** local champion resource bars (integers; snapshot-rate, change-guarded) */
  localHp: number;
  localMaxHp: number;
  localMana: number;
  localMaxMana: number;
  localShield: number;
  /** local champion alive state (drives the death-spectator HUD hint) */
  localAlive: boolean;
  lastReject: string | null;
  /** connected gamepad indices (discrete: set on connect/disconnect only) */
  gamepadIndices: number[];
  /** couch players on THIS machine (length 1 = classic single-player) */
  localPlayers: LocalPlayerView[];
  /**
   * Victory-settlement scoreboard: the one-shot MatchSettlement payload the
   * server broadcasts on MSG.EVENT ("matchSettlement") at match end (drives the
   * settlement screen). Null until the match ends. Discrete (fires once), so it
   * belongs here beside the other event-driven projections, not a per-frame path.
   */
  settlement: MatchSettlement | null;
  /**
   * The LOCAL champion's last shop outcome. Discrete (one per click), so it
   * belongs here beside the other event-driven projections. Null until the
   * player's first purchase attempt of the match.
   */
  shopEvent: ShopEventView | null;
  /**
   * The LOCAL player's live 連殺 chain (owner, 2026-07-27), or null.
   *
   * Discrete and event-driven, like `shopEvent` and `settlement` above — NOT a
   * snapshot projection. The count is decided in the sim off `world.tick`
   * (shared/sim/combat/killCombo) and arrives on the `killCombo` event; it is
   * deliberately NOT replicated on `MatchState`, because a 5-second transient
   * would then cost bandwidth every tick to say "still nothing".
   */
  killCombo: KillComboView | null;
  /**
   * 殭屍來襲 (task #258) — how many roguelite MOBS are alive in the LOCAL
   * player's own duel zone right now.
   *
   * WHY IT IS COUNTED FROM THE ENTITY MAP AND NOT SENT AS ITS OWN FIELD. The
   * mobs are already on the wire: they are `EntityState` rows with
   * `kind === ENTITY_KIND.MOB`, and the client renders every one of them. A
   * dedicated counter would be a SECOND opinion about how many zombies exist,
   * which is exactly how a HUD number starts disagreeing with the screen. This
   * is a projection of the authoritative set, so 「來襲」 fires on the same
   * snapshot that puts the first zombie on the floor.
   *
   * SCOPED TO YOUR OWN ZONE, like the minimap (#67): the other arena's wave is
   * not coming for you, and a count that includes it would make the banner fire
   * while your own floor is still empty.
   */
  mobsAlive: number;
}

/**
 * One live combo. `atMs` is a `performance.now()`-style stamp (monotone — it
 * cannot jump when the OS clock is corrected mid-fight); `seq` bumps on every
 * credited kill so the HUD can restart its pop animation on a re-hit, which
 * re-assigning the same CSS animation name would not do.
 */
export interface KillComboView {
  count: number;
  atMs: number;
  seq: number;
}

const initial: HudState = {
  connected: false,
  matchId: "",
  phase: "connecting",
  round: 0,
  phaseSecondsLeft: 0,
  localSeatId: null,
  localEntityId: null,
  combatEnvJson: "",
  fireRingTicks: -1,
  fireRingRadius: 0,
  seats: [],
  teams: [],
  kills: {},
  deaths: {},
  localHp: 0,
  localMaxHp: 0,
  localMana: 0,
  localMaxMana: 0,
  localShield: 0,
  localAlive: false,
  lastReject: null,
  gamepadIndices: [],
  localPlayers: [],
  settlement: null,
  shopEvent: null,
  killCombo: null,
  mobsAlive: 0,
};

let shopEventSeq = 0;

export const hudStore = createStore<HudState>(() => ({ ...initial }));

/** React hook (typed selector over the vanilla store). */
export function useHud<T>(selector: (s: HudState) => T): T {
  return useStore(hudStore, selector);
}

// ---------------------------------------------------------------------------
// schema → store projection (called from room.onStateChange, at SNAPSHOT_HZ)
// ---------------------------------------------------------------------------

let seatsCacheKey = "";
let teamsCacheKey = "";
let localsCacheKey = "";
/** couch accountIds of this machine, index = local player (0 = primary) */
let localAccounts: string[] = [];

export function resetHudStore(): void {
  hudStore.setState({ ...initial }, true);
  seatsCacheKey = "";
  teamsCacheKey = "";
  localsCacheKey = "";
  localAccounts = [];
  shopEventSeq = 0;
}

/** Register this machine's couch accountIds (MultiSession, at connect). */
export function setLocalAccounts(accounts: string[]): void {
  localAccounts = [...accounts];
}

export function syncHudFromState(state: MatchState, localAccountId: string): void {
  const prev = hudStore.getState();
  const patch: Partial<HudState> = {};

  if (!prev.connected) patch.connected = true;
  if (prev.matchId !== state.matchId) patch.matchId = state.matchId;
  if (prev.phase !== state.phase) patch.phase = state.phase;
  if (prev.round !== state.round) patch.round = state.round;

  const secondsLeft = Math.max(0, Math.ceil(state.phaseTicksLeft / TICK_HZ));
  if (prev.phaseSecondsLeft !== secondsLeft) patch.phaseSecondsLeft = secondsLeft;

  if (prev.combatEnvJson !== state.combatEnvJson) patch.combatEnvJson = state.combatEnvJson;

  // fire ring (#195): change-guarded like everything else here, but the radius
  // moves 0.039 u per sim tick while shrinking, so in practice it patches on
  // every snapshot for those 20 seconds — which is the point.
  if (prev.fireRingTicks !== state.fireRingTicks) patch.fireRingTicks = state.fireRingTicks;
  if (prev.fireRingRadius !== state.fireRingRadius) patch.fireRingRadius = state.fireRingRadius;

  // ---- seats (sorted by seatId; JSON key change-guard) ----
  const seats: SeatView[] = [];
  let localSeatId: number | null = null;
  let localEntityId: number | null = null;
  state.seats.forEach((ss) => {
    if (ss.accountId === localAccountId) {
      localSeatId = ss.seatId;
      localEntityId = ss.entityId > 0 ? ss.entityId : null;
    }
    // vitals from the entity snapshot (same map the overhead HP bars use); a
    // DEAD champion stays in the map with hp 0 / alive false, so the enemy
    // panel greys it out rather than losing the row.
    let hp = 0;
    let maxHp = 0;
    let mana = 0;
    let maxMana = 0;
    let shield = 0;
    let alive = false;
    let zone = -1;
    if (ss.entityId > 0) {
      const es = state.entities.get(String(ss.entityId));
      if (es) {
        hp = Math.round(es.hp);
        maxHp = Math.round(es.maxHp);
        mana = Math.round(es.mana);
        maxMana = Math.round(es.maxMana);
        shield = Math.round(es.shield);
        alive = es.alive;
        zone = es.zone;
      }
    }
    seats.push({
      seatId: ss.seatId,
      teamId: ss.teamId,
      displayName: ss.displayName,
      connected: ss.connected,
      driver: ss.driver,
      championId: ss.championId,
      entityId: ss.entityId,
      level: ss.level,
      gold: ss.gold,
      xp: ss.xp,
      hp,
      maxHp,
      mana,
      maxMana,
      shield,
      alive,
      zone,
      ready: ss.ready,
      unspentPoints: ss.unspentPoints,
      items: [...ss.items],
      augments: [...ss.augments],
      abilityRanks: [...ss.abilityRanks],
      cooldowns: [...ss.cooldowns],
      exAbilityId: ss.exAbilityId,
      exRank: ss.exRank,
      exCooldown: ss.exCooldown,
      passiveCooldown: ss.passiveCooldown,
      statStacks: ss.statStacks,
      statCapstonePct: ss.statCapstonePct,
      attrBonus: [...(ss.attrBonus ?? [])],
      statusIds: [...(ss.statusIds ?? [])],
      statusRemainTicks: [...(ss.statusRemainTicks ?? [])],
      undoDepth: ss.undoDepth,
      roundKills: ss.roundKills,
      roundDeaths: ss.roundDeaths,
      coinsLeft: ss.coinsLeft,
      // 殭屍擊殺數 (#258). `?? 0` covers a legacy/unprojected snapshot, which
      // reads as 「還沒殺過」 — the same degradation every other appended field
      // gets here.
      mobKills: ss.mobKills ?? 0,
      offers: ss.offers.map((o) => ({
        offerId: o.offerId,
        tier: o.tier,
        choices: [...o.choices],
      })),
    });
  });
  seats.sort((a, b) => a.seatId - b.seatId);
  const seatsKey = JSON.stringify(seats);
  if (seatsKey !== seatsCacheKey) {
    seatsCacheKey = seatsKey;
    patch.seats = seats;
  }
  if (prev.localSeatId !== localSeatId) patch.localSeatId = localSeatId;
  if (prev.localEntityId !== localEntityId) patch.localEntityId = localEntityId;

  // ---- teams ----
  const teams: TeamView[] = state.teams.map((t) => ({
    teamId: t.teamId,
    lives: t.lives,
    eliminated: t.eliminated,
    placement: t.placement,
    roundOutcome: t.roundOutcome,
  }));
  const teamsKey = JSON.stringify(teams);
  if (teamsKey !== teamsCacheKey) {
    teamsCacheKey = teamsKey;
    patch.teams = teams;
  }

  // ---- couch players (per-viewport mini-HUD; length 1 in classic play) ----
  const accounts = localAccounts.length > 0 ? localAccounts : [localAccountId];
  const locals: LocalPlayerView[] = [];
  state.seats.forEach((ss) => {
    const player = accounts.indexOf(ss.accountId);
    if (player < 0) return;
    const entityId = ss.entityId > 0 ? ss.entityId : null;
    const lp: LocalPlayerView = {
      player,
      accountId: ss.accountId,
      seatId: ss.seatId,
      entityId,
      teamId: ss.teamId,
      displayName: ss.displayName,
      hp: 0,
      maxHp: 0,
      mana: 0,
      maxMana: 0,
      shield: 0,
    };
    if (entityId !== null) {
      const es = state.entities.get(String(entityId));
      if (es) {
        lp.hp = Math.round(es.hp);
        lp.maxHp = Math.round(es.maxHp);
        lp.mana = Math.round(es.mana);
        lp.maxMana = Math.round(es.maxMana);
        lp.shield = Math.round(es.shield);
      }
    }
    locals.push(lp);
  });
  locals.sort((a, b) => a.player - b.player);
  const localsKey = JSON.stringify(locals);
  if (localsKey !== localsCacheKey) {
    localsCacheKey = localsKey;
    patch.localPlayers = locals;
  }

  // ---- 殭屍來襲 (#258): mobs alive in the LOCAL player's own duel zone ----
  // Counted from the authoritative entity map rather than sent as its own
  // field: the zombies are already replicated (kind 6) and already rendered, so
  // a second counter could only ever disagree with the screen. Zone-scoped like
  // the minimap (#67) — the other arena's wave is not coming for you.
  let mobsAlive = 0;
  if (localEntityId !== null) {
    const me = state.entities.get(String(localEntityId));
    if (me) {
      const myZone = me.zone;
      state.entities.forEach((es) => {
        if (es.kind === ENTITY_KIND.MOB && es.alive && es.zone === myZone) mobsAlive++;
      });
    }
  }
  if (prev.mobsAlive !== mobsAlive) patch.mobsAlive = mobsAlive;

  // ---- local resource bars (integers to bound update rate) ----
  if (localEntityId !== null) {
    const es = state.entities.get(String(localEntityId));
    if (es) {
      const hp = Math.round(es.hp);
      const maxHp = Math.round(es.maxHp);
      const mana = Math.round(es.mana);
      const maxMana = Math.round(es.maxMana);
      const shield = Math.round(es.shield);
      if (prev.localHp !== hp) patch.localHp = hp;
      if (prev.localMaxHp !== maxHp) patch.localMaxHp = maxHp;
      if (prev.localMana !== mana) patch.localMana = mana;
      if (prev.localMaxMana !== maxMana) patch.localMaxMana = maxMana;
      if (prev.localShield !== shield) patch.localShield = shield;
      if (prev.localAlive !== es.alive) patch.localAlive = es.alive;
    }
  }

  if (Object.keys(patch).length > 0) hudStore.setState(patch);
}

/** Tally K/D from death events (kills/deaths aren't in the schema). */
export function recordDeathEvent(ev: EventMessage, state: MatchState): void {
  if (ev.type !== "death") return;
  const victimEntity = ev.data.id as number | undefined;
  const killerEntity = ev.data.killer as number | null | undefined;
  if (victimEntity === undefined) return;
  const bySeat = (entityId: number | null | undefined): number | null => {
    if (entityId === null || entityId === undefined) return null;
    let found: number | null = null;
    state.seats.forEach((ss) => {
      if (ss.entityId === entityId) found = ss.seatId;
    });
    return found;
  };
  const victimSeat = bySeat(victimEntity);
  const killerSeat = bySeat(killerEntity);
  if (victimSeat === null && killerSeat === null) return;
  const prev = hudStore.getState();
  const deaths = { ...prev.deaths };
  const kills = { ...prev.kills };
  if (victimSeat !== null) deaths[victimSeat] = (deaths[victimSeat] ?? 0) + 1;
  if (killerSeat !== null && killerSeat !== victimSeat) kills[killerSeat] = (kills[killerSeat] ?? 0) + 1;
  hudStore.setState({ deaths, kills });
}

export function recordReject(reason: string): void {
  hudStore.setState({ lastReject: reason });
}

/* ── 連殺 COMBO (owner 2026-07-27) ──────────────────────────────────────────
 * 「戰鬥時擊殺殭屍或英雄間隔5秒內會顯示 combo 連殺數量」.
 *
 * The COUNT is not computed here — the sim decides it off `world.tick`, so
 * every client and the replay agree (shared/sim/combat/killCombo.ts). This is
 * only the projection of the `killCombo` event onto the HUD store, and it lives
 * in THIS file because `architecture.test.ts` (client-08) allows zustand
 * `setState` in exactly one place: an event fan-out that writes stores from all
 * over the client is how a per-frame re-render storm gets in.
 *
 * WHOSE COMBO: yours. `killerSeatId` gates it exactly as `guardianSlain` /
 * `coinPickedUp` gate their cues on the local seat — a teammate's zombie sweep
 * reading as your own chain would break the feedback loop the feature is for.
 */

/**
 * PURE: the chain length this event credits to `localSeatId`, or null when it
 * is not a combo, not ours, or malformed. Split out so 「someone else's kill
 * must not show on my screen」 is a direct assertion, not a store inference.
 */
export function localKillComboCount(ev: EventMessage, localSeatId: number | null): number | null {
  if (ev.type !== KILL_COMBO_EVENT) return null;
  if (localSeatId === null || localSeatId === undefined) return null;
  const seat = ev.data.killerSeatId;
  if (typeof seat !== "number" || seat !== localSeatId) return null;
  const count = ev.data.count;
  if (typeof count !== "number" || !Number.isFinite(count) || count < 1) return null;
  return count;
}

/** Record one drained `killCombo` event (called from GameApp's event drain). */
export function recordKillComboEvent(ev: EventMessage, nowMs: number = comboNowMs()): void {
  const prev = hudStore.getState();
  const count = localKillComboCount(ev, prev.localSeatId);
  if (count === null) return;
  hudStore.setState({
    killCombo: { count, atMs: nowMs, seq: (prev.killCombo?.seq ?? 0) + 1 },
  });
}

/**
 * The clock the counter lives on: `performance.now()` where it exists,
 * `Date.now()` otherwise. Both the stamp above and the HUD's expiry poll read
 * THIS function, so they can never be measured against different clocks.
 * (Wall time is fine here and banned in the sim for the same reason — this side
 * only decides when to stop DRAWING; the count itself was decided in ticks.)
 */
export function comboNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/**
 * Sim event types that describe a shop outcome (task #38/#60).
 *
 * ── THE UNDO PAIR WAS MISSING (task #121) ───────────────────────────────────
 * The sim has emitted `shopUndone` / `undoRejected` since the undo landed, and
 * `eventFanout` has fanned both out to the owning client — but neither was in
 * this map, so `isShopEvent` dropped them on the floor and pressing 復原上一步
 * produced NO toast and NO sound. The gold moved correctly and the player was
 * told nothing; a third press on an empty stack was indistinguishable from a
 * dead button. Both are here now, and `undoneKind` carries which transaction
 * was reversed so the sentence can name it.
 */
const SHOP_EVENT_KIND: Record<string, ShopEventView["kind"]> = {
  itemBought: "bought",
  itemSold: "sold",
  buyRejected: "buyRejected",
  sellRejected: "sellRejected",
  shopUndone: "undone",
  undoRejected: "undoRejected",
};

/** True when this event is one the shop HUD wants (cheap pre-filter for the drain). */
export function isShopEvent(type: string): boolean {
  return type in SHOP_EVENT_KIND;
}

/**
 * Record the LOCAL champion's shop outcome. Events for OTHER players are
 * dropped here — MatchRoom broadcasts them on the shared channel (as it does
 * damage and deaths), and the shop toast is a private matter.
 *
 * The payloads name the acting entity differently: the success events
 * (`itemBought` / `itemSold`) carry it as `id`, the rejections as `entity`.
 * Both are read so a rename on either side surfaces as a dropped toast, not a
 * mis-attributed one.
 */
export function recordShopEvent(ev: EventMessage, localEntityId: number | null): void {
  const kind = SHOP_EVENT_KIND[ev.type];
  if (!kind || localEntityId === null) return;
  const actor = (ev.data.id ?? ev.data.entity) as number | undefined;
  if (actor !== localEntityId) return;
  shopEventSeq++;
  hudStore.setState({
    shopEvent: {
      kind,
      itemId: typeof ev.data.itemId === "string" ? ev.data.itemId : "",
      slot: typeof ev.data.slot === "number" ? ev.data.slot : typeof ev.data.itemSlot === "number" ? ev.data.itemSlot : -1,
      reason: typeof ev.data.reason === "string" ? ev.data.reason : "",
      gold: typeof ev.data.gold === "number" ? ev.data.gold : -1,
      // only `shopUndone` carries this; every other payload leaves it ""
      undoneKind: kind === "undone" && typeof ev.data.kind === "string" ? ev.data.kind : "",
      seq: shopEventSeq,
    },
  });
}

/** Record the match-end settlement payload (drained once from MSG.EVENT). */
export function recordSettlement(settlement: MatchSettlement): void {
  hudStore.setState({ settlement });
}

/** Clear the settlement payload (match teardown / restart). */
export function resetSettlement(): void {
  hudStore.setState({ settlement: null });
}

/** Gamepad connect/disconnect (event-driven, never per-frame). */
export function setGamepadIndices(indices: number[]): void {
  const prev = hudStore.getState().gamepadIndices;
  if (prev.length === indices.length && prev.every((v, i) => v === indices[i])) return;
  hudStore.setState({ gamepadIndices: [...indices] });
}

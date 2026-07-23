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
import type { MatchState } from "@ggd/shared/protocol/schema";
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
  kind: "bought" | "sold" | "buyRejected" | "sellRejected";
  itemId: string;
  /** inventory slot for a sale / a completed purchase; -1 when not applicable */
  slot: number;
  /** rejection reason from the sim; "" on success */
  reason: string;
  /** gold AFTER the transaction; -1 when the event carried none */
  gold: number;
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
   * 能力屬性強化 progress (task #82). `statStacks` is the CONSECUTIVE stat-tick
   * count the shop renders as "N / 20"; it drops to 0 the moment the player
   * buys any real item, so the shop MUST be able to warn before that click.
   * `statCapstonePct` is 0 until 傳說·萬象強化 is earned, then the rolled
   * 10..100 magnitude — so "the path is still live" is `statCapstonePct === 0`.
   * The shop scene (#38) owns how this is drawn; this is the state it reads.
   */
  statStacks: number;
  statCapstonePct: number;
  offers: OfferView[];
}

export interface TeamView {
  teamId: number;
  lives: number;
  eliminated: boolean;
  placement: number;
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
};

let shopEventSeq = 0;

export const hudStore = createStore<HudState>(() => ({ ...initial }));

/** React hook (typed selector over the vanilla store). */
export function useHud<T>(selector: (s: HudState) => T): T {
  return useStore(hudStore, selector);
}

// ---------------------------------------------------------------------------
// schema → store projection (called from room.onStateChange, ~20 Hz)
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
      statStacks: ss.statStacks,
      statCapstonePct: ss.statCapstonePct,
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

/** Sim event types that describe a shop outcome (task #38/#60). */
const SHOP_EVENT_KIND: Record<string, ShopEventView["kind"]> = {
  itemBought: "bought",
  itemSold: "sold",
  buyRejected: "buyRejected",
  sellRejected: "sellRejected",
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

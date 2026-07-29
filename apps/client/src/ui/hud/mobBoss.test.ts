/**
 * 殭屍王 CLIENT — the 降臨 banner, the 分紅結算 sheet, and the two cues.
 *
 * The sim already proves the payout arithmetic (packages/shared/src/sim/
 * mobBoss.test.ts) and the game-server already proves the two events reach the
 * wire (apps/game-server/src/net/mobBossWire.test.ts). What was missing — and
 * what this file exists for — is everything AFTER the socket: v0.9.11 shipped
 * both events with ZERO client consumers, so 100 zombie kills produced a
 * monster nobody was told about and ~3,000 gold nobody could explain.
 *
 * The seven shapes of 「做了但玩家拿不到」, and where each is answered:
 *   ① drawn off-screen / on top of something → `where it lands` (geometry, at
 *      every guard viewport, against INDEPENDENTLY re-derived chrome rects)
 *   ② computed but never delivered           → `the wire → the store`, and the
 *      REAL GameApp drain run over a real batch
 *   ③ deletable from the render tree, still green → `the mounted HUD` renders
 *      <HudRoot /> through react-dom/server and reads the numbers back
 *   ④ asserted in the wrong direction        → every expiry/gate test asserts
 *      the NULL or the EMPTY STRING, not the value
 *   ⑤受測的不是出貨的那個東西                → the mount is `<HudRoot />`, the
 *      audio is `combatSfxKey` (the function GameApp calls), the sound files
 *      are measured as BYTES ON DISK
 *   ⑥ scanning source strings                → the only source scans here are
 *      the two that are ABOUT source (the fan-out whitelist is imported, not
 *      grepped; the audio-map is parsed JSON)
 *   ⑦ scanning attributes rather than behaviour → `visibleText` strips every
 *      tag WITH its attributes, so an aria-label can never answer for a pixel
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MOB_BOSS_SLAIN_EVENT, MOB_BOSS_SPAWN_EVENT } from "@ggd/shared/sim/mobBoss";
import { FANNED_OUT_EVENT_TYPES } from "../../../../game-server/src/net/eventFanout";
import {
  BOSS_BANNER_MS,
  BOSS_BANNER_TITLE,
  BOSS_COMPACT_H,
  BOSS_EXIT_MS,
  BOSS_LAST_HIT_TAG,
  BOSS_MIN_W,
  BOSS_SETTLEMENT_MS,
  BOSS_SETTLEMENT_TITLE,
  bossFullHeight,
  bossLifetime,
  bossRuleNote,
  bossRuleNoteShort,
  bossSettlementLayout,
  bossSortedShares,
  bossSummonLine,
  bossTotalLine,
  bossVisibleInZone,
  formatMultiplier,
  mobBossCollisions,
  mobBossOverlayRect,
  mobBossRect,
} from "./mobBossModel";
import { killComboRect } from "./killComboModel";
import {
  comboNowMs,
  hudStore,
  parseMobBossEvent,
  recordMobBossEvent,
  isMobBossEvent,
  localDuelZone,
  resetHudStore,
  type HudState,
  type LocalPlayerView,
  type SeatView,
} from "../../net/RoomStore";
import { MobBossOverlay } from "./MobBossOverlay";
import { KillCombo } from "./KillCombo";
import { HudRoot } from "../HudRoot";
// The REAL frame-loop drain. GameApp cannot be CONSTRUCTED headlessly, but the
// module imports fine and `handleDrainedEvent` lives on the prototype precisely
// so this file can run it — same seam killCombo.test.ts uses, and for the same
// reason: a grep of GameApp.ts is not a call.
import { GameApp } from "../../GameApp";
import {
  combatSfxKey,
  bossHorrorKey,
  bossJackpotKey,
  localDuelZone as sfxLocalDuelZone,
  setCombatSfxSeat,
} from "../../audio/combatSfx";
import { SFX_BY_SCENE } from "../../audio/sfxManifest";
import { EVENT_SPATIAL, CENTRED_EVENTS } from "../../audio/combatSfxSpatial";
import { hudTouch } from "./HudSlot";
import {
  HUD_SLOTS,
  hudRectInViewport,
  hudRectsOverlap,
  hudSlotRect,
  hudStampBandRect,
  type HudRect,
  type HudSlotId,
  type HudViewport,
} from "./hudLayout";
import { ABILITY_CLUSTER_H, ABILITY_CLUSTER_W } from "../controlLegendModel";

/**
 * The guard viewports, mirrored from hudLayout.test.ts / killCombo.test.ts —
 * a 375-393px tall window is a phone in landscape, so it is exercised with
 * `touch: true`, and the desktop sizes with `touch: false`. Getting that pairing
 * wrong is how a layout test comes to "prove" a configuration nobody ships.
 */
const VIEWPORTS: readonly { width: number; height: number; touch: boolean }[] = [
  { width: 667, height: 375, touch: true },
  { width: 812, height: 375, touch: true },
  { width: 852, height: 393, touch: true },
  { width: 1280, height: 720, touch: false },
  { width: 1920, height: 1080, touch: false },
];

const BANNER = { wantH: 74, minH: 52 };

/** Keeps only the text a browser would paint: no tags, no attributes, no CSS. */
function visibleText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const localPlayer = (seatId: number): LocalPlayerView => ({
  player: 0,
  accountId: `acct-${seatId}`,
  seatId,
  entityId: null,
  teamId: 1,
  displayName: "me",
  hp: 92,
  maxHp: 100,
  mana: 0,
  maxMana: 0,
  shield: 0,
});

const seatView = (seatId: number, displayName: string, zone = 0): SeatView => ({
  seatId,
  teamId: 1,
  displayName,
  connected: true,
  driver: "human",
  championId: "godie-hpb1",
  entityId: 100 + seatId,
  level: 3,
  gold: 0,
  xp: 0,
  hp: 90,
  maxHp: 100,
  mana: 0,
  maxMana: 0,
  shield: 0,
  alive: true,
  zone,
  ready: true,
  unspentPoints: 0,
  items: [],
  augments: [],
  abilityRanks: [0, 0, 0, 0],
  cooldowns: [0, 0, 0, 0],
  exAbilityId: "",
  exRank: 0,
  exCooldown: 0,
  passiveCooldown: 0,
  statStacks: 0,
  statCapstonePct: 0,
  mobKills: 0,
  undoDepth: 0,
  roundKills: 0,
  roundDeaths: 0,
  coinsLeft: 10,
  offers: [],
});

/** A live single-player combat HUD; seat 2 is ours, three seats in zone 0. */
function inCombat(over: Partial<HudState> = {}): void {
  resetHudStore();
  hudStore.setState({
    connected: true,
    phase: "combat",
    round: 3,
    localSeatId: 2,
    localMaxHp: 100,
    localHp: 92,
    localAlive: true,
    localPlayers: [localPlayer(2)],
    seats: [seatView(1, "阿明"), seatView(2, "你"), seatView(5, "小華")],
    ...over,
  });
}

const spawnEv = (over: Record<string, unknown> = {}) => ({
  type: MOB_BOSS_SPAWN_EVENT,
  tick: 900,
  data: {
    id: 77,
    zone: 0,
    x: 3,
    z: -4,
    maxHp: 12000,
    summoner: 102,
    summonerSeatId: 2,
    kills: 100,
    ...over,
  },
});

/**
 * 3 damagers, seat 2 = you (biggest damage), seat 5 = the last hitter.
 *
 * THESE NUMBERS ARE A REAL `"bonus"` PAYOUT, not a hand-waved table — checked
 * against `splitBossBounty` so the sheet under test is one the sim can actually
 * emit. Damage 2000 : 4000 : 1000 = 2:4:1 of a CONFIGURED pool of 2,625 gold /
 * 1,050 xp gives 750 / 1500 / 375, and then GH#206's bonus hands the last hitter
 * a second copy of their own 375 → 750. So the pool was 2,625 and 3,000 WAS PAID.
 *
 * ⚠️ WHICH IS WHY seat 5 IS PAID THE SAME AS seat 1 ON HALF THE DAMAGE. That
 * inversion is the point of the fixture, and it is what the sheet's ordering and
 * its rule sentence both have to survive.
 */
const slainEv = (over: Record<string, unknown> = {}) => ({
  type: MOB_BOSS_SLAIN_EVENT,
  tick: 1800,
  data: {
    id: 77,
    killer: 105,
    killerSeatId: 5,
    totalGold: 3000,
    totalXp: 1200,
    totalLevels: 0,
    lastHitMultiplier: 2,
    lastHitMode: "bonus",
    shares: [
      { id: 101, seatId: 1, damage: 2000, gold: 750, xp: 300, levels: 0, lastHit: false },
      { id: 102, seatId: 2, damage: 4000, gold: 1500, xp: 600, levels: 0, lastHit: false },
      { id: 105, seatId: 5, damage: 1000, gold: 750, xp: 300, levels: 0, lastHit: true },
    ],
    ...over,
  },
});

const renderOverlay = (): string => renderToStaticMarkup(createElement(MobBossOverlay));
const renderHud = (): string => renderToStaticMarkup(createElement(HudRoot));
const renderCombo = (): string => renderToStaticMarkup(createElement(KillCombo));

/**
 * Render the SHIPPED components the way a window of this size would.
 *
 * The HUD's `useViewport` falls back to 1280x800 when there is no `window`, and
 * this env has none (asserted below) — which is why every mounted-HUD guard in
 * this file has only ever measured ONE viewport, the roomiest one. A phone is
 * where the compact sheet and the 連殺 yield actually happen.
 */
function atViewport(width: number, height: number, fn: () => void): void {
  const g = globalThis as unknown as { window?: unknown };
  expect("window" in g, "a real window exists — this stub is stale").toBe(false);
  g.window = { innerWidth: width, innerHeight: height, addEventListener() {}, removeEventListener() {} };
  try {
    fn();
  } finally {
    delete g.window;
  }
}

/** Put a beat in the store, stamped `ageMs` in the past. */
function beat(ev: { type: string; tick: number; data: Record<string, unknown> }, ageMs = 0): void {
  recordMobBossEvent(ev, comboNowMs() - ageMs);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ⓪ visibleText — the reader every "the player sees it" assertion trusts
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("visibleText", () => {
  it("keeps text nodes and drops tags, attributes and <style> bodies", () => {
    expect(visibleText('<div aria-label="殭屍王降臨"><span>降臨</span></div>')).toBe("降臨");
    expect(visibleText('<div aria-label="殭屍王降臨"><span></span></div>')).toBe("");
    expect(visibleText("<div><style>.a{content:'X'}</style><b>3000 金</b></div>")).toBe("3000 金");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ① THE WIRE → THE STORE  (failure ②: computed but never delivered)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("the wire → the store", () => {
  beforeEach(() => inCombat());

  it("the two event names are the ones the SERVER actually fans out", () => {
    // Imported from the game-server's own whitelist, not grepped: a rename on
    // either side lands here instead of producing a HUD that listens forever
    // for an event nobody sends. THIS is the check that would have caught the
    // whole v0.9.11 gap if it had existed in the other direction.
    expect(FANNED_OUT_EVENT_TYPES.has(MOB_BOSS_SPAWN_EVENT)).toBe(true);
    expect(FANNED_OUT_EVENT_TYPES.has(MOB_BOSS_SLAIN_EVENT)).toBe(true);
    expect(isMobBossEvent(MOB_BOSS_SPAWN_EVENT)).toBe(true);
    expect(isMobBossEvent(MOB_BOSS_SLAIN_EVENT)).toBe(true);
    expect(isMobBossEvent("mobSlain")).toBe(false);
  });

  it("a spawn records WHO summoned it, and whether that was YOU", () => {
    const mine = parseMobBossEvent(spawnEv(), 2, 1000, 1)!;
    expect(mine.kind).toBe("spawn");
    expect(mine.mine).toBe(true);
    expect(mine.kills).toBe(100);
    expect(mine.summonerSeatId).toBe(2);
    // …and somebody else's quest is NOT yours (asserted in the failing
    // direction — the banner saying 「你」 for a teammate's 100 kills is the bug)
    expect(parseMobBossEvent(spawnEv({ summonerSeatId: 5 }), 2, 1000, 1)!.mine).toBe(false);
    // seat -1 is 「沒有座位」 and must never match a spectator's null seat
    expect(parseMobBossEvent(spawnEv({ summonerSeatId: -1 }), null, 1000, 1)!.mine).toBe(false);
  });

  it("a slain carries the WHOLE split through, untouched", () => {
    const v = parseMobBossEvent(slainEv(), 2, 1000, 1)!;
    expect(v.kind).toBe("slain");
    expect(v.totalGold).toBe(3000);
    expect(v.totalXp).toBe(1200);
    expect(v.lastHitMultiplier).toBe(2);
    expect(v.killerSeatId).toBe(5);
    expect(v.shares).toHaveLength(3);
    expect(v.shares.map((s) => s.gold)).toEqual([750, 1500, 750]);
    expect(v.shares.filter((s) => s.lastHit).map((s) => s.seatId)).toEqual([5]);
    // the client NEVER recomputes money: the printed total equals the sum of the
    // shares the sim sent, not a re-derivation.
    expect(v.shares.reduce((a, s) => a + s.gold, 0)).toBe(v.totalGold);
    // GH#206's three additions, each of which the projection silently dropped
    // until v0.9.12 — a field absent from the view can never reach a pixel.
    expect(v.lastHitMode).toBe("bonus");
    const lv = parseMobBossEvent(
      slainEv({
        totalLevels: 5,
        shares: [
          { id: 101, seatId: 1, damage: 2000, gold: 750, xp: 300, levels: 1, lastHit: false },
          { id: 105, seatId: 5, damage: 1000, gold: 750, xp: 300, levels: 4, lastHit: true },
        ],
      }),
      2,
      1000,
      1,
    )!;
    expect(lv.totalLevels).toBe(5);
    expect(lv.shares.map((s) => s.levels)).toEqual([1, 4]);
  });

  it("a malformed payload degrades to 「沒有翻倍」, never to an invented multiplier", () => {
    expect(parseMobBossEvent(slainEv({ lastHitMultiplier: "2x" }), 2, 1, 1)!.lastHitMultiplier).toBe(1);
    expect(parseMobBossEvent(slainEv({ lastHitMultiplier: 0.5 }), 2, 1, 1)!.lastHitMultiplier).toBe(1);
    expect(parseMobBossEvent(slainEv({ shares: "nope" }), 2, 1, 1)!.shares).toEqual([]);
    expect(parseMobBossEvent({ type: "mobSlain", tick: 1, data: {} }, 2, 1, 1)).toBeNull();
    // 等級 degrades to 0, never to NaN painted as 「+NaN 等」
    expect(parseMobBossEvent(slainEv({ totalLevels: "五" }), 2, 1, 1)!.totalLevels).toBe(0);
  });

  it("AN UNKNOWN lastHitMode DEGRADES TO 「bonus」 — never to the 「總額固定」 promise", () => {
    // ⚠️ ASSERTED IN THE DIRECTION THAT COSTS SOMETHING. Only `"weight"` licenses
    // the panel to say 「總獎金固定」, so an absent or garbled field must land on
    // `"bonus"`: the worst case is then a vaguer TRUE sentence instead of a false
    // claim about the player's money. A `?? "weight"` default would pass a test
    // that only checked 「it parsed to something」.
    expect(parseMobBossEvent(slainEv({ lastHitMode: undefined }), 2, 1, 1)!.lastHitMode).toBe("bonus");
    expect(parseMobBossEvent(slainEv({ lastHitMode: "WEIGHT" }), 2, 1, 1)!.lastHitMode).toBe("bonus");
    expect(parseMobBossEvent(slainEv({ lastHitMode: 7 }), 2, 1, 1)!.lastHitMode).toBe("bonus");
    // …and the real thing still comes through, or the mode would be dead config
    expect(parseMobBossEvent(slainEv({ lastHitMode: "weight" }), 2, 1, 1)!.lastHitMode).toBe("weight");
  });

  it("a SLAIN overwrites a still-showing SPAWN — never two king panels", () => {
    beat(spawnEv());
    expect(hudStore.getState().mobBoss!.kind).toBe("spawn");
    beat(slainEv());
    expect(hudStore.getState().mobBoss!.kind).toBe("slain");
    expect(hudStore.getState().mobBoss!.seq).toBe(2);
  });

  it("THE DRAIN, ACTUALLY RUN — GameApp's real per-event path moves the store", () => {
    // ⚠️ THE MUTATION A SOURCE SCAN CANNOT CATCH: leave the
    // `recordMobBossEvent(ev, nowMs)` line textually intact in GameApp.ts but
    // make it unreachable. The sim keeps emitting, the wire keeps carrying, and
    // no screen in the game ever hears about a king again. This runs the real
    // prototype method over a real batch, so the store must actually move.
    const stub = {
      vfx: { handleEvent() {} },
      views: { handleEvent() {} },
      casts: { handleEvent() {} },
      sfxQueue: { push() {} },
      applyCombatFeedback() {},
      dispatchContextualVoice() {},
      audioEntityPos: () => null,
      audioTeamOf: () => null,
      deathFocus: { noteDeath() {} },
    } as unknown as GameApp;
    const handle = (
      GameApp.prototype as unknown as {
        handleDrainedEvent: (
          this: GameApp,
          ev: unknown,
          state: unknown,
          localId: number | null,
          nowMs: number,
        ) => void;
      }
    ).handleDrainedEvent;
    handle.call(stub, slainEv(), null, 102, 4242);
    const v = hudStore.getState().mobBoss!;
    expect(v.kind).toBe("slain");
    expect(v.atMs).toBe(4242);
    expect(v.shares).toHaveLength(3);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ② LIFETIME  (failure ④: assert the NULL)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("how long each beat stays up", () => {
  const spawn = (atMs: number) => parseMobBossEvent(spawnEv(), 2, atMs, 1)!;
  const slain = (atMs: number) => parseMobBossEvent(slainEv(), 2, atMs, 1)!;

  it("the banner covers its own SOUND — a cue outliving its banner is the defect", () => {
    // The owner asked for a 3-5 s horror cue and the shipped clip is 4.40 s.
    // The banner must not vanish while the drone is still playing, so the hold
    // is asserted against the FILE's measured duration, not against a comment.
    expect(BOSS_BANNER_MS).toBeGreaterThanOrEqual(4400);
    expect(BOSS_SETTLEMENT_MS).toBeGreaterThanOrEqual(6000);
  });

  it("holds, then exits, then is GONE (the null is the assertion)", () => {
    expect(bossLifetime(spawn(0), 0)!.phase).toBe("live");
    expect(bossLifetime(spawn(0), BOSS_BANNER_MS - 1)!.phase).toBe("live");
    expect(bossLifetime(spawn(0), BOSS_BANNER_MS + 1)!.phase).toBe("out");
    expect(bossLifetime(spawn(0), BOSS_BANNER_MS + BOSS_EXIT_MS + 1)).toBeNull();
    // the settlement holds longer than the banner — two different beats
    expect(bossLifetime(slain(0), BOSS_BANNER_MS + BOSS_EXIT_MS + 1)!.phase).toBe("live");
    expect(bossLifetime(slain(0), BOSS_SETTLEMENT_MS + BOSS_EXIT_MS + 1)).toBeNull();
  });

  it("a backwards clock shows NOTHING rather than a stuck panel", () => {
    expect(bossLifetime(spawn(1000), 500)).toBeNull();
    expect(bossLifetime(null, 0)).toBeNull();
  });

  it("the exit fades to zero and never below it", () => {
    const half = bossLifetime(spawn(0), BOSS_BANNER_MS + BOSS_EXIT_MS / 2)!;
    expect(half.opacity).toBeGreaterThan(0.4);
    expect(half.opacity).toBeLessThan(0.6);
    expect(bossLifetime(spawn(0), BOSS_BANNER_MS + BOSS_EXIT_MS)!.opacity).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ③ WHERE IT LANDS  (failure ①: off-screen / on top of chrome)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Which persistent chrome a GIVEN rect lands on — re-derived here from
 * `HUD_SLOTS` and the two centred clusters, with the rect as an ARGUMENT rather
 * than a second call to `mobBossRect`. A guard that recomputes the placement
 * with the same inputs moves whenever the placement moves.
 */
function chromeHitBy(rect: HudRect, viewport: HudViewport, touch: boolean): string[] {
  const hits: string[] = [];
  for (const s of HUD_SLOTS) {
    if (s.transient) continue;
    if (hudRectsOverlap(rect, hudSlotRect(s.id as HudSlotId, viewport, touch))) hits.push(s.id);
  }
  const cluster: HudRect = {
    x: Math.max(0, (viewport.width - ABILITY_CLUSTER_W) / 2),
    y: Math.max(0, viewport.height - ABILITY_CLUSTER_H),
    w: Math.min(ABILITY_CLUSTER_W, viewport.width),
    h: Math.min(ABILITY_CLUSTER_H, viewport.height),
  };
  if (hudRectsOverlap(rect, cluster)) hits.push("ability-cluster");
  if (hudRectsOverlap(rect, hudStampBandRect(viewport))) hits.push("stamp-band");
  return hits.sort();
}

describe("where it lands", () => {
  it("the BANNER fits on screen and touches no chrome, at every guard viewport", () => {
    for (const vp of VIEWPORTS) {
      const rect = mobBossRect(vp, { touch: vp.touch, legendUp: false, ...BANNER });
      expect(rect, `${vp.width}x${vp.height}: banner had nowhere to go`).not.toBeNull();
      expect(hudRectInViewport(rect!, vp), `${vp.width}x${vp.height} off-screen`).toBe(true);
      expect(chromeHitBy(rect!, vp, vp.touch), `${vp.width}x${vp.height}`).toEqual([]);
      // and the model's own collision check agrees (it re-derives independently)
      expect(mobBossCollisions(vp, { touch: vp.touch, legendUp: false, ...BANNER })).toEqual([]);
    }
  });

  it("the SETTLEMENT sheet fits — full where there is room, compact where there is not", () => {
    for (const vp of VIEWPORTS) {
      const view = parseMobBossEvent(slainEv(), 2, 0, 1)!;
      const rect = mobBossOverlayRect(view, vp, { touch: vp.touch, legendUp: false });
      expect(rect, `${vp.width}x${vp.height}: settlement had nowhere to go`).not.toBeNull();
      expect(hudRectInViewport(rect!, vp)).toBe(true);
      expect(chromeHitBy(rect!, vp, vp.touch), `${vp.width}x${vp.height}`).toEqual([]);
      // the height is ONE of the two authored layouts, never something in between
      expect([bossFullHeight(3), BOSS_COMPACT_H]).toContain(rect!.h);
    }
  });

  it("A CORRIDOR TOO SHORT PRODUCES NULL, not a box over the ability bar", () => {
    // ⚠️ THE FAILING DIRECTION for 「just always draw it」. 240px tall leaves the
    // centre corridor negative once the top band and the ability cluster are
    // taken out; nothing is the only correct answer.
    expect(mobBossRect({ width: 900, height: 240 }, { touch: false, legendUp: false, ...BANNER })).toBeNull();
  });

  it("A VIEWPORT TOO NARROW PRODUCES NULL rather than an unreadable sliver", () => {
    const rect = mobBossRect({ width: 300, height: 800 }, { touch: false, legendUp: false, ...BANNER });
    if (rect) expect(rect.w).toBeGreaterThanOrEqual(BOSS_MIN_W);
    else expect(rect).toBeNull();
    // 240 wide cannot hold BOSS_MIN_W (220) plus both edge insets and the gap
    expect(mobBossRect({ width: 240, height: 800 }, { touch: false, legendUp: false, ...BANNER })).toBeNull();
  });

  it("THE 連殺 COUNTER YIELDS — geometrically, not by a boolean", () => {
    // ⚠️ THE MUTATION: drop the `bossRect` clause from `killComboRect`. On a
    // desktop screen NOTHING changes (both fit), which is exactly why a boolean
    // would have been wrong — so the assertion is about the two RECTS, at every
    // viewport, and it is the overlap that must be empty.
    for (const vp of VIEWPORTS) {
      const bossRect = mobBossRect(vp, { touch: vp.touch, legendUp: false, ...BANNER })!;
      const combo = killComboRect(vp, { touch: vp.touch, legendUp: false, bossRect });
      if (combo) {
        expect(
          hudRectsOverlap(combo, bossRect),
          `${vp.width}x${vp.height}: the combo counter landed on the king's banner`,
        ).toBe(false);
      }
    }
  });

  it("…and where BOTH fit, they STACK: the counter sits strictly below the king", () => {
    // ⚠️ THE MUTATION THIS EXISTS FOR, and why the overlap test above is not
    // enough on its own. Two independent mechanisms keep the two boxes apart:
    //   (1) `killComboRect` pushes its corridor top BELOW `bossRect`;
    //   (2) `killComboObstacles` also lists the boss box, so the side scan sees
    //       something straddling the centre line and bails out with null.
    // MEASURED: deleting (1) leaves (2), and (2) answers `null` — which the
    // 「if (combo) … not overlapping」 assertion accepts as a pass. The guard was
    // certifying a defect. 1000x440 is the viewport where the corridor is tall
    // enough to hold BOTH stacked (banner 106-180, counter 188-252), so the only
    // passing answer here is a REAL rect below the banner — and deleting (1)
    // turns that into null and goes red.
    const vp = { width: 1000, height: 440 };
    const bossRect = mobBossRect(vp, { touch: false, legendUp: false, ...BANNER })!;
    const combo = killComboRect(vp, { touch: false, legendUp: false, bossRect });
    expect(combo, "the counter vanished on a viewport that fits both").not.toBeNull();
    expect(combo!.y).toBeGreaterThanOrEqual(bossRect.y + bossRect.h);
    expect(hudRectsOverlap(combo!, bossRect)).toBe(false);
  });

  it("…and on a tall screen the counter is NOT simply suppressed", () => {
    // The failing direction for 「make killComboRect always return null」: the
    // yield must cost the counter only the room it actually needs.
    const vp = { width: 1920, height: 1080 };
    const bossRect = mobBossRect(vp, { touch: false, legendUp: false, ...BANNER })!;
    expect(killComboRect(vp, { touch: false, legendUp: false, bossRect })).not.toBeNull();
    // and with no king up, the counter's box is unchanged from before this task
    expect(killComboRect(vp, { touch: false, legendUp: false })).toEqual(
      killComboRect(vp, { touch: false, legendUp: false, bossRect: null }),
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ④ THE TABLE + THE RULE
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("the payout sheet", () => {
  const view = () => parseMobBossEvent(slainEv(), 2, 0, 1)!;
  const nameOf = (id: number) => ({ 1: "阿明", 2: "你", 5: "小華" })[id] ?? `座位 ${id}`;

  it("reads biggest-PAYOUT first, deterministically", () => {
    // 1500 / 750 / 750 → seat 2 leads; the two 750s tie and fall back to damage
    // (2000 > 1000), so seat 1 precedes seat 5.
    expect(bossSortedShares(view().shares).map((s) => s.seatId)).toEqual([2, 1, 5]);
  });

  it("FULL mode shows every participant", () => {
    const l = bossSettlementLayout(view(), 2, nameOf, bossFullHeight(3))!;
    expect(l.mode).toBe("full");
    expect(l.rows.map((r) => r.seatId)).toEqual([2, 1, 5]);
    expect(l.hiddenCount).toBe(0);
    expect(l.rows.find((r) => r.you)!.seatId).toBe(2);
    expect(l.rows.find((r) => r.lastHit)!.seatId).toBe(5);
  });

  it("COMPACT never drops YOUR row — it drops everyone else's", () => {
    // ⚠️ The defect this guards: shrinking the box by clipping rows would hide
    // the reader's own payout, which is the one number the panel exists for.
    //
    // THE LOCAL SEAT HERE IS 5 — the LOWEST damager (1000), so it is NOT
    // `sorted[0]`. That is deliberate and was a real bug in this test's first
    // version: with seat 2 (the top contributor, 4000) as the reader, replacing
    // `mine ?? sorted[0]` with a bare `sorted[0]` kept every assertion green,
    // because for that reader the two happen to be the same row. MEASURED, and
    // fixed by picking a reader for whom they differ.
    const l = bossSettlementLayout(view(), 5, nameOf, BOSS_COMPACT_H)!;
    expect(l.mode).toBe("compact");
    expect(l.rows).toHaveLength(1);
    expect(l.rows[0]!.seatId).toBe(5);
    expect(l.rows[0]!.you).toBe(true);
    expect(bossSortedShares(view().shares)[0]!.seatId).toBe(2); // …and it is NOT the top row
    expect(l.hiddenCount).toBe(2);
    // a spectator (not on the sheet) gets the top contributor instead of nothing
    const spec = bossSettlementLayout(view(), 9, nameOf, BOSS_COMPACT_H)!;
    expect(spec.rows[0]!.seatId).toBe(2);
    expect(spec.rows[0]!.you).toBe(false);
  });

  it("nobody paid ⇒ NO table (the sim really produces this)", () => {
    const empty = parseMobBossEvent(slainEv({ shares: [] }), 2, 0, 1)!;
    expect(bossSettlementLayout(empty, 2, nameOf, 400)).toBeNull();
    expect(mobBossOverlayRect(empty, { width: 1280, height: 720 }, { touch: false, legendUp: false })).toBeNull();
  });

  it("THE RULE SENTENCE states BOTH the mechanism and its consequence — PER MODE", () => {
    // ⚠️ THE WHOLE POINT OF THE PANEL, and the thing GH#206 turned into a lie.
    // Each mode needs its own mechanism AND its own consequence:
    //   weight → the doubling is in the denominator, so the total is FIXED
    //   bonus  → an extra copy is paid on top, so the total OVERSHOOTS the pool
    // Both halves of both sentences are asserted, so deleting any one goes red.
    const w = bossRuleNote(2, "weight");
    expect(w).toContain("×2 權重");
    expect(w).toContain("不是事後");
    expect(w).toContain("總獎金固定");

    const b = bossRuleNote(2, "bonus");
    expect(b).toContain("再多領一份自己的份額");
    expect(b).toContain("超出原本的獎金池");
    expect(b).toContain("實際發出去的金額");
    // …and it must NOT keep reciting the conserving rule (the shipped defect)
    expect(b).not.toContain("固定");

    // the multiplier is the MATCH's, not a hard-coded 2, in either mode
    expect(bossRuleNote(3, "weight")).toContain("×3 權重");
    expect(bossRuleNote(3, "bonus")).toContain("×3");
    expect(formatMultiplier(2)).toBe("2");
    expect(formatMultiplier(1.5)).toBe("1.5");

    // the one-liner obeys the same split
    expect(bossRuleNoteShort(2, "weight")).toContain("總獎金固定");
    expect(bossRuleNoteShort(2, "bonus")).not.toContain("固定");
    expect(bossRuleNoteShort(2, "bonus")).toContain("超出獎金池");
  });

  it("the total line prints what was ACTUALLY paid, and omits 等級 when nobody rose", () => {
    expect(bossTotalLine(view())).toBe("總獎金 3000 金 · 1200 經驗");
    // ⚠️ BOTH DIRECTIONS. `totalLevels: 0` is the common config and must add
    // nothing (a permanent 「· 0 等」 is noise); a real grant must always show.
    expect(bossTotalLine(view())).not.toContain("等");
    const lv = parseMobBossEvent(slainEv({ totalLevels: 5 }), 2, 0, 1)!;
    expect(bossTotalLine(lv)).toBe("總獎金 3000 金 · 1200 經驗 · 5 等");
  });

  it("the banner line names YOU or the summoner, never both", () => {
    const mine = parseMobBossEvent(spawnEv(), 2, 0, 1)!;
    expect(bossSummonLine(mine, "阿明")).toContain("你累積擊殺 100 隻殭屍");
    const theirs = parseMobBossEvent(spawnEv({ summonerSeatId: 5 }), 2, 0, 1)!;
    expect(bossSummonLine(theirs, "小華")).toContain("小華累積擊殺 100 隻殭屍");
    expect(bossSummonLine(theirs, "小華")).not.toContain("你累積");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑤ THE MOUNTED HUD REALLY PAINTS IT  (failures ③ / ⑤ / ⑦)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("the mounted HUD really paints it", () => {
  beforeEach(() => inCombat());

  it("renders in the env these numbers assume (no DOM, 1280x800 fallback)", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(hudTouch()).toBe(false);
  });

  it("the whole HUD tree, as the game mounts it, shows the BANNER", () => {
    // ⚠️ THE MUTATION: `return null` at the top of the `MobBossOverlay`
    // CONTAINER, or deleting `<MobBossOverlay />` from HudRoot. Both die here:
    // this is HudRoot's own OUTPUT, not a regex over its source.
    beat(spawnEv());
    const html = renderHud();
    expect(html).toContain('data-mob-boss="banner"');
    expect(visibleText(html)).toContain(BOSS_BANNER_TITLE);
    expect(visibleText(html)).toContain("你累積擊殺 100 隻殭屍");
  });

  it("the whole HUD tree shows the SETTLEMENT — numbers, names and the rule", () => {
    beat(slainEv());
    const html = renderHud();
    const text = visibleText(html);
    expect(html).toContain('data-mob-boss="settlement"');
    expect(text).toContain(BOSS_SETTLEMENT_TITLE);
    expect(text).toContain("總獎金 3000 金");
    // every participant's own money, by name — the whole reason this exists
    expect(text).toContain("你");
    expect(text).toContain("1500 金");
    expect(text).toContain("阿明");
    expect(text).toContain("750 金");
    expect(text).toContain("小華");
    expect(text).toContain(BOSS_LAST_HIT_TAG);
    // ⚠️ AND THE SENTENCE, as PAINTED text. Reading it off the raw markup would
    // let an aria-label answer for a pixel (this repo has shipped that bug);
    // `visibleText` deletes every tag WITH its attributes. The fixture is a
    // `"bonus"` king, so the BONUS sentence is the one that must appear — and
    // 「總獎金固定」 must not, because it is false about these very numbers.
    expect(text).toContain("再多領一份自己的份額");
    expect(text).toContain("超出原本的獎金池");
    expect(text).not.toContain("總獎金固定");
  });

  it("…and paints NOTHING when no king moment is live", () => {
    // The failing direction for 「just always draw it」: same mounted HUD, no
    // event recorded, and the overlay must be absent from the tree entirely —
    // while the rest of the HUD is demonstrably still there.
    const html = renderHud();
    expect(html).not.toContain("data-mob-boss");
    expect(html).not.toContain(BOSS_BANNER_TITLE);
    expect(html.length).toBeGreaterThan(500);
  });

  it("the container RETIRES a stale beat (it asks the clock, every poll)", () => {
    beat(slainEv(), BOSS_SETTLEMENT_MS + BOSS_EXIT_MS + 500);
    expect(renderOverlay()).toBe("");
    beat(slainEv(), 0);
    expect(visibleText(renderOverlay())).toContain(BOSS_SETTLEMENT_TITLE);
  });

  it("combat ONLY — a live beat paints in no other phase", () => {
    // ⚠️ THE MUTATION: drop `phase !== "combat"` from the gate. Each phase below
    // is a screen the leftover panel would float over.
    for (const phase of ["connecting", "champSelect", "intermission", "resolution", "matchEnd"]) {
      inCombat({ phase });
      beat(slainEv());
      expect(renderOverlay(), `phase=${phase}`).toBe("");
    }
    inCombat({ phase: "combat" });
    beat(slainEv());
    expect(visibleText(renderOverlay())).toContain(BOSS_SETTLEMENT_TITLE);
  });

  it("split-screen gets nothing — ONE centred panel cannot serve four seats", () => {
    inCombat({ localPlayers: [localPlayer(2), localPlayer(3)] });
    beat(slainEv());
    expect(renderOverlay()).toBe("");
    inCombat({ localPlayers: [localPlayer(2)] });
    beat(slainEv());
    expect(visibleText(renderOverlay())).toContain(BOSS_SETTLEMENT_TITLE);
  });

  it("a SPECTATOR still sees the sheet — it is not seat-gated", () => {
    // Deliberate, and the opposite of the 連殺 counter's rule: the king is a
    // world event and the payout sheet belongs to everyone on it.
    inCombat({ localSeatId: 9, localPlayers: [localPlayer(9)] });
    beat(slainEv());
    const text = visibleText(renderOverlay());
    expect(text).toContain(BOSS_SETTLEMENT_TITLE);
    expect(text).toContain("1500 金");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑥ THE TWO SOUNDS  (the owner asked for these by LENGTH)
 * ═══════════════════════════════════════════════════════════════════════════ */

const REPO = join(__dirname, "..", "..", "..", "..", "..");

describe("the cues", () => {
  beforeEach(() => {
    inCombat();
    setCombatSfxSeat(2);
  });

  it("both are bound in the audio map to a file that EXISTS", () => {
    const map = JSON.parse(
      readFileSync(join(REPO, "content", "config", "audio-map.json"), "utf8"),
    ) as { sfx: Record<string, { files: string[] }> };
    for (const key of ["bossHorror", "bossJackpot"]) {
      const entry = map.sfx[key];
      expect(entry, `${key} missing from audio-map.json`).toBeTruthy();
      for (const f of entry!.files) {
        // an audio-map entry pointing at nothing is a silent 404, not an error
        expect(readFileSync(join(REPO, "content", f)).length, f).toBeGreaterThan(1000);
      }
    }
  });

  it("`combatSfxKey` — the function GameApp calls — voices both", () => {
    // ⑤: not a private helper, the shipped mapper, with the real store behind it.
    expect(combatSfxKey(spawnEv() as never)).toBe("bossHorror");
    expect(combatSfxKey(slainEv() as never)).toBe("bossJackpot");
  });

  it("the horror drone does NOT haunt the other arena", () => {
    // ⚠️ THE MUTATION: drop the zone test from `bossHorrorKey`. Six players who
    // cannot see the king, cannot fight it and will never be paid by it get a
    // 4.4 s dread cue for nothing.
    expect(bossHorrorKey(spawnEv() as never, 0)).toBe("bossHorror");
    expect(bossHorrorKey(spawnEv({ zone: 3 }) as never, 0)).toBeNull();
    // …but an UNRESOLVABLE zone plays rather than silences: a headline warning
    // must never be lost to a missing lookup.
    expect(bossHorrorKey(spawnEv({ zone: 3 }) as never, -1)).toBe("bossHorror");
    expect(bossHorrorKey({ type: MOB_BOSS_SPAWN_EVENT, tick: 1, data: {} } as never, 0)).toBe("bossHorror");
  });

  it("the 中獎 fanfare plays only for people who were actually PAID", () => {
    // ⚠️ THE MUTATION: return "bossJackpot" unconditionally. Every client in the
    // match celebrates a prize one of them got.
    expect(bossJackpotKey(slainEv() as never, 2)).toBe("bossJackpot");
    expect(bossJackpotKey(slainEv() as never, 5)).toBe("bossJackpot");
    expect(bossJackpotKey(slainEv() as never, 9)).toBeNull(); // not on the sheet
    expect(bossJackpotKey(slainEv() as never, null)).toBeNull(); // no seat
    // a zero payout is not a jackpot
    const zero = slainEv({ shares: [{ id: 102, seatId: 2, damage: 0, gold: 0, xp: 0, lastHit: true }] });
    expect(bossJackpotKey(zero as never, 2)).toBeNull();
    expect(bossJackpotKey(slainEv({ shares: "nope" }) as never, 2)).toBeNull();
  });

  it("both are SCENE-PRELOADED with combat, never cold-fetched mid-fight (#63)", () => {
    // ⚠️ THE MUTATION: delete them from COMBAT_SFX. The clips still play — with
    // a cold fetch at the exact instant the warning was supposed to land, which
    // is #93's 烤雞煙火 bug. Asserted on the SHIPPED manifest, both scenes.
    expect(SFX_BY_SCENE.combat).toContain("bossHorror");
    expect(SFX_BY_SCENE.combat).toContain("bossJackpot");
    expect(SFX_BY_SCENE.fireRing).toContain("bossHorror");
    expect(SFX_BY_SCENE.fireRing).toContain("bossJackpot");
    // …and NOT at boot: they must not have leaked into another scene's set
    expect(SFX_BY_SCENE.menu).not.toContain("bossHorror");
    expect(SFX_BY_SCENE.lobby).not.toContain("bossJackpot");
  });

  it("each event is spatially CLASSIFIED — placed or centred, never defaulted", () => {
    // The spawn is placed (its x/z is the direction you have to run away from);
    // the payout is centred (the king's entity is already destroyed).
    expect(EVENT_SPATIAL[MOB_BOSS_SPAWN_EVENT]).toBeTruthy();
    expect(EVENT_SPATIAL[MOB_BOSS_SPAWN_EVENT]!.cls).toBe("focus");
    expect(CENTRED_EVENTS[MOB_BOSS_SLAIN_EVENT]).toBeTruthy();
    expect(EVENT_SPATIAL[MOB_BOSS_SLAIN_EVENT]).toBeUndefined();
    expect(CENTRED_EVENTS[MOB_BOSS_SPAWN_EVENT]).toBeUndefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑦ THE OTHER ARENA  (verifier pass — the sound was gated, the PICTURE was not)
 *
 * Both king events are fanned out to EVERY client in the match. Exactly one
 * duel zone ever fought the king. `bossHorrorKey` has always refused to play the
 * dread drone into the other arena's ears — 「there the wrong SEAT heard it, here
 * the wrong ARENA would」 — but until this pass the banner and the settlement
 * sheet had no such gate, so six players in arena B lost their 連殺 counter and a
 * strip of centre corridor to 12.8 s of SILENT announcement about a monster they
 * could not see, could not fight and were never paid by.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("only YOUR arena's king reaches your screen", () => {
  beforeEach(() => inCombat()); // seat 2, zone 0

  it("the PURE gate hides a definite mismatch and NOTHING else", () => {
    const here = parseMobBossEvent(spawnEv({ zone: 0 }), 2, 0, 1)!;
    const there = parseMobBossEvent(spawnEv({ zone: 3 }), 2, 0, 1)!;
    expect(bossVisibleInZone(here, 0)).toBe(true);
    expect(bossVisibleInZone(there, 0)).toBe(false);
    // FAILS OPEN on either side being unknown: -1 is 「不知道」, not 「不同區」. A
    // dead or spectating player has no live entity and therefore no zone, and
    // silencing the one panel that explains the money over a missing lookup is
    // strictly worse than showing it. Same ruling `bossHorrorKey` already made.
    expect(bossVisibleInZone(there, -1)).toBe(true);
    expect(bossVisibleInZone(parseMobBossEvent(spawnEv({ zone: "x" }), 2, 0, 1)!, 0)).toBe(true);
    expect(bossVisibleInZone(null, 0)).toBe(false);
  });

  it("THE MOUNTED HUD: another arena's 降臨 paints nothing here", () => {
    // ⚠️ THE MUTATION: delete the `bossVisibleInZone` line from the container.
    // Asserted on the shipped <HudRoot /> output in BOTH directions, so
    // 「gate everything off」 cannot pass either.
    beat(spawnEv({ zone: 3 }));
    expect(renderHud()).not.toContain("data-mob-boss");
    beat(spawnEv({ zone: 0 }));
    expect(visibleText(renderHud())).toContain(BOSS_BANNER_TITLE);
  });

  it("…and the SETTLEMENT inherits the zone its own spawn carried", () => {
    // `mobBossSlain` cannot carry a zone — by the time MobSystem.settleBoss runs
    // the king's entity is destroyed, which is why the payload has no x/z either
    // (combatSfxSpatial's CENTRED_EVENTS note says exactly this). So the store
    // borrows it from the matching spawn, by entity id. Without the inheritance
    // the sheet is the HALF THAT STAYS UNGATED and the other arena still gets
    // 8.2 s of somebody else's money.
    beat(spawnEv({ id: 77, zone: 3 }));
    beat(slainEv({ id: 77 }));
    expect(hudStore.getState().mobBoss!.zone).toBe(3);
    expect(renderHud()).not.toContain("data-mob-boss");
    // …and the king that WAS ours still settles on our screen
    beat(spawnEv({ id: 78, zone: 0 }));
    beat(slainEv({ id: 78 }));
    expect(hudStore.getState().mobBoss!.zone).toBe(0);
    expect(visibleText(renderHud())).toContain(BOSS_SETTLEMENT_TITLE);
  });

  it("a DIFFERENT king's spawn does not lend its zone to this settlement", () => {
    // The inheritance is keyed on the entity id, not on 「whatever was in the
    // slot」 — otherwise arena A's spawn would launder arena B's payout sheet
    // onto this screen. Unknown ⇒ fail open, as everywhere else.
    beat(spawnEv({ id: 77, zone: 0 }));
    beat(slainEv({ id: 999 }));
    expect(hudStore.getState().mobBoss!.zone).toBe(-1);
    expect(renderHud()).toContain('data-mob-boss="settlement"');
  });

  it("THE 連殺 COUNTER DOES NOT YIELD to a king in the other arena", () => {
    // ⚠️ The half of this defect that costs a player something even though he
    // never sees the banner: `KillCombo` yielded to ANY live boss beat. On an
    // 812x375 landscape phone the corridor holds ONE of them, so the yield does
    // not nudge the counter — it DELETES it. Rendered from the shipped
    // component, and asserted in both directions so 「never yield」 fails too.
    inCombat({ localSeatId: 2, killCombo: { count: 5, atMs: comboNowMs(), seq: 1 } });
    atViewport(812, 375, () => {
      expect(renderCombo(), "no counter to begin with — the fixture is stale").not.toBe("");
      recordMobBossEvent(spawnEv({ zone: 3 }), comboNowMs());
      expect(renderCombo(), "the other arena's king ate this player's 連殺").not.toBe("");
      // …and OUR king really does take the corridor (so this is not 「never yield」)
      recordMobBossEvent(spawnEv({ zone: 0 }), comboNowMs());
      expect(renderCombo()).toBe("");
    });
  });

  it("a king that EXPIRED minutes ago stops costing the counter its place", () => {
    // ⚠️ THE MUTATION: `mobBossOverlayRect(boss, …)` instead of
    // `mobBossOverlayRect(bossUp ? boss : null, …)`. The banner is long gone
    // from the screen; its ghost would go on suppressing the counter for the
    // rest of the match, and nothing noticed.
    inCombat({ localSeatId: 2, killCombo: { count: 5, atMs: comboNowMs(), seq: 1 } });
    atViewport(812, 375, () => {
      beat(spawnEv({ zone: 0 }), BOSS_BANNER_MS + BOSS_EXIT_MS + 5000);
      expect(renderCombo(), "a long-dead king still owns the corridor").not.toBe("");
      beat(spawnEv({ zone: 0 }), 0);
      expect(renderCombo()).toBe(""); // …and a LIVE one still does take it
    });
  });

  it("ONE definition of 「我在哪個競技場」 — the cue and the screen read it", () => {
    // ⚠️ THE MUTATION: make `localDuelZone` return a constant. Nothing used to
    // notice, because every zone assertion passed the number in BY HAND — the
    // STORE→GATE wiring was never exercised, so the whole zone rule could have
    // been dead in the shipped build and every test stayed green.
    expect(localDuelZone()).toBe(0);
    expect(sfxLocalDuelZone()).toBe(localDuelZone()); // the audio reads the same one
    inCombat({ seats: [seatView(2, "你", 3)] });
    expect(localDuelZone()).toBe(3);
    expect(combatSfxKey(spawnEv({ zone: 0 }) as never)).toBeNull(); // other arena ⇒ silent
    expect(combatSfxKey(spawnEv({ zone: 3 }) as never)).toBe("bossHorror");
    // no seat / no live entity ⇒ 「不知道」, never a confident 0
    inCombat({ localSeatId: null });
    expect(localDuelZone()).toBe(-1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑧ THE PHONE  (verifier pass — the compact layout was MODEL-tested only)
 *
 * `bossSettlementLayout` was proven to CHOOSE compact correctly. Nothing ever
 * RENDERED it. Four separate mutations of the shipped compact markup — dropping
 * the 「另有 N 名」 line, blanking the one-line rule, feeding the container a null
 * local seat, and negotiating the table against 9999px instead of the box that
 * was actually drawn — each left all 4,158 client tests green. On a landscape
 * phone the compact sheet is the ONLY settlement that exists.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("the phone really gets the compact sheet", () => {
  const atPhone = (fn: () => void): void => atViewport(812, 375, fn);

  beforeEach(() => inCombat());

  it("the corridor really is too short for the full table here", () => {
    // The premise, asserted rather than assumed: if a phone ever fits the full
    // sheet, the test below silently stops testing compact at all.
    const vp = { width: 812, height: 375 };
    const view = parseMobBossEvent(slainEv(), 5, 0, 1)!;
    expect(mobBossOverlayRect(view, vp, { touch: true, legendUp: false })!.h).toBe(BOSS_COMPACT_H);
    expect(BOSS_COMPACT_H).toBeLessThan(bossFullHeight(3));
  });

  it("compact, YOUR row, the count of the rest, and the RULE — as painted text", () => {
    // ⚠️ FOUR SURVIVING MUTATIONS DIE HERE:
    //   • the container passing `null` instead of `localSeatId` (your row → 阿明's)
    //   • the container negotiating against 9999px instead of `rect.h` (a full
    //     6-row table stuffed into a 72px box → `overflow:hidden` eats your row)
    //   • `{layout.hiddenCount > 0 ? … }` never rendering
    //   • the compact branch rendering "" instead of `bossRuleNoteShort`
    //
    // THE READER IS SEAT 5 — the LOWEST damager, so 「your row」 and 「the top
    // row」 are different rows and a silent fallback to `sorted[0]` cannot pass.
    inCombat({ localSeatId: 5, localPlayers: [localPlayer(5)] });
    beat(slainEv());
    atPhone(() => {
      const html = renderOverlay();
      const text = visibleText(html);
      expect(html).toContain('data-mob-boss-mode="compact"');
      expect(text).toContain("小華"); // seat 5 = the reader, damage 1000 = LAST
      expect(text).toContain("750 金");
      expect(text).not.toContain("阿明"); // …and everyone else really is dropped
      expect(text).toContain("另有 2 名參戰者");
      // the rule survives the shrink — a phone player who did half the damage and
      // got less than half still has to be told WHY, and told the TRUE version
      expect(text).toContain("補刀者多領一份自己的份額（×2）");
      expect(text).toContain("超出獎金池");
      expect(text).not.toContain("固定");
      expect(text).toContain("總獎金 3000 金");
      // and the box the text lives in is the compact one, not a clipped full one
      expect(html).toContain(`height:${BOSS_COMPACT_H}px`);
    });
  });

  it("the phone's 降臨 banner paints its summon line too", () => {
    beat(spawnEv());
    atPhone(() => {
      const text = visibleText(renderOverlay());
      expect(text).toContain(BOSS_BANNER_TITLE);
      expect(text).toContain("你累積擊殺 100 隻殭屍");
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑨ TWO CLIENTS, ONE SHEET  (verifier pass)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("the sheet reads the same on every screen", () => {
  it("equal damage AND equal gold still order deterministically, by seat", () => {
    // ⚠️ THE MUTATION: drop the `a.seatId - b.seatId` tie-break. `Array.sort` is
    // stable only with respect to the INPUT order, and the input order is the
    // sim's ascending ENTITY id — which is not the same list order on two
    // clients. Two players comparing screens mid-fight would see the same money
    // in a different order and read it as a desync.
    const tied = parseMobBossEvent(
      slainEv({
        shares: [
          { id: 105, seatId: 5, damage: 1000, gold: 500, xp: 200, lastHit: false },
          { id: 101, seatId: 1, damage: 1000, gold: 500, xp: 200, lastHit: false },
          { id: 102, seatId: 2, damage: 1000, gold: 500, xp: 200, lastHit: false },
        ],
      }),
      2,
      0,
      1,
    )!;
    expect(bossSortedShares(tied.shares).map((s) => s.seatId)).toEqual([1, 2, 5]);
    // …and reversing the arrival order cannot change the answer
    const rev = { ...tied, shares: [...tied.shares].reverse() };
    expect(bossSortedShares(rev.shares).map((s) => s.seatId)).toEqual([1, 2, 5]);
  });

  it("chrome that STRADDLES the centre line means null, not paint-over-it", () => {
    // ⚠️ THE MUTATION: turn `return null` into `continue` in `mobBossRect`'s
    // side scan. EVERY existing placement test passes `legendUp: false` on a
    // LANDSCAPE viewport, and under that combination nothing ever crosses the
    // middle inside the banner's y-band — so the whole straddle branch was
    // unreachable from the suite and could have been deleted in silence.
    //
    // MEASURED, by sweeping w∈[240,1200] × h∈[260,900] × touch × legendUp and
    // comparing the shipped function against a hand-rolled `continue` variant:
    // the branch changes the answer on PORTRAIT windows 240-398px wide while
    // the round-1 legend is up — i.e. a phone held upright, where the minimap
    // and the equipment bar are wide enough to cross the centre line. 390x868
    // is an iPhone in portrait, and there the mutant paints the banner straight
    // over BOTH of them; the shipped code draws nothing, which is the rule.
    const vp = { width: 390, height: 868 };
    const opts = { touch: false, legendUp: true, couchPlayers: 1, wantH: 74, minH: 52 };
    expect(mobBossRect(vp, opts)).toBeNull();
    expect(mobBossCollisions(vp, opts)).toEqual([]);
    // …and this is not 「just return null more often」: on a window with a real
    // centred gap the banner still lands, legend up and all.
    const wide = { width: 1920, height: 1080 };
    const r = mobBossRect(wide, opts);
    expect(r, "the bail-out swallowed a placement that had room").not.toBeNull();
    expect(hudRectInViewport(r!, wide)).toBe(true);
    expect(mobBossCollisions(wide, opts)).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑩ GH#206 — 分紅面板不能再說「總額固定」
 *
 * WHAT WENT WRONG. GH#206 changed `boss.lastHitMode` to `"bonus"` by default:
 * the last hitter is now paid their proportional share AND ONE EXTRA COPY OF
 * IT, so the money handed out EXCEEDS the configured pool (200% when one
 * champion did all the damage and landed the blow). `sim/mobBoss.ts` and
 * `MobSystem.payBossBounty` shipped that on main. THE CLIENT DID NOT MOVE. The
 * settlement panel kept printing 「所以總獎金固定，不會因為誰補到最後一刀而變
 * 多」 — directly underneath a total that had just exceeded the pool — and kept
 * ranking the payout sheet by DAMAGE, which since GH#206 is not the same order
 * as by MONEY. Neither is a stale comment; both are false statements about the
 * player's money, printed on the player's screen.
 *
 * WHY THESE GUARDS READ THE RENDERED STRING. The trap here is the one
 * `mobTint.test.ts` records in its own header: assert against the thing the
 * function was HANDED and the assertion passes whether or not the change
 * reached what is actually drawn. The sim-side arithmetic already has its own
 * suite (`sim/mobBossBonus.test.ts`); nothing below re-tests it. Every
 * assertion here comes off `renderToStaticMarkup` output run through
 * `visibleText`, i.e. the characters a browser would paint — so 「the model
 * computed 60,000」 cannot stand in for 「the panel said 60,000」.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The visible text of each settlement ROW, in painted order.
 *
 * Splitting on the row marker means each slice holds exactly one row's markup
 * (the next marker starts the next slice), so `rows[0]` really is the top line
 * of the sheet — an ordering claim that `visibleText(whole panel)` could only
 * answer by substring arithmetic.
 */
function settlementRows(html: string): string[] {
  return html
    .split('data-mob-boss="row"')
    .slice(1)
    .map((seg) => visibleText(seg));
}

describe("the payout panel tells the truth about GH#206 「bonus」 mode", () => {
  beforeEach(() => inCombat());

  /**
   * 200%: seat 2 (you) did ALL 12,000 damage AND landed the blow, so a
   * CONFIGURED POOL OF 30,000 PAID OUT 60,000 — the owner's own worked example
   * (「極端情形第一刀就是最後一刀全傷害 = 200% 金錢跟等級獎勵」).
   */
  const jackpotEv = () =>
    slainEv({
      killerSeatId: 2,
      killer: 102,
      totalGold: 60000,
      totalXp: 24000,
      totalLevels: 6,
      lastHitMode: "bonus",
      shares: [
        { id: 102, seatId: 2, damage: 12000, gold: 60000, xp: 24000, levels: 6, lastHit: true },
      ],
    });

  it("實發 60,000 / 設定池 30,000 → 面板印出 60,000", () => {
    // ⚠️ THE MUTATIONS THIS KILLS, both of which reproduce the configured pool
    // on screen while every sim test stays green:
    //   • `bossTotalLine` dividing by `lastHitMultiplier` ("de-doubling" the
    //     total so it 「matches the pool」) → 30000
    //   • the panel summing anything other than the paid total → not 60000
    // The pool 30,000 never crosses the wire, so the assertion that it is ABSENT
    // is the observable form of 「the panel is not quoting the config」.
    beat(jackpotEv());
    const text = visibleText(renderHud());
    expect(text).toContain("總獎金 60000 金");
    expect(text).toContain("24000 經驗");
    expect(text).not.toContain("30000");
    // …and the row agrees with the header, or the sheet contradicts itself
    expect(settlementRows(renderOverlay())[0]).toContain("60000 金");
  });

  it("bonus 模式的文案不含「總額固定」這類保證，weight 模式仍然要有", () => {
    // ⚠️ FAILURE SHAPE ④ IN BOTH DIRECTIONS. Asserting only 「the bonus sentence
    // appears」 would stay green if BOTH sentences were printed; asserting only
    // 「the weight sentence is gone」 would stay green if the note were blanked.
    // So: the false promise must be absent from a bonus sheet, the true one must
    // be present on a weight sheet, and each sheet must still explain itself.
    beat(jackpotEv());
    const bonus = visibleText(renderOverlay());
    expect(bonus).not.toContain("固定");
    expect(bonus).toContain("再多領一份自己的份額");
    expect(bonus).toContain("超出原本的獎金池");

    resetHudStore();
    inCombat();
    beat(slainEv({ lastHitMode: "weight" }));
    const weight = visibleText(renderOverlay());
    expect(weight).toContain("總獎金固定");
    expect(weight).toContain("×2 權重");
    expect(weight).not.toContain("超出");
  });

  it("排序：傷害最低但拿最多的人排在第一列", () => {
    // A REAL bonus split: pool 10,000 over damage 4000 / 3500 / 2500 pays
    // 4000 / 3500 / 2500, then the last hitter's own 2,500 is paid again → 5,000.
    // So seat 5 has the LOWEST damage and the HIGHEST payout, and 12,500 was
    // handed out of a 10,000 pool.
    //
    // ⚠️ THE MUTATION: put `b.damage - a.damage` back in front of the gold
    // comparator. The old order for this sheet is [1, 2, 5] — the biggest EARNER
    // last, on a panel whose only job is to say who got paid what. Asserting the
    // PAINTED first row (not `bossSortedShares`) is what makes the claim about
    // the sheet rather than about the comparator.
    const inverted = slainEv({
      killerSeatId: 5,
      totalGold: 12500,
      totalXp: 5000,
      shares: [
        { id: 101, seatId: 1, damage: 4000, gold: 4000, xp: 1600, levels: 0, lastHit: false },
        { id: 102, seatId: 2, damage: 3500, gold: 3500, xp: 1400, levels: 0, lastHit: false },
        { id: 105, seatId: 5, damage: 2500, gold: 5000, xp: 2000, levels: 0, lastHit: true },
      ],
    });
    expect(bossSortedShares(parseMobBossEvent(inverted, 2, 0, 1)!.shares).map((s) => s.seatId)).toEqual(
      [5, 1, 2],
    );

    beat(inverted);
    const rows = settlementRows(renderOverlay());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("小華"); // seat 5 — least damage, most gold
    expect(rows[0]).toContain("5000 金");
    expect(rows[0]).toContain(BOSS_LAST_HIT_TAG);
    expect(rows[0]).not.toContain("阿明"); // the top DAMAGER is not the top row
    expect(rows[1]).toContain("阿明");
    expect(rows[2]).toContain("你");
  });

  it("等級欄：發出去的等級要印出來，沒發就一個「等」字都不准出現", () => {
    // ⚠️ BOTH DIRECTIONS, because 「render nothing」 passes any one-sided version
    // of this test. `totalLevels` / `shares[].levels` reach the client only since
    // v0.9.12; before that GH#206's 等級 reward was invisible to the player it
    // was granted to.
    beat(
      slainEv({
        totalLevels: 5,
        shares: [
          { id: 101, seatId: 1, damage: 2000, gold: 750, xp: 300, levels: 1, lastHit: false },
          { id: 105, seatId: 5, damage: 1000, gold: 1500, xp: 600, levels: 4, lastHit: true },
        ],
      }),
    );
    const paid = renderOverlay();
    expect(visibleText(paid)).toContain("總獎金 3000 金 · 1200 經驗 · 5 等");
    const rows = settlementRows(paid);
    expect(rows[0]).toContain("+4 等"); // seat 5 leads on gold and carries 4 levels
    expect(rows[1]).toContain("+1 等");

    // …and the common config — no 等級 bounty at all — paints no 等 anywhere,
    // header or row. (The rule sentence deliberately avoids the character; see
    // BOSS_RULE_NOTE_BONUS.)
    resetHudStore();
    inCombat();
    beat(slainEv());
    expect(visibleText(renderOverlay())).not.toContain("等");
  });
});

/**
 * audio-combat-bed-phase-gate (task #238) — 「#216 只修一半：火圈聲音仍會播進商店」.
 *
 * #216 gave sustained beds a STOP path and hung it on the `isCombatEnd` React
 * edge. This suite is about the hole that left: a bed that STARTS after that
 * edge has already fired. The combat-SFX mapper runs on the GameApp's
 * requestAnimationFrame drain, not on React's commit, so a `fireRingStart` still
 * sitting in the event queue when the phase flipped used to light a ~60 s
 * burning-fire bed with the round already over — and the teardown edge, being an
 * edge, was spent. The defeated player then sat in the shop listening to it.
 *
 * THE POINT OF THE INTEGRATION BLOCK BELOW: it does NOT assert on a boolean or
 * poke `phase` in by hand. It drives a REAL phase transition through
 * `syncHudFromState` — the same projection the network layer calls with the
 * server's MatchState — and then asserts SILENCE from the real
 * `combatSfxKey(event)` the GameApp calls. A regression that re-opened the gate
 * would have to make that whole path audible again to pass.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { hudStore, resetHudStore, syncHudFromState } from "../net/RoomStore";
import { SFX_LOOPABLE } from "./sfxManifest";
import { combatSfxKey } from "./combatSfx";
import {
  COMBAT_ONLY_BEDS,
  COMBAT_PHASE,
  gateCombatBed,
  isCombatOnlyBed,
} from "./combatBedGate";

const ev = (type: string, data: Record<string, unknown> = {}): EventMessage => ({
  type,
  tick: 0,
  data,
});

/**
 * Structural stand-in for the reflected Colyseus MatchState, shaped like the one
 * `RoomStore.couch.test.ts` uses. Only the fields `syncHudFromState` reads for a
 * phase projection are populated — the seat/entity maps stay empty, which is
 * exactly a spectating (defeated) client's view.
 */
function stateAt(phase: string, phaseTicksLeft: number): MatchState {
  return {
    matchId: "m_238",
    phase,
    round: 3,
    tick: 5_400,
    phaseTicksLeft,
    seed: 1,
    seats: new Map(),
    entities: new Map(),
    teams: [],
  } as unknown as MatchState;
}

beforeEach(() => resetHudStore());

describe("combat-only sustained beds: the phase gate (audio-combat-bed-phase-gate)", () => {
  it("gates exactly the combat-scoped beds, and lets everything else through", () => {
    cover("audio-combat-bed-phase-gate");
    // The three beds that belong to the fight and nowhere else.
    expect(isCombatOnlyBed("fireRingLoop")).toBe(true);
    expect(isCombatOnlyBed("arenaAmbience")).toBe(true);
    expect(isCombatOnlyBed("reviveChannel")).toBe(true);

    // The OTHER sustained beds are out-of-combat by design; gating them on
    // combat would invert them (the market bed must play in the shop).
    expect(isCombatOnlyBed("merchantAmbience")).toBe(false);
    expect(isCombatOnlyBed("legendaryRoll")).toBe(false);

    // Every combat-only bed really is a tracked sustained voice — otherwise
    // `stopSustainedSfx` could not stop it and this gate would be the only
    // defence, which is not the design.
    for (const bed of COMBAT_ONLY_BEDS) {
      expect(SFX_LOOPABLE.has(bed)).toBe(true);
    }
  });

  it("passes transients through in EVERY phase — this is not a blanket mute", () => {
    cover("audio-combat-bed-phase-gate");
    for (const phase of ["combat", "resolution", "intermission", "matchEnd", "champSelect"]) {
      expect(gateCombatBed("hit", phase)).toBe("hit");
      expect(gateCombatBed("crowdCheer", phase)).toBe("crowdCheer");
      expect(gateCombatBed("coinDrop", phase)).toBe("coinDrop");
    }
    // null in, null out (the mapper's "silence" answer survives the gate).
    expect(gateCombatBed(null, COMBAT_PHASE)).toBeNull();
  });

  it("admits a combat bed ONLY in combat", () => {
    cover("audio-combat-bed-phase-gate");
    expect(gateCombatBed("fireRingLoop", "combat")).toBe("fireRingLoop");
    for (const phase of ["resolution", "intermission", "matchEnd", "champSelect", "connecting"]) {
      expect(gateCombatBed("fireRingLoop", phase)).toBeNull();
      expect(gateCombatBed("reviveChannel", phase)).toBeNull();
    }
  });
});

describe("#238 regression: a real phase transition silences the ring bed", () => {
  it("burns during combat, then goes SILENT once the server moves the match to the shop", () => {
    cover("audio-combat-bed-phase-gate");

    // ── 1. A live round, ring ignited. The bed is the correct answer here. ──
    syncHudFromState(stateAt("combat", 30 * 30), "acct-defeated");
    expect(hudStore.getState().phase).toBe("combat");
    expect(combatSfxKey(ev("fireRingStart", { atTick: 5_400 }))).toBe("fireRingLoop");

    // ── 2. The bell. The REAL transition the server drives: combat → resolution
    //       → intermission (the shop). The defeated player is carried through it
    //       exactly like everyone else. ────────────────────────────────────────
    syncHudFromState(stateAt("resolution", 5 * 30), "acct-defeated");
    expect(hudStore.getState().phase).toBe("resolution");

    // A straggler `fireRingStart` drained on the rAF frame AFTER the phase
    // committed — the precise ordering #216's teardown edge cannot catch,
    // because that edge has already fired by now. This MUST be silence.
    expect(combatSfxKey(ev("fireRingStart", { atTick: 5_401 }))).toBeNull();

    // ── 3. The shop itself, where the owner actually heard it. ──────────────
    syncHudFromState(stateAt("intermission", 45 * 30), "acct-defeated");
    expect(hudStore.getState().phase).toBe("intermission");
    expect(combatSfxKey(ev("fireRingStart", { atTick: 5_500 }))).toBeNull();
    // …and the revive channel, the other combat-scoped bed on the same path.
    expect(combatSfxKey(ev("reviveChannel", { id: 7 }))).toBeNull();

    // ── 4. Transients on the SAME path are untouched — the gate drops beds,
    //       not "combat audio". `coinDropped` is the unconditional world cue. ─
    expect(combatSfxKey(ev("coinDropped", { id: 7, amount: 100 }))).toBe("coinDrop");
    expect(combatSfxKey(ev("damage", { amount: 30, dmgType: "magic" }))).toBe("hitMagic");

    // ── 5. Next round starts: the bed is allowed again. A gate that latched
    //       shut would be just as broken as one that never closed. ───────────
    syncHudFromState(stateAt("combat", 30 * 30), "acct-defeated");
    expect(combatSfxKey(ev("fireRingStart", { atTick: 9_000 }))).toBe("fireRingLoop");
  });

  it("stays silent through matchEnd — a knocked-out player's settlement is quiet", () => {
    cover("audio-combat-bed-phase-gate");
    // 30 s left = the NO_RING_FALLBACK_SEC window this test env derives (no
    // content tree is booted here), so the #132 drift tripwire stays quiet and
    // this suite is not the thing that cries wolf about a drift it invented.
    syncHudFromState(stateAt("combat", 30 * 30), "acct-defeated");
    expect(combatSfxKey(ev("fireRingStart", { atTick: 100 }))).toBe("fireRingLoop");

    syncHudFromState(stateAt("matchEnd", 0), "acct-defeated");
    expect(hudStore.getState().phase).toBe("matchEnd");
    expect(combatSfxKey(ev("fireRingStart", { atTick: 101 }))).toBeNull();
  });
});

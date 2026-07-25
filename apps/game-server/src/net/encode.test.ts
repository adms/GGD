/**
 * Regression: the schema must actually ENCODE (match-13). With ES2022
 * [[Define]] class-field semantics, initializers shadow @colyseus/schema's
 * tracking accessors and the encoder throws the moment a client joins — the
 * unit tests all passed while the live server crashed. This test encodes a
 * fully-projected MatchState exactly like the transport does, then decodes it
 * into a fresh instance and checks round-tripped values.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { Encoder, Decoder } from "@colyseus/schema";
import { MatchState } from "@ggd/shared/protocol/schema";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };

describe("schema encode regression (match-13)", () => {
  it("encodes and decodes a projected MatchState", () => {
    cover("schema-encode");
    const ctl = new MatchController(
      "enc",
      42,
      Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
      FAST,
    );
    while (ctl.phase.phase !== "combat") ctl.tick();
    for (let i = 0; i < 30; i++) ctl.tick();

    const state = new MatchState();
    const encoder = new Encoder(state);
    projectSnapshot(ctl, state, new Map());

    // full encode (what the transport does on client join)
    const full = encoder.encodeAll();
    expect(full.byteLength).toBeGreaterThan(100);

    // decode into a fresh state — proves tracking accessors were live
    const decoded = new MatchState();
    const decoder = new Decoder(decoded);
    decoder.decode(full);
    expect(decoded.phase).toBe("combat");
    expect(decoded.seats.size).toBe(12);
    expect(decoded.teams.length).toBe(4);
    let champs = 0;
    decoded.entities.forEach((e) => {
      if (e.kind === 0) champs++;
    });
    expect(champs).toBe(12);

    // incremental patch after more ticks encodes too
    for (let i = 0; i < 10; i++) ctl.tick();
    projectSnapshot(ctl, state, new Map());
    const patch = encoder.encode();
    expect(patch.byteLength).toBeGreaterThan(0);
    decoder.decode(patch);
    expect(decoded.tick).toBe(state.tick);
  });

  /**
   * The fire ring's two replicated fields (task #195) fall into exactly the trap
   * this file exists for: `declare` + a constructor assignment encodes, a class
   * FIELD INITIALIZER silently shadows the tracking accessor and the value is
   * simply never sent — the client would then draw a ring at radius 0 forever
   * with nothing to log.
   */
  it("encodes MatchState.fireRingTicks / fireRingRadius on join (the declare-and-assign trap)", () => {
    cover("schema-encode");
    const fireRing = {
      startSec: 0.2, // 6 ticks — armed and already shrinking well inside this test
      shrinkSec: 1,
      minRadius: 0.5,
      burnPctPerSecStart: 0.04,
      burnPctPerSecEnd: 0.2,
      maxPctPerSec: 1,
    };
    const ctl = new MatchController(
      "enc-ring",
      42,
      Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
      FAST,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      fireRing,
    );
    while (ctl.phase.phase !== "combat") ctl.tick();
    for (let i = 0; i < 20; i++) ctl.tick(); // past ignition, mid-shrink

    const state = new MatchState();
    const encoder = new Encoder(state);
    projectSnapshot(ctl, state, new Map());
    expect(state.fireRingTicks).toBeGreaterThan(0);
    expect(state.fireRingRadius).toBeLessThan(24); // it has actually moved

    const decoded = new MatchState();
    new Decoder(decoded).decode(encoder.encodeAll());
    expect(decoded.fireRingTicks).toBe(state.fireRingTicks);
    expect(decoded.fireRingRadius).toBeCloseTo(state.fireRingRadius, 4);
  });

  it("a match with NO ring encodes the disarmed sentinel, not a phantom ring", () => {
    cover("schema-encode");
    const ctl = new MatchController(
      "enc-noring",
      7,
      Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
      FAST,
    );
    while (ctl.phase.phase !== "combat") ctl.tick();
    const state = new MatchState();
    const encoder = new Encoder(state);
    projectSnapshot(ctl, state, new Map());
    const decoded = new MatchState();
    new Decoder(decoded).decode(encoder.encodeAll());
    // -1 = disarmed; the radius reads as the full zone boundary so a client that
    // renders it unconditionally draws the un-shrunk rim, not a hazard at 0.
    expect(decoded.fireRingTicks).toBe(-1);
    expect(decoded.fireRingRadius).toBe(24);
  });
});

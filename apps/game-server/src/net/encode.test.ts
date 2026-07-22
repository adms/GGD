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
});

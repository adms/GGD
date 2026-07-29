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
      // 殭屍王回合延長 (#L1)。`config.match@1` 的 fireRing.boss 帶 `.default()`,
      // 所以 Zod 的 OUTPUT 型別上它是必填 —— 這個 fixture 少了它就不是
      // FireRingConfig。值就是出貨預設 (content/config/config.match.json)。
      boss: { extendCombatSec: 180, delayFireRingSec: 180 },
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

  /**
   * 殭屍擊殺數 REACHES THE CLIENT (task #258).
   *
   * THE FAILURE THIS EXISTS FOR is the repo's second failure shape — 「算出來了
   * 但從來沒送到客戶端」 — and #258 was a live instance of it, not a hypothetical:
   * `world.mobKills` has driven a real mechanic since #215 (every 30th kill
   * grants a LEVEL), yet the ONLY path it ever took to a client was
   * `RoundStatDelta`, assembled at ROUND SETTLE for the settlement chart. There
   * was no field on the wire mid-combat, so no HUD could show it.
   *
   * So this asserts the whole lane end to end — the sim's own map, through
   * `projectSnapshot`, through a REAL encode/decode — rather than the
   * projection alone. Deleting `ss.mobKills = …` from snapshot.ts, or the
   * `defineTypes` entry, or shadowing the accessor with a class-field
   * initializer, each fail it.
   */
  it("SeatState.mobKills carries world.mobKills to the client", () => {
    cover("schema-encode");
    const ctl = new MatchController(
      "enc-mobkills",
      11,
      Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
      FAST,
    );
    while (ctl.phase.phase !== "combat") ctl.tick();
    ctl.tick();

    // Two seats with a champion, so the test also proves the number is PER SEAT
    // and not accidentally broadcast from one entity to everybody.
    const withEntity = [...ctl.seats.values()].filter((s) => s.entityId !== null);
    expect(withEntity.length).toBeGreaterThanOrEqual(2);
    const a = withEntity[0]!;
    const b = withEntity[1]!;
    // exactly what MobSystem's payout pass does on a mob death
    ctl.world.mobKills.set(a.entityId!, 37);
    ctl.world.mobKills.set(b.entityId!, 0);

    const state = new MatchState();
    const encoder = new Encoder(state);
    projectSnapshot(ctl, state, new Map());

    const decoded = new MatchState();
    new Decoder(decoded).decode(encoder.encodeAll());
    expect(decoded.seats.get(String(a.seatId))!.mobKills).toBe(37);
    expect(decoded.seats.get(String(b.seatId))!.mobKills).toBe(0);

    // …and it keeps arriving on INCREMENTAL patches, which is what makes it a
    // LIVE counter rather than a join-time snapshot.
    ctl.world.mobKills.set(a.entityId!, 38);
    ctl.tick();
    projectSnapshot(ctl, state, new Map());
    new Decoder(decoded).decode(encoder.encode());
    expect(decoded.seats.get(String(a.seatId))!.mobKills).toBe(38);

    // uint16, not uint8: 30 kills = 1 level and the path runs to LV99, so a
    // counter that silently wrapped at 255 would be worse than no counter.
    ctl.world.mobKills.set(a.entityId!, 700);
    ctl.tick();
    projectSnapshot(ctl, state, new Map());
    new Decoder(decoded).decode(encoder.encode());
    expect(decoded.seats.get(String(a.seatId))!.mobKills).toBe(700);
  });
});

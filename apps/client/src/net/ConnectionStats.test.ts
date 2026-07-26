/**
 * settings-perf: connection-quality classifier (pure) + the ping/jitter
 * estimator (input-ack RTT, snapshot-cadence jitter).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SNAPSHOT_MS } from "@ggd/shared/constants";
import {
  ConnectionStats,
  OFFLINE_SNAPSHOT_GAP_MS,
  classifyConnection,
} from "./ConnectionStats";

describe("connection classifier (settings-perf)", () => {
  it("maps ping + jitter (+ stale-snapshot guard) → good / fair / poor", () => {
    cover("connection-classifier");
    expect(classifyConnection({ pingMs: 40, jitterMs: 10, snapshotGapMs: 40 })).toBe("good");
    expect(classifyConnection({ pingMs: 60, jitterMs: 15, snapshotGapMs: 60 })).toBe("good");
    expect(classifyConnection({ pingMs: 100, jitterMs: 20, snapshotGapMs: 60 })).toBe("fair");
    expect(classifyConnection({ pingMs: 200, jitterMs: 10, snapshotGapMs: 60 })).toBe("poor");
    expect(classifyConnection({ pingMs: 40, jitterMs: 60, snapshotGapMs: 60 })).toBe("poor");
    // a long snapshot gap forces poor regardless of ping/jitter
    expect(classifyConnection({ pingMs: 20, jitterMs: 5, snapshotGapMs: 700 })).toBe("poor");
  });
});

describe("ping / jitter estimator (settings-perf)", () => {
  it("measures RTT from the input-ack delta", () => {
    cover("connection-ping");
    const cs = new ConnectionStats();
    cs.noteSent(5, 1000);
    cs.noteAck(5, 1080);
    expect(cs.pingMs).toBeCloseTo(80, 0);
    // a repeated ack (no advance) does not perturb the estimate
    cs.noteAck(5, 5000);
    expect(cs.pingMs).toBeCloseTo(80, 0);
  });

  it("derives jitter from snapshot inter-arrival deviation", () => {
    cover("connection-ping");
    const cs = new ConnectionStats();
    // Cadence-DERIVED, never the literal 50. A perfectly on-rate stream must
    // score exactly zero jitter at ANY snapshot rate; pinning this to 50 was
    // what let the nominal in ConnectionStats drift away from SNAPSHOT_MS.
    cs.noteSnapshot(0);
    cs.noteSnapshot(SNAPSHOT_MS); // on-cadence → 0 deviation
    expect(cs.jitterMs).toBeCloseTo(0, 5);
    cs.noteSnapshot(SNAPSHOT_MS * 3); // a doubled gap → non-zero deviation
    expect(cs.jitterMs).toBeGreaterThan(0);
    expect(cs.snapshotGapMs(SNAPSHOT_MS * 4)).toBeCloseTo(SNAPSHOT_MS, 5);
  });

  it("a perfectly on-cadence stream classifies as good (no phantom jitter)", () => {
    cover("connection-classifier");
    // REGRESSION GUARD. ConnectionStats used to compare gaps against a
    // hardcoded 50 ms. Against the 30 Hz (33.3 ms) broadcast that scored a
    // constant 16.7 ms of "jitter" on a flawless connection — permanently over
    // the 15 ms "good" threshold, so the quality chip would have read "fair"
    // forever with nothing actually wrong. Rate-agnostic by construction.
    const cs = new ConnectionStats();
    for (let i = 0; i <= 40; i++) cs.noteSnapshot(i * SNAPSHOT_MS);
    expect(cs.jitterMs).toBeCloseTo(0, 5);
    expect(cs.quality(40 * SNAPSHOT_MS)).toBe("good");
  });

  it("reports offline until the first snapshot arrives", () => {
    cover("connection-classifier");
    const cs = new ConnectionStats();
    expect(cs.quality(0)).toBe("offline");
    cs.noteSnapshot(0);
    cs.noteSnapshot(SNAPSHOT_MS);
    expect(cs.quality(SNAPSHOT_MS * 1.2)).toBe("good");
  });
});

describe("「慢」 and 「斷」 are distinguishable (conn-offline-vs-slow)", () => {
  it("a dead stream eventually reports offline, not a permanent poor", () => {
    cover("conn-offline-vs-slow");
    // THE DEFECT (task #272, plan acceptance 1-4「拔網路要能分辨『慢』與『斷』」).
    // quality() used to answer `offline` ONLY when it had never seen a snapshot.
    // Pull the cable mid-match and noteSnapshot simply stops being called, so
    // the gap grows without bound and the chip sat on `poor` forever — the same
    // reading as a bad-but-live connection.
    const cs = new ConnectionStats();
    cs.noteSnapshot(0);
    cs.noteSnapshot(SNAPSHOT_MS);
    expect(cs.quality(SNAPSHOT_MS + 200)).toBe("good");
    // a real hiccup: late, but alive
    expect(cs.quality(SNAPSHOT_MS + 700)).toBe("poor");
    // …and then nothing at all
    expect(cs.quality(SNAPSHOT_MS + OFFLINE_SNAPSHOT_GAP_MS + 1)).toBe("offline");
    // the boundary is a real threshold, not a coincidence of the ping value
    expect(classifyConnection({ pingMs: 20, jitterMs: 2, snapshotGapMs: 1999 })).toBe("poor");
    expect(classifyConnection({ pingMs: 20, jitterMs: 2, snapshotGapMs: 2001 })).toBe("offline");
    // 60 missed snapshots — well past any hiccup, well inside a stalled socket
    expect(OFFLINE_SNAPSHOT_GAP_MS / SNAPSHOT_MS).toBeCloseTo(60, 0);
  });

  it("a resumed stream recovers — offline is a state, not a latch", () => {
    cover("conn-offline-vs-slow");
    const cs = new ConnectionStats();
    cs.noteSnapshot(0);
    expect(cs.quality(5000)).toBe("offline");
    cs.noteSnapshot(5000);
    cs.noteSnapshot(5000 + SNAPSHOT_MS);
    expect(cs.quality(5000 + SNAPSHOT_MS + 10)).not.toBe("offline");
  });
});

describe("the ping carries its own provenance (ping-provenance)", () => {
  it("says how many samples it has and how old the last one is", () => {
    cover("ping-provenance");
    // Without this a UI cannot tell "0 ms, perfect" from "never measured", nor
    // "42 ms, live" from "42 ms, frozen since you stopped moving" — the two
    // lies an always-on ping chip is worst at telling.
    const cs = new ConnectionStats();
    let s = cs.sample(1000);
    expect(s.pingSamples).toBe(0);
    expect(s.pingAgeMs).toBe(Number.POSITIVE_INFINITY);
    expect(s.snapshots).toBe(0);
    expect(s.pingMs).toBe(0); // the value that must never be printed as-is

    cs.noteSent(1, 1000);
    cs.noteAck(1, 1080);
    s = cs.sample(1100);
    expect(s.pingSamples).toBe(1);
    expect(s.pingAgeMs).toBeCloseTo(20, 6);

    // the player stops issuing input: IntentSender sends nothing, the ack never
    // advances, the EMA is untouched — and the AGE is the only thing that moves.
    cs.noteAck(1, 9000); // repeated ack, no advance
    s = cs.sample(9000);
    expect(s.pingSamples).toBe(1);
    expect(s.pingMs).toBeCloseTo(80, 0);
    expect(s.pingAgeMs).toBeCloseTo(7920, 0);
  });

  it("counts snapshots, so 'no match at all' is distinguishable from 'bad match'", () => {
    cover("ping-provenance");
    const cs = new ConnectionStats();
    expect(cs.sample(0).snapshots).toBe(0);
    cs.noteSnapshot(0);
    cs.noteSnapshot(SNAPSHOT_MS);
    expect(cs.sample(SNAPSHOT_MS).snapshots).toBe(2);
  });

  it("reset() forgets everything — a new match never inherits the old one", () => {
    cover("ping-provenance");
    // perfBus is a process-global plain object and the chip is on the lobby too,
    // so a torn-down match that kept its counters would show 斷線 on the login
    // screen with an ever-growing gap.
    const cs = new ConnectionStats();
    cs.noteSent(7, 0);
    cs.noteAck(7, 50);
    cs.noteSnapshot(50);
    cs.reset();
    const s = cs.sample(10_000);
    expect(s.pingMs).toBe(0);
    expect(s.jitterMs).toBe(0);
    expect(s.pingSamples).toBe(0);
    expect(s.snapshots).toBe(0);
    expect(s.snapshotGapMs).toBe(0);
    expect(cs.quality(10_000)).toBe("offline");
    // and a fresh ack on the SAME seq still measures (lastAck was cleared)
    cs.noteSent(7, 10_000);
    cs.noteAck(7, 10_030);
    expect(cs.sample(10_030).pingSamples).toBe(1);
  });
});

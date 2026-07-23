/**
 * settings-perf: connection-quality classifier (pure) + the ping/jitter
 * estimator (input-ack RTT, snapshot-cadence jitter).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SNAPSHOT_MS } from "@ggd/shared/constants";
import { ConnectionStats, classifyConnection } from "./ConnectionStats";

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

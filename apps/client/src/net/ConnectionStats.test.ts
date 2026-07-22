/**
 * settings-perf: connection-quality classifier (pure) + the ping/jitter
 * estimator (input-ack RTT, snapshot-cadence jitter).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
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
    cs.noteSnapshot(0);
    cs.noteSnapshot(50); // on-cadence → 0 deviation
    expect(cs.jitterMs).toBeCloseTo(0, 5);
    cs.noteSnapshot(150); // 100ms gap → 50ms deviation from the 50ms nominal
    expect(cs.jitterMs).toBeGreaterThan(0);
    expect(cs.snapshotGapMs(200)).toBeCloseTo(50, 5);
  });

  it("reports offline until the first snapshot arrives", () => {
    cover("connection-classifier");
    const cs = new ConnectionStats();
    expect(cs.quality(0)).toBe("offline");
    cs.noteSnapshot(0);
    cs.noteSnapshot(50);
    expect(cs.quality(60)).toBe("good");
  });
});

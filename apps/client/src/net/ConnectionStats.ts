/**
 * ConnectionStats — a lightweight ping/jitter estimator + a PURE connection
 * classifier. RTT comes from input-ack deltas: the IntentSender stamps each
 * seq with a send time; when the authoritative seat's lastAckSeq catches up we
 * measure now − sentAt(ackSeq). Snapshot jitter is the mean absolute deviation
 * of patch inter-arrival gaps. No Babylon / network imports — unit-testable.
 */
import { SNAPSHOT_MS } from "@ggd/shared/constants";
import type { ConnectionQuality } from "../perfBus";

export interface ConnectionSample {
  pingMs: number;
  jitterMs: number;
  snapshotGapMs: number;
}

/**
 * Pure classifier: ping + jitter (+ a stale-snapshot guard) → quality chip.
 * good  ≤ 60ms ping, ≤ 15ms jitter; poor > 140ms ping or > 45ms jitter or a
 * snapshot gap > 500ms; fair in between.
 */
export function classifyConnection(s: ConnectionSample): ConnectionQuality {
  if (s.snapshotGapMs > 500) return "poor";
  if (s.pingMs > 140 || s.jitterMs > 45) return "poor";
  if (s.pingMs <= 60 && s.jitterMs <= 15) return "good";
  return "fair";
}

const EMA = 0.2;
const MAX_PENDING = 128;

export class ConnectionStats {
  /** seq → send timestamp (ms), pruned as acks arrive. */
  private readonly sent = new Map<number, number>();
  private rtt = 0;
  private lastSnapshotMs = Number.NaN;
  private jitter = 0;
  private lastAck = -1;

  /** Record that input `seq` was transmitted at `nowMs`. */
  noteSent(seq: number, nowMs: number): void {
    this.sent.set(seq, nowMs);
    if (this.sent.size > MAX_PENDING) {
      // drop the oldest inserted key (Map preserves insertion order)
      const oldest = this.sent.keys().next().value;
      if (oldest !== undefined) this.sent.delete(oldest);
    }
  }

  /** Observe the authoritative ackSeq; measure RTT when it advances. */
  noteAck(ackSeq: number, nowMs: number): void {
    if (ackSeq === this.lastAck || ackSeq <= 0) return;
    this.lastAck = ackSeq;
    const sentAt = this.sent.get(ackSeq);
    if (sentAt !== undefined) {
      const sample = Math.max(0, nowMs - sentAt);
      this.rtt = this.rtt === 0 ? sample : this.rtt + (sample - this.rtt) * EMA;
    }
    // prune everything up to and including the acked seq (wrap-agnostic best effort)
    for (const seq of [...this.sent.keys()]) {
      if (seq <= ackSeq) this.sent.delete(seq);
    }
  }

  /** Observe an authoritative snapshot patch arrival; update jitter + gap. */
  noteSnapshot(nowMs: number): void {
    if (Number.isFinite(this.lastSnapshotMs)) {
      const gap = nowMs - this.lastSnapshotMs;
      // Deviation from the NOMINAL snapshot cadence. This must track
      // SNAPSHOT_MS: it used to be the literal 50, and against a 30 Hz (33.3 ms)
      // broadcast a perfectly steady connection would have scored a constant
      // |33.3 - 50| = 16.7 ms of "jitter" — permanently above the 15 ms "good"
      // threshold in classifyConnection, so every player would have been pinned
      // at the "fair" chip forever with no network problem at all.
      const dev = Math.abs(gap - SNAPSHOT_MS);
      this.jitter = this.jitter + (dev - this.jitter) * EMA;
    }
    this.lastSnapshotMs = nowMs;
  }

  get pingMs(): number {
    return this.rtt;
  }

  get jitterMs(): number {
    return this.jitter;
  }

  snapshotGapMs(nowMs: number): number {
    return Number.isFinite(this.lastSnapshotMs) ? nowMs - this.lastSnapshotMs : 0;
  }

  sample(nowMs: number): ConnectionSample {
    return {
      pingMs: this.rtt,
      jitterMs: this.jitter,
      snapshotGapMs: this.snapshotGapMs(nowMs),
    };
  }

  quality(nowMs: number): ConnectionQuality {
    if (!Number.isFinite(this.lastSnapshotMs)) return "offline";
    return classifyConnection(this.sample(nowMs));
  }
}

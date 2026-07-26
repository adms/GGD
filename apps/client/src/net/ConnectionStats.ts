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
 * The full readout `sample()` returns: the classifier's three numbers plus the
 * PROVENANCE of the ping — how many RTT samples have ever landed and how long
 * ago the last one did.
 *
 * Provenance is not decoration (task #272). `pingMs` starts at 0 and freezes
 * whenever the ack stops advancing, and BOTH of those look exactly like a
 * flawless connection on a chip that prints a bare number:
 *   • before the player's first input there is no ack to measure, so a "0 ms"
 *     readout at match start is a lie about a measurement that never happened;
 *   • `IntentSender.update()` sends nothing while there is no pending order or
 *     aim (net/IntentSender.ts), so a player standing still stops producing new
 *     seqs, the ack stops advancing, and the last EMA value sits there looking
 *     live indefinitely. Same again after death, when GameApp's `if (seat && es)`
 *     gate stops calling `noteAck` at all.
 * A UI cannot tell any of that from `pingMs` alone, so the estimator reports it.
 */
export interface ConnectionReport extends ConnectionSample {
  /** RTT samples measured so far. 0 ⇒ `pingMs` is a placeholder, not a measurement. */
  pingSamples: number;
  /** ms since the last RTT sample landed; Infinity when there has never been one. */
  pingAgeMs: number;
  /** authoritative snapshots received. 0 ⇒ there is no match stream at all. */
  snapshots: number;
}

/**
 * A snapshot stream this far behind is not "slow", it is GONE (task #272).
 *
 * The acceptance criterion for the latency work is 「拔網路要能分辨『慢』與
 * 『斷』」, and before this constant the client could not: `quality()` only
 * answered `offline` when it had NEVER seen a snapshot, so pulling the network
 * cable mid-match simply stopped `noteSnapshot` from being called and the chip
 * sat on `poor` forever — indistinguishable from a bad-but-live connection.
 *
 * 2000 ms = 60 consecutive missed snapshots at SNAPSHOT_HZ. Well past any
 * plausible hiccup (the `poor` threshold is already 500 ms) and comfortably
 * before Colyseus's own reconnection grace, so the chip says 斷線 while the
 * socket is still formally deciding.
 */
export const OFFLINE_SNAPSHOT_GAP_MS = 2000;

/**
 * What `pingMs` reads on a PERFECT connection — the protocol's own floor.
 *
 * `pingMs` is an input→ack round trip, not a network round trip, and two 30Hz
 * quantisations sit inside it that no amount of bandwidth removes: the server
 * only consumes input on a tick boundary (SNAPSHOT_MS), and the ack only rides
 * home on the next state patch (SNAPSHOT_MS again).
 *
 * MEASURED, not derived (task #272's adversarial pass): a TCP delay proxy was
 * spliced between a local client and a local game-server, and with **zero**
 * injected latency the readout settled at 34.4 / 34.7 ms. Injecting 100 ms of
 * RTT moved it to 137.9 / 139.4 (+103.5 / +104.9); 200 ms → 237.8 / 238.2
 * (+203.4 / +203.8); returning to 0 came back to 34.4. So the estimator tracks
 * real latency to ≤5 ms — it simply sits on a ~34 ms plinth.
 *
 * The classifier's thresholds have to be measured from the plinth, or every
 * player on a flawless connection reads one grade worse than they are. The
 * owner's family plays from Taiwan against asia-east1 — real RTT roughly
 * 5–40 ms — which lands at 39–74 ms displayed and would have shown 「普通」
 * for most of them under a bare 60 ms cut.
 */
export const PING_PROTOCOL_FLOOR_MS = 34;

/**
 * Pure classifier: ping + jitter (+ a stale-snapshot guard) → quality chip.
 *
 * The ping cuts are `PING_PROTOCOL_FLOOR_MS + (network budget)`, so they mean
 * what they look like they mean: `good` is ≤26 ms of real network RTT, `poor`
 * is >106 ms. Those two budgets are the original #272 intent (60 / 140); only
 * the plinth is new. Jitter needs no such correction — it is a deviation from
 * the nominal cadence, so the quantisation cancels out of it.
 *
 * `offline` once the stream has been silent for OFFLINE_SNAPSHOT_GAP_MS.
 */
export const PING_GOOD_MS = PING_PROTOCOL_FLOOR_MS + 26;
export const PING_POOR_MS = PING_PROTOCOL_FLOOR_MS + 106;

export function classifyConnection(s: ConnectionSample): ConnectionQuality {
  if (s.snapshotGapMs > OFFLINE_SNAPSHOT_GAP_MS) return "offline";
  if (s.snapshotGapMs > 500) return "poor";
  if (s.pingMs > PING_POOR_MS || s.jitterMs > 45) return "poor";
  if (s.pingMs <= PING_GOOD_MS && s.jitterMs <= 15) return "good";
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
  /** RTT samples measured; 0 means `rtt` is the initial 0, not a measurement. */
  private rttSamples = 0;
  /** when the last RTT sample landed (NaN until one does). */
  private lastRttAtMs = Number.NaN;
  /** authoritative snapshots received; 0 means there is no stream at all. */
  private snapshots = 0;

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
      // provenance (#272): a measurement HAPPENED, and this is when. Without
      // these two the UI cannot separate "0 ms, perfect" from "never measured"
      // or "42 ms, live" from "42 ms, frozen since you stopped moving".
      this.rttSamples++;
      this.lastRttAtMs = nowMs;
    }
    // prune everything up to and including the acked seq (wrap-agnostic best effort)
    for (const seq of [...this.sent.keys()]) {
      if (seq <= ackSeq) this.sent.delete(seq);
    }
  }

  /** Observe an authoritative snapshot patch arrival; update jitter + gap. */
  noteSnapshot(nowMs: number): void {
    this.snapshots++;
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

  /** ms since the last RTT sample landed; Infinity when none ever has. */
  pingAgeMs(nowMs: number): number {
    return Number.isFinite(this.lastRttAtMs)
      ? Math.max(0, nowMs - this.lastRttAtMs)
      : Number.POSITIVE_INFINITY;
  }

  sample(nowMs: number): ConnectionReport {
    return {
      pingMs: this.rtt,
      jitterMs: this.jitter,
      snapshotGapMs: this.snapshotGapMs(nowMs),
      pingSamples: this.rttSamples,
      pingAgeMs: this.pingAgeMs(nowMs),
      snapshots: this.snapshots,
    };
  }

  quality(nowMs: number): ConnectionQuality {
    if (!Number.isFinite(this.lastSnapshotMs)) return "offline";
    return classifyConnection(this.sample(nowMs));
  }

  /**
   * Forget everything. GameApp calls this on teardown so a NEW match (or the
   * lobby after one) does not inherit the dead match's ping, its sample counts
   * or its ever-growing snapshot gap — which would otherwise make the chip
   * report 斷線 on the login screen.
   */
  reset(): void {
    this.sent.clear();
    this.rtt = 0;
    this.jitter = 0;
    this.lastSnapshotMs = Number.NaN;
    this.lastAck = -1;
    this.rttSamples = 0;
    this.lastRttAtMs = Number.NaN;
    this.snapshots = 0;
  }
}

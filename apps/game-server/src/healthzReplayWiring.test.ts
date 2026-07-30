/**
 * GUARD: the replay counter actually REACHES /healthz (GH#170, failure shape ②).
 *
 * The counter in replay/replayHealth.ts can be perfect and still be worth
 * nothing if the endpoint never renders it — which is the shape of the original
 * bug one layer down (recording "worked", nothing reached the disk, nothing
 * said so). replayHealth.test.ts proves the counter counts; this file proves an
 * operator can SEE it, and that the top-level `ok` is a real conjunction rather
 * than the literal `true` it was before this ticket.
 *
 * It calls the same `buildHealthzPayload()` index.ts calls, over the same
 * process singleton — no hand-built fake (failure shape ⑤).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildHealthzPayload, healthzStatus } from "./healthz";
import { replayHealth } from "./replay/replayHealth";

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {
    GGD_REPLAY_UNHEALTHY_AFTER: process.env.GGD_REPLAY_UNHEALTHY_AFTER,
    GGD_REPLAY_REQUIRED: process.env.GGD_REPLAY_REQUIRED,
    GGD_REPLAY_HEALTHZ_STATUS: process.env.GGD_REPLAY_HEALTHZ_STATUS,
  };
  replayHealth.reset();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  replayHealth.reset();
});

describe("/healthz carries the replay block (GH#170)", () => {
  it("renders the fields an operator diagnoses a silent recording failure with", () => {
    const body = buildHealthzPayload();
    expect(body.replay).toBeDefined();
    // Each of these answers a specific question the owner asked in #170.
    // `dir`        — is it even pointed where I mounted?
    // `writable`   — can it write there AT ALL (proved by a real create+unlink)?
    // `opened`/`recorded`/`bytesWritten` — did anything actually land?
    // `consecutiveFailures`/`reason` — is it broken right now, and why?
    for (const key of [
      "dir",
      "writable",
      "probeError",
      "opened",
      "recorded",
      "bytesWritten",
      "failures",
      "byPhase",
      "consecutiveFailures",
      "lastFailure",
      "reason",
      "required",
      "unhealthyAfter",
    ]) {
      expect(Object.hasOwn(body.replay, key), `missing replay.${key}`).toBe(true);
    }
    // The pre-existing blocks must survive the extraction.
    expect(body.rooms).toBeDefined();
    expect(body.sim).toBeDefined();
    expect(body.platform).toBeDefined();
  });

  it("top-level ok goes FALSE when replay is degraded — it is no longer a constant", () => {
    expect(buildHealthzPayload().ok).toBe(true);

    replayHealth.noteProbe(false, Object.assign(new Error("permission denied"), { code: "EACCES" }));
    const bad = buildHealthzPayload();
    expect(bad.ok).toBe(false);
    expect(bad.replay.ok).toBe(false);
    expect(bad.replay.reason).toMatch(/not writable/);
  });

  it("N consecutive recording failures flip ok, at the configured threshold", () => {
    process.env.GGD_REPLAY_UNHEALTHY_AFTER = "2";
    replayHealth.noteFailure("write", "m1", new Error("EACCES"));
    expect(buildHealthzPayload().ok).toBe(true);
    replayHealth.noteFailure("write", "m2", new Error("EACCES"));
    expect(buildHealthzPayload().ok).toBe(false);
  });

  it("the STATUS CODE stays 200 by default so no liveness probe can kill a shard", () => {
    delete process.env.GGD_REPLAY_HEALTHZ_STATUS;
    replayHealth.noteProbe(false, new Error("EACCES"));
    const payload = buildHealthzPayload();
    expect(payload.ok).toBe(false); // the body tells the truth…
    expect(healthzStatus(payload)).toBe(200); // …and the code stays harmless.

    // An operator who wired a MONITORING probe can opt in.
    process.env.GGD_REPLAY_HEALTHZ_STATUS = "503";
    expect(healthzStatus(buildHealthzPayload())).toBe(503);
    // A healthy shard is 200 regardless of the knob.
    replayHealth.reset();
    expect(healthzStatus(buildHealthzPayload())).toBe(200);
  });
});

/**
 * MUTATION RECORD (verified: broken → red → restored)
 *  M7  healthz.ts, buildHealthzPayload(): delete the `replay,` line
 *        →  RED: "renders the fields…" (body.replay undefined).
 *  M8  healthz.ts, buildHealthzPayload(): restore `ok: true`
 *        →  RED: "top-level ok goes FALSE…" and the threshold test.
 *  M9  healthz.ts, healthzStatus(): return `degradedHealthzStatus()`
 *        unconditionally  →  RED: the 200-by-default test.
 */

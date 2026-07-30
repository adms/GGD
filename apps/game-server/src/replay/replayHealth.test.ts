/**
 * GUARDS for GH#170 — 「正式機錄影可能正在靜靜失敗，而 /healthz 不會說」.
 *
 * WHAT MAKES THESE GUARDS AND NOT DECORATION. Every test here drives a REAL
 * unwritable directory (chmod 0555, the exact shape a docker bind mount created
 * as root gives a container running `USER node`) through the REAL
 * `MatchRecorder`, and then asserts on the counter an operator actually reads.
 * Specifically they are written against the seven failure shapes in CLAUDE.md:
 *
 *   ② 「算出來了但從沒送到客戶端」 — the whole bug. Recording "worked" (open()
 *      returned a recorder, push() accepted every line) and nothing reached the
 *      disk. So the assertions read `bytesWritten` and the file listing, never
 *      「開得起來嗎」.
 *   ③ 「可以刪掉但測試還是全綠」 — the mutation record at the bottom of this
 *      file names the exact line to break for each test.
 *   ⑤ 「被測的不是出貨的那個」 — no hand-rolled fake recorder. The tests import
 *      `MatchRecorder` and `replayHealth`, the same singletons index.ts renders.
 *   ⑥ 「用掃原始碼字串代替行為」 — nothing here greps source.
 *
 * NOTE ON `chmod` AND ROOT: a process running as root ignores directory
 * permission bits entirely, so these tests would silently pass without ever
 * exercising the failure. The suite asserts up front that it is NOT root and
 * that the read-only directory really does reject a write, so "running as root"
 * turns into a red test rather than a vacuous green one.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, chmodSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MatchRecorder } from "./Recorder";
import { probeReplayDirWritable, replayDir } from "./store";
import {
  formatReplayFailureLog,
  REPLAY_LOG_TAG,
  replayHealth,
  type ReplayHealthSnapshot,
} from "./replayHealth";
import type { ReplayHeader } from "./format";

const HEADER = {
  matchId: "guard-1",
  startedAt: "2026-07-30T00:00:00.000Z",
  seed: 7,
  contentVersion: "cv_test",
  buildStamp: "test",
  arenaId: "arena-1",
  seats: [],
} as unknown as ReplayHeader;

/** Silence + capture console.error for the duration of one call. */
async function quiet<T>(fn: () => Promise<T>): Promise<{ value: T; errors: string[] }> {
  const errors: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void errors.push(String(a[0]));
  try {
    return { value: await fn(), errors };
  } finally {
    console.error = orig;
  }
}

const dirs: string[] = [];
function makeDir(mode: number): string {
  const d = mkdtempSync(join(tmpdir(), "ggd-replay-guard-"));
  chmodSync(d, mode);
  dirs.push(d);
  return d;
}

let savedDir: string | undefined;
let savedKnobs: Record<string, string | undefined> = {};

beforeEach(() => {
  savedDir = process.env.GGD_REPLAY_DIR;
  savedKnobs = {
    GGD_REPLAY_UNHEALTHY_AFTER: process.env.GGD_REPLAY_UNHEALTHY_AFTER,
    GGD_REPLAY_REQUIRED: process.env.GGD_REPLAY_REQUIRED,
    GGD_REPLAY_HEALTHZ_STATUS: process.env.GGD_REPLAY_HEALTHZ_STATUS,
  };
  replayHealth.reset();
});

afterEach(() => {
  if (savedDir === undefined) delete process.env.GGD_REPLAY_DIR;
  else process.env.GGD_REPLAY_DIR = savedDir;
  for (const [k, v] of Object.entries(savedKnobs)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const d of dirs.splice(0)) {
    try {
      chmodSync(d, 0o755);
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
  replayHealth.reset();
});

// ---------------------------------------------------------------------------

describe("GH#170 preconditions — the test environment can actually fail", () => {
  it("is not running as root, and a 0555 directory really does reject a write", () => {
    // Root ignores permission bits, which would make every test below pass
    // without exercising anything. Fail loudly instead of quietly.
    expect(typeof process.getuid === "function" ? process.getuid() : 1000).not.toBe(0);
    const ro = makeDir(0o555);
    expect(() => writeFileSync(join(ro, "nope"), "x")).toThrow();
  });
});

describe("GH#170 boot probe — an unwritable replay dir is known BEFORE any match", () => {
  it("a real create+unlink says writable on a good dir and NOT writable on a 0555 dir", async () => {
    process.env.GGD_REPLAY_DIR = makeDir(0o755);
    await expect(probeReplayDirWritable()).resolves.toEqual({ ok: true });

    process.env.GGD_REPLAY_DIR = makeDir(0o555);
    const bad = await probeReplayDirWritable();
    expect(bad.ok).toBe(false);
    expect(String((bad as { err: unknown }).err)).toMatch(/EACCES|EPERM|EROFS/);
  });

  it("a not-yet-created directory is CREATED, not reported as broken (fresh deploy)", async () => {
    // On a brand-new host `data/replays` does not exist yet. A probe that only
    // asked the kernel about the directory would answer ENOENT and raise a
    // false alarm on a perfectly healthy first deploy — and a false alarm on
    // day one is how an alarm gets ignored on day ten.
    const parent = makeDir(0o755);
    const fresh = join(parent, "not-created-yet");
    process.env.GGD_REPLAY_DIR = fresh;
    await expect(probeReplayDirWritable()).resolves.toEqual({ ok: true });
    expect(readdirSync(fresh)).toEqual([]); // created, and left clean
  });

  it("the probe leaves NO file behind — it can never be mistaken for a recording", async () => {
    const dir = makeDir(0o755);
    process.env.GGD_REPLAY_DIR = dir;
    await probeReplayDirWritable();
    expect(readdirSync(dir)).toEqual([]);
  });

  it("a failed probe alone makes the shard report NOT ok, naming the directory", () => {
    process.env.GGD_REPLAY_DIR = makeDir(0o555);
    replayHealth.noteProbe(false, Object.assign(new Error("permission denied"), { code: "EACCES" }));
    const s = replayHealth.snapshot();
    expect(s.ok).toBe(false);
    expect(s.writable).toBe(false);
    expect(s.reason).toMatch(/not writable/);
    expect(s.probeError).toContain("EACCES");
    expect(s.dir).toBe(replayDir());
  });
});

describe("GH#170 the measured failure — an unwritable dir records NOTHING and used to say nothing", () => {
  it("counts the write failure, writes zero bytes, and flips /healthz to not-ok after N matches", async () => {
    const dir = makeDir(0o555);
    process.env.GGD_REPLAY_DIR = dir;
    process.env.GGD_REPLAY_UNHEALTHY_AFTER = "3";

    const seen: string[] = [];
    for (let match = 1; match <= 3; match++) {
      const { value: rec, errors } = await quiet(async () => {
        const r = await MatchRecorder.open(`unwritable-${match}`, HEADER);
        // The EACCES arrives asynchronously — this is precisely why open()
        // returning non-null was never evidence of anything.
        await new Promise((res) => setTimeout(res, 120));
        return r;
      });
      seen.push(...errors);
      // The shipped behaviour: open() SUCCEEDS against an unwritable directory.
      // Pinning it here so a future reader does not "fix" the guard by assuming
      // a null return, which is the assumption that let this bug live.
      expect(rec).not.toBeNull();
      await rec?.abandon();

      const s = replayHealth.snapshot();
      expect(s.consecutiveFailures).toBe(match);
      // ok flips exactly at the threshold, not before and not after.
      expect(s.ok).toBe(match < 3);
    }

    const s = replayHealth.snapshot();
    expect(s.opened).toBe(3);
    expect(s.recorded).toBe(0);
    expect(s.byPhase.write).toBe(3);
    // THE assertion. `opened` climbing while `bytesWritten` stays 0 is the
    // signature of GH#170, and it is a claim about the DEVICE, not about our
    // own buffer (which happily accepted every line the whole time).
    expect(s.bytesWritten).toBe(0);
    expect(readdirSync(dir)).toEqual([]);
    expect(s.reason).toMatch(/3 consecutive recordings failed/);
    // And it is greppable, not just structured.
    expect(seen.some((l) => l.includes(REPLAY_LOG_TAG))).toBe(true);
  });

  it("a writable dir records for real: bytes land, a tape exists, ok stays true", async () => {
    const dir = makeDir(0o755);
    process.env.GGD_REPLAY_DIR = dir;

    const rec = await MatchRecorder.open("writable-1", HEADER);
    expect(rec).not.toBeNull();
    await rec!.abandon(); // abandon() flushes and closes

    const s = replayHealth.snapshot();
    expect(s.opened).toBe(1);
    expect(s.failures).toBe(0);
    expect(s.ok).toBe(true);
    // Not vacuous: bytes really moved and a file really exists.
    expect(s.bytesWritten).toBeGreaterThan(0);
    expect(readdirSync(dir)).toContain("writable-1.jsonl");
  });

  // ------------------------------------------------------------------------
  // These two drive the REAL `finish()` path. They exist because the mutation
  // 「delete the `if (this.disabled) return` early-out in finish()」 was GREEN
  // against the first version of this file: every test above ends its recorder
  // with `abandon()`, so the entire seal path — the only place `noteRecorded`
  // is called from — was untested. Exactly CLAUDE.md ③ (可以刪掉關鍵那行但測試
  // 全綠), caught by actually running the mutation instead of assuming.
  // ------------------------------------------------------------------------
  /** The four fields `finish()` reads. Duck-typed so no world is needed. */
  const fakeCtl = () =>
    ({
      phase: { round: 3 },
      faultCount: 0,
      lives: new Map([[0, 1]]),
      placements: new Map([[0, 1]]),
    }) as never;

  it("a recorder that FAILED mid-match is not counted as recorded when it seals", async () => {
    process.env.GGD_REPLAY_DIR = makeDir(0o555);
    process.env.GGD_REPLAY_UNHEALTHY_AFTER = "1";

    const { value: rec } = await quiet(async () => {
      const r = await MatchRecorder.open("failed-then-sealed", HEADER);
      await new Promise((res) => setTimeout(res, 120)); // let EACCES land
      return r;
    });
    await quiet(async () => rec!.finish(fakeCtl()));

    const s = replayHealth.snapshot();
    // The match ended "normally" — but no tape exists, so it must NOT clear
    // the alarm. This is the assertion the M3 mutation breaks.
    expect(s.recorded).toBe(0);
    expect(s.consecutiveFailures).toBe(1);
    expect(s.ok).toBe(false);
  });

  it("a recorder that SUCCEEDED seals, compresses, and clears the alarm", async () => {
    const dir = makeDir(0o755);
    process.env.GGD_REPLAY_DIR = dir;
    process.env.GGD_REPLAY_UNHEALTHY_AFTER = "1";
    // Pre-load the alarm so "cleared" is a real transition, not a starting state.
    replayHealth.noteFailure("write", "earlier", new Error("EACCES"));
    expect(replayHealth.snapshot().ok).toBe(false);

    const rec = await MatchRecorder.open("sealed-ok", HEADER);
    await rec!.finish(fakeCtl());

    const s = replayHealth.snapshot();
    expect(s.recorded).toBe(1);
    expect(s.consecutiveFailures).toBe(0);
    expect(s.ok).toBe(true);
    // Not vacuous: the compressed tape really is on disk.
    expect(readdirSync(dir)).toContain("sealed-ok.jsonl.gz");
  });

  it("a success CLEARS the consecutive counter — a healed shard stops reporting degraded", () => {
    process.env.GGD_REPLAY_UNHEALTHY_AFTER = "2";
    replayHealth.noteFailure("write", "a", new Error("EACCES"));
    replayHealth.noteFailure("write", "b", new Error("EACCES"));
    expect(replayHealth.snapshot().ok).toBe(false);

    replayHealth.noteRecorded();
    const s = replayHealth.snapshot();
    expect(s.consecutiveFailures).toBe(0);
    expect(s.ok).toBe(true);
    expect(s.recorded).toBe(1);
  });

  it("retention and compress failures do NOT claim the shard cannot record", () => {
    process.env.GGD_REPLAY_UNHEALTHY_AFTER = "1";
    replayHealth.noteFailure("prune", "a", new Error("ENOENT"));
    replayHealth.noteFailure("compress", "b", new Error("ENOSPC"));
    const s = replayHealth.snapshot();
    // Counted and visible…
    expect(s.failures).toBe(2);
    expect(s.byPhase.prune).toBe(1);
    expect(s.byPhase.compress).toBe(1);
    // …but neither loses a tape (compress leaves the playable .jsonl behind),
    // so neither may raise a false alarm on the recording path.
    expect(s.consecutiveFailures).toBe(0);
    expect(s.ok).toBe(true);
  });
});

describe("GH#170 the knobs are real knobs (CLAUDE.md 第一守則: 決策點要可調)", () => {
  it("GGD_REPLAY_UNHEALTHY_AFTER moves the threshold, and is echoed back", () => {
    for (let i = 0; i < 5; i++) replayHealth.noteFailure("write", "x", new Error("EACCES"));
    process.env.GGD_REPLAY_UNHEALTHY_AFTER = "10";
    expect(replayHealth.snapshot().ok).toBe(true);
    expect(replayHealth.snapshot().unhealthyAfter).toBe(10);
    process.env.GGD_REPLAY_UNHEALTHY_AFTER = "5";
    expect(replayHealth.snapshot().ok).toBe(false);
  });

  it("the threshold is CLAMPED at both ends — 0 and a typo'd 99999 cannot brick it", () => {
    // CLAUDE.md: validateField only checked `min` until 2026-07-29, so 50 typed
    // as 500 sailed through. Both ends, or it is not a bound.
    process.env.GGD_REPLAY_UNHEALTHY_AFTER = "0";
    expect(replayHealth.snapshot().unhealthyAfter).toBe(1);
    process.env.GGD_REPLAY_UNHEALTHY_AFTER = "99999";
    expect(replayHealth.snapshot().unhealthyAfter).toBe(1000);
    process.env.GGD_REPLAY_UNHEALTHY_AFTER = "banana";
    expect(replayHealth.snapshot().unhealthyAfter).toBe(3);
  });

  it("GGD_REPLAY_REQUIRED=0 stops it counting as unhealthy but STILL states the reason", () => {
    replayHealth.noteProbe(false, new Error("EACCES: permission denied"));
    process.env.GGD_REPLAY_REQUIRED = "0";
    const s = replayHealth.snapshot();
    expect(s.ok).toBe(true);
    expect(s.required).toBe(false);
    // Hiding the sentence too would rebuild the exact silence GH#170 is about.
    expect(s.reason).toMatch(/not writable/);
    expect(s.writable).toBe(false);
  });

  it("the /healthz status stays 200 by default so no probe can kill a game shard", () => {
    delete process.env.GGD_REPLAY_HEALTHZ_STATUS;
    expect(replayHealth.snapshot().degradedHealthzStatus).toBe(200);
    process.env.GGD_REPLAY_HEALTHZ_STATUS = "503";
    expect(replayHealth.snapshot().degradedHealthzStatus).toBe(503);
  });
});

describe("GH#170 the log line is greppable and complete", () => {
  it("carries the fixed tag plus the running totals, not just this one event", () => {
    const s: ReplayHealthSnapshot = replayHealth.snapshot();
    const line = formatReplayFailureLog("write", "m_01ABC", new Error("EACCES: denied"), s);
    expect(line.startsWith(`[${REPLAY_LOG_TAG}]`)).toBe(true);
    for (const key of ["phase=", "id=", "dir=", "consecutive=", "failures=", "opened=", "recorded=", "bytesWritten=", "ok="]) {
      expect(line).toContain(key);
    }
    expect(line).toContain("EACCES");
  });

  it("throttles: a persistent failure does not emit one line per event", () => {
    let logged = 0;
    for (let i = 0; i < 40; i++) if (replayHealth.noteFailure("write", "x", new Error("e"))) logged++;
    // First few in full, then every REPLAY_LOG_EVERY-th — never 40 lines.
    expect(logged).toBeGreaterThan(0);
    expect(logged).toBeLessThan(10);
    // …and the COUNTER counted every single one regardless of what was logged.
    expect(replayHealth.snapshot().failures).toBe(40);
  });
});

/**
 * ---------------------------------------------------------------------------
 * MUTATION RECORD (CLAUDE.md 第二守則 — each guard was verified by breaking the
 * line it protects and confirming red, then restoring). Run one at a time:
 *
 *  M1  Recorder.ts, MatchRecorder.open stream error handler:
 *        replace `reportFailure("write", rec.id, err)` with the old
 *        `console.error(...)`  →  RED: "counts the write failure…" fails at
 *        `byPhase.write` (0 !== 3) and `ok` never flips.
 *  M2  Recorder.ts, flush():
 *        delete `replayHealth.noteBytes(chunk.length)`  →  RED: "a writable dir
 *        records for real" fails on `bytesWritten > 0`.
 *  M3  Recorder.ts, finish():
 *        delete the `if (this.disabled) { … return; }` early-out so a disabled
 *        recorder still calls noteRecorded()  →  RED: consecutive counter is
 *        cleared by a match that produced nothing.
 *  M4  replayHealth.ts, snapshot():
 *        change `this.consecutive >= unhealthyAfter` to `> unhealthyAfter`
 *        →  RED: `ok` is still true at the threshold.
 *  M5  replayHealth.ts, envInt():
 *        drop the `Math.min(max, …)` clamp  →  RED: 99999 test.
 *  M4  replayHealth.ts, snapshot(): `>=` → `>`  →  RED (6 tests).
 *  M5  replayHealth.ts, envInt(): drop `Math.min(max, …)`  →  RED.
 *  M6b store.ts, probeReplayDirWritable(): delete `await mkdir(dir, …)`
 *        →  RED: the fresh-deploy test (a probe that does not create the
 *        directory raises a false alarm on a brand-new host).
 *
 *  ⚠️ NOT RED — stated rather than hidden:
 *  M6a store.ts: swapping the real `writeFile` for `access(dir, W_OK)` keeps
 *        every test GREEN. The two only diverge on a read-only MOUNT (EROFS)
 *        and a FULL disk (ENOSPC), where the permission bits look fine; for a
 *        chmod 0555 directory — the case these tests can create portably —
 *        both report failure. The real write is still the right implementation
 *        (it is the exact syscall the recorder performs), but the choice
 *        between them is currently guarded by the comment in store.ts and by
 *        M6b, NOT by a behavioural test. Simulating EROFS/ENOSPC needs a
 *        loopback/tmpfs mount and root, which this suite deliberately does not
 *        have (see the not-root precondition test).
 * ---------------------------------------------------------------------------
 */

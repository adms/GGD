/**
 * Guard for the replay-list index (task C).
 *
 * THE ONE THING THIS MUST PROVE. An index is a second copy of the truth, and a
 * second copy of the truth is a liability unless something fails loudly when it
 * drifts. store.ts's header promises 「the directory IS the index」; these tests
 * are what keeps that promise true after adding a cache in front of it.
 *
 * So the assertions are never "the index file has N rows" (a property — failure
 * form ⑦). They are always "`listReplaysIndexed()` returns EXACTLY what
 * `listReplays()` returns", with `listReplays` — the shipped authority, which
 * opens every file — as the expected value. Every drift case below mutates the
 * DIRECTORY behind the index's back and then demands the two still agree:
 *
 *   one recording deleted        -> the row must disappear
 *   one recording added          -> the row must appear
 *   one recording GREW           -> the row's ticks/bytes must be the new ones
 *   the index is corrupt/missing -> the list is still right, just slower
 *
 * The third is the sharp one: an index keyed only on "which ids exist" passes
 * the first two and still serves a stale row for a match that is being written
 * right now, which is the common case on a live shard.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { encodeLine, type ReplayHeader, type ReplayLine } from "./format";
import { listReplays } from "./store";
import {
  listReplaysIndexed,
  readSidecar,
  rebuildSidecar,
  sidecarPath,
  SIDECAR_NAME,
  upsertSidecarRow,
  forgetSidecarRows,
} from "./sidecar";

const dir = mkdtempSync(join(tmpdir(), "ggd-replay-sidecar-"));
process.env.GGD_REPLAY_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function header(matchId: string, startedAt: string): ReplayHeader {
  return {
    formatVersion: 1,
    matchId,
    startedAt,
    seed: 4242,
    contentVersion: "cv_sidecar",
    registryFingerprint: "rf_sidecar",
    buildStamp: "dev",
    seats: [
      { seatId: 0, teamId: 0, accountId: "a0", displayName: "玩家 0", championId: "c0", isBot: false, driver: "human" },
      { seatId: 1, teamId: 1, accountId: "a1", displayName: "玩家 1", championId: "c1", isBot: true, driver: "ai" },
    ],
    startingLives: 3,
    arenaId: "arena.godie",
    arenaPoolIds: ["arena.godie"],
    combatEnv: {} as never,
    phaseConfig: { champSelectTicks: 5, intermissionTicks: 8, combatMaxTicks: 900, resolutionTicks: 3 },
    fireRing: null,
    arenaRules: {},
    whitelist: { bypass: true, champions: [], items: [], abilities: [] },
    env: { whitelistBypass: true, combatEnvBypass: true, devCheats: false },
  };
}

/** Body of a recording with `ticks` digest ticks, optionally sealed with a footer. */
function body(matchId: string, startedAt: string, ticks: number, sealed: boolean): string {
  const lines: ReplayLine[] = [{ t: "header", ...header(matchId, startedAt) }];
  lines.push({ t: "g", k: 0, w: Array.from({ length: ticks }, (_, i) => i + 1), h: Array.from({ length: ticks }, () => 7) });
  if (sealed) {
    lines.push({
      t: "footer",
      endedAt: "2026-07-30T12:00:00.000Z",
      finalTick: ticks - 1,
      rounds: 3,
      faultCount: 0,
      finalWorldDigest: 1,
      finalHostDigest: 2,
      teams: [
        { teamId: 0, lives: 3, placement: 1 },
        { teamId: 1, lives: 0, placement: 2 },
      ],
    });
  }
  return lines.map(encodeLine).join("");
}

async function writeFinished(id: string, startedAt: string, ticks = 30): Promise<void> {
  await writeFile(join(dir, `${id}.jsonl.gz`), gzipSync(Buffer.from(body(id, startedAt, ticks, true), "utf8")));
}
async function writeLive(id: string, startedAt: string, ticks = 30): Promise<void> {
  await writeFile(join(dir, `${id}.jsonl`), body(id, startedAt, ticks, false));
}

async function clean(): Promise<void> {
  for (const f of await (await import("node:fs/promises")).readdir(dir)) await rm(join(dir, f), { force: true });
}

/** The whole contract in one line: the fast path must equal the slow path. */
async function expectAgreement(): Promise<{ cached: number; parsed: number }> {
  const truth = await listReplays();
  const fast = await listReplaysIndexed(dir);
  expect(fast.replays).toEqual(truth);
  return { cached: fast.cached, parsed: fast.parsed };
}

describe("replay list index", () => {
  beforeEach(async () => {
    await clean();
  });

  it("agrees with the full scan on a cold directory, and warms the index", async () => {
    await writeFinished("m-a", "2026-07-30T10:00:00.000Z");
    await writeFinished("m-b", "2026-07-30T11:00:00.000Z");
    const cold = await expectAgreement();
    expect(cold.parsed).toBe(2);
    expect(cold.cached).toBe(0);

    const warm = await listReplaysIndexed(dir);
    expect(warm.cached).toBe(2);
    expect(warm.parsed).toBe(0);
    expect(warm.replays.map((r) => r.id)).toEqual(["m-b", "m-a"]); // newest first
  });

  it("DRIFT — a recording deleted behind the index's back leaves the list", async () => {
    await writeFinished("gone-1", "2026-07-30T10:00:00.000Z");
    await writeFinished("stay-1", "2026-07-30T11:00:00.000Z");
    await listReplaysIndexed(dir); // index now holds BOTH

    await rm(join(dir, "gone-1.jsonl.gz"));
    const sc = await readSidecar(dir);
    expect(sc.entries.map((e) => e.id).sort()).toEqual(["gone-1", "stay-1"]); // still stale on disk

    const after = await expectAgreement();
    const rows = (await listReplaysIndexed(dir)).replays;
    expect(rows.map((r) => r.id)).toEqual(["stay-1"]);
    expect(after.parsed).toBe(0); // the survivor was served from cache, not re-read
    // and the stale entry is gone from the index too
    expect((await readSidecar(dir)).entries.map((e) => e.id)).toEqual(["stay-1"]);
  });

  it("DRIFT — a recording that appeared behind the index's back joins the list", async () => {
    await writeFinished("known-1", "2026-07-30T10:00:00.000Z");
    await listReplaysIndexed(dir);

    await writeFinished("surprise-1", "2026-07-30T12:00:00.000Z");
    const res = await expectAgreement();
    expect(res.parsed).toBe(1); // only the new one was opened
    expect((await listReplaysIndexed(dir)).replays.map((r) => r.id)).toEqual(["surprise-1", "known-1"]);
  });

  it("DRIFT — a recording that GREW is re-summarised, not served stale", async () => {
    // The live-match case: the file is appended to every 500 ms while a match
    // runs, so an index keyed only on "which ids exist" would keep reporting the
    // tick count and byte size the match had when it was first listed.
    await writeLive("growing-1", "2026-07-30T10:00:00.000Z", 30);
    const first = (await listReplaysIndexed(dir)).replays[0]!;
    expect(first.ticks).toBe(30);
    const bytesBefore = first.bytes;

    await writeLive("growing-1", "2026-07-30T10:00:00.000Z", 90);
    const res = await expectAgreement();
    const grown = (await listReplaysIndexed(dir)).replays[0]!;
    expect(grown.ticks).toBe(90);
    expect(grown.bytes).toBeGreaterThan(bytesBefore);
    expect(res.parsed).toBe(1);
  });

  it("DRIFT — a same-length rewrite is caught by mtime", async () => {
    // Same byte length, different content: `bytes` alone cannot see this.
    await writeLive("rewrite-1", "2026-07-30T10:00:00.000Z", 30);
    const before = (await listReplaysIndexed(dir)).replays[0]!;
    const p = join(dir, "rewrite-1.jsonl");
    const size = (await stat(p)).size;

    await writeFile(p, body("rewrite-1", "2026-07-30T09:00:00.000Z", 30, false));
    expect((await stat(p)).size).toBe(size); // identical length, different startedAt
    const t = new Date(Date.now() + 5_000);
    await utimes(p, t, t);

    await expectAgreement();
    const after = (await listReplaysIndexed(dir)).replays[0]!;
    expect(after.startedAt).not.toBe(before.startedAt);
    expect(after.startedAt).toBe("2026-07-30T09:00:00.000Z");
  });

  it("a corrupt or missing index costs a rescan, never a wrong answer", async () => {
    await writeFinished("c-1", "2026-07-30T10:00:00.000Z");
    await writeFinished("c-2", "2026-07-30T11:00:00.000Z");
    await listReplaysIndexed(dir);

    await writeFile(sidecarPath(dir), "{not json at all");
    const res = await expectAgreement();
    expect(res.parsed).toBe(2); // full rescan
    expect(res.cached).toBe(0);

    await rm(sidecarPath(dir));
    expect((await expectAgreement()).parsed).toBe(2);
  });

  it("the index file is invisible to every recording reader", async () => {
    await writeFinished("vis-1", "2026-07-30T10:00:00.000Z");
    await listReplaysIndexed(dir);
    // It exists...
    expect((await readFile(sidecarPath(dir), "utf8")).length).toBeGreaterThan(0);
    // ...and neither listing counts it as a recording. `pruneReplays` uses the
    // very same `.jsonl`/`.jsonl.gz` filter, so this also proves retention can
    // never delete the index out from under itself.
    expect(SIDECAR_NAME.startsWith(".")).toBe(true);
    expect(SIDECAR_NAME.endsWith(".jsonl")).toBe(false);
    expect(SIDECAR_NAME.endsWith(".jsonl.gz")).toBe(false);
    expect((await listReplays()).map((r) => r.id)).toEqual(["vis-1"]);
    expect((await listReplaysIndexed(dir)).replays.map((r) => r.id)).toEqual(["vis-1"]);
  });

  it("a .jsonl still present next to its .jsonl.gz is not listed twice", async () => {
    // The momentary state `compressRecording` leaves between gzip and unlink.
    await writeFinished("dup-1", "2026-07-30T10:00:00.000Z");
    await writeLive("dup-1", "2026-07-30T10:00:00.000Z");
    await expectAgreement();
    expect((await listReplaysIndexed(dir)).replays.map((r) => r.id)).toEqual(["dup-1"]);
  });

  it("write-time upsert lands a row without opening the recording", async () => {
    // The 「寫入時更新」 half: MatchRecorder.finish() already holds the header and
    // footer, so the row is built in memory and only `stat` touches the disk.
    await writeFinished("up-1", "2026-07-30T10:00:00.000Z");
    const truth = (await listReplays())[0]!;
    await upsertSidecarRow("up-1", "up-1.jsonl.gz", truth, dir);

    const res = await listReplaysIndexed(dir);
    expect(res.parsed).toBe(0); // never opened — the upsert already had it
    expect(res.cached).toBe(1);
    expect(res.replays).toEqual([truth]);
  });

  it("forgetSidecarRows drops what retention deleted", async () => {
    await writeFinished("keep-1", "2026-07-30T10:00:00.000Z");
    await writeFinished("prune-1", "2026-07-30T09:00:00.000Z");
    await listReplaysIndexed(dir);
    await rm(join(dir, "prune-1.jsonl.gz"));
    await forgetSidecarRows(["prune-1"], dir);
    expect((await readSidecar(dir)).entries.map((e) => e.id)).toEqual(["keep-1"]);
    await expectAgreement();
  });

  it("rebuildSidecar reproduces the full scan exactly", async () => {
    await writeFinished("rb-1", "2026-07-30T10:00:00.000Z");
    await writeLive("rb-2", "2026-07-30T11:00:00.000Z");
    await rm(sidecarPath(dir), { force: true });
    expect(await rebuildSidecar(dir)).toBe(2);
    const res = await listReplaysIndexed(dir);
    expect(res.parsed).toBe(0);
    expect(res.replays).toEqual(await listReplays());
  });
});

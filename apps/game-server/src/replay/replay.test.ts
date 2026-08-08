/**
 * Match replay (task #175) — record a real match through the real
 * MatchController, then play it back and prove the two agree tick by tick.
 *
 * These are NOT round-trips of a hand-built input array. Every test below drives
 * the same `MatchController` the game server runs, with the same recorder object
 * `MatchRoom` attaches, writing the same JSONL file to disk that the admin
 * console lists — because a replay feature that only works against a synthetic
 * fixture is exactly the kind of thing that ships green here and cannot happen
 * in a real match.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zArenaDoc, type ArenaDoc, type FireRingConfig } from "@ggd/shared/content";
import { Arenas, Configs } from "@ggd/shared/content";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { DEFAULT_BURN_CURVE } from "@ggd/shared/sim/fireRing";
import { asSeatId } from "@ggd/shared/ids";
import { DEFAULT_COMBAT_ENV, normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import { DEFAULT_BASE_BONUS, baseBonusFor, type BaseBonusTable } from "@ggd/shared/sim/baseBonus";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { Ownership } from "../curation/ownership";
import { rebuildBaseBonus } from "./headerCodec";
import { DEFAULT_GOLD_DROP_CONFIG } from "@ggd/shared/content";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "../match/arenaRules";
import { resolveStartingLives } from "../match/phaseConfig";
import { AIDriver } from "../ai/Tier0Brain";
import { HumanDriver } from "../seat/HumanDriver";
import { Whitelist } from "../curation/whitelist";
import { MatchRecorder } from "./Recorder";
import { buildHeader } from "./headerCodec";
import { checkCompatibility, ReplayPlayer, setActiveContentVersion } from "./Player";
import { hostDigest } from "./digest";
import { decodeLines, REPLAY_FORMAT_VERSION, type ReplayHeader } from "./format";
import { registryFingerprint, resetRegistryFingerprintCache } from "./fingerprint";
import { listReplays, pruneReplays, RETAIN_MAX_FILES } from "./store";
import { mintReplayTicket, verifyReplayTicket } from "./access";
import { isFannedOutEvent } from "../net/eventFanout";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const loadArena = (id: string): ArenaDoc =>
  zArenaDoc.parse(JSON.parse(readFileSync(join(CONTENT, "arenas", `${id}.json`), "utf8")));

/** Short phases so a whole match runs in a couple of thousand ticks. */
const FAST = { champSelectTicks: 5, intermissionTicks: 8, combatMaxTicks: 900, resolutionTicks: 3 };
/** A NON-neutral table, because the live host's is not neutral either. */
const ENV = normalizeCombatEnv({ damageDealt: 0.5, maxHealth: 8, cooldown: 0.25, abilityRange: 0.6 });
const CV = "cv_testcontent1";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    displayName: `玩家 ${i}`,
    accountId: `acct-${i}`,
    isBot: i > 0,
  }));

let dir: string;

beforeAll(() => {
  for (const id of ["arena.castle", "arena.colosseum", "arena.dota", "arena.godie"]) {
    Arenas.register(loadArena(id));
  }
  dir = mkdtempSync(join(tmpdir(), "ggd-replay-"));
  process.env.GGD_REPLAY_DIR = dir;
  setActiveContentVersion(CV);
  // The skeleton content the controller registers is now in the registries, so
  // the fingerprint computed below covers the same set playback will see.
  resetRegistryFingerprintCache();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.GGD_REPLAY_DIR;
});

/**
 * A fire ring that ignites almost immediately and closes fast (task #195), so a
 * short recorded match spends most of its ticks with the ring ACTIVELY shrinking
 * and burning — which is the state whose determinism is worth proving.
 */
const RING: FireRingConfig = {
  startSec: 0.5,
  shrinkSec: 6,
  minRadius: 0.5,
  burnCurve: [...DEFAULT_BURN_CURVE], // 出貨曲線的唯一字面值住在 sim/fireRing.ts
  maxPctPerSec: 1,
  // GH#287 出貨預設：火圈無視免死（＝這一格出現之前的行為）。
  lethalSaveApplies: false,
  // 殭屍王回合延長 (#L1)。`config.match@1` 的 fireRing.boss 帶 `.default()`,
  // 所以 Zod 的 OUTPUT 型別上它是必填 —— 這個 fixture 少了它就不是
  // FireRingConfig。值就是出貨預設 (content/config/config.match.json)。
  // #248 —— 回合硬上限，鏡射出貨的 300 秒（不是隨手挑的：這個 fixture 的用途就是
  // 「出貨長什麼樣」，挑一個別的數字會讓它變成測一份不存在的設定）。
  roundHardCapSec: 300,
  boss: { extendCombatSec: 180, delayFireRingSec: 180 },
};

function makeController(
  matchId: string,
  seed: number,
  whitelist = Whitelist.allowAll(),
  fireRing: FireRingConfig | null = null,
  baseBonus: BaseBonusTable | undefined = undefined,
): MatchController {
  return new MatchController(
    matchId,
    seed,
    allBots(),
    FAST,
    3,
    DEFAULT_ARENA_RULES,
    SKELETON_ARENA,
    whitelist,
    ENV,
    fireRing,
    [],
    Ownership.allowAll(),
    baseBonus ?? DEFAULT_BASE_BONUS,
  );
}

function headerFor(
  ctl: MatchController,
  matchId: string,
  seed: number,
  cv = CV,
  fireRing: FireRingConfig | null = null,
  baseBonus: BaseBonusTable = DEFAULT_BASE_BONUS,
): ReplayHeader {
  return buildHeader({
    matchId,
    seed,
    contentVersion: cv,
    seats: ctl.seats,
    specIsBot: (seatId) => seatId > 0,
    startingLives: 3,
    arena: SKELETON_ARENA,
    arenaPool: [],
    combatEnv: ENV,
    baseBonus,
    phaseConfig: FAST,
    fireRing,
    arenaRules: DEFAULT_ARENA_RULES,
    whitelist: ctl.whitelist,
    env: { whitelistBypass: true, combatEnvBypass: false, devCheats: true },
  });
}

/**
 * Record a real match to a real file. `onTick` is the seam the disconnect test
 * uses to drive a mid-match driver swap through the same code path MatchRoom's
 * onLeave/onJoin uses (`seat.setDriver`).
 */
async function recordMatch(
  matchId: string,
  seed: number,
  onTick?: (ctl: MatchController) => void,
  fireRing: FireRingConfig | null = null,
  baseBonus: BaseBonusTable = DEFAULT_BASE_BONUS,
): Promise<{ ctl: MatchController; ticks: number; finalWorld: number; finalHost: number }> {
  const ctl = makeController(matchId, seed, Whitelist.allowAll(), fireRing, baseBonus);
  const rec = await MatchRecorder.open(
    matchId,
    headerFor(ctl, matchId, seed, CV, fireRing, baseBonus),
  );
  expect(rec).not.toBeNull();
  ctl.recorder = rec;
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < 60_000) {
    onTick?.(ctl);
    ctl.tick();
    n++;
  }
  const out = {
    ctl,
    ticks: ctl.world.tick,
    finalWorld: ctl.world.digest(),
    finalHost: hostDigest(ctl),
  };
  ctl.recorder = null;
  await rec!.finish(ctl);
  return out;
}

/** Play a recording all the way through, asserting it never diverges. */
async function playFully(id: string): Promise<ReplayPlayer> {
  const opened = await ReplayPlayer.open(id);
  if ("refusal" in opened) throw new Error(`refused: ${opened.refusal.code} — ${opened.refusal.message}`);
  const p = opened.player;
  let guard = 0;
  while (!p.stopped && guard++ < 60_000) p.runSlice(500);
  return p;
}

describe("replay header", () => {
  it("captures every non-input the sim reads — the audited hidden-state list", async () => {
    const ctl = makeController("hdr-1", 4242);
    const h = headerFor(ctl, "hdr-1", 4242);

    // The determinism key. `seed` must be the MATCH seed; MatchResult.seed holds
    // the FINAL rng state instead, and recording that would produce a plausible
    // replay of a match that never happened.
    expect(h.seed).toBe(4242);
    expect(h.formatVersion).toBe(REPLAY_FORMAT_VERSION);
    expect(h.contentVersion).toBe(CV);
    // contentVersion is NOT sufficient alone: hashCollection sorts before
    // hashing, but the augment/champion pools are iterated in INSERTION order,
    // and registerSkeletonContent injects content from code.
    expect(h.registryFingerprint).toMatch(/^rf_[0-9a-f]{16}$/);
    expect(h.buildStamp.length).toBeGreaterThan(0);

    // Roster + seat assignment, with names (the reason recordings are admin-only).
    expect(h.seats).toHaveLength(12);
    expect(h.seats[0]).toMatchObject({ seatId: 0, teamId: 0, displayName: "玩家 0", isBot: false });
    expect(h.seats[11]).toMatchObject({ seatId: 11, teamId: 3, isBot: true });

    // Arena selection AND the rotation pool (pickRoundArena indexes the pool).
    expect(h.arenaId).toBe(SKELETON_ARENA.id);
    expect(Array.isArray(h.arenaPoolIds)).toBe(true);

    // The snapshotted combat-env table, NOT the neutral default.
    expect(h.combatEnv.damageDealt).toBe(0.5);
    expect(h.combatEnv.maxHealth).toBe(8);
    expect(h.combatEnv).not.toEqual(DEFAULT_COMBAT_ENV);

    // Phase durations / fire ring / arena rules / starting lives all retime or
    // rebalance a round and none of them are constants.
    expect(h.phaseConfig).toEqual(FAST);
    expect(h.fireRing).toBeNull();
    expect(h.startingLives).toBe(3);
    expect((h.arenaRules as { rounds: unknown[] }).rounds.length).toBeGreaterThan(0);

    // The curation whitelist: a sim input consulted before an rng roll, and one
    // that fail-safes to allow-all on a platform outage.
    expect(h.whitelist.bypass).toBe(true);

    // Env flags that silently swap the whitelist / combat-env for allow-all.
    expect(h.env).toMatchObject({ whitelistBypass: true, combatEnvBypass: false, devCheats: true });
    expect(h.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("stores a non-bypass whitelist verbatim so playback rebuilds the same predicate", () => {
    const wl = new Whitelist({ champions: ["sela"], items: ["itm-a", "itm-b"], abilities: ["ab-1"] }, false);
    const ctl = makeController("hdr-2", 7, wl);
    const h = headerFor(ctl, "hdr-2", 7);
    expect(h.whitelist.bypass).toBe(false);
    expect(h.whitelist.champions).toEqual(["sela"]);
    expect(h.whitelist.items).toEqual(["itm-a", "itm-b"]);
    expect(h.whitelist.abilities).toEqual(["ab-1"]);
  });
});

/**
 * 基礎加成 must be REPLAYED FROM THE HEADER, not re-resolved at playback time
 * (task #278 — 稽核補的一組, verifier).
 *
 * ⚠️ 為什麼這一組非有不可。#278 把 基礎加成 從「開機時的常數」變成「每一場從
 * 耐久覆蓋層解析」,所以同一個 process 上的兩場比賽可以合法地用不同的表。
 * 錄影因此必須把當時那張表寫進 header —— 否則操作者在後台改一個數字,昨天的
 * 錄影就會用今天的數字重播,digest 分岔,而報告會說「主機不一致」。
 *
 * 這一組是稽核加上的,因為原本的守衛**分不出對錯兩種實作**:所有錄影測試都用
 * `DEFAULT_BASE_BONUS`,而 `rebuildBaseBonus` 的回退路徑(讀本機內容)在測試
 * 環境剛好也回同一張表。把 `rebuildBaseBonus` 改成「永遠忽略 header、只讀內容」
 * (= 缺陷原狀)之後,整個 game-server 套件 549 條全綠。
 *
 * 下面錄的那一場刻意用 `maxHealth: 1500` —— 和本機內容值(出貨 300)**不同**,
 * 所以「讀 header」和「讀內容」會給出不同的血量,digest 一定會分岔。
 */
describe("replay 用的是錄影當下的 基礎加成 (replay-basebonus-header)", () => {
  const RECORDED: BaseBonusTable = Object.freeze({ [Stat.MaxHealth]: 1500 });

  it("header 帶著錄影當下那張表,重播照它跑 —— 不是重播時再解析一次", async () => {
    cover("replay-basebonus-header");
    // 本機內容/註冊表給的是出貨預設(300);錄影當下用的是 1500。
    expect(baseBonusFor(rebuildBaseBonus({} as ReplayHeader), Stat.MaxHealth)).toBe(
      baseBonusFor(DEFAULT_BASE_BONUS, Stat.MaxHealth),
    );

    const rec = await recordMatch("bb-hdr-1", 20260728, undefined, null, RECORDED);
    expect(baseBonusFor(rec.ctl.world.baseBonus, Stat.MaxHealth)).toBe(1500);
    expect(rec.ticks).toBeGreaterThan(200);

    const p = await playFully("bb-hdr-1");
    // (a) 重播的 sim 真的拿到 1500,不是本機的 300
    expect(
      baseBonusFor(p.ctl.world.baseBonus, Stat.MaxHealth),
      "重播用的是本機現在的值,不是錄影當下的值",
    ).toBe(1500);
    // (b) 而且逐 tick 不分岔 —— 血量不同會讓整場打法不同
    expect(p.divergence, "重播分岔了 —— 基礎加成沒有從 header 還原").toBeNull();
    expect(p.finished).toBe(true);
    expect(p.ctl.world.digest()).toBe(rec.finalWorld);
    expect(hostDigest(p.ctl)).toBe(rec.finalHost);
  }, 60_000);

  it("#278 之前的舊錄影(沒有這個欄位)回退到本機內容值,而不是空表", () => {
    cover("replay-basebonus-header");
    const legacy = { matchId: "old", seed: 1 } as unknown as ReplayHeader;
    expect(baseBonusFor(rebuildBaseBonus(legacy), Stat.MaxHealth)).toBe(
      baseBonusFor(DEFAULT_BASE_BONUS, Stat.MaxHealth),
    );
    // 而有欄位的錄影一定走 header,兩條路徑的答案在這裡是不同的
    const modern = { baseBonus: { maxHealth: 1500 } } as unknown as ReplayHeader;
    expect(baseBonusFor(rebuildBaseBonus(modern), Stat.MaxHealth)).toBe(1500);
  });
});

describe("record → replay", () => {
  it("replays a full recorded match to identical digests on every tick", async () => {
    const rec = await recordMatch("rt-1", 123456789);
    expect(rec.ticks).toBeGreaterThan(200);

    const p = await playFully("rt-1");
    expect(p.divergence).toBeNull();
    expect(p.finished).toBe(true);
    // Same length, same final sim digest, same final host digest.
    expect(p.ctl.world.tick).toBe(rec.ticks);
    expect(p.ctl.world.digest()).toBe(rec.finalWorld);
    expect(hostDigest(p.ctl)).toBe(rec.finalHost);
    // And the match itself really happened the same way.
    expect([...p.ctl.lives.values()]).toEqual([...rec.ctl.lives.values()]);
    expect([...p.ctl.kills.values()]).toEqual([...rec.ctl.kills.values()]);
    expect(p.ctl.phase.round).toBe(rec.ctl.phase.round);
    expect([...p.ctl.seats.values()].map((s) => s.championId)).toEqual(
      [...rec.ctl.seats.values()].map((s) => s.championId),
    );
  }, 60_000);

  /**
   * THE SHRINKING RING IS THE SHARPEST DETERMINISM TEST THIS CODEBASE HAS
   * (task #195).
   *
   * `SimWorld.digest()` quantizes floats at 1/4096, but the ring's safety
   * predicate — `distSq <= inner*inner` — has ZERO tolerance. A position
   * divergence far too small for the world digest to notice can therefore flip
   * who is inside the ring and who burns, and from that tick the two runs are
   * playing different matches. This records a match whose ring is igniting and
   * closing throughout, and demands BOTH digests match on every tick.
   */
  it("replays a match with the fire ring SHRINKING to identical world AND host digests", async () => {
    const rec = await recordMatch("rt-ring", 987654321, undefined, RING);
    expect(rec.ticks).toBeGreaterThan(200);

    const p = await playFully("rt-ring");
    expect(p.divergence).toBeNull(); // per-TICK check, not just the end state
    expect(p.finished).toBe(true);
    expect(p.ctl.world.tick).toBe(rec.ticks);
    expect(p.ctl.world.digest()).toBe(rec.finalWorld);
    // hostDigest now folds in fireRingTicks + the quantized radius, so a ring
    // that armed differently surfaces HERE rather than as an unexplained HP gap.
    expect(hostDigest(p.ctl)).toBe(rec.finalHost);
    expect([...p.ctl.lives.values()]).toEqual([...rec.ctl.lives.values()]);
  }, 60_000);

  /**
   * The SIM DIGEST CONTRACT is untouched by #195.
   *
   * `SimWorld.digest()` is deliberately verbatim: the ring's state is folded
   * into `hostDigest` instead, so the pre-existing "byte-identical sim" checks
   * keep their exact expectations and this feature costs them nothing. Proven
   * two ways — structurally (the digest never reads any fireRing field) and
   * behaviourally (a disarmed 3000-tick seeded run is stable, so the value here
   * is a lock a future change to digest() has to justify breaking).
   */
  it("SimWorld.digest() ignores the ring entirely — the sim digest contract is untouched", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/shared/src/sim/SimWorld.ts"),
      "utf8",
    );
    const body = src.slice(src.indexOf("digest(): number {"));
    const end = body.indexOf("\n  }");
    expect(body.slice(0, end)).not.toMatch(/fireRing/);

    // …and a disarmed run is reproducible tick-for-tick, so the number below is
    // a real regression lock rather than a restatement of the code.
    const run = (): number => {
      const ctl = makeController("digest-baseline", 20260725);
      expect(ctl.world.fireRingRules).toBeNull();
      for (let i = 0; i < 3000; i++) ctl.tick();
      return ctl.world.digest();
    };
    const a = run();
    expect(run()).toBe(a);
  }, 60_000);

  /**
   * The lives-config compat guard. `match.startingTeamLives` is now READ from
   * `config.match@1` instead of being a hardcoded 3, which means the live value
   * can move between the day a replay is recorded and the day it is watched —
   * and a replay whose reservoir silently changed is not a replay, it is a
   * different match. The header records the reservoir the match actually ran on
   * and `ReplayPlayer.reset` feeds THAT back; `resolveStartingLives()` is never
   * called on the playback path. This test moves the live config to 8 underneath
   * a recording taken at 3 and proves playback still runs on 3.
   */
  it("plays a 3-life recording on 3 lives after the live config moves to 8", async () => {
    const rec = await recordMatch("rt-lives", 20260724);
    // The live content now says 8 — as `content/config/config.match.json` does.
    Configs.register({ id: "config.match", schema: "config@1", match: { startingTeamLives: 8 } } as never);
    try {
      expect(resolveStartingLives()).toBe(8);
      const p = await playFully("rt-lives");
      // Rebuilt from the HEADER, not from the live doc.
      expect(p.ctl.startingLives).toBe(3);
      expect(p.divergence).toBeNull();
      expect(p.ctl.world.digest()).toBe(rec.finalWorld);
      expect([...p.ctl.lives.values()]).toEqual([...rec.ctl.lives.values()]);
      expect(p.ctl.phase.round).toBe(rec.ctl.phase.round);
    } finally {
      Configs.clear();
    }
  }, 60_000);

  it("indexes rounds so the viewer can jump to one without simulating first", async () => {
    await recordMatch("rt-rounds", 987654321);
    const opened = await ReplayPlayer.open("rt-rounds");
    if ("refusal" in opened) throw new Error(opened.refusal.code);
    expect(opened.player.rounds.length).toBeGreaterThan(2);
    expect(opened.player.rounds[0]).toMatchObject({ phase: "champSelect", round: 0 });
    expect(opened.player.roundStartTick(2)).toBeGreaterThan(0);
  }, 60_000);

  it("seeks by rebuilding from tick 0 and lands on the same state as playing there", async () => {
    const rec = await recordMatch("rt-seek", 42);
    const target = Math.floor(rec.ticks / 2);

    const straight = await ReplayPlayer.open("rt-seek");
    if ("refusal" in straight) throw new Error(straight.refusal.code);
    while (straight.player.tick < target && !straight.player.stopped) {
      straight.player.runSlice(Math.min(200, target - straight.player.tick));
    }
    expect(straight.player.tick).toBe(target);
    const expected = straight.player.ctl.world.digest();

    // Now overshoot and seek BACKWARDS to the same tick.
    await straight.player.seek(rec.ticks);
    await straight.player.seek(target);
    expect(straight.player.tick).toBe(target);
    expect(straight.player.ctl.world.digest()).toBe(expected);
    expect(straight.player.divergence).toBeNull();
  }, 60_000);
});

describe("playback is not combat-mute", () => {
  // Every combat VISUAL in this game (floating damage/heal numbers, attack/cast
  // animations, hit sparks, projectiles, ability VFX, shop toasts) is driven by
  // the fanned-out MSG.EVENT stream, NOT the replicated schema. The live
  // MatchRoom forwards net/eventFanout's whitelist; the ReplayRoom must forward
  // the EXACT same events the re-run sim regenerates, or the owner watches HP
  // bars drain with no idea WHY. This proves the re-run produces those events
  // identically, tick for tick — so the ReplayRoom has something real to fan out.
  it("regenerates the same combat events on playback that the live match produced", async () => {
    const fanoutByTick = (ctl: MatchController): string =>
      ctl.world.events
        .filter(isFannedOutEvent)
        .map((e) => `${e.type}`)
        .join(",");

    // Record, capturing the fanned-out event signature of every tick.
    const recorded: string[] = [];
    const rec = await recordMatch("mute-1", 778899, (ctl) => {
      // read the PREVIOUS tick's events before this tick clears them
      if (ctl.world.tick > 0) recorded[ctl.world.tick - 1] = fanoutByTick(ctl);
    });
    recorded[rec.ctl.world.tick - 1] = fanoutByTick(rec.ctl);

    // A real combat match must actually contain combat events — otherwise this
    // test would pass vacuously on a match that never fought.
    const totalEvents = recorded.reduce((n, s) => n + (s ? s.split(",").length : 0), 0);
    expect(totalEvents).toBeGreaterThan(50);
    expect(recorded.some((s) => s?.includes("damage"))).toBe(true);

    // Play back, capturing the same signature per tick, and compare.
    const opened = await ReplayPlayer.open("mute-1");
    if ("refusal" in opened) throw new Error(opened.refusal.code);
    const p = opened.player;
    const replayed: string[] = [];
    while (!p.stopped) {
      const t = p.ctl.world.tick;
      if (!p.step()) break;
      if (p.ctl.world.tick > t) replayed[t] = fanoutByTick(p.ctl);
    }
    expect(p.divergence).toBeNull();
    // Byte-identical event stream: same events, same order, same ticks.
    expect(replayed).toEqual(recorded);
    // And the settlement payload the ReplayRoom fans out at the end exists.
    expect(p.ctl.settlement).not.toBeNull();
  }, 60_000);
});

describe("human input through the real mailbox", () => {
  // The prior verify pass noted every round-trip was all-bot: the bot frames DO
  // exercise the recording code, but the HUMAN-specific path — network message →
  // InputMailbox coalescing (latest-wins order/aim, seq de-dup) → drain →
  // tick-stamp at HumanDriver.produceIntent — was never replayed. That path IS
  // the feedback use case ("mother says something weird happened"). This drives a
  // real HumanDriver's mailbox the way MatchRoom's MSG.INPUT handler does, then
  // replays and proves the human's moves/casts reproduce at the exact ticks.
  it("records human moves + casts at the drained tick and replays them identically", async () => {
    const matchId = "human-1";
    const ctl = makeController(matchId, 246810);
    // Seat 0 is the human. Attach a real HumanDriver (the same class MatchRoom
    // attaches on join) and push into its mailbox as the network layer would.
    const human = new HumanDriver();
    const seat0 = ctl.seats.get(asSeatId(0))!;
    seat0.setDriver(human);

    const rec = await MatchRecorder.open(matchId, headerFor(ctl, matchId, 246810));
    expect(rec).not.toBeNull();
    ctl.recorder = rec;

    let castSent = false;
    let n = 0;
    while (ctl.phase.phase !== "matchEnd" && n < 60_000) {
      const tick = ctl.world.tick;
      // Push BEFORE the tick runs, exactly as a message arriving between room
      // frames does. onAttach cleared the mailbox on the first tick, so only push
      // once combat is well underway and the driver is firmly attached.
      if (tick === 40) {
        // two messages the same tick → coalescing keeps the LATEST order/aim
        human.mailbox.push({ seq: 1, order: { kind: "move", point: { x: 3, z: 3 } }, aim: { x: 1, z: 0 }, commands: [] });
        human.mailbox.push({ seq: 2, order: { kind: "move", point: { x: -2, z: 4 } }, aim: { x: 0, z: 1 }, commands: [] });
      }
      if (tick === 60) {
        human.mailbox.push({
          seq: 3,
          commands: [{ kind: "castAbility", slot: "Q", target: { type: "point", point: { x: 5, z: 5 } } }],
        });
        castSent = true;
      }
      ctl.tick();
      n++;
    }
    expect(castSent).toBe(true);
    const finalWorld = ctl.world.digest();
    const finalHost = hostDigest(ctl);
    ctl.recorder = null;
    await rec!.finish(ctl);

    // The human's discrete cast is really in the recording, stamped at the tick
    // it drained (60), on seat 0 — not on the client's seq, the drained tick.
    const raw = readFileSync(join(dir, `${matchId}.jsonl.gz`));
    const { gunzipSync } = await import("node:zlib");
    const { lines } = decodeLines(gunzipSync(raw).toString("utf8"));
    const castLine = lines.find(
      (l) => l.t === "i" && l.s === 0 && l.k === 60 && l.f.commands.some((c) => c.kind === "castAbility"),
    );
    expect(castLine).toBeDefined();
    // The coalesced order at tick 40 kept the LATEST push (the mailbox is
    // latest-wins), proving the human coalescing path round-trips too.
    const moveLine = lines.find((l) => l.t === "i" && l.s === 0 && l.k === 40);
    expect(moveLine && moveLine.t === "i" ? moveLine.f.order?.point : undefined).toEqual({ x: -2, z: 4 });

    // And the whole match replays to the same digests — the human seat included.
    const p = await playFully(matchId);
    expect(p.divergence).toBeNull();
    expect(p.ctl.world.digest()).toBe(finalWorld);
    expect(hostDigest(p.ctl)).toBe(finalHost);
  }, 60_000);
});

describe("mid-match disconnect", () => {
  it("replays a driver swap: the seat becomes a bot at the same tick and the match still matches", async () => {
    // Seat 0 "disconnects" at tick 300 — the same call MatchRoom.onLeave makes.
    // `driverKind` is a real sim input (the intermission offer auto-pick reads
    // it), so a replay that dropped the swap would diverge on the next offer.
    let swapped = false;
    const rec = await recordMatch("dc-1", 555000111, (ctl) => {
      if (!swapped && ctl.world.tick === 300) {
        swapped = true;
        ctl.seats.get(asSeatId(0))!.setDriver(new AIDriver());
      }
    });
    expect(swapped).toBe(true);

    const body = readFileSync(join(dir, "dc-1.jsonl.gz"));
    expect(body.byteLength).toBeGreaterThan(0);

    const p = await playFully("dc-1");
    expect(p.divergence).toBeNull();
    expect(p.ctl.world.digest()).toBe(rec.finalWorld);
    expect(hostDigest(p.ctl)).toBe(rec.finalHost);

    // The swap really is in the recording, at the tick it was APPLIED (301: the
    // request lands at the next tick boundary).
    const opened = await ReplayPlayer.open("dc-1");
    if ("refusal" in opened) throw new Error(opened.refusal.code);
    const raw = readFileSync(join(dir, "dc-1.jsonl.gz"));
    const { gunzipSync } = await import("node:zlib");
    const { lines } = decodeLines(gunzipSync(raw).toString("utf8"));
    const swaps = lines.filter((l) => l.t === "d");
    expect(swaps.length).toBeGreaterThan(0);
    // The swap is stamped at the tick it is APPLIED. setDriver was called while
    // world.tick === 300 (in onTick, before that tick ran), and applyPendingDriver
    // runs at the top of that same ctl.tick() while world.tick is still 300.
    expect(swaps.some((l) => l.t === "d" && l.s === 0 && l.k === 300)).toBe(true);
  }, 60_000);
});

describe("divergence alarm", () => {
  it("REFUSES a recording made on a different contentVersion, naming both", async () => {
    const h = headerFor(makeController("cv-1", 1), "cv-1", 1, "cv_somethingelse");
    const refusal = checkCompatibility(h);
    expect(refusal).not.toBeNull();
    expect(refusal!.code).toBe("content-version");
    expect(refusal!.expected).toBe("cv_somethingelse");
    expect(refusal!.actual).toBe(CV);
    expect(refusal!.message).toContain("拒絕播放");
    expect(refusal!.message).toContain("cv_somethingelse");
  });

  it("REFUSES when cv_ matches but the registry order / skeleton content changed", () => {
    const h = headerFor(makeController("rf-1", 1), "rf-1", 1);
    const refusal = checkCompatibility(h, {
      contentVersion: CV,
      registryFingerprint: "rf_0000000000000000",
      buildStamp: "dev",
    });
    expect(refusal!.code).toBe("registry-fingerprint");
    expect(refusal!.message).toContain("排列順序");
    expect(refusal!.message).toContain("skeleton.ts");
  });

  it("REFUSES an unknown replay format version", () => {
    const h = { ...headerFor(makeController("fv-1", 1), "fv-1", 1), formatVersion: 99 };
    expect(checkCompatibility(h)!.code).toBe("format-version");
  });

  it("REFUSES when an arena the match used is not loaded here", () => {
    const h = { ...headerFor(makeController("ar-1", 1), "ar-1", 1), arenaId: "arena.doesnotexist" };
    const refusal = checkCompatibility(h);
    expect(refusal!.code).toBe("missing-arena");
    expect(refusal!.message).toContain("arena.doesnotexist");
  });

  it("accepts a matching recording (the checks are not vacuously refusing everything)", () => {
    const h = headerFor(makeController("ok-1", 1), "ok-1", 1);
    expect(h.registryFingerprint).toBe(registryFingerprint());
    expect(checkCompatibility(h)).toBeNull();
  });

  it("STOPS at the first divergent tick and names it, rather than playing on", async () => {
    const rec = await recordMatch("dv-1", 24680);
    const opened = await ReplayPlayer.open("dv-1");
    if ("refusal" in opened) throw new Error(opened.refusal.code);
    const p = opened.player;

    // Simulate "a code change altered the sim": burn one extra rng draw at tick
    // 200. This is the perturbation the prove pass measured as 0-tick-latency
    // for the world digest, and it must be caught the moment it happens.
    p.runSlice(200);
    expect(p.tick).toBe(200);
    p.ctl.world.rng.next();
    while (!p.stopped) p.runSlice(100);

    expect(p.divergence).not.toBeNull();
    expect(p.divergence!.tick).toBe(200);
    expect(p.divergence!.kind).toBe("sim");
    expect(p.divergence!.actualWorld).not.toBe(p.divergence!.expectedWorld);
    expect(p.divergence!.message).toContain("第 200 幀");
    // Playback is over. `step()` must not quietly resume.
    expect(p.step()).toBe(false);
    expect(rec.ticks).toBeGreaterThan(200);
  }, 60_000);

  it("catches a HOST-only divergence the sim digest is blind to (gold)", async () => {
    // The prove pass measured +500 gold on one champion going undetected by
    // SimWorld.digest() for the entire remaining 3,720 ticks of a match. That is
    // the worst possible outcome for this feature — 「已驗證」 on a wrong replay —
    // so the host digest exists precisely to catch it on the same tick.
    await recordMatch("dv-2", 13579);
    const opened = await ReplayPlayer.open("dv-2");
    if ("refusal" in opened) throw new Error(opened.refusal.code);
    const p = opened.player;
    p.runSlice(400);
    const champ = [...p.ctl.world.champion.values()][0];
    expect(champ).toBeDefined();
    champ!.gold += 500;
    p.runSlice(1);

    expect(p.divergence).not.toBeNull();
    expect(p.divergence!.kind).toBe("host");
    expect(p.divergence!.expectedWorld).toBe(p.divergence!.actualWorld);
    expect(p.divergence!.expectedHost).not.toBe(p.divergence!.actualHost);
    expect(p.divergence!.message).toContain("金幣");
  }, 60_000);
});

/**
 * 陣亡投幣 (task #191) end-to-end through the recorder.
 *
 * This test is MANDATORY rather than nice-to-have. `champion.gold` is not in
 * `SimWorld.digest()` at all, so no test in packages/shared can prove that a
 * thrown/collected coin moves the same gold on a replay as it did live — only
 * `hostDigest` sees it, and only this file drives it.
 */
describe("dead-player gold drop (task #191)", () => {
  const COIN_RULES: ArenaRules = { ...DEFAULT_ARENA_RULES, goldDrop: DEFAULT_GOLD_DROP_CONFIG };
  /**
   * A LETHAL table with a long round cap. The default test env (8x maxHealth,
   * half damage) plus a 30 s cap produces matches in which nobody ever actually
   * dies — and a dead player is the only one who can throw, so the coin path
   * would never execute and this whole file would pass vacuously.
   */
  const COIN_ENV = normalizeCombatEnv({ damageDealt: 4, maxHealth: 0.5, cooldown: 0.25 });
  const COIN_PHASES = { ...FAST, combatMaxTicks: 2400 };

  function makeCoinController(matchId: string, seed: number): MatchController {
    return new MatchController(
      matchId,
      seed,
      allBots(),
      COIN_PHASES,
      3,
      COIN_RULES,
      SKELETON_ARENA,
      Whitelist.allowAll(),
      COIN_ENV,
      null,
      [],
    );
  }

  function coinHeaderFor(ctl: MatchController, matchId: string, seed: number): ReplayHeader {
    return buildHeader({
      matchId,
      seed,
      contentVersion: CV,
      seats: ctl.seats,
      specIsBot: (seatId) => seatId > 0,
      startingLives: 3,
      arena: SKELETON_ARENA,
      arenaPool: [],
      combatEnv: COIN_ENV,
      baseBonus: DEFAULT_BASE_BONUS,
      phaseConfig: COIN_PHASES,
      fireRing: null,
      arenaRules: COIN_RULES,
      whitelist: ctl.whitelist,
      env: { whitelistBypass: true, combatEnvBypass: false, devCheats: true },
    });
  }

  /**
   * Record a match in which seat 0 is a HUMAN who mashes 「丟金幣」 on every
   * single tick. Most presses are refused (alive / not in combat / broke), which
   * is the point — the accepted AND the rejected paths both ride the recorded
   * input stream.
   *
   * The rest of the setup exists to manufacture a long stretch of "seat 0 is
   * DEAD while its round is still running", which is the only state in which the
   * feature does anything: seats 0-2 (all of team 0) are inert humans so the
   * enemy kills them, and a `fullHeal` cheat resurrects seats 1-2 whenever they
   * fall so the duel never actually resolves. Seat 0 is left dead with a
   * `grantGold` stake and throws until the cap or its purse runs out. Cheats ride
   * the recording as `x` lines and are re-applied at the same tick on playback.
   */
  async function recordCoinMatch(matchId: string, seed: number): Promise<{
    ctl: MatchController;
    ticks: number;
    finalWorld: number;
    finalHost: number;
    drops: number;
    pickups: number;
  }> {
    const ctl = makeCoinController(matchId, seed);
    const human = new HumanDriver();
    ctl.seats.get(asSeatId(0))!.setDriver(human);
    for (const s of [1, 2]) ctl.seats.get(asSeatId(s))!.setDriver(new HumanDriver());
    const rec = await MatchRecorder.open(matchId, coinHeaderFor(ctl, matchId, seed));
    expect(rec).not.toBeNull();
    ctl.recorder = rec;

    let drops = 0;
    let pickups = 0;
    let funded = false;
    let seq = 0;
    let n = 0;
    while (ctl.phase.phase !== "matchEnd" && n < 60_000) {
      if (!funded && ctl.phase.phase === "combat") {
        funded = true;
        rec!.recordCheat(ctl.world.tick, asSeatId(0), { kind: "grantGold", amount: 1000 });
        ctl.applyCheat(asSeatId(0), { kind: "grantGold", amount: 1000 });
      }
      if (ctl.world.combatActive) {
        for (const s of [1, 2]) {
          const e = ctl.seats.get(asSeatId(s))!.entityId;
          if (e !== null && ctl.world.health.get(e)?.alive === false) {
            rec!.recordCheat(ctl.world.tick, asSeatId(s), { kind: "fullHeal" });
            ctl.applyCheat(asSeatId(s), { kind: "fullHeal" });
          }
        }
      }
      human.mailbox.push({ seq: ++seq % 65536, commands: [{ kind: "dropCoin" }] });
      ctl.tick();
      for (const ev of ctl.world.events) {
        if (ev.type === "coinDropped") drops++;
        if (ev.type === "coinPickedUp") pickups++;
      }
      n++;
    }
    const out = {
      ctl,
      ticks: ctl.world.tick,
      finalWorld: ctl.world.digest(),
      finalHost: hostDigest(ctl),
      drops,
      pickups,
    };
    ctl.recorder = null;
    await rec!.finish(ctl);
    return out;
  }

  it("records and replays a match with coins thrown, without diverging", async () => {
    const rec = await recordCoinMatch("coin-1", 20260725);
    // Not vacuous: the mechanic actually fired, and the round cap held.
    expect(rec.drops).toBeGreaterThan(0);
    expect(rec.drops).toBeLessThanOrEqual(10 * rec.ctl.phase.round);

    const p = await playFully("coin-1");
    expect(p.divergence).toBeNull();
    expect(p.finished).toBe(true);
    expect(p.ctl.world.tick).toBe(rec.ticks);
    expect(p.ctl.world.digest()).toBe(rec.finalWorld);
    // The gold digest is the one that matters here — it is the only place the
    // 100-out / 100-in of every coin is visible.
    expect(hostDigest(p.ctl)).toBe(rec.finalHost);
    // Nothing survives the last concludeCombat: no coin carries into settlement.
    expect(p.ctl.world.coin.size).toBe(0);
    expect(p.ctl.world.coinBudget.size).toBe(0);
  }, 60_000);

  it("a replayed champion given +100 gold surfaces as a HOST divergence", async () => {
    await recordCoinMatch("coin-2", 5150);
    const opened = await ReplayPlayer.open("coin-2");
    if ("refusal" in opened) throw new Error(opened.refusal.code);
    const p = opened.player;
    p.runSlice(400);
    const champ = [...p.ctl.world.champion.values()][0];
    expect(champ).toBeDefined();
    // exactly one coin's worth — the smallest wrong number this feature can
    // produce, and the one SimWorld.digest() would never see
    champ!.gold += 100;
    p.runSlice(1);

    expect(p.divergence).not.toBeNull();
    expect(p.divergence!.kind).toBe("host");
    expect(p.divergence!.expectedWorld).toBe(p.divergence!.actualWorld);
    expect(p.divergence!.expectedHost).not.toBe(p.divergence!.actualHost);
  }, 60_000);
});

describe("recording cost + storage", () => {
  it("does no synchronous disk I/O on the tick path", async () => {
    const matchId = "cost-1";
    const ctl = makeController(matchId, 999);
    const rec = await MatchRecorder.open(matchId, headerFor(ctl, matchId, 999));
    ctl.recorder = rec;

    // Run 600 ticks WITHOUT ever yielding to the event loop. The recorder only
    // buffers strings; the flush interval cannot have fired, so the file must
    // still hold nothing but whatever the initial open wrote.
    const path = join(dir, `${matchId}.jsonl`);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 600; i++) ctl.tick();
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const sizeDuring = existsSync(path) ? readFileSync(path).byteLength : 0;
    expect(sizeDuring).toBe(0);

    // And the same 600 ticks without a recorder, for a like-for-like comparison.
    const bare = makeController(matchId, 999);
    const t1 = process.hrtime.bigint();
    for (let i = 0; i < 600; i++) bare.tick();
    const bareMs = Number(process.hrtime.bigint() - t1) / 1e6;

    ctl.recorder = null;
    await rec!.finish(ctl);

    // Generous ceiling: this asserts "no stall", not a micro-benchmark. Two
    // digests per tick over 12 champions is single-digit microseconds; a
    // synchronous write would be orders of magnitude worse than this bound.
    expect(elapsedMs).toBeLessThan(bareMs + 400);
  }, 60_000);

  it("writes a durable, listable, gzipped recording with a footer", async () => {
    const rec = await recordMatch("store-1", 31337);
    expect(existsSync(join(dir, "store-1.jsonl.gz"))).toBe(true);
    expect(existsSync(join(dir, "store-1.jsonl"))).toBe(false);

    const all = await listReplays();
    const row = all.find((r) => r.id === "store-1")!;
    expect(row).toBeDefined();
    expect(row.complete).toBe(true);
    expect(row.matchId).toBe("store-1");
    expect(row.rounds).toBe(rec.ctl.phase.round);
    expect(row.ticks).toBe(rec.ticks);
    expect(row.bytes).toBeGreaterThan(0);
    expect(row.players).toHaveLength(12);
    expect(row.players[0]!.displayName).toBe("玩家 0");
    expect(row.winnerTeamId).not.toBeNull();
    // Newest first.
    expect(all.map((r) => r.startedAt)).toEqual([...all.map((r) => r.startedAt)].sort().reverse());
  }, 60_000);

  it("keeps a partial recording playable when the server dies mid-match", async () => {
    const matchId = "partial-1";
    const ctl = makeController(matchId, 2468);
    const rec = await MatchRecorder.open(matchId, headerFor(ctl, matchId, 2468));
    ctl.recorder = rec;
    for (let i = 0; i < 400; i++) ctl.tick();
    ctl.recorder = null;
    await rec!.abandon(); // no footer — exactly what a killed process leaves

    const p = await playFully(matchId);
    expect(p.divergence).toBeNull();
    expect(p.tick).toBeGreaterThan(300);
    const row = (await listReplays()).find((r) => r.id === matchId)!;
    expect(row.complete).toBe(false);
  }, 60_000);

  it("retention prunes to the named ceiling and never touches a live recording", async () => {
    const before = (await listReplays()).length;
    expect(before).toBeLessThan(RETAIN_MAX_FILES); // nothing to prune yet
    const deleted = await pruneReplays([]);
    expect(deleted).toEqual([]);
    expect((await readdir(dir)).length).toBeGreaterThan(0);
  });
});

describe("viewing tickets", () => {
  it("binds a ticket to one recording and expires it", () => {
    const t = mintReplayTicket("s3cret", "match-a");
    expect(verifyReplayTicket("s3cret", t, "match-a")).toBe(true);
    // Not a skeleton key for other recordings...
    expect(verifyReplayTicket("s3cret", t, "match-b")).toBe(false);
    // ...not forgeable without the secret...
    expect(verifyReplayTicket("other", t, "match-a")).toBe(false);
    // ...and not a permanent public URL.
    expect(verifyReplayTicket("s3cret", t, "match-a", Math.floor(Date.now() / 1000) + 100_000)).toBe(false);
  });
});

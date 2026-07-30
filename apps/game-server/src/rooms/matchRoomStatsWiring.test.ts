/**
 * #207 對戰事件記錄 —— **出貨接線**的守衛。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼 `analytics/analytics.test.ts` 不夠(它已經很好,但守的不是這個)
 * ─────────────────────────────────────────────────────────────────────────────
 * 隔壁那一份自己 `new MatchController(...)`、自己 `MatchStatsRecorder.open(...)`、
 * 再手寫 `ctl.statsSink = rec`。它證明的是「**如果**有人把 recorder 接上去,
 * 檔案的內容是對的」。
 *
 * 而真正出貨的接線在 `MatchRoom.onCreate` —— 線上每一場比賽走的是那一段,不是
 * 測試自己接的那一段。把 `MatchRoom.ts` 的
 *
 *     this.statsRecorder = await MatchStatsRecorder.open(matchId, {...});
 *
 * 整段換成 `this.statsRecorder = null`(= 線上每一場比賽都不記錄任何東西),
 * **`analytics.test.ts` 仍然 10 條全綠**(2026-07-30 實測)。
 * 這是第③號(刪掉還全綠)+ 第⑤號(被測的不是出貨的那個)故障疊在一起。
 *
 * 所以這一份**只**做隔壁那份做不到的事:起一個真的 `MatchRoom`、走真的
 * `onCreate`、驅動真的 `loop()` 打完一場、然後**從磁碟讀回檔案**。
 * 內容的細節(delta 語意、聚合對得起來、名次排序)留給隔壁,不重覆。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 突變驗證(2026-07-30 逐一實際跑過,每一條都改壞 → 看紅 → 改回來)
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `MatchRoom.onCreate` 的 `MatchStatsRecorder.open(...)` 整段改成
 *     `this.statsRecorder = null` → **3 條全紅**(檔案根本不存在),
 *     而 `analytics.test.ts` 同一次跑 **10 條全綠**。
 *     這正是駁斥者複現、而在這個檔案之前沒有任何一條測試會紅的那個突變。
 *  2. 拿掉 `this.ctl.statsSink = this.statsRecorder`(recorder 開了但沒接上
 *     controller)→ 2 紅 1 綠:header 照樣落地(第 1 條綠),但一行 round 都
 *     沒有(`[] !== [1,2]` / `[1..10] !== [10]`)。
 *  3. 拿掉 `finishMatch()` 裡的 `await stats.finish(this.ctl)` → 2 紅 1 綠:
 *     沒有 final 行,「打完一場」與後台列表的 `complete` 兩邊都翻掉。
 *  4. 拿掉 `onDispose()` 裡的 `void stats?.abandon()` → 「中斷」那條紅:場次 id
 *     永遠留在 `liveStatsIds()` 裡,保存規則從此跳過那個檔,而同一個 matchId
 *     再也開不了第二個 recorder。
 *
 * ⚠️ 斷言一律讀**磁碟上真的產生的那份輸出**,不讀記憶體裡的 recorder。
 * `ctl.ledger` 只在「中斷」那一條當 **oracle**(應該被寫出去的是什麼),
 * 斷言的方向永遠是「磁碟必須含有帳本已經結算的每一個回合」。
 *
 * ⛔ 統計檔**和**回放檔全程寫 `os.tmpdir()` 下的 mkdtemp 目錄,afterAll 刪掉;
 * 不碰 repo 的 `data/`,更不碰線上。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Configs } from "@ggd/shared/content";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Augments } from "@ggd/shared/sim/content/registry";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { ModOp } from "@ggd/shared/sim/stats/modifiers";
import type { AugmentTier } from "@ggd/shared/sim/content/defs";
import type { AugmentId } from "@ggd/shared/ids";
import { TICK_MS, SEAT_COUNT } from "@ggd/shared/constants";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { Whitelist } from "../curation/whitelist";
import { setServerOpsForTests } from "../config/serverOps";
import { setActiveContentVersion, activeContentVersion } from "../replay/Player";
import { MatchStatsRecorder, liveStatsIds } from "../analytics/Recorder";
import { listMatchStats, matchStatsDir, statsPath } from "../analytics/store";
import { decodeStatsLines, foldMatchStats, type FoldedMatchStats } from "../analytics/format";

/**
 * 走真的 `MatchRoom`,只把 Colyseus 的傳輸層拔掉。
 *
 * ⚠️ `setSimulationInterval` 是**捕獲**而不是丟掉 —— 隔壁幾支房間測試都寫
 * `room.setSimulationInterval = () => {}`,那讓 `loop()`(以及裡面每一個
 * `ctl.tick()`)一次都不會跑。#207 的資料是回合結算才寫出去的,所以一個永遠不
 * 前進的房間連一行 round 都不會產生,這一份就會退化成只測 header。
 */
interface RoomHandle {
  onCreate(o: MatchRoomOptions): Promise<void>;
  onDispose(): void;
  ctl: {
    phase: { phase: string; round: number };
    world: { tick: number };
    ledger: { snapshot(): { rounds: { round: number; seatId: number }[] } };
  };
}

function makeRoom(): { room: RoomHandle; step: () => void } {
  let loop: ((dtMs: number) => void) | null = null;
  const room = new MatchRoom() as unknown as RoomHandle & {
    setSimulationInterval: (fn: (dtMs: number) => void, ms?: number) => void;
    onMessage: () => void;
  };
  room.setSimulationInterval = (fn): void => {
    loop = fn;
  };
  room.onMessage = (): void => {};
  return {
    room,
    // 一次呼叫 = 一個 sim tick(dt 正好一格,所以 planTicks 不會 shed —— 這一份
    // 測的是記錄,不是掉幀)。
    step: (): void => {
      if (!loop) throw new Error("MatchRoom.onCreate never installed a simulation loop");
      loop(TICK_MS);
    },
  };
}

/**
 * 骨架內容每個 tier 只有 **1 張** augment,`offerCount: 3` 的三選一在骨架上會
 * 只發得出一張,「沒選的那兩張」測不到。補到 4 張。
 *
 * ⚠️ 一定要在 `onCreate` **之後**才補:`MatchController` 的建構子(在 onCreate
 * 裡)會跑 `registerSkeletonContent()`,先補會被蓋掉。
 */
function seedAugmentPool(): void {
  for (const tier of ["silver", "gold", "prismatic"] as AugmentTier[]) {
    for (let i = 0; i < 4; i++) {
      const id = `roomwire-${tier}-${i}` as AugmentId;
      Augments.register(id, {
        id,
        name: `RW ${tier} ${i}`,
        description: "test-only augment (matchRoomStatsWiring.test.ts)",
        tier,
        weight: 100,
        modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 1 }],
        tags: ["test"],
      });
    }
  }
}

/** 直接讀磁碟 —— 這一份唯一的資料來源。 */
function readFromDisk(matchId: string): FoldedMatchStats {
  const path = statsPath(matchStatsDir(), matchId);
  const { lines } = decodeStatsLines(readFileSync(path, "utf8"));
  return foldMatchStats(lines);
}

const MATCH_ID = "room-wire-full";
const ABORTED_ID = "room-wire-aborted";
/**
 * 這一批測試期間 process 的內容版本。
 *
 * ⚠️ 一定要設一個**非空且獨特**的值。`activeContentVersion()` 預設是 `""`
 * (只有 index.ts 開機時會設),所以在測試裡不設的話,「房間有沒有把內容版本寫
 * 進 header」這一題的正確答案和「這一格從來沒被填過」長得一模一樣 —— 斷言
 * `header.contentVersion === activeContentVersion()` 會變成 `"" === ""`,對正確
 * 與壞掉的實作都會過(形態④)。
 */
const TEST_CV = "cv_roomwire_20260730";

let statsDir = "";
let replayDir = "";
const saved: Record<string, string | undefined> = {};
let full: FoldedMatchStats | null = null;
let fullBytes = 0;
let savedCv = "";
let roomsToRelease: RoomHandle[] = [];
/** `onCreate` **一 resolve** 磁碟上就有檔了嗎(還沒跑過任何一個 tick)。 */
let fileExistedAfterOnCreate = false;

/**
 * 讓每一條測試都能明講「這一場的檔案根本沒被寫出來」,而不是在 `full!` 上炸出
 * 一個看不懂的 TypeError。
 */
function requireFull(): FoldedMatchStats {
  expect(
    full,
    `磁碟上沒有 ${statsPath(statsDir, MATCH_ID)} 這一份可讀的統計檔 —— ` +
      "MatchRoom.onCreate 沒有開 recorder(或 finishMatch 沒有封口)。" +
      "這正是 #207 的出貨接線被拔掉時的樣子,而它不會讓 analytics.test.ts 紅一條。",
  ).not.toBeNull();
  return full!;
}

const options = (matchId: string): MatchRoomOptions => ({
  matchId,
  seed: 20260730,
  // 注入 → onCreate 完全不打平台(這三個是 onCreate 僅有的網路依賴)
  whitelist: Whitelist.allowAll(),
  combatEnv: {},
  baseBonus: {},
});

/**
 * 等一個非同步後果落地(`finishMatch` / `abandon` 都是 `void …` 起飛的)。
 * 逾時回 false 而不是 throw —— beforeAll 裡 throw 會變成一整個 suite 掛掉,
 * 訊息只剩一句 timeout;回 false 才能讓下面每一條測試各自講清楚少了什麼。
 */
async function waitFor(ok: () => boolean, ms = 10_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 10));
  }
  return true;
}

beforeAll(async () => {
  for (const k of ["GGD_MATCH_STATS", "GGD_MATCH_STATS_DIR", "GGD_REPLAY_DIR"]) saved[k] = process.env[k];
  // `analytics/testSetup.ts` 把整批測試的預設關成 "0"(不要污染 data/match-stats)。
  // 這一份要真的寫檔,所以明確打開,而且指到暫存目錄。
  process.env.GGD_MATCH_STATS = "1";
  statsDir = await mkdtemp(join(tmpdir(), "ggd-room-stats-"));
  process.env.GGD_MATCH_STATS_DIR = statsDir;
  // 回放檔也要導開:`onCreate` 同時開一個 `MatchRecorder`,不導的話這一份每跑
  // 一次就往 repo 的 `data/replays/` 多丟一個檔 —— 那個目錄已經被測試產物淹過
  // 一次(95 個檔),不踩第二次。
  //
  // ⚠️ 這件事**還沒有**被系統性擋住:`analytics/testSetup.ts` 只把統計關掉,
  // 回放沒有對應的開關,所以隔壁幾支房間測試(`m` / `sec-room` / `seat-name`)
  // 每跑一次 `pnpm test` 就**往同一個檔 append**(量到 `data/replays/m.jsonl`
  // 已經 1.4 MB)。這一份自己導開,但那個坑本身還在。
  replayDir = await mkdtemp(join(tmpdir(), "ggd-room-replays-"));
  process.env.GGD_REPLAY_DIR = replayDir;
  // 運維設定用注入的,`resolveServerOps()` 才不會去 fetch 平台。
  setServerOpsForTests({});
  savedCv = activeContentVersion();
  setActiveContentVersion(TEST_CV);

  registerSkeletonContent();
  // 短場次:phase 秒數 + 團隊生命都從 `config.match@1` 走真的解析路徑
  // (`resolvePhaseConfig` / `resolveStartingLives`),不是塞 PhaseConfig 進去。
  Configs.register({
    id: "config.match",
    schema: "config@1",
    match: {
      champSelectSec: 0.2,
      intermissionSec: 0.5,
      combatMaxSec: 12,
      resolutionSec: 0.2,
      startingTeamLives: 3,
    },
  } as never);

  const { room, step } = makeRoom();
  roomsToRelease.push(room);
  await room.onCreate(options(MATCH_ID));
  // ⚠️ 量在**這一刻**:Colyseus 在 onCreate resolve 之前不收 join,而 #207 的
  // header 是 recorder 一開就寫的。所以「房間開好了、一個 tick 都還沒跑,檔案
  // 就該在了」是這條接線最乾淨的判斷點。
  //
  // ⚠️ 但**不能**直接 `existsSync`:`openStatsStream` 用的是
  // `createWriteStream`,它的 open(2) 是非同步的,所以 `await open(...)` 回來的
  // 那一瞬間檔案可能還沒出現在目錄裡 —— 直接 existsSync 會是一條偶發紅的假守衛
  // (我第一版就這樣寫,而且真的紅了)。給它一個短窗口:對的實作幾毫秒就到,
  // 拔掉接線的話這裡燒完 3 秒回 false,下面就不必再空等封口。
  fileExistedAfterOnCreate = await waitFor(() => existsSync(statsPath(statsDir, MATCH_ID)), 3_000);
  seedAugmentPool();

  for (let n = 0; n < 400_000 && room.ctl.phase.phase !== "matchEnd"; n++) step();
  expect(room.ctl.phase.phase, "the room must actually reach matchEnd").toBe("matchEnd");

  // `loop()` 在 matchEnd 那一格用 `void this.finishMatch()` 起飛,所以封口是在
  // 這之後才落地的。
  //
  // ⚠️ 先等**回放**那一半收工,再等統計。理由不是順序好看,是清潔:`finishMatch`
  // 會先 `await rec.finish(...)`(gzip 回放)才輪到統計,而 afterAll 一旦把
  // `GGD_REPLAY_DIR` 還原回去,還在飛的那一段就會把檔案寫進 repo 的
  // `data/replays/`。突變驗證時我真的在那裡留下過一個 0 byte 的
  // `room-wire-full.jsonl.gz` —— 統計沒寫成的那條路根本不會進下面的等待。
  // 回放的 gz 兩條路都會產生,所以拿它當「這個房間收工了」的訊號。
  await waitFor(() => existsSync(join(replayDir, `${MATCH_ID}.jsonl.gz`)));
  if (fileExistedAfterOnCreate) {
    await waitFor(() => {
      try {
        return readFromDisk(MATCH_ID).complete;
      } catch {
        return false;
      }
    });
    try {
      full = readFromDisk(MATCH_ID);
      fullBytes = readFileSync(statsPath(statsDir, MATCH_ID), "utf8").length;
    } catch {
      full = null;
    }
  }
}, 600_000);

afterAll(async () => {
  for (const room of roomsToRelease) {
    try {
      room.onDispose();
    } catch {
      /* 已經 dispose 過 */
    }
  }
  roomsToRelease = [];
  setServerOpsForTests(null);
  setActiveContentVersion(savedCv);
  Configs.clear();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await rm(statsDir, { recursive: true, force: true });
  await rm(replayDir, { recursive: true, force: true });
});

describe("#207 出貨接線 —— 走真的 MatchRoom.onCreate,斷言磁碟上的檔案", () => {
  it("房間一建立,磁碟上就有這一場的檔,而且 header 是這個房間的", () => {
    // ⚠️ 這一條就是駁斥者複現的那個突變的守衛:把 onCreate 的
    // `MatchStatsRecorder.open(...)` 換成 `this.statsRecorder = null`
    // (= 線上每一場比賽都不記錄任何東西),檔案根本不會被建立。
    //
    // 量的是 **onCreate 一 resolve 的那一刻**,一個 tick 都還沒跑 —— 所以它抓的
    // 就是「房間開起來了,但這一場從頭到尾沒有人在記」,不是「打完之後才發現
    // 沒東西」。
    expect(
      fileExistedAfterOnCreate,
      `MatchRoom.onCreate 回來之後 ${statsPath(statsDir, MATCH_ID)} 不存在 —— ` +
        "房間沒有開 #207 的 recorder,這一場(以及線上每一場)什麼都不會被記錄",
    ).toBe(true);
    const f = requireFull();

    // header 必須是**房間算出來的那一份**,不是隨便一份能過的常數:座位表來自
    // `ctl.seats`(12 個、四隊、全是 bot),seed 是房間收到的那個。
    expect(f.header.matchId).toBe(MATCH_ID);
    expect(f.header.seed).toBe(20260730);
    expect(f.header.arenaId).not.toBe("");
    expect(f.header.buildStamp).not.toBe("");
    // contentVersion 必須是**這個 process 真的在跑的那一份**(`activeContentVersion()`)
    // —— 跨內容版本比統計是沒有意義的,所以版本要跟著資料走。beforeAll 明確設了
    // 一個非空的值,不然這一條會退化成 `"" === ""`(形態④)。
    expect(TEST_CV).not.toBe("");
    expect(f.header.contentVersion).toBe(TEST_CV);
    expect(Number.isFinite(Date.parse(f.header.startedAt))).toBe(true);
    expect(f.header.seats).toHaveLength(SEAT_COUNT);
    expect(new Set(f.header.seats.map((s) => s.seatId)).size).toBe(SEAT_COUNT);
    expect(new Set(f.header.seats.map((s) => s.teamId)).size).toBe(SEAT_COUNT / 3);
    for (const s of f.header.seats) expect(s.isBot).toBe(true);
  });

  it("房間打完一整場之後,檔案還原得出陣容 / 技能 / 三選一 / 名次 / 冠軍", () => {
    const f = requireFull();
    // ── 封口 ────────────────────────────────────────────────────────────
    // 沒有 final 行 = 這場沒打完。拿掉 finishMatch 的 `stats.finish(...)`,
    // 線上每一場打完的比賽都會被標成未完成,而且尾巴(結算才算出來的團隊積分)
    // 整段掉。
    expect(f.complete, "打完的比賽必須有 final 行").toBe(true);
    expect(f.final!.rounds).toBeGreaterThanOrEqual(2);
    expect(f.final!.teams.length, "團隊積分是結算時才算的 —— 它只在尾巴那一段").toBeGreaterThan(0);
    expect(f.final!.winnerTeamId, "一場打完必須有冠軍隊").toBeGreaterThanOrEqual(0);
    expect(f.final!.finalTick).toBeGreaterThan(0);

    // ── 這一場玩的是誰 ──────────────────────────────────────────────────
    expect(f.picks).toHaveLength(SEAT_COUNT);
    const champs = new Set(f.picks.map((p) => p.championId));
    expect(champs.size, "十二個座位不可能全部撞同一隻英雄").toBeGreaterThan(1);
    for (const cid of champs) expect(cid).not.toBe("");
    // 現況的反面:記到的必須是玩家的英雄,不是小怪的模型 id。
    expect([...champs]).not.toContain("godie-zombiex");

    // ── 每回合一行,而且每一行只裝那一個回合 ────────────────────────────
    const settled: number[] = [];
    for (const line of f.rounds) {
      if (line.players.length === 0) continue;
      expect([...new Set(line.players.map((p) => p.round))]).toEqual([line.round]);
      settled.push(line.round);
    }
    expect(settled.length).toBeGreaterThanOrEqual(2);
    expect(settled).toEqual([...settled].sort((a, b) => a - b));
    expect(new Set(settled).size).toBe(settled.length);

    // ── 陣容 ────────────────────────────────────────────────────────────
    expect(f.lineups.length, "每個回合的每個 zone 都要留下對局").toBeGreaterThan(0);
    const teamOf = new Map(f.picks.map((p) => [p.seatId, p.teamId]));
    const champOf = new Map(f.picks.map((p) => [p.seatId, p.championId]));
    for (const l of f.lineups) {
      expect(l.sides).toHaveLength(2);
      expect(l.sides[0]!.teamId).toBeLessThan(l.sides[1]!.teamId);
      expect(l.sides.filter((s) => s.won)).toHaveLength(1);
      for (const side of l.sides) {
        const expected = [...champOf.entries()]
          .filter(([seatId]) => teamOf.get(seatId) === side.teamId)
          .map(([, cid]) => cid)
          .sort();
        expect([...side.championIds].sort()).toEqual(expected);
      }
    }

    // ── 技能施放 ────────────────────────────────────────────────────────
    expect(f.casts.length, "十二隻 bot 打好幾回合不可能一次技能都沒放").toBeGreaterThan(0);
    // 每個座位寫出去的施放列數,必須等於**同一份檔案裡**計分板的 abilityCasts
    // 總和。兩者是 `abilityCast` 事件的兩條不同的路,任何一條漏記就會分岔;
    // 只數「大於 0」是形態⑦(掃屬性代替掃行為)。
    const castRows = new Map<number, number>();
    for (const c of f.casts) castRows.set(c.seatId, (castRows.get(c.seatId) ?? 0) + 1);
    const scoreboard = new Map<number, number>();
    for (const p of f.players) scoreboard.set(p.seatId, (scoreboard.get(p.seatId) ?? 0) + p.abilityCasts);
    for (const [seatId, n] of scoreboard) {
      expect(castRows.get(seatId) ?? 0, `seat ${seatId}: cast rows vs scoreboard abilityCasts`).toBe(n);
    }
    expect(f.final!.abilityUse.length).toBeGreaterThan(0);

    // ── 三選一(含沒被選的那兩張)────────────────────────────────────────
    expect(f.offers.length, "DEFAULT_ARENA_RULES 的 1/3/5 回合會發三選一").toBeGreaterThan(0);
    const three = f.offers.filter((o) => o.offered.length === 3);
    expect(three.length, "offerCount = 3,而且卡池補到 4 張了").toBeGreaterThan(0);
    for (const o of three) {
      if (o.picked === null) continue;
      expect(o.declined).toHaveLength(2);
      expect([...o.declined, o.picked].sort()).toEqual([...o.offered].sort());
    }

    // ── 名次 ────────────────────────────────────────────────────────────
    for (const line of f.rounds) {
      const played = line.players.filter((p) => !p.bye);
      if (played.length === 0) continue;
      expect(played.map((p) => p.placement).sort((a, b) => a - b)).toEqual(
        Array.from({ length: played.length }, (_, i) => i + 1),
      );
      for (const p of line.players) if (p.bye) expect(p.placement).toBe(0);
    }

    // ── 後台列表看得到它,而且標成「打完了」──────────────────────────────
    console.log(
      `[#207 room-wire] ${MATCH_ID}: ${fullBytes} bytes, ${f.rounds.length} round lines, ` +
        `${f.casts.length} casts, ${f.offers.length} offers, ${f.players.length} player-rounds`,
    );
  });

  it("中斷的比賽:已結算的每一個回合都留在磁碟上,而且場次 id 被釋放", async () => {
    const { room, step } = makeRoom();
    roomsToRelease.push(room);
    await room.onCreate(options(ABORTED_ID));
    seedAugmentPool();

    // 打到第 2 個回合結算完就把房間丟掉(伺服器關機 / 所有人離開)。
    for (let n = 0; n < 400_000; n++) {
      step();
      if (room.ctl.ledger.snapshot().rounds.some((r) => r.round === 2)) break;
    }
    // ORACLE(注意方向):帳本說「已經結算了這些回合」,磁碟必須一個都不少。
    // 反過來寫(讀帳本斷言帳本)才是 #207 要防的那種假守衛。
    const settledInLedger = [...new Set(room.ctl.ledger.snapshot().rounds.map((r) => r.round))].sort(
      (a, b) => a - b,
    );
    expect(settledInLedger.length, "要先真的結算過至少兩個回合才問得出這一題").toBeGreaterThanOrEqual(2);
    expect(liveStatsIds()).toContain(ABORTED_ID);

    room.onDispose();
    // `onDispose` 用 `void stats?.abandon()` 起飛,所以等它落地。拿掉那一行,
    // 這裡就會等到逾時 —— 場次 id 永遠留在 `liveStatsIds()` 裡。
    expect(
      await waitFor(() => !liveStatsIds().includes(ABORTED_ID)),
      "房間 dispose 之後場次 id 沒有被釋放 —— onDispose 沒有 abandon() 這一場的 recorder。" +
        "保存規則會從此永遠跳過這個檔,而同一個 matchId 再也開不了第二個 recorder。",
    ).toBe(true);

    const aborted = readFromDisk(ABORTED_ID);
    // 沒有 final 行 —— 「這場沒打完」的判斷依據。
    expect(aborted.complete).toBe(false);
    expect(aborted.final).toBeNull();
    // 而前面每一個結算過的回合都完整可讀:一場打到一半斷線的比賽,那幾回合的
    // 平衡資料仍然是真的。
    const onDisk = [...new Set(aborted.rounds.filter((l) => l.players.length > 0).map((l) => l.round))].sort(
      (a, b) => a - b,
    );
    expect(onDisk, "磁碟掉了帳本已經結算的回合").toEqual(settledInLedger);
    expect(aborted.picks).toHaveLength(SEAT_COUNT);

    // id 真的被釋放:保存規則不會再永遠跳過這個檔,而同一個 matchId 開得了第二
    // 個 recorder。拿掉 `void stats?.abandon()`,這兩條會紅。
    const second = await MatchStatsRecorder.open(ABORTED_ID, {
      matchId: ABORTED_ID,
      startedAt: new Date().toISOString(),
      seed: 1,
      contentVersion: "cv_test",
      buildStamp: "test",
      arenaId: "skeleton",
      seats: [],
    });
    expect(second, "場次 id 沒有被釋放 —— 同一場再也開不了第二個 recorder").not.toBeNull();
    await second!.abandon();

    // 後台的「對戰紀錄」列表兩場都看得到,而且能分辨誰打完了。
    const list = await listMatchStats();
    const byId = new Map(list.map((s) => [s.id, s]));
    expect(byId.get(MATCH_ID)?.complete).toBe(true);
    expect(byId.get(ABORTED_ID)?.complete).toBe(false);
    expect(byId.get(MATCH_ID)!.championIds.length).toBeGreaterThan(1);
  }, 600_000);
});

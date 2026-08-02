/**
 * 「預設打開 + 玩到一半離開也要有」—— 行為守衛 (owner 2026-08-02).
 *
 * owner：「請幫我預設打開，就算玩到一半就離開也應該有 replay 才對」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 被測的是**出貨的那一個**
 * ═══════════════════════════════════════════════════════════════════════════
 * 這裡開的是真的 `MatchRoom`：真的 `onCreate`（含它自己決定要不要開錄影器）、
 * 真的 `loop()`、真的 `onDispose()`。斷言看的是**磁碟上有沒有那個檔、裡面有
 * 沒有東西**，不是「某個函式有沒有被呼叫」。所以：
 *   · 把 `MatchRoom` 的錄影開關寫死成 `false` → 第一條紅；
 *   · 把 `onDispose` 改回 `void rec?.abandon()`（射後不理）→ 「中途離開」那條紅；
 *   · 把落地間隔寫死回 500 → 間隔那條紅。
 * 三個突變都做過，紀錄在回報裡。
 *
 * ⚠️ 為什麼「中途離開」那條要在 `await onDispose()` 之後**立刻**讀檔，而且不加
 * 任何 `setTimeout`：那個 `await` 就是被測的東西。Colyseus 的
 * `gracefullyShutdown()` 會等 `onDispose()` 的 promise，所以只要那裡是射後不理，
 * SIGTERM 之後程序可以在最後一段緩衝落地之前就結束。多睡 50ms 會讓射後不理版本
 * 也變綠 —— 那就正好是失敗形態 ④（斷言方向跟缺陷無關）。
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Configs } from "@ggd/shared/content";
import { TICK_MS } from "@ggd/shared/constants";
import { MatchRoom, type MatchRoomOptions } from "../rooms/MatchRoom";
import { Whitelist } from "../curation/whitelist";
import { MatchRecorder } from "./Recorder";
import { replayPolicy, replayRecordingEnabled } from "./policy";

interface RoomHandle {
  setSimulationInterval: (fn: unknown, ms?: number) => void;
  onMessage: (type: string, fn: unknown) => void;
  broadcast: (type: string, message: unknown) => void;
  onCreate(o: MatchRoomOptions): Promise<void>;
  onDispose(): Promise<void> | void;
  loop(dtMs: number): void;
  ctl: { phase: { phase: string }; world: { tick: number } };
}

let dir = "";
let savedDir: string | undefined;

/** A real MatchRoom with no sockets — bots only, which is what a replay records anyway. */
async function openRoom(matchId: string): Promise<RoomHandle> {
  const room = new MatchRoom() as unknown as RoomHandle;
  room.setSimulationInterval = (): void => {};
  room.onMessage = (): void => {};
  room.broadcast = (): void => {};
  await room.onCreate({ matchId, seed: 11, whitelist: Whitelist.allowAll(), combatEnv: {} });
  return room;
}

function run(room: RoomHandle, ticks: number): void {
  for (let i = 0; i < ticks; i++) room.loop(TICK_MS);
}

/** Recording files only — the `.index.json` sidecar and `.probe` files are not tapes. */
function tapes(): string[] {
  return readdirSync(dir).filter((n) => n.endsWith(".jsonl") || n.endsWith(".jsonl.gz"));
}

beforeEach(() => {
  savedDir = process.env.GGD_REPLAY_DIR;
  dir = mkdtempSync(join(tmpdir(), "ggd-replay-default-"));
  process.env.GGD_REPLAY_DIR = dir;
  Configs.clear();
  delete process.env.GGD_REPLAY_ENABLED;
});

afterEach(() => {
  Configs.clear();
  delete process.env.GGD_REPLAY_ENABLED;
  if (savedDir === undefined) delete process.env.GGD_REPLAY_DIR;
  else process.env.GGD_REPLAY_DIR = savedDir;
  rmSync(dir, { recursive: true, force: true });
});

describe("錄影預設是開的 (replay-default-on)", () => {
  it("沒有任何設定文件時，一場比賽仍然留下一份錄影檔", async () => {
    // 「內容沒載進來」是正式機真的會發生的狀態（#170 的鄰居）。它**不可以**
    // 順手變成「這台機器不錄影」。
    expect(Configs.tryGet("replay")).toBeUndefined();
    const room = await openRoom("default-on");
    run(room, 60);
    await room.onDispose();
    expect(tapes(), "缺文件時整台機器一場都沒錄到 —— 這正是 owner 說的那個症狀").toContain(
      "default-on.jsonl",
    );
  }, 30_000);

  it("後台把 enabled 關掉 → 完全不開錄影檔，而且比賽照打", async () => {
    // 這條同時是上一條的**對照組**：沒有它，一個從頭到尾都不錄影的實作也會讓
    // 上面那條看起來像是在測什麼東西（其實不是）。
    Configs.register({
      id: "replay",
      schema: "config.replay@1",
      enabled: false,
      flushIntervalMs: 500,
      retainMaxFiles: 200,
      retainMaxAgeDays: 30,
    } as never);
    expect(replayRecordingEnabled()).toBe(false);
    const room = await openRoom("switched-off");
    run(room, 60);
    expect(room.ctl.world.tick, "關掉錄影把比賽也一起關掉了").toBeGreaterThan(0);
    await room.onDispose();
    expect(tapes()).toEqual([]);
  }, 30_000);

  it("env 逃生門壓過內容（逐台 shard 的決定，不是全域內容的決定）", () => {
    Configs.register({
      id: "replay",
      schema: "config.replay@1",
      enabled: true,
      flushIntervalMs: 500,
      retainMaxFiles: 200,
      retainMaxAgeDays: 30,
    } as never);
    process.env.GGD_REPLAY_ENABLED = "0";
    expect(replayRecordingEnabled()).toBe(false);
    process.env.GGD_REPLAY_ENABLED = "1";
    expect(replayRecordingEnabled()).toBe(true);
  });
});

describe("玩到一半就離開也要有 (replay-mid-leave-lands)", () => {
  it("打到一半關房 → 檔案在磁碟上、有 header、有真的比賽內容", async () => {
    const room = await openRoom("mid-leave");
    run(room, 120);
    const ticked = room.ctl.world.tick;
    expect(ticked, "harness 沒有真的跑").toBeGreaterThan(100);

    // ⚠️ 這個 await 就是被測的東西 —— 後面**沒有** setTimeout。
    await room.onDispose();

    const path = join(dir, "mid-leave.jsonl");
    expect(existsSync(path), "中途離開沒有留下任何錄影檔").toBe(true);
    const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
    const header = JSON.parse(lines[0]!) as { t: string; matchId: string };
    expect(header.t).toBe("header");
    expect(header.matchId).toBe("mid-leave");
    // 只有 header 不算「有 replay」—— 那是一場空白帶。要有真的逐 tick 摘要。
    const digestChunks = lines.filter((l) => (JSON.parse(l) as { t: string }).t === "g");
    expect(digestChunks.length, "只寫了 header，比賽過程一個 tick 都沒落地").toBeGreaterThan(0);
    // 沒有 footer 才對：這場沒打完，列表要標成「未完成」。
    expect(lines.some((l) => (JSON.parse(l) as { t: string }).t === "footer")).toBe(false);
  }, 30_000);

  it("`onDispose()` 的 promise **等到串流真的關好才 resolve**（不是射後不理）", async () => {
    // ── 這一條在測什麼，以及為什麼「檔案存在」不足以測它 ────────────────────
    // 上面那條在射後不理的實作下也會綠：`abandon()` 在第一個 await 之前就已經
    // 同步把緩衝交給 WriteStream 了，所以檔案內容照樣看得到。真正的缺陷在**時序**
    // ——「Colyseus 等不等得到落地」。
    //
    // 所以這裡量的是唯一分得開兩者的東西：`onDispose()` 回傳的 promise 需要
    // 一個**巨集任務**（串流的 'finish' 事件）才會 resolve。射後不理版本沒有任何
    // 東西可等，它在幾個微任務內就 resolve —— 下面的斷言就是那個分界線。
    const room = await openRoom("dispose-awaits-disk");
    run(room, 30);

    const p = Promise.resolve(room.onDispose());
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    // 排乾微任務佇列。巨集任務（串流關閉）不會在這裡發生。
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(
      settled,
      "onDispose() 在微任務內就 resolve —— 它沒有等錄影落地，SIGTERM 之後最後一段會消失",
    ).toBe(false);

    await p;
    expect(settled).toBe(true);
    expect(existsSync(join(dir, "dispose-awaits-disk.jsonl"))).toBe(true);
  }, 30_000);
});

describe("落地間隔是後台可調的 (replay-flush-interval-configurable)", () => {
  it("政策的間隔真的被拿去設定計時器，不是寫死的 500", async () => {
    Configs.register({
      id: "replay",
      schema: "config.replay@1",
      enabled: true,
      flushIntervalMs: 137,
      retainMaxFiles: 200,
      retainMaxAgeDays: 30,
    } as never);
    expect(replayPolicy().flushIntervalMs).toBe(137);

    const rec = await MatchRecorder.open("flush-knob", {
      v: 1,
      matchId: "flush-knob",
      startedAt: new Date().toISOString(),
      seed: 1,
      contentVersion: "cv_test",
      buildStamp: "test",
      arenaId: "skeleton",
      seats: [],
    } as never);
    expect(rec).not.toBeNull();
    // 讀 Node 計時器自己記下來的週期。這是「間隔真的被套用」唯一不靠猜的證據 ——
    // 用睡覺量落地時間會慢、而且會 flaky。
    const timer = (rec as unknown as { timer: { _repeat?: number } }).timer;
    expect(timer._repeat, "計時器的週期不是政策裡那個數字 —— 間隔仍然是寫死的").toBe(137);
    await rec!.abandon();
  }, 30_000);
});

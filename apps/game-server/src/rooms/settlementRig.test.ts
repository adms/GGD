/**
 * ⚙️ HEADLESS 結算 RIG (GH#108) —— 「跑一場」，但**不用手打**。
 *
 * ---------------------------------------------------------------------------
 * 為什麼這一支存在
 * ---------------------------------------------------------------------------
 * #108 的稽核結論是：**結算 → M幣 → 水晶 → 解鎖英雄整條迴圈從未執行過**。
 * 證據是三重的、而且互相獨立：`data/history/` 目錄根本不存在、19 份帳號 JSON
 * 全部 `games=0 mcoin=0` 且沒有 `crystal` 欄位、87 份錄影裡有 footer 的只有 9 份
 * 而那 9 份全是 `dev-*`。⇒ 真帳號的場次沒一場打完，打完的場次沒一場掛真帳號。
 *
 * owner 2026-08-22 的裁決是兩個字：「**那你跑阿**」。
 *
 * ⛔ 但「跑一場」如果是**一個人用瀏覽器打完 40 分鐘**，它就不是閘 —— 它是一次
 * 性的證據，下一個 regression 出現時沒有任何東西會紅（而且 owner 2026-08-09 已經
 * 明說「你不用玩遊戲測試 太浪費時間了」）。所以這一支把那場實測做成**每次跑測試
 * 都會重跑一遍**的東西：CLAUDE.md 元規則的「**把判準換成閘**」。
 *
 * ---------------------------------------------------------------------------
 * 它跑的是**出貨的那一條路**，不是一份手寫的 payload
 * ---------------------------------------------------------------------------
 * 這是重點，也是 #6 / #25 曾經整整一年沒被抓到的原因（失敗形態⑤「被測的不是出貨
 * 的那個」）：`gamelink` 那一包每一支測試都在 Go 裡**手建**一個 `ResultRequest`，
 * 於是它們證明了結算邏輯是對的，卻對「game server 真的送出去的位元組」一無所知。
 * 而真相是那些位元組 `placements` / `seats` 全部 decode 成 nil，平台 HMAC 驗過、
 * 200 OK、**一個人都沒付**。
 *
 * 所以這裡從 `new MatchRoom()` 開始，走 `onCreate` → 真 12 座位 → 真 sim →
 * `loop()` → `finishMatch()` → `settleToPlatform()`，⛔ 沒有一步是重寫的。
 *
 * ---------------------------------------------------------------------------
 * 四項後置條件，誰守哪一項
 * ---------------------------------------------------------------------------
 * #108 列了四項。這一支守 game server 那一半，另一半由平台的 Go 測試守，
 * 而**中間那道縫**（兩邊有沒有在講同一種語言）就是第 ④ 條斷言的工作：
 *
 *  (a) 一份有 `"t":"footer"` 且**沒有 `dev-` 前綴**的錄影 → 本檔 ③
 *  (b) `data/history/<accountId>.jsonl` 多一列 → 平台 `gamelink_test.go`
 *      (`TestResultPersists` / `TestResultIdempotent` 讀 `store.ReadLines("history", …)`)
 *  (c) 帳號 `games=1`、`mcoin`／`crystal` 非零 → `mcoin_test.go` / `crystal_test.go`
 *  (d) log 寫 `credited=N/M` 而不是 `credited=0` → 本檔 ②（回呼真的送得出去，
 *      而且送的是平台讀得懂的東西；`credited` 是平台回報的數字）
 *  (+) 水晶 → 解鎖英雄 → `wallet/meta_test.go::TestCrystalUnlockChampion`
 *
 * ⭐ 那些 Go 測試全部餵**手建的** `ResultRequest`，唯一吃真位元組的是
 * `gamelink/contract_test.go`，而它讀的是一份**錄下來的** fixture
 * (`testdata/gameserver_result_callback.json`)。那份 fixture 的新鮮度在此之前
 * 只被一句註解守著（「regenerate it by calling that function if the shape ever
 * changes」）—— 那是**判準**，不是閘，而這份文件已經記錄了判準失效五次。
 * 本檔 ④ 把它變成閘：出貨的 `buildPlatformResult` 一旦長出／改名任何欄位而
 * fixture 沒跟著動，這裡就紅，而且紅在**編輯發生的當下**。
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Configs } from "@ggd/shared/content";
import { TICK_MS } from "@ggd/shared/constants";
import { sign } from "../auth/hmac";
import { Whitelist } from "../curation/whitelist";
import { setServerOpsForTests } from "../config/serverOps";
import { MatchRoom, isSettleableAccountId, type MatchRoomOptions } from "./MatchRoom";
import type { MatchResult } from "../match/MatchController";

const HERE = dirname(fileURLToPath(import.meta.url));
/** The fixture the platform's own contract test decodes. Read-only here. */
const FIXTURE = join(
  HERE,
  "../../../platform/internal/gamelink/testdata/gameserver_result_callback.json",
);

/**
 * ULID-shaped ids, exactly like the ones the platform mints. ⛔ 刻意**不是**
 * `dev-…`：`isSettleableAccountId` 會把那種座位整個濾掉，而 #108 的整個癥結就是
 * 「打完的場次沒一場掛真帳號」。
 */
const HUMANS = [
  "01KYRIG0000000000000000001",
  "01KYRIG0000000000000000002",
  "01KYRIG0000000000000000003",
  "01KYRIG0000000000000000004",
];

interface RigRoom {
  onCreate(o: MatchRoomOptions): Promise<void>;
  onDispose(): void;
  loop(dtMs: number): void;
  ctl: { phase: { phase: string }; result: MatchResult | null; tick(): string };
}

interface CapturedPost {
  url: string;
  headers: Record<string, string>;
  body: string;
}

let replayRoot = "";
let post: CapturedPost | null = null;
let room: RigRoom;
const MATCH_ID = "m_rig_01KYRIGMATCH00000000000001";

beforeAll(async () => {
  replayRoot = mkdtempSync(join(tmpdir(), "ggd-settlement-rig-"));
  process.env.GGD_REPLAY_DIR = replayRoot;
  registerSkeletonContent();
  // ⛔ 不要讓 onCreate 去打平台（測試環境沒有平台，那只是一次逾時）。
  setServerOpsForTests({ maxRooms: 64 });

  // THE PLATFORM, stubbed at the ONE place the game server touches it: the
  // result callback. It answers exactly what the real platform answers —
  // `{status, settled}` — so the `credited=N/M` branch in settleToPlatform is
  // the one that runs. ⛔ 這裡不重寫任何結算邏輯：平台那一半由 Go 測試守。
  const realFetch = globalThis.fetch;
  const done = new Promise<void>((resolve) => {
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      post = {
        url: String(url),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: String(init?.body ?? ""),
      };
      resolve();
      return new Response(JSON.stringify({ status: "ok", settled: HUMANS.length }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof globalThis.fetch;
  });

  room = new MatchRoom() as unknown as RigRoom & {
    setSimulationInterval: () => void;
    onMessage: () => void;
    broadcast: () => void;
  };
  (room as unknown as { setSimulationInterval: () => void }).setSimulationInterval = (): void => {};
  (room as unknown as { onMessage: () => void }).onMessage = (): void => {};
  (room as unknown as { broadcast: () => void }).broadcast = (): void => {};

  await room.onCreate({
    matchId: MATCH_ID,
    seed: 20260822,
    whitelist: Whitelist.allowAll(),
    combatEnv: {},
    baseBonus: {},
    callbackUrl: `http://127.0.0.1:65535/api/v1/internal/matches/${MATCH_ID}/result`,
    // 一隊一個真人，其餘八格由 onCreate 自己補成 bot —— 平台建房就是這個形狀。
    seats: HUMANS.map((accountId, i) => ({
      seatId: i * 3,
      teamId: i,
      accountId,
      displayName: `Rig${i}`,
    })),
    // 把一場比賽壓進幾秒：⛔ 這是**房主設定**（#288 的合法欄位），不是繞過相位機。
    champSelectSec: 5,
    intermissionSec: 5,
    combatMaxSec: 30,
    maxRounds: 1,
  });

  // 真的把它跑完。⛔ 不 fake 相位、不直接呼叫 finishMatch —— `loop()` 自己在看到
  // matchEnd 的那一 tick 呼叫它，那條接線正是這一支要守的東西。
  for (let n = 0; n < 200_000 && room.ctl.phase.phase !== "matchEnd"; n++) {
    room.loop(TICK_MS);
  }
  // matchEnd 之後再推一幀，讓 loop 裡的 `phase === "matchEnd"` 分支真的觸發。
  room.loop(TICK_MS);
  await Promise.race([done, new Promise((r) => setTimeout(r, 20_000))]);
  globalThis.fetch = realFetch;
}, 300_000);

afterAll(() => {
  setServerOpsForTests(null);
  Configs.clear();
  delete process.env.GGD_REPLAY_DIR;
  room?.onDispose();
  if (replayRoot) rmSync(replayRoot, { recursive: true, force: true });
});

/** Recursive key→typename skeleton: shape only, values discarded. */
function shapeOf(v: unknown): unknown {
  if (Array.isArray(v)) {
    // Union of every element's shape, so 12 seats with/without `championId`
    // collapse to the set of keys the wire can actually carry.
    const keys = new Map<string, unknown>();
    for (const e of v) {
      const s = shapeOf(e);
      if (s && typeof s === "object") for (const [k, t] of Object.entries(s)) keys.set(k, t);
      else return [typeof v[0]];
    }
    return [Object.fromEntries([...keys].sort())];
  }
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v)
        .map(([k, x]) => [k, shapeOf(x)] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return typeof v;
}

describe("GH#108 headless 結算 rig —— 一場真帳號比賽走完整條回呼", () => {
  it("① 12 個座位真的打到 matchEnd,而且產出名次 —— #108 卡了整個專案的那一步", () => {
    cover("settle-rig-matchend");
    expect(room.ctl.phase.phase).toBe("matchEnd");
    const result = room.ctl.result;
    expect(result, "matchEnd 沒有 result = 這場沒有東西可以結算").not.toBeNull();
    // 名次要是一個真的排名（1..N 各一次），⛔ 不是一堆並列的 0。
    const places = result!.teams.map((t) => t.placement).sort((a, b) => a - b);
    expect(places).toEqual(places.map((_, i) => i + 1));
  });

  it("② 回呼真的送出去了,而且簽的是**這個 body** —— credited=N/M 的那條路", () => {
    cover("settle-rig-callback");
    expect(post, "settleToPlatform 一個字都沒送出去").not.toBeNull();
    expect(post!.url).toBe(
      `http://127.0.0.1:65535/api/v1/internal/matches/${MATCH_ID}/result`,
    );
    const ts = post!.headers["X-Internal-Timestamp"] ?? "";
    expect(ts, "沒有時戳 = 平台會當成重放攻擊拒收").toBeTruthy();
    // 簽章要對得上**送出去的那份 body**。⛔ 不是「有這個 header 就好」——
    // 簽到別的東西上面，平台會 401,而 game server 這邊看起來完全正常。
    expect(post!.headers["X-Internal-Auth"]).toBe(
      sign(process.env.PLATFORM_GAME_SHARED_SECRET ?? "", ts, post!.body),
    );

    const body = JSON.parse(post!.body) as {
      matchId: string;
      placements: unknown[];
      seats: { accountId: string; isBot: boolean }[];
    };
    expect(body.matchId).toBe(MATCH_ID);
    // ⭐ 這兩格就是整整一年 decode 成 nil 的那兩格（#6 / #25）。
    expect(body.placements.length).toBeGreaterThan(0);
    expect(body.seats.length).toBeGreaterThan(0);
    const humans = body.seats.filter((s) => !s.isBot).map((s) => s.accountId);
    expect(humans.sort()).toEqual([...HUMANS].sort());
    // #108 的癥結：打完的場次沒一場掛得住真帳號。
    expect(humans.every(isSettleableAccountId)).toBe(true);
  });

  it("③ 這一場留下一份**有 footer** 且座位不是 dev- 的錄影（#108 驗收 (a)）", () => {
    cover("settle-rig-footer");
    const files = readdirSync(replayRoot).filter((f) => f.includes(".jsonl"));
    expect(files, "這一場沒有留下任何錄影").not.toHaveLength(0);
    const raw = readFileSync(join(replayRoot, files[0]!));
    const text = files[0]!.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
    const lines = text.trim().split("\n");
    // footer 是 `rec.finish()` 在 finishMatch() 裡寫的 —— 沒 footer = 這場從未
    // 走到 matchEnd,而那正是 87 份錄影裡 78 份的狀態。
    expect(lines.some((l) => l.includes('"t":"footer"'))).toBe(true);
    expect(lines[0]).toContain(HUMANS[0]!);
    expect(lines[0]).not.toContain('"dev-');
  });

  it("④ 出貨的位元組與平台契約 fixture **逐鍵同型** —— fixture 過期就紅", () => {
    cover("settle-rig-contract-fresh");
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as unknown;
    // ⛔ 值不比（match id / 帳號 / 時戳每場都不同），比的是**形狀**：欄位名、
    // 巢狀、型別。平台的 contract_test.go 吃的就是這份 fixture,所以形狀一致
    // ⇒ 它證明的東西才真的適用於出貨的位元組。
    expect(shapeOf(JSON.parse(post!.body))).toEqual(shapeOf(fixture));
  });
});

/**
 * 出貨的**完整快照塞不塞得進出貨的編碼緩衝區** —— 一個沒有人會紅的效能缺陷。
 *
 * ⛔ ⑦ 會是「`Encoder.BUFFER_SIZE === 65536`」：那是一個屬性，跟「這一場比賽的
 *    快照裝不裝得下」無關 —— 上限往上調一格它就變成謊話。
 * ⛔ ⑥ 會是 grep `snapshot.ts` 有沒有 `BUFFER_SIZE` 這個字。
 * ⭐ 這裡跑的是**出貨的那一條路**：真的 `MatchController` 進戰鬥、真的
 *    `mobRulesFromConfig` / `spawnMob`（數量由**出貨設定**的 `maxAlivePerZone`
 *    推導，⛔ 不抄字面值）、真的 `projectSnapshot`、真的 `getFullState`（`encodeAll`
 *    + `encodeAllView`，見 testkit/wireFullState.ts）
 *    —— 也就是 `SchemaSerializer.getFullState()` 在每一位玩家加入時走的那一趟。
 *
 * 斷言分兩半，缺一半就測不出東西：
 *   ① 這份夾具的完整快照**真的**超過函式庫的預設緩衝區（`Buffer.poolSize`）
 *      —— 沒有這一條，第 ② 條在一個 3 隻實體的世界裡也會過。
 *   ② 編一次**不會溢位**（`console.warn` 一次都沒被呼叫）。溢位不會丟資料，
 *      它只是整趟作廢 → 重新配置 → **從頭再編一次** → 往 stderr 印五行，
 *      所以它在功能測試裡永遠是綠的。
 */
import { describe, expect, it, vi } from "vitest";
import { Encoder } from "@colyseus/schema";
import { fullStateBytes } from "../testkit/wireFullState";
import { MatchController } from "../match/MatchController";
import { projectSnapshot, resolveSnapshotBufferBytes, SNAPSHOT_BUFFER_DEFAULT_KB } from "./snapshot";
import { MatchState } from "@ggd/shared/protocol/schema";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import { mobRulesFromConfig, spawnMob } from "@ggd/shared/sim/mobs";
import { beginCombatMobs } from "@ggd/shared/sim/systems/MobSystem";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const DT = 1 / 30;
/** 出貨的最終回合 —— `maxAlivePerZone` 的排程尖峰就在這裡。 */
const PEAK_ROUND = DEFAULT_MOB_WAVES_CONFIG.schedule?.length
  ? Math.max(...DEFAULT_MOB_WAVES_CONFIG.schedule.map((s) => s.round)) - 1
  : DEFAULT_MOB_WAVES_CONFIG.fromRound;

describe("快照編碼緩衝區裝得下出貨的一場尖峰", () => {
  it("尖峰的完整快照大於函式庫預設緩衝區，而且編起來不溢位", () => {
    const ctl = new MatchController(
      "snap-buf",
      3,
      Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
      FAST,
    );
    while (ctl.phase.phase !== "combat") ctl.tick();
    ctl.tick();

    const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, PEAK_ROUND);
    ctl.world.mobRules = rules;
    beginCombatMobs(ctl.world, rules, [0]);
    for (let i = 0; i < rules.maxAlivePerZone; i++) spawnMob(ctl.world, 0, rules, 1, i);

    const state = new MatchState();
    const encoder = new Encoder(state);
    projectSnapshot(ctl, state, new Map());

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // ⚠️ GH#760：`entities` 帶著 view tag 之後，`encodeAll()` 的輸出裡**一個實體
    // 都沒有**（3,765 B）—— 拿它當「一份完整快照」量，第 ① 條會永遠紅而且理由是
    // 假的。出貨在玩家加入時走的是 `getFullState(client)` ＝ 共用段 + view 段，
    // 那就是 `fullStateBytes`（testkit/wireFullState.ts 逐字照抄那四行）。
    const full = fullStateBytes(encoder, state);
    // ⚠️ 呼叫次數要在 `mockRestore()` **之前**抄下來 —— restore 會把 mock 的
    // 通話紀錄一起清掉,所以「restore 之後才斷言」的寫法對兩種實作都是綠的(形態④)。
    const overflowWarnings = warn.mock.calls.length;
    warn.mockRestore();

    // ① 這份夾具真的夠大 —— 否則第 ② 條什麼都證明不了。
    expect(full.byteLength).toBeGreaterThan(Buffer.poolSize);
    // ② ⬇ 把 snapshot.ts 的 `Encoder.BUFFER_SIZE = …` 那一行拿掉,這一條就紅。
    expect(overflowWarnings).toBe(0);
  });

  it("旋鈕:缺席/壞值回出貨預設,合法值照收,超界不採信", () => {
    const KB = 1024;
    expect(resolveSnapshotBufferBytes({})).toBe(SNAPSHOT_BUFFER_DEFAULT_KB * KB);
    expect(resolveSnapshotBufferBytes({ GGD_SNAPSHOT_BUFFER_KB: "nope" })).toBe(SNAPSHOT_BUFFER_DEFAULT_KB * KB);
    expect(resolveSnapshotBufferBytes({ GGD_SNAPSHOT_BUFFER_KB: "8" })).toBe(8 * KB);
    expect(resolveSnapshotBufferBytes({ GGD_SNAPSHOT_BUFFER_KB: "999999" })).toBe(SNAPSHOT_BUFFER_DEFAULT_KB * KB);
  });
});

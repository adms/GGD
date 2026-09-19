/**
 * 🔁 【再次施放】**送不送得到客戶端**（GH#1187 的缺口 a）。
 *
 * ── 為什麼補這一條 ──────────────────────────────────────────────
 * 機制本身在 `packages/shared` 有守衛（窗口、次數、死亡／暈眩收掉）。⛔ 而
 * `net/snapshot.ts:391-393` 是 `SeatState.recastCharges` / `recastWindow` 的**唯一寫端**，
 * 今天**零守衛**（全 game-server 的測試 grep `recast` ⇒ 0 命中）⇒ 刪掉那兩行：
 *   · 所有 shared 測試照樣綠
 *   · 客戶端永遠讀到 0 ⇒ 畫面上「有沒有後段」與**沒有這個機制**一模一樣（失敗形態②）
 *
 * ⭐ 這一條走出貨的路：真的開一場、用**出貨的** `armRecast()` 開窗（⛔ 不手寫 wire 欄位），
 * 再讀 `projectSnapshot` 投影出來的那一份 —— 也就是客戶端真正會收到的東西。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { MatchState } from "@ggd/shared/protocol/schema";
import { armRecast, finishRecast } from "@ggd/shared/sim/abilities/recast";
import { asSeatId, type EntityId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { DEFAULT_ARENA_RULES } from "../match/arenaRules";
import { projectSnapshot } from "./snapshot";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const FAST = { champSelectTicks: 3, intermissionTicks: 9999, combatMaxTicks: 60, resolutionTicks: 3 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

/** 0 號座位在**線路上**的那兩格（⭐ 客戶端讀的就是這一份）。 */
function wire(ctl: MatchController): { charges: number[]; window: number[] } {
  const state = new MatchState();
  projectSnapshot(ctl, state, new Map());
  const ss = state.seats.get("0");
  return { charges: [...(ss?.recastCharges ?? [])], window: [...(ss?.recastWindow ?? [])] };
}

describe("🔁 再次施放的後段狀態要送得到客戶端（GH#1187）", () => {
  it("★★ 開窗 ⇒ 線路上帶著次數與剩餘窗口；階段結束 ⇒ 回到 0", () => {
    const ctl = new MatchController("recast-wire", 31, allBots(), FAST, 3, DEFAULT_ARENA_RULES);
    let n = 0;
    while (ctl.phase.phase !== "intermission" && n++ < 500) ctl.tick();
    const entity = ctl.seats.get(asSeatId(0))!.entityId as EntityId;
    const ab = ctl.world.abilities.get(entity)!;

    expect(wire(ctl), "⛔ 還沒開窗就有值 ⇒ 這場實驗沒有鑑別力").toEqual({ charges: [0, 0, 0, 0], window: [0, 0, 0, 0] });

    // ⭐ 出貨的那一支開窗（⛔ 不手寫 wire 欄位，也⛔ 不手寫 inst.recast）
    armRecast(ab.slots.Q, { windowSec: 3, charges: 2 }, ctl.world.tick, ctl.world.dt, 0);
    ctl.tick();

    const armed = wire(ctl);
    expect(armed.charges[0], "⛔ 次數沒送出去 ⇒ 客戶端不知道還能再按幾次").toBe(2);
    expect(armed.window[0], "⛔ 剩餘窗口沒送出去 ⇒ 畫面畫不出倒數").toBeGreaterThan(0);
    expect([armed.charges[1], armed.charges[2], armed.charges[3]], "⛔ 別的槽被寫髒了").toEqual([0, 0, 0]);

    // ⭐ 階段結束（出貨的 `finishRecast`，⛔ 不是手動清欄位）⇒ 線路上要回到 0
    // ⚠️ 刻意**不用「等窗口過期」**來驗：到期是 `tickCooldowns` 做的，而它在**中場不跑**
    //   ⇒ 那個夾具會靠一個假前提綠（失敗形態⑩）。這裡問的是寫端，⛔ 不是到期規則。
    finishRecast(ab.slots.Q);
    ctl.tick();
    expect(wire(ctl), "⛔ 階段結束了線路上還留著殘值 ⇒ 客戶端的倒數永遠不會消失").toEqual({
      charges: [0, 0, 0, 0],
      window: [0, 0, 0, 0],
    });
  });
});

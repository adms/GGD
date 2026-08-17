/**
 * 隱藏英雄（彩蛋）—— owner 2026-08-17「隱藏角色可以隨機到 但不能選到」。
 *
 * ⚠️ **兩個方向一定要一起讀**，少了任何一邊這條守衛都會對錯的實作全綠：
 *   ① 手動選被拒（而且拒絕理由**不洩漏**它是彩蛋）
 *   ② 隨機池**仍然包含**它 —— ⛔ 少了這一條，一個「把 hidden 放進
 *      `Whitelist.allowsChampion`」的實作（＝把隱藏做成下架）會全部通過，
 *      而那正是 CLAUDE.md 失敗形態 ④：斷言方向跟缺陷無關。
 *
 * ⚠️ 全程 `Whitelist.allowAll()` + `Ownership.allowAll()`（fail-open，也就是平台
 * 連不上與 localhost 的常態）。隱藏是**內容事實**不是營運狀態，所以它必須在那條路
 * 上也成立 —— 與 `retiredChampions.test.ts` 同一個理由。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId } from "@ggd/shared/ids";
import { Configs } from "@ggd/shared/content";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { DEFAULT_ARENA_RULES } from "../match/arenaRules";
import { Whitelist } from "./whitelist";
import { Ownership } from "./ownership";

/** ⛔ 不用出貨的英雄 id：這一份自己註冊，出貨名單改了也不該讓它紅。 */
const H = "sela";
const LIVE = "thorne";

const FAST = { champSelectTicks: 5, intermissionTicks: 40, combatMaxTicks: 1200, resolutionTicks: 5 };

function newController(): MatchController {
  registerSkeletonContent();
  const specs: SeatSpec[] = Array.from({ length: 12 }, (_, i) =>
    i === 0 ? { seatId: 0, teamId: 0, accountId: "acc-1", isBot: false } : { seatId: i, teamId: Math.floor(i / 3), isBot: true },
  );
  // positional: matchId, seed, specs, phaseCfg, startingTeamHealth, rules,
  // arena, whitelist, combatEnv, fireRing, arenaPool, ownership
  return new MatchController(
    "m-hidden",
    99,
    specs,
    FAST,
    3,
    DEFAULT_ARENA_RULES,
    undefined,
    Whitelist.allowAll(),
    undefined,
    undefined,
    undefined,
    Ownership.allowAll(),
  );
}

beforeEach(() => {
  Configs.clear();
  Configs.register({ id: "roster", schema: "config.roster@1", retiredChampions: [], hiddenChampions: [H] } as never);
});
afterEach(() => Configs.clear());

describe("隱藏英雄：選不到，但抽得到", () => {
  it("★ ① SELECT_CHAMPION 被拒，而且理由不說出它是彩蛋", () => {
    cover("hidden-champions");
    const ctl = newController();
    const seat = asSeatId(0);
    const rejected = ctl.selectChampion(seat, H);
    expect(rejected.ok, "隱藏英雄不可以被手動選到").toBe(false);
    // ⭐ 刻意與「這個 id 根本不存在」**無法區分** —— 一個專屬理由等於在 REJECT
    // 訊息裡公告彩蛋名單，探測用的客戶端掃一輪 id 就挖得出來。
    expect(ctl.selectChampion(seat, "no-such-champion"), "彩蛋被拒絕理由洩漏了").toEqual(rejected);
    // 對照組：沒被藏起來的照樣選得到（少了它，「永遠回 false」的實作也會過）。
    expect(ctl.selectChampion(seat, LIVE)).toEqual({ ok: true });
  });

  it("★ ② 隨機池仍然包含它 —— 這就是「可以隨機到」", () => {
    cover("hidden-champions");
    const pool = newController().randomChampionPool() as string[];
    expect(pool, "隱藏 ≠ 下架：把它從隨機池拿掉就是把彩蛋做成下架").toContain(H);
    expect(pool).toContain(LIVE);
  });
});

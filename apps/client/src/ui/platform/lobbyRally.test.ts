/**
 * 大廳集合令的兩個會出錯的決定（GH#492）。
 *
 * ⛔ 這裡**不驗數字**（10 秒住在三個住處 + laneConfigDocs 的 drift 守衛上）。
 * 驗的是兩件「壞了玩家一定看得出來」的機制：
 *
 *  ① 一個**斷線的真人**必須留在名冊上，而且要標成「BOT 接手」。
 *     ⭐ 這是 owner 給的理由本身（「有可能斷線離開或連線回來房間繼續遊戲」），
 *     也是唯一一條寫成 `driver === "ai"` 就會**靜靜地**壞掉的路：那一版會把他
 *     整列刪掉，而畫面上看起來就像「他本來就沒在」。
 *  ② 倒數必須從**伺服器蓋的 `expiresAt`** 算 —— 一個從「收到訊息 + waitSec」
 *     起算的版本在單機測試裡完全正確，在真的網路上會讓比賽開了而視窗還在數。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  DEFAULT_LOBBY_RALLY,
  rallyCountdown,
  rosterRows,
  rosterShows,
  type RosterSeat,
} from "./lobbyRally";

const TAG = "lobby-rally";

const seat = (over: Partial<RosterSeat> & { seatId: number }): RosterSeat => ({
  teamId: 0,
  displayName: `P${over.seatId}`,
  connected: true,
  driver: "human",
  championId: "sela",
  rating: 1200,
  human: true,
  ...over,
});

describe("大廳集合令 (lobby-rally)", () => {
  it("★ 斷線的真人留在名冊上並標成 BOT 接手；天生的 bot 根本不上名冊", () => {
    cover(TAG);
    const rows = rosterRows(
      [
        seat({ seatId: 0 }),
        // 斷線的真人 —— `MatchRoom.onLeave` 立刻把 driver 換成 ai、connected 清掉。
        seat({ seatId: 3, teamId: 1, connected: false, driver: "ai" }),
        // 天生的 bot：`human` 是 false，其餘每一格都和上面那一列一樣。
        seat({ seatId: 6, teamId: 2, connected: false, driver: "ai", human: false, rating: 0 }),
      ],
      0,
    );
    expect(rows.map((r) => r.seatId), "只有屬於真人的位子上名冊").toEqual([0, 3]);
    expect(rows[0]?.presence).toBe("playing");
    expect(rows[0]?.isSelf).toBe(true);
    expect(rows[1]?.presence, "斷線 ≠ 消失 —— 這是 owner 要這份名冊回答的問題").toBe(
      "bot-holding",
    );
  });

  it("★ 倒數讀伺服器的截止時間，⛔ 不是各自從收到訊息起算", () => {
    cover(TAG);
    const cd = rallyCountdown(10_000, 10, 6_000);
    expect(cd.secondsLeft).toBe(4);
    expect(cd.expired).toBe(false);
    expect(rallyCountdown(10_000, 10, 10_000).expired, "到期就是到期").toBe(true);
    // waitSec 缺席（舊 push）不可以變成除以零 —— 進度條退化成滿格。
    expect(rallyCountdown(10_000, 0, 6_000).fraction).toBe(1);
  });

  it("★ 名冊只在 owner 指名的兩個時機出現，而且要有第二個真人", () => {
    cover(TAG);
    const p = DEFAULT_LOBBY_RALLY;
    expect(rosterShows(p, "resolution", 2), "每回合結算").toBe(true);
    expect(rosterShows(p, "champSelect", 2), "一起進場那一刻").toBe(true);
    expect(rosterShows(p, "combat", 2), "⛔ 戰鬥中不擋畫面").toBe(false);
    expect(rosterShows(p, "resolution", 1), "⭐「若有其他玩家」= 一個人不畫").toBe(false);
    expect(rosterShows({ ...p, showRosterInSettlement: false }, "resolution", 2)).toBe(false);
  });
});

/**
 * ⚠️ 上面三條全是純函式 —— 而這個 repo 最貴的失敗形態正是「純函式全綠、元件根本
 * 沒被掛上去」（`roundReportMount.test.ts` 的檔頭數過**八次**）。所以再加兩條
 * **接線**斷言：名冊真的畫得出那三樣東西，而且真的在 `HudRoot` 的樹上。
 */
describe("真人玩家名冊真的畫得出來，而且真的被掛上去 (GH#492)", () => {
  it("★ 一列上同時有 姓名 · 積分 · 所選英雄 · 斷線狀態", async () => {
    cover(TAG);
    const { hudStore } = await import("../../net/RoomStore");
    const { HumanRosterPanel } = await import("../panels/HumanRosterPanel");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    hudStore.setState({
      phase: "resolution",
      localSeatId: 0,
      seats: [
        { ...(seat({ seatId: 0, rating: 1234 }) as object) } as never,
        { ...(seat({ seatId: 3, teamId: 1, rating: 987, connected: false, driver: "ai" }) as object) } as never,
      ],
    } as never);
    const html = renderToStaticMarkup(createElement(HumanRosterPanel));
    expect(html).toContain("真人玩家");
    expect(html).toContain("P0"); // 姓名
    expect(html).toContain("1234"); // 積分
    expect(html).toContain("987");
    expect(html).toContain("斷線 · BOT 接手"); // ⭐ owner 要的那一句
  });

  it("★ 它真的在 HudRoot 的渲染樹上（⛔ 不是只寫在檔案裡）", async () => {
    cover(TAG);
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "HudRoot.tsx"), "utf8");
    expect(src).toMatch(/import\s*\{\s*HumanRosterPanel\s*\}/);
    expect(src.match(/<HumanRosterPanel\s*\/>/g) ?? []).toHaveLength(1);
  });
});

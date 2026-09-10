/**
 * ⭐⭐ 換邊操作殭屍王的守衛（GH#922 / #1151 E）——
 * ⭐ 票的驗收①②④⑤⑦ ＋ 四種濫用各一條，⛔ 而它們全部撞同一道門。
 */
import { describe, it, expect } from "vitest";
import {
  round11TeamShouldConvert,
  round11ConvertibleSeats,
  round11DenyPossession,
  round11ReconnectState,
  round11ScoreAccrual,
  round11KillRewardHp,
  round11BumpBossKills,
  type Round11Seat,
  type Round11Possession,
} from "./round11Possession";

const seat = (seatId: number, team: number, championAlive: boolean, possessing = false): Round11Seat => ({
  seatId,
  team,
  championAlive,
  possessing,
});

describe("驗收①② 整隊轉王的觸發 —— ⭐ 分母是**存活的英雄**", () => {
  it("⭐ 驗收①：同隊三個英雄全死 ⇒ 觸發", () => {
    const seats = [seat(1, 0, false), seat(2, 0, false), seat(3, 0, false), seat(4, 1, true)];
    expect(round11TeamShouldConvert(true, seats, 0)).toBe(true);
  });

  it("⛔⛔ 驗收②：**還有一個隊友活著** ⇒ 不觸發（⛔ 即使場上沒有復活圈）", () => {
    const seats = [seat(1, 0, false), seat(2, 0, false), seat(3, 0, true)];
    expect(round11TeamShouldConvert(true, seats, 0)).toBe(false);
  });

  it("⛔⛔ 分母**不是實體數** —— 已經轉王的隊友⛔ 不算「還活著」", () => {
    // ⚠️ 票文逐字:「屍體都變成王了,用實體數會**永遠不結束**」。
    // ⭐ 三個都轉王了(possessing=true)而英雄全死 ⇒ 這一隊仍然算全滅。
    const seats = [seat(1, 0, false, true), seat(2, 0, false, true), seat(3, 0, false, true)];
    expect(round11TeamShouldConvert(true, seats, 0)).toBe(true);
  });

  it("⛔ 機制關著 ⇒ 不觸發（⭐ 一鍵 rollback）", () => {
    const seats = [seat(1, 0, false), seat(2, 0, false)];
    expect(round11TeamShouldConvert(false, seats, 0)).toBe(false);
  });

  it("⛔ **空隊**不叫全滅 —— 否則開場那一 tick 就轉王", () => {
    expect(round11TeamShouldConvert(true, [seat(1, 1, true)], 0)).toBe(false);
  });

  it("⭐ 該轉的座位：⛔ 已經在開王的不重複轉，而且**依 seatId 排序**", () => {
    const seats = [seat(9, 0, false), seat(2, 0, false, true), seat(5, 0, false), seat(7, 1, false)];
    expect(round11ConvertibleSeats(seats, 0)).toEqual([5, 9]);
  });
});

const CONVERTED: Round11Possession = { convertedAtSec: 100, bossEntityId: 42, bossDead: false };
const allow = (p: Round11Possession, id = 42, since = 99, win = 10) =>
  round11DenyPossession(true, p, id, since, win);

describe("四種濫用 —— ⭐ 同一道門", () => {
  it("⭐ 轉王了 ＋ 逃跑窗過了 ＋ 是自己的王 ⇒ **可以操作**", () => {
    expect(allow(CONVERTED)).toBeNull();
  });

  it("⛔ 機制關著 ⇒ 一律拒絕", () => {
    expect(round11DenyPossession(false, CONVERTED, 42, 99, 10)).toBe("disabled");
  });

  it("⛔ 還沒轉王 ⇒ 拒絕（⭐ 不能同時操作英雄與王）", () => {
    expect(allow({ ...CONVERTED, convertedAtSec: null })).toBe("notConverted");
  });

  it("⛔⛔ **操作他人的王** ⇒ 拒絕", () => {
    expect(allow(CONVERTED, 999)).toBe("notYourBoss");
  });

  it("⛔⛔ **重生第二具** ⇒ 拒絕（王死了就徹底離場）", () => {
    expect(allow({ ...CONVERTED, bossDead: true })).toBe("bossDead");
  });

  it("⛔⛔ **逃跑窗內提前攻擊** ⇒ 拒絕（⭐ 那 10 秒是給活人跑的）", () => {
    expect(allow(CONVERTED, 42, 9.9, 10)).toBe("escapeWindow");
    expect(allow(CONVERTED, 42, 10, 10), "⭐ 窗一到就放行").toBeNull();
  });

  it("⛔⛔ **順序**：要別人的王且還在窗內 ⇒ `notYourBoss`，⛔ 不是 `escapeWindow`", () => {
    // ⚠️ 回 `escapeWindow` 的話,呼叫端會以為「再等一下就可以」——⛔ 而它永遠不可以。
    expect(allow(CONVERTED, 999, 0, 10)).toBe("notYourBoss");
  });

  it("⛔ 還沒分配到王 ⇒ `notAssigned`", () => {
    expect(allow({ ...CONVERTED, bossEntityId: null })).toBe("notAssigned");
  });
});

describe("重連 —— ⛔ 不可以趁機**重生第二具**", () => {
  it("⭐ 還沒轉 ⇒ champion", () => {
    expect(round11ReconnectState({ convertedAtSec: null, bossEntityId: null, bossDead: false })).toBe("champion");
  });

  it("⭐ 轉了、王還在 ⇒ **同一個王**", () => {
    expect(round11ReconnectState(CONVERTED)).toBe("boss");
  });

  it("⭐ 王死了 ⇒ 旁觀（⛔ 不分配新的，⭐ 但仍看得到結算）", () => {
    expect(round11ReconnectState({ ...CONVERTED, bossDead: true })).toBe("spectator");
  });

  it("⭐ 轉了但**從未分配** ⇒ 旁觀，⛔ 不是「趁重連給他一具」", () => {
    expect(round11ReconnectState({ ...CONVERTED, bossEntityId: null })).toBe("spectator");
  });
});

describe("驗收④⑤⑦ 分數凍結 · 擊倒回滿 · 獨立統計", () => {
  it("⛔⛔ 驗收④：開王期間打死人 ⇒ 生存分數 **0 增量**", () => {
    expect(round11ScoreAccrual(true, 250)).toBe(0);
    expect(round11ScoreAccrual(false, 250), "⭐ 還在開英雄 ⇒ 照常累積").toBe(250);
  });

  it("⭐⭐ 驗收⑤：擊倒回滿吃的是**夾限之後**的 maxHp，⛔ 不是基礎值", () => {
    // ⚠️ 票文:「⛔ 不可以被王的強度夾限夾掉」——⭐ 夾限管 maxHp 多大,這一條把 hp 拉到那個 maxHp。
    const base = 1000;
    const afterScale = base * 8; // ⭐ 上界 bossScaleCeil
    expect(round11KillRewardHp(true, 1, afterScale)).toBe(8000);
    expect(round11KillRewardHp(true, 1, afterScale)).not.toBe(base);
  });

  it("⛔ 關掉獎勵 ⇒ 血量原樣（⭐ 一鍵 rollback）", () => {
    expect(round11KillRewardHp(false, 1, 8000)).toBe(1);
  });

  it("⭐ 驗收⑦：擊倒統計是**獨立計數**，⛔ 它不回傳任何分數", () => {
    const tally = new Map<number, number>();
    expect(round11BumpBossKills(tally, 3)).toBe(1);
    expect(round11BumpBossKills(tally, 3)).toBe(2);
    expect(round11BumpBossKills(tally, 7)).toBe(1);
    expect(tally.get(3)).toBe(2);
    // ⭐ 而生存分數那一欄**沒有被它改動** —— 同一個座位仍然是 0 增量。
    expect(round11ScoreAccrual(true, 999)).toBe(0);
  });
});

/**
 * GH#726（接手 #104 / #144）—— 兩處**伺服器不知情**的作弊面。
 *
 * 兩條都不是「少一個功能」，是**客戶端知道的事實伺服器不知道**：
 *   ① 選角鎖定只住在按下按鈕的那一台客戶端上（`champselect/lockGate.ts` 自承）
 *   ② 用過作弊碼沒有任何不可逆的記號（`godModeSeats` 是**可逆** Set，開了再關就查不到）
 *
 * ⭐ 突變點（一批一條，挑最承重的）：把 `applyCheat` 的 `if (ok) this.cheatEverUsed = true;`
 * 拿掉 ⇒ 「開了再關仍然算作弊」那條紅。
 *
 * ⛔ 這一支不驗任何出貨數字；驗的全部是「這件事會不會發生」。
 */
import { describe, it, expect } from "vitest";
import { asSeatId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_SCORE_CHEATED_MATCHES, resolveScoreCheatedMatches } from "./integrityPolicy";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const SEAT0 = asSeatId(0);

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function inCombat(): MatchController {
  const ctl = new MatchController("authority", 4242, allBots(), FAST);
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  return ctl;
}

describe("① 座位鎖是伺服器的事實 (GH#726 / #104)", () => {
  it("⭐ 明確鎖定之後，改選被**拒絕**而且 championId 一個字都沒動", () => {
    const ctl = new MatchController("authority-lock", 7, allBots(), FAST);
    const before = ctl.seats.get(SEAT0)!.championId;

    // 鎖定之前：改選是自由的（⛔ 對照組 —— 少了它，下面那條對「selectChampion
    // 整支壞掉」也會過，失敗形態④）。
    expect(ctl.selectChampion(SEAT0, "sela").ok).toBe(true);
    expect(ctl.selectChampion(SEAT0, "thorne").ok).toBe(true);
    expect(ctl.seats.get(SEAT0)!.championId).toBe("thorne");
    expect(ctl.seatLocked(SEAT0)).toBe(false);
    expect(ctl.seats.get(SEAT0)!.championId).not.toBe(before);

    // 鎖定 —— 走 `MSG.LOCK_CHAMPION` 的落點，⛔ 不是測試自己捏一個狀態。
    expect(ctl.lockSeatChampion(SEAT0, "thorne").ok).toBe(true);
    expect(ctl.seatLocked(SEAT0)).toBe(true);

    // 改造過的客戶端在鎖定之後又送一次 SELECT_CHAMPION。
    expect(ctl.selectChampion(SEAT0, "sela")).toEqual({ ok: false, reason: "already-locked" });
    expect(ctl.seats.get(SEAT0)!.championId).toBe("thorne"); // ⛔ 擋下來了，東西也真的沒動
  });

  it("鎖定走的是 `selectChampion` 的同一支權威閘 —— 不存在的英雄鎖不進去，而且**沒有**留下鎖", () => {
    const ctl = new MatchController("authority-gate", 7, allBots(), FAST);
    expect(ctl.lockSeatChampion(SEAT0, "no-such-champion").ok).toBe(false);
    // ⚠️ 這一條擋的是「先鎖再驗」那種寫法：那個版本會讓一個**失敗**的鎖定請求
    // 把座位永久凍在它原本的英雄上。
    expect(ctl.seatLocked(SEAT0)).toBe(false);
  });
});

describe("② 用過作弊碼是**單向**的 (GH#726 / #144)", () => {
  it("出貨預設：作弊局不計分（owner「用了就沒有分數與藍水晶」）", () => {
    expect(resolveScoreCheatedMatches()).toBe(DEFAULT_SCORE_CHEATED_MATCHES);
    expect(DEFAULT_SCORE_CHEATED_MATCHES).toBe(false);
  });

  it("⭐ 承重：開了**再關掉**，這一場仍然帶著記號 —— 可逆的旗標等於沒有旗標", () => {
    const ctl = inCombat();
    expect(ctl.cheatUsed).toBe(false); // ⛔ 對照組：乾淨的一場不帶記號

    expect(ctl.applyCheat(SEAT0, { kind: "godMode", enabled: true })).toBe(true);
    expect(ctl.cheatUsed).toBe(true);

    // 這正是 #144 的洞：`godModeSeats` 是可逆的 Set，關掉就查不到了。
    expect(ctl.applyCheat(SEAT0, { kind: "godMode", enabled: false })).toBe(true);
    expect(ctl.cheatUsed).toBe(true);
  });

  it("被**拒絕**的作弊不算 —— 一個 no-op 不可以沒收玩家的水晶", () => {
    const ctl = inCombat();
    expect(ctl.applyCheat(SEAT0, { kind: "swapChampion", championId: "no-such-champion" })).toBe(
      false,
    );
    expect(ctl.cheatUsed).toBe(false);
  });
});

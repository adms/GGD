/**
 * ⭐ 陣亡投幣被拒 → 畫面上**真的**有一句話。
 *
 * ⛔ 這一條刻意**不驗數字**（`coinValue` / `coinsPerRound` / `startingGold` 是
 * owner 每週在調的東西，而它們已經有三個住處與 drift 守衛）。它驗的是**機制**：
 * 一顆權威的 `coinDropRejected` 走完 `GameApp` 真的那條事件排水口之後，
 * `ui/castFeedback` 的告示盒裡**有東西**。
 *
 * ⚠️ 為什麼跑真的排水口而不是直接呼叫 `recordCoinEvent`：這一整包的失敗形態是
 * ③「可以從樹上刪掉而測試全綠」—— 在此之前 `coinDropRejected` 逐座位私訊了很久
 * 而客戶端一個消費端都沒有。直接測純函式會對「有接線」和「沒接線」同樣通過。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { GameApp } from "../GameApp";
import { hudStore, resetHudStore } from "../net/RoomStore";
import { getCastNotice, resetCastFeedback } from "./castFeedback";
import { COIN_REJECT_GENERIC } from "./coinThrow";

interface DrainSeam {
  drainNetworkEvents(state: null, localId: number | null, nowMs: number): void;
}

/** GameApp 的**真** prototype，協作者用惰性 own-property 遮掉（同 killCombo.test）。 */
function runDrain(events: unknown[]): void {
  const noop = (): void => {};
  const seam = Object.assign(Object.create(GameApp.prototype) as object, {
    sessions: { primary: { drainEvents: () => events } },
    vfx: { handleEvent: noop, statusFx: { set: noop } },
    views: { handleEvent: noop },
    casts: { handleEvent: noop },
    sfxQueue: { push: noop },
    deathFocus: { noteDeath: noop },
    applyCombatFeedback: noop,
    dispatchContextualVoice: noop,
    audioEntityPos: () => null,
    audioTeamOf: () => null,
    batchProfiled: false,
    frameKicks: 0,
  }) as unknown as DrainSeam;
  seam.drainNetworkEvents(null, null, 1000);
}

const rejected = (seatId: number, reason: string): unknown => ({
  type: "coinDropRejected",
  tick: 1,
  data: { seatId, reason },
});

describe("陣亡投幣被拒 —— 每個玩家每一場都會撞到的那一筆", () => {
  beforeEach(() => {
    resetHudStore();
    resetCastFeedback();
    hudStore.setState({ localSeatId: 2 });
  });

  it("GameApp 的排水口真的把伺服器的拒絕理由送上畫面", () => {
    // ⚠️ 突變：把 GameApp 排水口裡的 `recordCoinEvent(ev)` 拿掉（或讓它到不了）
    // → 告示盒永遠是 null → 這一條紅。那正是出貨行為：按鈕亮著、按了沒反應。
    expect(getCastNotice()).toBeNull();
    runDrain([rejected(2, "no-gold")]);
    expect(getCastNotice()?.text).toContain("金幣不足");
    // ⛔ 投幣不坐在任何一格技能上 —— 抓一格來抖比不抖更難懂。
    expect(getCastNotice()?.slot).toBeNull();
  });

  it("別人座位的拒絕不是我的告示", () => {
    runDrain([rejected(5, "no-gold")]);
    expect(getCastNotice()).toBeNull();
  });

  it("這一版不認得的理由**照樣說話**，⛔ 不可以退回靜默", () => {
    runDrain([rejected(2, "__a_reason_from_a_newer_server__")]);
    expect(getCastNotice()?.text).toContain(COIN_REJECT_GENERIC);
  });
});

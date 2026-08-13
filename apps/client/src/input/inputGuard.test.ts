// @vitest-environment jsdom
/**
 * ⭐【誤觸防護真的擋得住】—— owner 2026-08-14「滑鼠右鍵 WIN鍵等按鍵要鎖住」。
 *
 * ⚠️ 這條驗的是**行為**（事件真的被 preventDefault），⛔ 不是「有沒有註冊監聽」——
 *    後者對「註冊了但條件寫反」是完全不敏感的（失敗形態④）。
 *
 * ⚠️ 也刻意驗**不該擋的那一半**：輸入框裡的 Backspace。少了它，這個功能會用
 *    「玩家在聊天/改名時刪不掉字」的形式上線，而那種缺陷沒有人會聯想到誤觸防護。
 *
 * 突變紀錄：把 `blockContextMenu` 那一行的判斷拿掉（永遠 preventDefault）→
 * 「開關關掉時右鍵選單要出得來」那條紅；把 `isTextEntry` 拿掉 → 輸入框那條紅。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  installInputGuard,
  shouldRelockFollow,
  DEFAULT_INPUT_GUARD,
  type InputGuard,
} from "./inputGuard";

let guard: InputGuard | null = null;

afterEach(() => {
  guard?.dispose();
  guard = null;
});
beforeEach(() => {
  document.body.innerHTML = "";
});

/** 派一個事件，回報它有沒有被擋下來。 */
function fire(type: string, init: MouseEventInit | KeyboardEventInit = {}, target?: EventTarget): boolean {
  const ev =
    type === "keydown"
      ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...(init as KeyboardEventInit) })
      : new MouseEvent(type, { bubbles: true, cancelable: true, ...(init as MouseEventInit) });
  (target ?? document.body).dispatchEvent(ev);
  return ev.defaultPrevented;
}

describe("誤觸防護（input-guard）", () => {
  it("⭐ 右鍵選單被擋掉 —— 而且開關關掉就放行", () => {
    guard = installInputGuard(document, window, { ...DEFAULT_INPUT_GUARD });
    expect(fire("contextmenu", { button: 2 }), "右鍵選單沒被擋").toBe(true);

    guard.update({ ...DEFAULT_INPUT_GUARD, blockContextMenu: false });
    expect(fire("contextmenu", { button: 2 }), "開關關掉了還在擋 —— 那不是開關").toBe(false);
  });

  it("中鍵自動捲動與滑鼠側鍵『上一頁』都被擋，左鍵不受影響", () => {
    guard = installInputGuard(document, window, { ...DEFAULT_INPUT_GUARD });
    for (const button of [1, 3, 4]) {
      expect(fire("pointerdown", { button }), `button ${button} 沒被擋`).toBe(true);
      expect(fire("auxclick", { button }), `auxclick ${button} 沒被擋`).toBe(true);
    }
    // ⛔ 左鍵是遊戲的主要輸入，擋了整個遊戲就不能玩了。
    expect(fire("pointerdown", { button: 0 }), "左鍵被擋了 —— 遊戲會直接不能玩").toBe(false);
  });

  it("Backspace：遊戲中擋掉（會退到上一頁），⛔ 但輸入框裡一定要放行", () => {
    guard = installInputGuard(document, window, { ...DEFAULT_INPUT_GUARD });
    expect(fire("keydown", { key: "Backspace" }), "Backspace 沒被擋 —— 會退出比賽").toBe(true);

    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(
      fire("keydown", { key: "Backspace" }, input),
      "輸入框裡的 Backspace 被擋了 —— 玩家會刪不掉字，而且不會聯想到誤觸防護",
    ).toBe(false);
  });

  it("⚠️ 誠實回報：沒有 Keyboard Lock API 時，systemKeysLocked 必須是 false", () => {
    // 這條是這個功能最容易說謊的地方：Win 鍵在**非全螢幕**時網頁一律擋不掉，
    // 而 HUD 會照著 state() 告訴玩家。⛔ 這裡回 true 就是對玩家撒謊。
    guard = installInputGuard(document, window, { ...DEFAULT_INPUT_GUARD });
    const st = guard.state();
    expect(st.systemKeysLocked, "沒鎖成功卻回報鎖住了").toBe(false);
    expect(st.webGuardsActive).toBe(true);
    // jsdom 沒有 navigator.keyboard ⇒ 支援旗標必須如實回 false。
    expect(st.keyboardLockSupported).toBe(false);
  });

  it("dispose 之後不再擋 —— 大廳不可以繼續吃右鍵", () => {
    guard = installInputGuard(document, window, { ...DEFAULT_INPUT_GUARD });
    guard.dispose();
    guard = null;
    expect(fire("contextmenu", { button: 2 }), "拆掉之後還在擋").toBe(false);
  });
});

describe("回合開始把視角拉回自己英雄（owner 2026-08-14）", () => {
  it("⭐ 只在『非戰鬥 → 戰鬥』那一個 edge 扣回跟隨鎖", () => {
    // 缺陷本身：上一回合看過小地圖 ⇒ followLock=false 一路帶到這一回合。
    expect(shouldRelockFollow(true, false, false), "回合開打沒有拉回來").toBe(true);
    // ⛔ 戰鬥中每一幀都扣 = 玩家整場不能平移，比原缺陷更糟。
    expect(shouldRelockFollow(true, true, false), "戰鬥中還在扣 —— 平移會被搶走").toBe(false);
    // 商店 / 結算不算回合開始。
    expect(shouldRelockFollow(false, true, false)).toBe(false);
    expect(shouldRelockFollow(false, false, false)).toBe(false);
    // 死亡觀戰的自由視角是 #85 刻意給的，⛔ 不可以搶。
    expect(shouldRelockFollow(true, false, true), "觀戰視角被搶走了").toBe(false);
  });
});

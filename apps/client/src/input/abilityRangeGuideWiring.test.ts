/**
 * 技能範圍指引 —— 鍵盤與 hover 真的接到**同一條**預覽上 (GH#367).
 *
 * ⚠️ 驗的是**接線**不是幾何：`GameApp.resolveHoldPreview` 早就會把
 * `getHeldAimSlot()` 換算成 post-`envFactor("abilityRange")` 的圈（#125/#136），
 * 而 #367 之前鍵盤與 hover **從來沒有寫進那個 seam** —— 觸控與手把看得到、
 * 鍵盤玩家按 Q 什麼都沒有。所以斷言的是「按下去之後那個 seam 讀得到」，
 * ⛔ 不是「某個函式存在」（失敗形態⑥：掃字串代替行為）。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { getDescribedAbility, getHeldAimSlot, setHeldAbility } from "../ui/abilityHold";
import { hoverGuideEnter, hoverGuideLeave, ABILITY_RANGE_GUIDE } from "../ui/abilityRangeGuide";
import { InputCapture } from "./InputCapture";

class FakeTarget {
  private readonly listeners = new Map<string, ((ev: never) => void)[]>();
  addEventListener(type: string, fn: (ev: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(): void {}
  dispatch(type: string, ev: object): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(ev as never);
  }
}

/** A wired-up InputCapture whose window is a FakeTarget we can dispatch onto. */
function harness(): FakeTarget {
  const win = new FakeTarget();
  vi.stubGlobal("window", win); // attach() puts the key handlers on window
  const noop = (): void => {};
  new InputCapture(new FakeTarget() as unknown as HTMLElement, {
    screenToGround: () => null,
    getSelfPos: () => ({ x: 0, z: 0 }),
    getAbility: () => null,
    pickEnemy: () => null,
    pickSelf: () => false,
    onOrder: noop,
    onCommand: noop,
    onSelectSelf: noop,
    onZoom: noop,
    onToggleFollow: noop,
  }).attach();
  return win;
}
const key = (code: string): object => ({ code, repeat: false, target: null });

afterEach(() => {
  setHeldAbility(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("按住技能鍵 → 地板範圍指引 (GH#367)", () => {
  it("keydown 餵進預覽 seam，keyup / blur 收回去", () => {
    const win = harness();
    win.dispatch("keydown", key("KeyQ"));
    expect(getHeldAimSlot()).toBe("Q"); // ← GameApp 每一幀讀的就是這個
    // ⛔ 「a KEY hold is a full hold」在 2026-08-22 之後沒有意義了（沒有橫幅）。
    expect(getDescribedAbility()).toBe("Q");
    win.dispatch("keyup", { code: "KeyQ" });
    expect(getHeldAimSlot()).toBeNull();

    // alt-tab eats the keyup — blur must not strand the ring on the floor
    win.dispatch("keydown", key("KeyF"));
    expect(getHeldAimSlot()).toBe("EX");
    win.dispatch("blur", {});
    expect(getHeldAimSlot()).toBeNull();
  });

  it("放開 Q 不可以扯掉之後才按下去的 W（四個 writer 共用一格全域）", () => {
    const win = harness();
    win.dispatch("keydown", key("KeyQ"));
    setHeldAbility("W"); // 手指還按著 Q 的時候，滑鼠按下 W 圖示 → 接手
    win.dispatch("keyup", { code: "KeyQ" }); // 這一下只能收回「自己放的那個」
    expect(getHeldAimSlot()).toBe("W");
  });
});

describe("hover 技能圖示 → 只出範圍，不開說明橫幅", () => {
  it("停留超過門檻才出，離開就收", () => {
    vi.useFakeTimers();
    hoverGuideEnter("E");
    expect(getHeldAimSlot()).toBeNull(); // 路過不觸發
    vi.advanceTimersByTime(ABILITY_RANGE_GUIDE.hoverDelayMs + 1);
    expect(getHeldAimSlot()).toBe("E");
    // ⛔ 說明橫幅 2026-08-22 退休（owner:「不需要那麼大的技能說明區塊」）⇒
    //    `getDescribedAbility()` 現在**等於** `getHeldAimSlot()`，這一行不再有
    //    「橫幅開不開」這個意思。⭐ 保留它是為了釘住兩者不會再分岔。
    expect(getDescribedAbility()).toBe("E");
    hoverGuideLeave("E");
    expect(getHeldAimSlot()).toBeNull();
  });
});

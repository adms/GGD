/**
 * mobile-09/10: touch-device detection ('ontouchstart' + coarse pointer, plus
 * the __ggdForceTouch dev seam) gating the touch layout, and the portrait →
 * rotate-to-landscape overlay logic. Pure predicates, node-run.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  isTouchDevice,
  detectQuality,
  shouldShowRotateOverlay,
  showTouchControls,
  readTouchEnv,
  type TouchEnv,
} from "./mobileDetect";
import {
  DESKTOP_FPS_CAP,
  TABLET_FPS_CAP,
  MENU_FPS_CAP,
  defaultFpsCap,
  menuFpsCap,
} from "../render/frameCap";

describe("touch detection + layout gating (mobile-09)", () => {
  it("requires BOTH touch events and a coarse pointer", () => {
    cover("mobile-detect-layout");
    expect(isTouchDevice({ hasTouchStart: true, coarsePointer: true, forced: false })).toBe(true);
    // desktop with a touchscreen but a mouse primary pointer → not touch UI
    expect(isTouchDevice({ hasTouchStart: true, coarsePointer: false, forced: false })).toBe(false);
    expect(isTouchDevice({ hasTouchStart: false, coarsePointer: true, forced: false })).toBe(false);
    expect(isTouchDevice({ hasTouchStart: false, coarsePointer: false, forced: false })).toBe(false);
  });

  it("the __ggdForceTouch dev seam forces touch mode (browser-pane emulation)", () => {
    cover("mobile-detect-layout");
    expect(isTouchDevice({ hasTouchStart: false, coarsePointer: false, forced: true })).toBe(true);
    const g = globalThis as { __ggdForceTouch?: boolean };
    g.__ggdForceTouch = true;
    expect(readTouchEnv().forced).toBe(true);
    expect(isTouchDevice(readTouchEnv())).toBe(true);
    delete g.__ggdForceTouch;
    expect(readTouchEnv().forced).toBe(false);
  });

  it("touch controls render only in-game, single local player, on touch", () => {
    cover("mobile-detect-layout");
    expect(showTouchControls({ touch: true, inGame: true, couch: false })).toBe(true);
    expect(showTouchControls({ touch: false, inGame: true, couch: false })).toBe(false);
    expect(showTouchControls({ touch: true, inGame: false, couch: false })).toBe(false);
    expect(showTouchControls({ touch: true, inGame: true, couch: true })).toBe(false);
  });
});

/**
 * GH#271 —— owner 2026-08-04:「我明明是 mac 卻被鎖 25fps」。
 *
 * 那份回報的第一個推論是「MacBook 的觸控板讓 `navigator.maxTouchPoints > 0`,
 * 所以被判成觸控裝置、吃到 TABLET_FPS_CAP」。**去量了,不是。**
 * 2026-08-04 在 owner 那台 Mac 的瀏覽器裡跑同一組查詢:
 *
 *     maxTouchPoints 0 · 'ontouchstart' in window false · TouchEvent defined true
 *     (pointer: coarse) false · (pointer: fine) true
 *     (any-pointer: coarse) false · (hover: hover) true · (any-hover: none) false
 *     platform MacIntel · hardwareConcurrency 18 · deviceMemory 32
 *
 * 也就是 `readTouchEnv()` 在那台機器上回 `{hasTouchStart:false,
 * coarsePointer:false}` → `isTouchDevice` = **false** → `defaultFpsCap` =
 * DESKTOP。而且它 localStorage 裡存的 `fpsCap` 就是 60,不是 30。
 * 「25fps / 30fps」另有原因(見 `render/frameCap.FrameDelta`)。
 *
 * ⚠️ 所以這一組**不是在修一個缺陷**,是把「量到的環境」釘成資料 ——
 * 下次有人想把 `maxTouchPoints` 或 `hover` 加進判準時,這裡會直接告訴他
 * owner 的 Mac 實際長什麼樣,不用再猜一次。
 *
 * 這一組同時守**兩個方向**(只驗一邊的話反向壞掉不會紅),而且期望值一律從
 * `DESKTOP_FPS_CAP` / `TABLET_FPS_CAP` 推導,不寫死 60/30。
 */
describe("真實裝置 → 觸控判定 + fps 上限 (mobile-09 / GH#271)", () => {
  /** 每一列都是一台真的機器,不是一個假想的組合。 */
  const DEVICES: {
    label: string;
    env: TouchEnv;
    touch: boolean;
    /** 這台機器該不該長出虛擬搖桿(GameApp 用同一個判定裝 TouchController)。 */
    joystick: boolean;
  }[] = [
    {
      // 量到的(2026-08-04,owner 那台 MacBook 的瀏覽器)
      label: "MacBook(有觸控板,無觸控螢幕)",
      env: { hasTouchStart: false, coarsePointer: false, forced: false },
      touch: false,
      joystick: false,
    },
    {
      // iOS Safari / WKWebView —— 這個 client 明說的目標平台
      label: "iPhone Safari",
      env: { hasTouchStart: true, coarsePointer: true, forced: false },
      touch: true,
      joystick: true,
    },
    {
      // 有觸控螢幕**又**有滑鼠的桌機:主要指標仍然是細的
      label: "Surface / 觸控筆電(接著滑鼠)",
      env: { hasTouchStart: true, coarsePointer: false, forced: false },
      touch: false,
      joystick: false,
    },
  ];

  it("桌機(含有觸控板/觸控螢幕的)判成非觸控;真手機判成觸控", () => {
    cover("mobile-detect-layout");
    for (const d of DEVICES) {
      expect(isTouchDevice(d.env), `${d.label} 的觸控判定反了`).toBe(d.touch);
    }
  });

  it("同一個判定同時決定 fps 上限與虛擬搖桿 —— 兩邊都要對", () => {
    cover("client-fps-platform");
    for (const d of DEVICES) {
      const touch = isTouchDevice(d.env);
      // fps:期望值從常數推導。手機的預算必須真的比較長,不是只有一個常數不同。
      expect(defaultFpsCap(touch), `${d.label} 拿到了錯的 fps 上限`).toBe(
        d.touch ? TABLET_FPS_CAP : DESKTOP_FPS_CAP,
      );
      expect(menuFpsCap(touch), `${d.label} 的選單上限錯了`).toBe(
        d.touch ? TABLET_FPS_CAP : MENU_FPS_CAP,
      );
      // 搖桿:`GameApp.ts` 的 `if (isTouchDevice(readTouchEnv()))` 與 HUD 的
      // `showTouchControls` 走的是同一個判定。Mac 長出虛擬搖桿、或真手機拿不到
      // 虛擬搖桿,都是比 fps 更嚴重的壞法。
      expect(
        showTouchControls({ touch, inGame: true, couch: false }),
        `${d.label} 的虛擬搖桿裝錯了`,
      ).toBe(d.joystick);
    }
  });
});

describe("rotate-to-landscape overlay (mobile-10)", () => {
  it("shows only on touch devices in portrait", () => {
    cover("mobile-rotate-overlay");
    expect(shouldShowRotateOverlay({ touch: true, width: 375, height: 812 })).toBe(true);
    expect(shouldShowRotateOverlay({ touch: true, width: 812, height: 375 })).toBe(false);
    expect(shouldShowRotateOverlay({ touch: false, width: 375, height: 812 })).toBe(false);
    // square-ish split views stay playable
    expect(shouldShowRotateOverlay({ touch: true, width: 800, height: 800 })).toBe(false);
  });
});

describe("quality tier auto-detect (mobile-11)", () => {
  it("touch devices and <=4-core CPUs get the mobile tier", () => {
    cover("mobile-quality-tier");
    expect(detectQuality({ touch: true, hardwareConcurrency: 8 })).toBe("mobile");
    expect(detectQuality({ touch: false, hardwareConcurrency: 4 })).toBe("mobile");
    expect(detectQuality({ touch: false, hardwareConcurrency: 2 })).toBe("mobile");
    expect(detectQuality({ touch: false, hardwareConcurrency: 8 })).toBe("desktop");
  });
});

// @vitest-environment jsdom
/**
 * 📱 **@visual-proof** —— GH#1089 平台政策：⛔ **不支援手機** · ⭐ 平板上限 30fps
 * · ⭐ 最低配備 iPad mini (A17 Pro)。
 *
 * owner 2026-09-06（逐字）：
 * > 「本遊戲不支援手機但支援平板最高 30fps  手機是 30fps
 * >  以 ipad mini 的 A17 Pro 為最低配備標準來設計」
 *
 * ⭐ **兩個方向都驗**（⛔ 只驗「手機會出現」不算）：手機尺寸 ⇒ 告知**出現**且畫面上
 * 真的有最低配備那幾個字；⛔ iPad mini 尺寸與桌機 ⇒ 告知**不出現**，且 fps 上限
 * 分別是 30 / 60。
 *
 * ⭐ 掛的是**出貨的 `<PlatformNotice/>`** 與**出貨的 `content/config/model-lod.json`**
 * （⛔ 不自己造一份政策 —— 那是失敗形態⑤「被測的不是出貨的那個」）。
 *
 * ⚠️ 誠實的界線：jsdom ⛔ 不 raster ⇒ 這裡證明的是「**墨水存在**（節點在、字在、
 * 而且是從 config 讀來的那個字）」，⛔ 不證明它在真機上好不好看。
 *
 * 突變紀錄（2026-09-07）：`input/mobileDetect.ts` 的 `classifyDevice` 把手機那一支
 * 改成 `return "tablet"` ⇒ 紅（找不到告知節點）。用 Edit 改回來。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_MODEL_LOD } from "@ggd/shared/content";
import { applyModelLodPolicy } from "./modelLod";
import { applyPlatformPolicy, defaultFpsCap, menuFpsCap, platformPolicy, DESKTOP_FPS_CAP } from "./frameCap";
import { classifyDevice, readDeviceSizeEnv } from "../input/mobileDetect";
import { PlatformNotice } from "../ui/PlatformNotice";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom 底下 `import.meta.url` 不是 file: —— 從 cwd 往上找出貨檔（找不到就爆，⛔ 不靜默跳過）。 */
function shippedPath(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const p = join(dir, "content/config/model-lod.json");
    if (existsSync(p)) return p;
    dir = dirname(dir);
  }
  throw new Error("找不到 content/config/model-lod.json —— 這條守衛沒有在驗出貨的那一份");
}
const SHIPPED = JSON.parse(readFileSync(shippedPath(), "utf8")) as typeof DEFAULT_MODEL_LOD;

/** 一台裝置在 web 上說得出來的四個事實。 */
function device(coarse: boolean, touchPoints: number, w: number, h: number): void {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: touchPoints, configurable: true });
  (window as unknown as { matchMedia: (q: string) => unknown }).matchMedia = (q: string) => ({
    matches: coarse && q.includes("coarse"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

let root: Root | null = null;
/** 掛出貨元件，回傳它畫出來的文字（沒畫 = 空字串）。 */
function noticeText(): string {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(PlatformNotice)));
  return host.querySelector('[data-testid="platform-notice"]')?.textContent ?? "";
}

beforeEach(() => {
  // ⭐ 出貨文件走**出貨的採用路徑**（modelLod → frameCap），⛔ 不直接塞政策。
  applyModelLodPolicy(SHIPPED);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("平台政策 (client-platform-policy)", () => {
  it("出貨政策真的從 content/config/model-lod.json 被採用（⛔ 不是程式裡的字面值）", () => {
    expect(SHIPPED.platformPolicy).toEqual(DEFAULT_MODEL_LOD.platformPolicy);
    expect(platformPolicy()).toEqual(SHIPPED.platformPolicy);
    // 一份讀不懂的文件不可以把「不支援手機」關掉 —— 回到出貨政策，⛔ 不是「沒有政策」。
    applyPlatformPolicy({ nonsense: true });
    expect(platformPolicy()).toEqual(DEFAULT_MODEL_LOD.platformPolicy);
    applyModelLodPolicy(SHIPPED);
  });

  it("📱 手機（短邊 390）⇒ 告知出現，而且最低配備那行字是從 config 讀來的", () => {
    device(true, 5, 390, 844);
    expect(classifyDevice(readDeviceSizeEnv(), platformPolicy().phoneShortEdgePx)).toBe("phone");
    const text = noticeText();
    expect(text).toContain("不支援手機");
    expect(text).toContain(platformPolicy().minDevice);
    expect(text).toContain(String(platformPolicy().tabletFpsCap));
    // 出貨 hardBlock=false ⇒ 一定要有逃生口，否則誤判就是擋住一位玩家。
    expect(platformPolicy().phoneHardBlock).toBe(false);
    expect(text).toContain("仍要繼續");
  });

  it("⛔ 平板（iPad mini 744×1133，iPadOS 只有 maxTouchPoints 說真話）⇒ 沒有告知，fps 上限吃 config", () => {
    device(true, 5, 744, 1133);
    expect(classifyDevice(readDeviceSizeEnv(), platformPolicy().phoneShortEdgePx)).toBe("tablet");
    expect(noticeText()).toBe("");
    expect(defaultFpsCap(true)).toBe(SHIPPED.platformPolicy.tabletFpsCap);
    expect(menuFpsCap(true)).toBe(SHIPPED.platformPolicy.tabletFpsCap);
    // 後台把那一格改掉，四條 render loop 立刻跟著 —— ⛔ 不必重建映像。
    act(() => applyPlatformPolicy({ ...SHIPPED.platformPolicy, tabletFpsCap: 45 }));
    expect(defaultFpsCap(true)).toBe(45);
  });

  it("🖥 桌機 ⇒ 沒有告知，而且行為逐位元沒變（60）", () => {
    device(false, 0, 1920, 1080);
    expect(classifyDevice(readDeviceSizeEnv(), platformPolicy().phoneShortEdgePx)).toBe("desktop");
    expect(noticeText()).toBe("");
    expect(defaultFpsCap(false)).toBe(DESKTOP_FPS_CAP);
  });
});

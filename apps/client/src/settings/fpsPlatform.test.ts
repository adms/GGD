/**
 * FPS 上限依平台 (owner 2026-07-28:「FPS強制都是60，除非額外調整，
 * 手機則是預設30」).
 *
 * ⚠️ 這一組守的是「預設」與「鎖死」的差別。owner 那句話有兩半,兩半都要成立:
 *   · 預設 —— 桌機 60、手機 30,而且是**每一條 render loop** 都吃到,不只戰鬥那條
 *   · 除非額外調整 —— 玩家選過的值永遠贏,包含在手機上選 60 或 120
 *
 * v0.9.8 只做了「全平台 60」。把它改成「手機硬鎖 30」會通過一半的驗收而拿掉
 * 玩家的選擇權;只改 DEFAULT_GRAPHICS 則對**已經玩過的人**(也就是全部的人)
 * 完全沒有效果 —— 他們的 localStorage 裡已經有 60 了。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_FPS_CAP,
  MOBILE_FPS_CAP,
  defaultFpsCap,
  menuFpsCap,
  minFrameMs,
} from "../render/frameCap";
import {
  DEFAULT_GRAPHICS,
  SETTINGS_VERSION,
  defaultGraphicsFor,
  migrateSettings,
  SETTINGS_STORAGE_KEY,
} from "./types";
import { SettingsStore } from "./SettingsStore";
import { applyPreset, paramsForPreset } from "./presets";

const HERE = dirname(fileURLToPath(import.meta.url));

/** In-memory Storage stub. */
function mem(seed?: string): Pick<Storage, "getItem" | "setItem"> {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set(SETTINGS_STORAGE_KEY, seed);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("fps 上限依平台 (client-fps-platform)", () => {
  it("桌機 60 / 手機 30 —— 而且選單場景也跟著", () => {
    cover("client-fps-platform");
    expect(defaultFpsCap(false)).toBe(60);
    expect(defaultFpsCap(true)).toBe(30);
    expect(DESKTOP_FPS_CAP).toBe(60);
    expect(MOBILE_FPS_CAP).toBe(30);
    // 選單/預覽場景(登入、中場、英靈殿立繪)在手機上待的時間比戰鬥還長。
    // 只鎖戰鬥那條 loop,「手機一場就發燙」只會解決一半。
    expect(menuFpsCap(true)).toBe(30);
    expect(menuFpsCap(false)).toBe(60);
    // 而且真的換算成更長的每張預算 —— 不是只有一個沒人讀的常數。
    expect(minFrameMs(menuFpsCap(true))).toBeGreaterThan(minFrameMs(menuFpsCap(false)));
  });

  it("全新安裝:手機拿到 30,桌機拿到 60", () => {
    cover("client-fps-platform");
    expect(new SettingsStore(mem(), true).graphics().fpsCap).toBe(30);
    expect(new SettingsStore(mem(), false).graphics().fpsCap).toBe(60);
    // 其餘畫質欄位一個都沒動 —— 平台只影響 fps。
    const phone = defaultGraphicsFor(true);
    expect({ ...phone, fpsCap: DEFAULT_GRAPHICS.fpsCap }).toEqual(DEFAULT_GRAPHICS);
  });

  it("玩家選過的值永遠贏 —— 手機上選 120 就是 120", () => {
    cover("client-fps-platform");
    // 「除非額外調整」那半句。硬鎖手機 30 會讓這一條紅。
    const seeded = JSON.stringify({
      version: SETTINGS_VERSION,
      graphics: { ...DEFAULT_GRAPHICS, fpsCap: 120 },
      network: {},
    });
    expect(new SettingsStore(mem(seeded), true).graphics().fpsCap).toBe(120);
    const store = new SettingsStore(mem(), true);
    store.patchGraphics({ fpsCap: 60 });
    expect(store.graphics().fpsCap).toBe(60);
  });

  it("v3→v4 遷移:手機上「沒動過的 60」變成 30,桌機不動", () => {
    cover("client-fps-platform");
    // 不做這一步的話,這個改動對所有已經玩過的人都是 no-op —— 而這個部署裡
    // 「已經玩過的人」就是全部的人。
    const v3 = { version: 3, graphics: { ...DEFAULT_GRAPHICS, fpsCap: 60 }, network: {} };
    expect(migrateSettings(v3, { touch: true }).graphics.fpsCap).toBe(30);
    expect(migrateSettings(v3, { touch: false }).graphics.fpsCap).toBe(60);
    // 手機上刻意選過 30 或 120 的,遷移不碰
    for (const cap of [30, 120, 0]) {
      const blob = { version: 3, graphics: { ...DEFAULT_GRAPHICS, fpsCap: cap }, network: {} };
      expect(migrateSettings(blob, { touch: true }).graphics.fpsCap).toBe(cap);
    }
    // 已經是 v4 的就不再動它 —— 遷移只跑一次
    const v4 = { version: 4, graphics: { ...DEFAULT_GRAPHICS, fpsCap: 60 }, network: {} };
    expect(migrateSettings(v4, { touch: true }).graphics.fpsCap).toBe(60);
  });

  it("套用畫質預設不會偷偷把手機推回 60", () => {
    cover("client-fps-platform");
    // 三個預設本來都寫死 fpsCap: 60。手機玩家點一下「高畫質」就會把平台預設
    // 蓋掉,而設定頁顯示的仍然是他選的那個預設 —— 看不出哪裡不對。
    for (const preset of ["low", "medium", "high"] as const) {
      expect(paramsForPreset(preset, true)!.fpsCap).toBe(30);
      expect(paramsForPreset(preset, false)!.fpsCap).toBe(60);
      expect(applyPreset(defaultGraphicsFor(true), preset, true).fpsCap).toBe(30);
    }
  });

  it("⭐ setPreset 也要帶平台 —— 手機點一下畫質預設不得把 fps 推回 60", () => {
    cover("client-fps-platform");
    // ⚠️ 這是一個「修了兩個姊妹呼叫點中的一個」的漏。`resetToRecommended` 從
    // 一開始就傳了 touch,`setPreset` 沒有 —— 而 setPreset 才是玩家會按的那個。
    // 上一條測的是 `applyPreset` 這個純函式,這一條測的是**出貨的 store**。
    const store = new SettingsStore(mem(), true);
    expect(store.graphics().fpsCap).toBe(30);
    for (const preset of ["low", "medium", "high"] as const) {
      store.setPreset(preset);
      expect(store.graphics().fpsCap, `手機點「${preset}」之後 fps 被推回去了`).toBe(30);
    }
    // 桌機不受影響
    const desk = new SettingsStore(mem(), false);
    desk.setPreset("high");
    expect(desk.graphics().fpsCap).toBe(60);
  });

  it("每一條 render loop 都走 frameCap,沒有人自己抄一份數字", () => {
    cover("client-fps-platform");
    // 失敗形狀 ⑤ 的防線:v0.9.8 之前 StorePreview 忘了抄,於是它是唯一一條真的
    // 以 120 fps 在跑的 loop。這裡逐一檢查每個消費端「有沒有把平台傳進去」。
    const read = (rel: string): string => readFileSync(join(HERE, rel), "utf8");
    const scenes = [
      { label: "登入", file: "../render/menu/LoginScene.ts" },
      { label: "中場商店", file: "../render/intermission/IntermissionScene.ts" },
      { label: "立繪預覽", file: "../render/StorePreview.ts" },
    ];
    for (const s of scenes) {
      const src = read(s.file);
      expect(src, `${s.label} 沒有用平台上限`).toContain("menuFpsCap(");
      expect(src, `${s.label} 沒有把 touch 判定傳進去`).toContain("isTouchDevice(readTouchEnv())");
      // 模組層級的 `const X = minFrameMs(...)` 在 import 時就定死,手機永遠拿到
      // 桌機的值。這條擋的就是把函式又改回常數。
      expect(src, `${s.label} 把上限算成模組常數了`).not.toMatch(
        /^const\s+\w+\s*=\s*minFrameMs\(/m,
      );
    }
  });
});

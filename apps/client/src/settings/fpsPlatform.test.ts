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
import { PRESET_PARAMS, applyPreset, paramsForPreset } from "./presets";

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

  /**
   * ⭐ GH#271 —— owner 2026-08-04:「我選了 max 反而會變成固定 30」。
   *
   * `paramsForPreset` 無條件把**平台預設**塞進 fpsCap,而 `applyPreset` 無條件
   * 把它 spread 進去,所以按任何一個固定畫質預設 = 玩家在 fps 那一排選的東西
   * 被丟掉,而 Segmented 仍然亮著他選的那個。上面那兩條既有測試看不見這件事,
   * 因為它們的基底剛好**就是**平台預設(30/60),覆蓋前後同一個值。
   *
   * 這一條用一個**跟平台預設不同**的值,兩者才分得開。
   */
  it("⭐ 玩家選了 X,套畫質預設之後仍然是 X(出貨值:玩家贏)", () => {
    cover("client-fps-platform");
    // 期望值從常數推導,不寫死 60/30(owner 常設:守衛驗機制不驗數字)。
    // 只要不是「這台裝置的平台預設」都可以;0 = Max,正是 owner 按的那一個。
    const PLAYER_PICKED = 0 as const; // "Max"
    for (const touch of [false, true]) {
      expect(PLAYER_PICKED, "測試選的值剛好等於平台預設就分不開了").not.toBe(
        defaultFpsCap(touch),
      );
      const store = new SettingsStore(mem(), touch);
      store.patchGraphics({ fpsCap: PLAYER_PICKED });
      for (const preset of ["low", "medium", "high", "auto"] as const) {
        store.setPreset(preset);
        expect(
          store.graphics().fpsCap,
          `${touch ? "手機" : "桌機"}選了 Max,按「${preset}」之後被改成 ` +
            `${store.graphics().fpsCap} —— 設定 UI 最糟的那種行為`,
        ).toBe(PLAYER_PICKED);
      }
      // 而畫質欄位**確實**被預設換掉了 —— 不是整個 applyPreset 都失效了
      store.setPreset("low");
      expect(store.graphics().resolutionScale).toBe(PRESET_PARAMS.low.resolutionScale);
      expect(store.graphics().shadows).toBe(false);
    }
  });

  it("⭐ 決策點是一個欄位:打開 fpsCapFollowsPreset 就回到舊行為(平台預設贏)", () => {
    cover("client-fps-platform");
    // 第一守則:拿不定主意的決策做成兩種模式 + 後台可切,而不是挑一個然後在
    // 註解裡辯護。這一條證明**另一半**真的接得上,不是一個沒人讀的旗標。
    for (const touch of [false, true]) {
      const store = new SettingsStore(mem(), touch);
      store.patchGraphics({ fpsCap: 0, fpsCapFollowsPreset: true });
      store.setPreset("high");
      expect(store.graphics().fpsCap).toBe(defaultFpsCap(touch));
      // 純函式層兩種模式都要分得開
      const g = { ...DEFAULT_GRAPHICS, fpsCap: 0 as const };
      expect(applyPreset(g, "high", touch, false).fpsCap).toBe(0);
      expect(applyPreset(g, "high", touch, true).fpsCap).toBe(defaultFpsCap(touch));
    }
    // 出貨值 = 玩家贏(這一格如果哪天被改成 true,這裡就紅)
    expect(DEFAULT_GRAPHICS.fpsCapFollowsPreset).toBe(false);
    // 舊的 blob(沒有這一格)也拿到出貨值,不是 undefined
    expect(migrateSettings({ version: 4, graphics: {}, network: {} }).graphics.fpsCapFollowsPreset)
      .toBe(false);
  });

  /**
   * 失敗形態 ②「做了但玩家拿不到」的防線 —— 這正是同一個 repo 的 gore 那次
   * (`ui/SettingsScreen.gore.test.ts`):整條管線接好了、預設值也對,但**沒有
   * 任何畫面寫得到那一格**,於是它永遠凍在預設。這裡用同一種做法(去掉註解
   * 再掃出貨的那個檔),因為 SettingsScreen 要 React DOM 才跑得起來。
   */
  it("設定頁真的寫得到這一格 —— 不是一個只有測試碰得到的旗標", () => {
    cover("client-fps-platform");
    const src = readFileSync(join(HERE, "../ui/SettingsScreen.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(src, "SettingsScreen 沒有任何控制項寫 fpsCapFollowsPreset").toMatch(
      /patchGraphics\(\s*\{\s*fpsCapFollowsPreset:/,
    );
    // 而且 fps 那一排本身還在(這一格的意義完全取決於上面那個選擇存在)
    expect(src).toMatch(/patchGraphics\(\s*\{\s*fpsCap:/);
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

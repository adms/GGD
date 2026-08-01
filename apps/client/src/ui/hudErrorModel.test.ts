/**
 * hudErrorModel.test.ts — 「介面永久消失」那個缺陷的守衛。
 *
 * 兩組斷言，缺一不可：
 *   ① 決策與紀錄：`hudErrorModel` 的行為（純函式，真的呼叫）。
 *   ② 接縫：`AppRoot` 真的把 `<MatchOverlay />` 包在 boundary 裡，
 *      **而且帶了 resetKey**。
 *
 * ⚠️ ② 用掃原始碼是刻意的取捨：`apps/client` 沒有 jsdom / testing-library
 * （`package.json` 裡沒有），而 `AppRoot` 會拉進整棵 store 與 Babylon 支援的
 * 場景，在這裡掛它等於測測試環境本身。掃描範圍刻意很窄 ——
 * 它只在包裝消失時紅，而那正是它存在的唯一理由。
 * 同 `panels/roundReportMount.test.ts` 的理由（那份列了八次前科）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  HUD_ERROR_LOG_CAP,
  clearHudErrors,
  hudErrorFallbackText,
  hudErrors,
  recordHudError,
} from "./hudErrorModel";

describe("① 崩潰紀錄：那一瞬間必須被留下來", () => {
  beforeEach(() => clearHudErrors());

  it("★ 記下來的內容含元件堆疊 —— 兇手的名字就在裡面", () => {
    recordHudError({
      label: "比賽介面",
      message: "Cannot read properties of undefined",
      componentStack: "\n    at PhaseTimer\n    at HudRoot",
    });
    const got = hudErrors();
    expect(got).toHaveLength(1);
    expect(got[0]?.componentStack).toContain("PhaseTimer");
    // ⚠️ 這是整個檔案的理由：React 的那行錯誤在 root 被卸載之後只會印一次，
    // 而 owner 在打的時候不會開 devtools。沒存下來就永遠消失。
    expect(got[0]?.message.length).toBeGreaterThan(0);
  });

  it("★ 滿了之後留最舊的，不是最新的 —— 第一次崩潰才是根因", () => {
    for (let i = 0; i < HUD_ERROR_LOG_CAP + 5; i++) {
      recordHudError({ label: `L${i}`, message: `m${i}`, componentStack: "" });
    }
    const got = hudErrors();
    expect(got).toHaveLength(HUD_ERROR_LOG_CAP);
    expect(got[0]?.label, "第一筆應該還是最早那次").toBe("L0");
  });

  it("★ 回傳的是複本 —— 外面改不到內部紀錄", () => {
    recordHudError({ label: "a", message: "m", componentStack: "" });
    const first = hudErrors() as unknown as unknown[];
    first.length = 0;
    expect(hudErrors()).toHaveLength(1);
  });

  it("★ fallback 的字要說出哪裡壞了與還能不能玩，不是「發生錯誤」", () => {
    const t = hudErrorFallbackText("商店");
    expect(t).toContain("商店");
    // 「其餘介面正常」是玩家最需要知道的一件事 —— 他要決定要不要重整。
    expect(t).toContain("其餘介面正常");
    expect(t).toContain("重試");
    expect(t).not.toContain("錯誤");
  });
});

describe("② 接縫：比賽介面真的被 boundary 包住了", () => {
  const appRoot = readFileSync(join(__dirname, "platform", "AppRoot.tsx"), "utf8");

  it("★ AppRoot import 了 HudErrorBoundary", () => {
    expect(appRoot).toMatch(
      /import\s*\{\s*HudErrorBoundary\s*\}\s*from\s*"\.\.\/HudErrorBoundary"/,
    );
  });

  it("★ <MatchOverlay /> 被包在 <HudErrorBoundary> 裡", () => {
    // 允許中間有屬性與換行，但 MatchOverlay 必須在 boundary 的開合標籤之間。
    const wrapped = /<HudErrorBoundary[^>]*>[\s\S]{0,200}?<MatchOverlay\s*\/>[\s\S]{0,200}?<\/HudErrorBoundary>/;
    expect(
      wrapped.test(appRoot),
      "「介面永久消失」的止血點不見了：React 18 在 render 期間吃到未捕捉例外會" +
        "卸載整個 root，而 main.tsx 的 root.render 只在開機呼叫一次 —— " +
        "沒有這個包裝，一次例外 = 玩家這個分頁剩下的時間都沒有介面。",
    ).toBe(true);
  });

  it("★ boundary 帶了 resetKey —— 否則壞掉就再也不會自己回來", () => {
    const withKey = /<HudErrorBoundary[^>]*\bresetKey=\{[^}]+\}/;
    expect(
      withKey.test(appRoot),
      "boundary 沒有 resetKey。React boundary 一旦 catch 就停在 fallback，" +
        "不會自己重試 —— 那只是把「永久」從分頁縮小到比賽，owner 的痛沒有解決。",
    ).toBe(true);
  });
});

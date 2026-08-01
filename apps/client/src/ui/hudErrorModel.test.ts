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

describe("③ fallback 說出的重試時機，必須跟那一層的 resetKey 一致", () => {
  it("★ round 層說「下一回合」，match 層說「換一場」", () => {
    // ⚠️ 這條的由來是一個實測到的謊話：所有 fallback 本來都寫「下一回合會自動
    // 重試」，而包住 <MatchOverlay /> 的那一顆 resetKey 是 matchEpoch ——
    // 換回合、換相位都不會動它。複驗者還原例外後**等了 25 秒 HUD 沒回來**，
    // 而畫面上那行字還在叫玩家等。玩家會照著它等，而它永遠不會發生。
    expect(hudErrorFallbackText("階段倒數", false, "round")).toContain("下一回合");
    expect(hudErrorFallbackText("小地圖", false, "match")).toContain("換一場");
    expect(hudErrorFallbackText("小地圖", false, "match")).not.toContain("下一回合");
  });

  it("★ 重試額度用完之後兩層都改叫重新整理（這時等待才是真的沒用）", () => {
    for (const scope of ["round", "match"] as const) {
      const t = hudErrorFallbackText("商店", true, scope);
      expect(t).toContain("重新整理");
      expect(t).not.toContain("自動重試");
    }
  });

  it("★ 掛載點宣告的 scope 跟它的 resetKey 對得上", () => {
    // 掃原始碼是刻意的取捨（同檔頭 ②）：這裡驗的是「兩個常數配對正確」，
    // 而配對錯了不會有任何行為測試會紅 —— 文案照樣印得出來，只是在說謊。
    const hudRoot = readFileSync(join(__dirname, "HudRoot.tsx"), "utf8");
    const appRoot = readFileSync(join(__dirname, "platform", "AppRoot.tsx"), "utf8");
    // HudRoot：resetKey 是 phase:round → 必須宣告 round
    expect(hudRoot).toMatch(/resetKey=\{`\$\{phase\}:\$\{round\}`\}\s+retryScope="round"/);
    // AppRoot 兩處：resetKey 是 matchEpoch → 必須宣告 match
    const matchScoped = appRoot.match(/resetKey=\{matchEpoch\}\s+retryScope="match"/g) ?? [];
    expect(
      matchScoped.length,
      "AppRoot 有 resetKey={matchEpoch} 的 boundary 沒有宣告 retryScope=\"match\"，" +
        "它的 fallback 會告訴玩家「下一回合會自動重試」——那是假的。",
    ).toBe(2);
  });
});

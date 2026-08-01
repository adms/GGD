/**
 * noChampionNoticeModel.test.ts — 兩半都要守。
 *
 * 這個功能的價值全部在「玩家真的看到那句話」，而這個專案有**八次**前科是
 * 「東西算出來了、從渲染樹刪掉、測試全綠」（見 `panels/roundReportMount.test.ts`
 * 的清單：#93 煙火畫在地板下、#247 跳出畫面、#259 的距離模型算完沒變成音量、
 * #265 的回合報告兩個掛載點都被換成 `{null}` 而 3,566 條測試全過）。
 *
 * 所以這裡有兩組斷言，缺一不可：
 *   ① 決策：`noChampionNotice()` 的行為（純函式，真的呼叫）。
 *   ② 接縫：`HudRoot` 真的 import 了它、也真的把 `<NoChampionNotice />` 放進
 *      渲染樹。⚠️ 用掃原始碼是**刻意的取捨**而不是偷懶 —— `apps/client` 沒有
 *      jsdom / testing-library（package.json 裡沒有），而 `HudRoot` 會拉進整棵
 *      HUD store 與 Babylon 支援的頭像，在這裡掛它等於在測測試環境本身。
 *      掃描範圍刻意很窄：它只在 JSX 消失時紅，而那正是它存在的唯一理由。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NO_CHAMPION_DETAIL,
  NO_CHAMPION_TITLE,
  noChampionNotice,
} from "./noChampionNoticeModel";

describe("① 決策：什麼時候該說「你沒有英雄」", () => {
  it("★ 沒有英雄 + 在對戰中 → 出現，而且兩句話都有內容", () => {
    const view = noChampionNotice("combat", false);
    expect(view).not.toBeNull();
    expect(view?.title).toBe(NO_CHAMPION_TITLE);
    expect(view?.detail).toBe(NO_CHAMPION_DETAIL);
    // 空字串等於沒說 —— 一個「有出現但沒有字」的告示是失敗形態 ①。
    expect(view?.title.length).toBeGreaterThan(0);
    expect(view?.detail.length).toBeGreaterThan(0);
  });

  it("★ 有英雄 → 永遠不出現（任何相位）", () => {
    for (const phase of ["champSelect", "intermission", "combat", "resolution", "matchEnd"]) {
      expect(noChampionNotice(phase, true), `phase=${phase}`).toBeNull();
    }
  });

  it("★ 選角相位不出現 —— 那時候還沒選是正常的，跳這句話是雜訊", () => {
    expect(noChampionNotice("champSelect", false)).toBeNull();
  });

  it("★ 結算(matchEnd)要出現 —— 那是玩家唯一有空回頭問「剛剛怎麼回事」的時候", () => {
    // ⚠️ HudRoot 的 `inGame` 把 matchEnd 排除掉，但那是為了技能列。
    // 照抄它會讓這個告示正好在最該被讀到的畫面消失。
    expect(noChampionNotice("matchEnd", false)).not.toBeNull();
  });

  it("★ 中場與結算之間的相位也要出現（不是只有 combat）", () => {
    for (const phase of ["intermission", "resolution"]) {
      expect(noChampionNotice(phase, false), `phase=${phase}`).not.toBeNull();
    }
  });

  it("文案要真的說出後果與下一步，不是「發生錯誤」這種等於沒說的話", () => {
    expect(NO_CHAMPION_DETAIL).toContain("商店");
    expect(NO_CHAMPION_DETAIL).toContain("選角");
    // 「內容沒載入成功 → 重新整理」是 2026-08-02 那次事故的真實出路，
    // 少了它玩家只會知道自己壞了、不知道能做什麼。
    expect(NO_CHAMPION_DETAIL).toContain("重新整理");
  });
});

describe("② 接縫：它真的在渲染樹裡（八次前科的那個形態）", () => {
  const hudRoot = readFileSync(join(__dirname, "..", "HudRoot.tsx"), "utf8");

  it("★ HudRoot import 了 NoChampionNotice", () => {
    expect(hudRoot).toMatch(
      /import\s*\{\s*NoChampionNotice\s*\}\s*from\s*"\.\/hud\/NoChampionNotice"/,
    );
  });

  it("★ HudRoot 真的 render <NoChampionNotice />", () => {
    const mounts = hudRoot.match(/<NoChampionNotice\s*\/>/g) ?? [];
    expect(
      mounts.length,
      `HudRoot.tsx 出現 <NoChampionNotice /> ${mounts.length} 次。` +
        `把它從渲染樹拿掉，整個功能就撤銷了，而純函式那組測試會全綠 —— ` +
        `那正是這個專案犯過八次的錯。`,
    ).toBe(1);
  });

  it("★ 掛在 connected 早退之後，否則連線中的玩家看不到它", () => {
    // HudRoot 在 `if (!connected)` 時整個 return 一個「Connecting to match…」
    // 方框。掛在那個分支之前的東西永遠不會跟主 HUD 一起出現。
    const guard = hudRoot.indexOf("if (!connected)");
    const mount = hudRoot.indexOf("<NoChampionNotice />");
    expect(guard, "HudRoot 應該還有 !connected 早退").toBeGreaterThan(-1);
    expect(mount, "找不到 <NoChampionNotice /> 的掛載點").toBeGreaterThan(-1);
    expect(
      mount,
      "<NoChampionNotice /> 掛在 !connected 早退之前 —— 那個分支會整個 return，" +
        "所以它永遠不會跟主 HUD 一起畫出來。",
    ).toBeGreaterThan(guard);
  });
});

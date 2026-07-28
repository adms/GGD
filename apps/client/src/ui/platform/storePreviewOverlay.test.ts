/**
 * 四個場景都要換到暴雪模型 (GH#31) — owner 2026-07-28:
 *   「別忘了 英雄殿 選擇英雄 戰鬥 結算 四個場景都要替換喔」
 *
 * ⚠️ 這一份守的是**場景層級的失敗形狀 ⑤**:受測的東西不是出貨的東西。
 *
 * v0.9.6 讓 40 位共用替身英雄改載入自己的 Warcraft III 模型 —— 但那個改動落在
 * `EntityViewRegistry` → `ChampionView.tryUpgradeToGlb`,也就是**競技場**那條路。
 * 結算只是一台架在競技場上的相機(見 render/settlementCamera.ts),所以它跟著對了。
 *
 * 另外兩個場景不是。選擇英雄(panels/champselect/ProfileBlock)、英靈殿
 * (platform/ValhallaPanel),加上商店(platform/StoreScreen),全部走
 * `StorePreviewCanvas` —— 而它抓到出貨的 model doc 之後就直接丟給 Babylon。
 *
 * 於是:守衛全綠、競技場真的修好了、玩家看的四個畫面裡有三個還是借來的身體。
 *
 * 這份測試因此**逐一列出每個消費端**,而不是只測那個 resolver。一個只測
 * resolver 的守衛,在有人新增第四個預覽畫面時不會紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blizzardOverlayModels } from "../../render/views/blizzardOverlay";
import type { ModelDoc } from "@ggd/shared/content";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(HERE, rel), "utf8");

/** A stand-in doc — exactly what `/content/models/champ.sela.json` returns. */
const STAND_IN: ModelDoc = {
  id: "champ.sela",
  schema: "model@1",
  glbPath: "assets/models/champions/blocky-mage.glb",
} as unknown as ModelDoc;

describe("GH#31 · 預覽畫面必須走 overlay 解析", () => {
  it("StorePreviewCanvas 的 fetchModelDoc 有把 doc 交給 overlay,而且先 await 探測", () => {
    // 這裡刻意讀原始碼(平常禁止的失敗形狀 ⑥),因為要斷言的是「**呼叫順序**」——
    // 先 await 再 resolve。順序錯了行為就錯:大廳從不跑 GameApp,探測沒落地時
    // resolve 回 null,而這個元件把 null 當 failed 且不重試 → 第一次開預覽是黑的。
    // 純行為測試看不見「少了那個 await」,因為在測試環境探測往往已經 resolve 了。
    const src = read("./StorePreviewCanvas.tsx");
    const awaitAt = src.indexOf("await blizzardOverlayModels.load()");
    const resolveAt = src.indexOf("blizzardOverlayModels.resolve(");
    expect(awaitAt, "fetchModelDoc 必須先 await load()").toBeGreaterThan(-1);
    expect(resolveAt, "fetchModelDoc 必須呼叫 resolve()").toBeGreaterThan(-1);
    expect(awaitAt, "await load() 必須在 resolve() 之前").toBeLessThan(resolveAt);
    // championId 一定要傳進去 —— 少了它 resolve 直接回 shipped doc(見其實作),
    // 整條路徑就變成一個昂貴的 no-op,而且沒有任何東西會紅。
    expect(src).toContain("blizzardOverlayModels.resolve(shipped, championId)");
  });

  it("三個預覽場景都真的傳了 championId,不是只傳 modelKey", () => {
    // ⚠️ 這條是「新場景加進來會不會被漏掉」的那道閘。resolve 沒有 championId 就
    // 認不出這位英雄,會原封不動退回共用替身 —— 而畫面看起來「有東西」,所以
    // 目視驗收抓不到。
    const scenes: { label: string; file: string }[] = [
      { label: "選擇英雄", file: "../panels/champselect/ProfileBlock.tsx" },
      { label: "英靈殿", file: "./ValhallaPanel.tsx" },
      { label: "商店", file: "./StoreScreen.tsx" },
    ];
    for (const s of scenes) {
      const src = read(s.file);
      expect(src, `${s.label} 沒有用 StorePreviewCanvas?`).toContain("StorePreviewCanvas");
      // ⚠️ 必須看 **那個元素本身**,不能只掃整份檔案有沒有出現 `championId=`。
      // 我第一版寫成 `expect(src).toMatch(/championId=/)`,然後把 ProfileBlock
      // 那一行的 championId 刪掉 —— 測試還是綠的,因為同一個檔案別處也有這個字串。
      // 那就是失敗形狀 ⑥ 的實例:掃字串分不出「傳給這個元件」與「檔案裡剛好有」。
      const els = [...src.matchAll(/<StorePreviewCanvas\b[\s\S]*?\/?>/g)].map((m) => m[0]);
      expect(els.length, `${s.label} 找不到 <StorePreviewCanvas> 元素`).toBeGreaterThan(0);
      for (const el of els) {
        expect(el, `${s.label} 的 <StorePreviewCanvas> 傳了 modelKey 卻沒傳 championId`).toMatch(
          /championId=/,
        );
      }
    }
  });

  it("resolve 對沒有 championId 的呼叫原封不動退回 —— 這就是漏傳的代價", () => {
    // 行為層的證明:上面那條掃描斷言不是憑空的規矩,少了 championId 真的會失效。
    expect(blizzardOverlayModels.resolve(STAND_IN, null)).toBe(STAND_IN);
    expect(blizzardOverlayModels.resolve(STAND_IN, undefined)).toBe(STAND_IN);
  });

  it("結算場景不需要自己的替換路徑 —— 它是競技場上的一台相機", () => {
    // 記錄推理,而不只是結論:如果有人日後把結算改成獨立的 3D 舞台,這條會紅,
    // 而那正是需要重新檢查的時刻。
    const cam = read("../../render/settlementCamera.ts");
    expect(cam, "settlementCamera 應該是純數學,不自己載模型").not.toContain("assets.load");
    expect(cam).not.toContain("glbPath");
  });
});

/**
 * GH#114 —— 回放頁 transport 的每一顆控制項都有音訊回饋。
 *
 * 缺陷（票逐字）：`ReplayControls.tsx` 的四個 JSX 位置（播放/暫停 · 從頭 ↺ ·
 * 速度 chip · 回合 chip）是**裸的 `<button>`**，整個 `ui/replay/` 目錄 grep
 * `playSfx|SfxButton|audioSystem` **零命中**，而且**沒有任何全域 click 委派**會
 * 替它們補上 —— `buttonSfx.test.ts` 測的是 `SfxButton` wrapper 本身。
 * 上一輪把回放頁歸類成「內部頁」而跳過，判錯的理由寫在 `ui/GlobalChrome.tsx`
 * 檔頭：那是 owner 拿來截圖回報 playtest 的**那一頁**。
 *
 * ⚠️ 為什麼是原始碼掃描：這一包的 vitest 是 `environment: "node"`，而缺陷本身
 * 就是**結構的**（用了哪一種元素），⛔ 不是「按下去會不會響」——「這個檔裡沒有
 * 裸 `<button>`」的真相**就寫在原始碼裡**。掃之前先 `stripComments`，否則這個
 * 檔頭談論 `<button>` 的散文就會自己滿足（或自己打破）斷言。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stripComments } from "@ggd/shared/testkit/stripComments";

const SRC = stripComments(
  readFileSync(fileURLToPath(new URL("./ReplayControls.tsx", import.meta.url)), "utf8"),
);

describe("回放 transport 的音訊回饋 (GH#114)", () => {
  it("⛔ 一顆裸的 <button> 都沒有 —— 全部走 SfxButton", () => {
    // 兩個方向一起讀：既要沒有裸 button，也要真的有 SfxButton 在用。
    // 只驗前者的話，把四顆按鈕整段刪掉也是綠的。
    expect(SRC.match(/<button[\s>]/g) ?? [], "還有裸的 <button>").toHaveLength(0);
    expect(SRC).toContain('from "../SfxButton"');
    // 四個 JSX 位置（票點名的那四個）都要在
    expect((SRC.match(/<SfxButton[\s>]/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("seek 拉桿手動接：hover 出聲、放開出聲，⛔ 不掛在 onChange 上", () => {
    const range = SRC.slice(SRC.indexOf('type="range"'), SRC.indexOf('aria-label="時間軸"'));
    expect(range, "拉桿沒有 hover 回饋").toContain('playSfx("uiHover")');
    expect(range, "拉桿放開時不出聲").toMatch(/onPointerUp=\{[^}]*playSfx/s);
    // ⚠️ 掛在 onChange 上就是拖曳一次響幾十聲 —— 那比沒聲音更糟
    expect(range).not.toMatch(/onChange=\{[^}]*playSfx/s);
  });
});

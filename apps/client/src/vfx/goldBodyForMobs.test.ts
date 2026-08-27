/**
 * ⭐【殺死殭屍要掉金幣、要有音效與音階】GH#575。
 *
 * ⛔⛔ **這個檔存在，是因為它的第一個版本不存在。**
 * `a65fb548` 的 commit 訊息逐字寫著「突變:拿掉 `GameApp` 那一行 ⇒ 紅」——
 * 那當下是真的（`mobHealthBarWiring` 的正則被我插的那一行打斷了），
 * ⚠️ 但我**隨後放寬了那個正則**，於是同一個突變變成**全綠**。
 * ⇒ ⭐ 那個 commit 的突變紀錄從那一刻起就是假的，而**沒有任何東西會說**。
 *
 * ⭐ 教訓（寫下來，因為它會再犯）：**「我剛才看到紅」與「有一條守衛在守」是兩件事。**
 * 一條因為**別的**測試恰好被打斷而紅的突變，⛔ 不是守衛 —— 它是巧合，
 * 而巧合會在下一次重構時安靜地消失。
 *
 * ── 這條守衛驗的機制 ──────────────────────────────────────────────────────
 * `GoldPickupFx.spawn()` 的起點來自 `noteBody()` 記下的最後位置
 * （`mobSlain` 的 payload **沒有 x/z**，而殭屍在事件到達時通常已經從快照裡消失）。
 * ⇒ **一隻從來沒有被 `noteBody` 記過的身體，死掉時金幣不生 —— 音效與音階也一起不播。**
 *
 * ⛔ 它**不驗數字**（第二守則）：不驗金幣飛多快、不驗音階是第幾度。
 * ⭐ 只驗「有沒有起點」，因為那正是這個缺陷的定義。
 *
 * ── 突變紀錄（實跑）────────────────────────────────────────────────────────
 * M1 `apps/client/src/game/frameBusProjection.ts` 小怪迴圈裡的 `d.vfx.noteGoldBody(...)` 刪掉
 *    ⇒ ★① 紅（`從沒被 noteBody 記過的身體，死掉時金幣不生`）。
 *    ⚠️ 這一次是**這個檔**紅，⛔ 不是靠別的測試的正則恰好被打斷。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { GoldPickupFx } from "./GoldPickupFx";

// ⭐ GH#716 —— 小怪迴圈搬到 `game/frameBusProjection.ts`（`GameApp.updateFrameBus`
// 現在是轉發）。⚠️ 錨點 `if (es.kind === KIND_MOB) {` 跟著走了 ⇒ 繼續讀舊檔的話
// 這條守衛會在**第一行**就炸（那還算誠實），⛔ 但更糟的是有人把它改成軟性比對。
const GAMEAPP = fileURLToPath(new URL("../game/frameBusProjection.ts", import.meta.url));

describe("殭屍的身體有被記下來 (gold-body-for-mobs-575)", () => {
  it("★① 沒有起點就不生金幣 —— 這就是缺陷本身", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    // ⭐ 用**出貨的**建構子（失敗形態⑤：⛔ 不要為了好測而重寫一份簡化版）。
    const fx = new GoldPickupFx(scene, {
      playSfx: () => {},
      policy: () => ({}) as never,
    } as never);
    // 一隻**從來沒有**被 noteBody 記過的身體（＝修好之前每一隻殭屍的處境）
    expect(
      fx.spawnFrom(9001),
      "從沒被 noteBody 記過的身體，死掉時金幣不生 —— 音效與音階也一起不播",
    ).toBeNull();
    // 記過之後就有起點了
    fx.noteBody(9001, { x: 3, z: -4 });
    expect(fx.spawnFrom(9001), "記過之後要拿得到起點").toEqual({ x: 3, z: -4 });
  });

  it("★② 出貨的小怪迴圈**真的**呼叫它，而且在任何 return 之前", () => {
    const src = readFileSync(GAMEAPP, "utf8");
    const i = src.indexOf("if (es.kind === KIND_MOB) {");
    expect(i, "小怪迴圈不見了 —— 這條守衛失去了它的錨點").toBeGreaterThan(0);
    const block = src.slice(i, i + 1200);
    const call = block.indexOf("noteGoldBody");
    const firstReturn = block.indexOf("return;");
    expect(call, "出貨的小怪迴圈沒有呼叫 noteGoldBody").toBeGreaterThan(0);
    expect(
      call,
      "noteGoldBody 落在某個 return 之後 —— 被剔除掉的殭屍就不會被記，而金幣的歸屬與音階" +
        "跟「血條有沒有畫在螢幕上」無關",
    ).toBeLessThan(firstReturn);
  });
});

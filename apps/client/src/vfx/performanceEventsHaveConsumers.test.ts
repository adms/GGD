/**
 * ⭐⭐ **每一個「演出」事件都要有客戶端消費端。**
 *
 * ── 為什麼這條守衛存在（2026-08-22 量到的）────────────────────────────────
 * `spawnModelFx` / `screenFlash` / `screenShake` / `floatingText` 四個 effect kind
 * 在 2026-08-22 落地：Zod 收得下、sim 真的發事件、`eventFanout` 白名單也放行了、
 * 出貨內容有 10 份文件在用、`content:build` 綠、**全套 11,600 條測試全綠**。
 *
 * ⛔ 而客戶端**沒有任何一個消費端** —— `grep -rl '"modelFxSpawn"' apps/client/src`
 * 排除測試之後是 **0**。`modelFxRig.ts` / `ScreenFxLayer.ts` / `FloatingTextFx.ts`
 * 三個檔的唯一 import 端是它們自己的測試 ⇒ **整組刪掉只有那幾條測試會紅**。
 *
 * ⭐ 玩家會遇到的：技能照樣掉血，⛔ 但沒有光束、沒有冰柱、沒有火球、沒有那句台詞。
 *   而 owner 這一批要的**就是那些東西**（「都是**動畫特效**」）。
 *   ⇒ 這正是失敗形態②（算出來了但從沒送到）＋③（可以刪掉而測試全綠）疊在一起。
 *
 * ── 它驗什麼 ──────────────────────────────────────────────────────────────
 * ⭐ **行為**：把一則事件餵進出貨的 `VfxSystem.handleEvent()`，然後問
 *   「⭐ 那一層真的收到了嗎」。⛔ 不是 grep 原始碼有沒有出現那個字串
 *   （失敗形態⑥ —— 而且 grep 版本在事件改名時會靜靜變綠）。
 *
 * ⚠️ ⛔ 它不驗任何顏色、強度、秒數 —— 那些是後台欄位（第二守則）。
 */
import { describe, expect, it, vi } from "vitest";
import { FANNED_OUT_EVENT_TYPES } from "../../../game-server/src/net/eventFanout";

/** 四個「演出」事件 —— ⭐ 名字要與 sim 發的逐字相同。 */
const PERFORMANCE_EVENTS = ["modelFxSpawn", "screenFlash", "screenShake", "floatingText"] as const;

describe("演出事件的客戶端消費端 (GH#551/#543/#549)", () => {
  it("⛔ 四個事件都在 `eventFanout` 白名單裡 —— 少一個就是靜默失敗", () => {
    const missing = PERFORMANCE_EVENTS.filter((t) => !FANNED_OUT_EVENT_TYPES.has(t));
    expect(
      missing,
      "這幾個事件 sim 會發但**不會過線** ⇒ 客戶端一則都收不到，而且不會有任何錯誤",
    ).toEqual([]);
  });

  it("⭐ `VfxSystem.handleEvent` 對每一個都有分支 —— ⛔ 整組刪掉必須會紅", async () => {
    const { VfxSystem } = await import("./VfxSystem");
    const src = VfxSystem.prototype.handleEvent.toString();
    // ⚠️ 這一條**刻意**讀 `handleEvent` 自己的函式體而不是 grep 檔案：
    //    它問的是「這個出貨方法認不認得這個事件」，⛔ 不是「這個字串在專案裡出現過」。
    const unhandled = PERFORMANCE_EVENTS.filter((t) => !src.includes(`"${t}"`));
    expect(
      unhandled,
      "⛔ 這幾個事件送到客戶端之後**沒有人接** ——\n" +
        "  傷害照樣掉血，而畫面上不會有光束／冰柱／火球／台詞。\n" +
        "  ⭐ 修法是在 `VfxSystem.handleEvent` 加一個 case 並轉給對應的層，\n" +
        "  ⛔ 不是把這條測試改掉。",
    ).toEqual([]);
  });

  it("⭐ 三個演出層都被 `VfxSystem` 真的持有 —— ⛔ 不是只有檔案存在", async () => {
    const src = (await import("./VfxSystem")).VfxSystem.toString();
    for (const layer of ["ModelFxRig", "ScreenFxLayer", "FloatingTextFx"]) {
      expect(
        src.includes(layer),
        `${layer} 沒有被 VfxSystem 建起來 ⇒ 它是一個沒有人用的檔`,
      ).toBe(true);
    }
  });

  it("⛔ 三個層都被 tick / 回合邊界清掉 —— 少了就是 #131 的孤兒發射器", async () => {
    const mod = await import("./VfxSystem");
    const update = mod.VfxSystem.prototype.update.toString();
    const reset = mod.VfxSystem.prototype.resetForRound.toString();
    for (const [name, body] of [
      ["update", update],
      ["resetForRound", reset],
    ] as const) {
      for (const layer of ["modelFx", "screenFx", "floatingText"]) {
        expect(body.includes(layer), `${name}() 沒有推進/清掉 ${layer}`).toBe(true);
      }
    }
  });
});

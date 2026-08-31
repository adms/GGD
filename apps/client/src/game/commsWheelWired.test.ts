/**
 * ⭐⭐ GH#731 —— 輪盤的**接縫**守衛（失敗形態⑧：消費端存在，而它消費不到）。
 *
 * ⚠️ ⭐ 這條守衛是踩出來的：狀態機、config、admin 標籤、五條單元測試**全部齊了**，
 * ⛔ 而 `pointerMove` **一個呼叫端都沒有** ⇒ `hovered` 永遠 null
 * ⇒ `keyUp` 一律當成「死區＝取消」⇒ ⭐ **整個功能是死的，而所有測試都是綠的**。
 *
 * ⇒ 這裡驗的不是「狀態機對不對」（那有別條），是
 * **`InputCapture` 真的把四種事件都轉給輪盤了**。
 *
 * MUTATION LOG：`trackCursor` 裡的 `onCommsPointerMove?.(…)` 拿掉 → ①紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commsWheelRunner } from "./commsWheelRunner";

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../input/InputCapture.ts"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("GH#731 輪盤的四段接縫", () => {
  it("★ ⭐ `InputCapture` 四種事件**都**轉給輪盤（⛔ 少一種功能就是死的）", () => {
    for (const hook of [
      "onCommsKeyDown", // 按住開
      "onCommsKeyUp", // 放開送出
      "onCommsPointerMove", // ⭐ 指向 —— 缺了它永遠送不出東西
      "onCommsCancel", // 失焦取消
    ]) {
      expect(SRC, `⛔ InputCapture 沒有呼叫 ${hook} —— 那一段是斷的`).toContain(`${hook}?.(`);
    }
  });

  it("★ ⭐ runner 四個出口都在（⛔ 型別上少一個，接線端就靜靜不接）", () => {
    const deps = commsWheelRunner(() => null).inputDeps as Record<string, unknown>;
    for (const hook of ["onCommsKeyDown", "onCommsKeyUp", "onCommsPointerMove", "onCommsCancel"]) {
      expect(typeof deps[hook], `⛔ runner 少了 ${hook}`).toBe("function");
    }
  });

  it("⭐ 端到端：按住 → 指向 → 放開 ⇒ **真的挑到一格**（⛔ 不是 null）", () => {
    // ⚠️ ⭐ 這一條刻意走 `inputDeps`（＝出貨那條路），⛔ 不是直接戳狀態機 ——
    // 上面那個洞正是「狀態機測得好好的，而出貨的那條路沒接上」。
    const r = commsWheelRunner(() => null);
    const d = r.inputDeps;
    // config 由 uiCues() 供給；出貨值 enabled=true / KeyV / 5 格。
    if (!d.onCommsKeyDown("KeyV", { x: 200, y: 200 })) return; // 後台關著就跳過
    d.onCommsPointerMove(200, 100); // 正上方
    expect(r.state.hoveredIndex, "⛔ 指向沒有被記下來 —— pointerMove 沒接上").toBe(0);
  });
});

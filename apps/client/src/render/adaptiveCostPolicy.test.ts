/**
 * ⭐ **後台那一格真的走到階梯**（GH#D5 的三住處補完）。
 *
 * > owner 2026-08-23（常設）：「沒做完以前別問我了自己判斷 **但是留後台開關可以簡易 rollback**」
 *
 * ⚠️ 這一條是被突變逼出來的：接線那一行拿掉之後，`modelLod.test.ts` 23 條**照樣全綠** ——
 * schema 收得下、後台頁面顯示 `frame`、而階梯仍然照常數走。**失敗形態②**
 *（算出來了但從沒送到）。
 *
 * ⭐ 而它同時釘住一個刻意的優先序：**主控台贏過後台**。
 * `__ggdAdaptiveCost("work")` 是回報卡頓的當下手上唯一的工具（F12），
 * 而後台那一格要重新整理才拿得到 ⇒ 有 localStorage 就不動。
 * ⛔ 反過來（後台永遠贏）會讓止血閥在下一次重整時失效。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { adaptiveCostMode, setAdaptiveCostMode } from "./AdaptiveQuality";
import { applyModelLodPolicy } from "./modelLod";
import { DEFAULT_MODEL_LOD } from "@ggd/shared/content/schema/config/modelLod";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  setAdaptiveCostMode("frame");
  store.clear(); // ⛔ 上一行寫進去的要清掉，否則「沒有覆蓋」那條驗不到
});

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("GH#D5 後台那一格 → 階梯", () => {
  it("★ 文件說 work，階梯就讀 work（⛔ 接線少一行 = 這一格是死的）", () => {
    applyModelLodPolicy({ ...DEFAULT_MODEL_LOD, adaptiveCostMode: "work" });
    expect(
      adaptiveCostMode(),
      "後台把成本來源切成 work，而階梯還在讀 frame —— 那一格沒有接上（失敗形態②）",
    ).toBe("work");

    applyModelLodPolicy({ ...DEFAULT_MODEL_LOD, adaptiveCostMode: "frame" });
    expect(adaptiveCostMode()).toBe("frame");
  });

  it("⭐ 主控台贏過後台（止血閥不可以被下一次重整洗掉）", () => {
    setAdaptiveCostMode("work"); // ← 玩家在 F12 按下止血閥
    applyModelLodPolicy({ ...DEFAULT_MODEL_LOD, adaptiveCostMode: "frame" });
    expect(
      adaptiveCostMode(),
      "後台蓋掉了主控台的選擇 —— 那會讓止血閥在下一次重整時失效",
    ).toBe("work");
  });

  it("文件壞掉 → 出貨預設（⛔ 不是「沒有模式」）", () => {
    applyModelLodPolicy(null);
    expect(adaptiveCostMode()).toBe("frame");
  });
});

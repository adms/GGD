import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { composeDoc, composeIds, overlayKey, type OverlayLayer } from "./overlayCompose";

/**
 * ⭐⭐ GH#730 批 A —— **兩層合成**。
 *
 * ⭐ 這條守衛釘住三件會**靜默**出錯的事，⛔ 不是「函式回對的值」：
 * ① **刪除優先於覆蓋**（平台端是「先寫後刪」，⛔ 讀端不可以挑相反的答案）
 * ② ⭐ **`source` 分得出「刪掉了」與「本來就沒有」** —— ⛔ 兩者在 UI 上長一樣
 *    就是 fail-open 的靜默版
 * ③ ⭐ **列表兩個方向都要算**（覆蓋層可以新增也可以刪除）——
 *    只算一邊，列表頁與編輯頁會互相矛盾
 *
 * ⚠️ ⭐ 第四條驗的是**與 client 那一側同一個語意** —— ⛔ 兩邊不一樣的話，
 * 後台看到的與玩家看到的會不同，而那正是整條鏈要防的東西。
 */
const layer = (docs: Record<string, unknown>, deleted: Record<string, boolean> = {}): OverlayLayer =>
  ({ docs, deleted });

describe("GH#730 覆蓋層 × 出貨樹 的合成", () => {
  it("沒有覆蓋層 ⇒ 逐位元回出貨樹（⛔ 既有行為不變）", () => {
    expect(composeDoc("abilities", "a", { v: 1 }, null)).toEqual({ doc: { v: 1 }, source: "shipped" });
  });

  it("★ ⭐ **刪除優先於覆蓋** —— 同時在兩個 map 裡就是刪掉的", () => {
    const l = layer({ "abilities/a": { v: 2 } }, { "abilities/a": true });
    expect(composeDoc("abilities", "a", { v: 1 }, l)).toEqual({ doc: null, source: "deleted" });
  });

  it("★ ⭐ `source` 分得出「刪掉了」與「本來就沒有」", () => {
    const del = composeDoc("items", "x", { v: 1 }, layer({}, { "items/x": true }));
    const miss = composeDoc("items", "y", null, layer({}));
    expect(del.doc).toBeNull();
    expect(miss.doc).toBeNull();
    expect(
      del.source,
      "⛔ 兩者都回 null 而分不出來 ⇒ UI 上「後台刪掉了」與「本來就沒有」長一樣",
    ).not.toBe(miss.source);
  });

  it("★ ⭐ 列表**兩個方向**都算（覆蓋層可以新增，也可以刪除）", () => {
    const l = layer({ "abilities/new": {} }, { "abilities/gone": true });
    expect(composeIds("abilities", ["gone", "keep"], l)).toEqual(["keep", "new"]);
    // ⛔ 別的集合的鍵不可以漏進來
    expect(composeIds("items", ["i"], layer({ "abilities/x": {} }))).toEqual(["i"]);
  });

  it("⭐ 鍵的字面形狀與 client 那一側**同一個**（⛔ 不一樣＝後台與玩家看到不同東西）", () => {
    expect(overlayKey("abilities", "a")).toBe("abilities/a");
    const client = readFileSync(
      resolve(__dirname, "../../client/src/content/clientOverlay.ts"),
      "utf8",
    );
    // ⭐ client 側同樣以 `docs` / `deleted` 兩個 map 表達 —— 名字對不上就是兩套語意。
    expect(client).toContain("deleted");
    expect(client).toContain("docs");
  });
});

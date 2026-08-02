/**
 * editModelAppend.test.ts — 新成員的插入與刪除，**不可以**碰到其他任何位元組。
 *
 * ── 為什麼 (2026-08-02) ───────────────────────────────────────────────────
 *
 * `spliceTopLevelMember` 只會**取代已存在**的成員，對不存在的直接 throw，
 * 而它的 docstring 說「the caller must add new members through the full-doc
 * PUT path instead」。那條建議會毀掉這整條線的存在理由：PUT 走一次
 * `JSON.stringify` 全文重寫，把 Python 匯出器的 `350.0` 全部正規化成 `350`。
 *
 * 而「加一個新成員」正是鑄技工坊兩個主功能各自要做的事：
 *   · 幫還沒有 `template` 的技能綁模板
 *   · 幫只有 `vfxKey` 的技能（**646 支，也就是絕大多數**）加 `vfxLayers`
 *
 * 所以這一組守的是：新增與刪除都走純文字編輯，浮點格式一位元不差。
 */
import { describe, expect, it } from "vitest";
import { appendTopLevelMember, deleteTopLevelMember, spliceMembers } from "./editModel";

/** Python 匯出器寫出來的樣子 —— `350.0` 這種寫法就是這條測試的重點。 */
const DOC = `{
  "id": "godie-hart.w",
  "schema": "ability@1",
  "name": "43-02 破壞死光",
  "cooldownSec": 12.0,
  "manaCost": 350.0,
  "vfxKey": "fx.w3x.locust.frostnova.p01"
}
`;

describe("appendTopLevelMember —— 新成員接在最後，其餘位元組不動", () => {
  it("★ 加一個新成員，而且 350.0 還是 350.0", () => {
    const out = appendTopLevelMember(DOC, "vfxLayers", [{ vfxKey: "a" }, { vfxKey: "b" }]);
    expect(out).toContain('"manaCost": 350.0');
    expect(out).toContain('"cooldownSec": 12.0');
    expect(JSON.parse(out)["vfxLayers"]).toEqual([{ vfxKey: "a" }, { vfxKey: "b" }]);
    // 純新增：把新加的那一段拿掉之後，要逐位元組回到原文。
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      "id",
      "schema",
      "name",
      "cooldownSec",
      "manaCost",
      "vfxKey",
      "vfxLayers",
    ]);
  });

  it("縮排是從最後一個成員讀的，不是猜的", () => {
    const four = DOC.replace(/^ {2}/gm, "    ");
    const out = appendTopLevelMember(four, "radius", 3.5);
    expect(out).toContain('\n    "radius": 3.5');
  });

  it("已經有這個 key 就 throw —— 呼叫端要用 splice，不是靜默覆蓋", () => {
    expect(() => appendTopLevelMember(DOC, "vfxKey", "x")).toThrow(/already has/);
  });
});

describe("deleteTopLevelMember —— 「回到單值 vfxKey」要表達得出來", () => {
  it("★ 刪掉中間的成員，JSON 仍然合法，其他成員格式不變", () => {
    const out = deleteTopLevelMember(DOC, "cooldownSec");
    expect(() => JSON.parse(out)).not.toThrow();
    expect(out).not.toContain("cooldownSec");
    expect(out).toContain('"manaCost": 350.0');
  });

  it("★ 刪掉最後一個成員不留下拖尾逗號（拖尾逗號不是合法 JSON）", () => {
    const out = deleteTopLevelMember(DOC, "vfxKey");
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out)["vfxKey"]).toBeUndefined();
    expect(JSON.parse(out)["manaCost"]).toBe(350);
  });

  it("刪一個不存在的成員是 no-op，不是 throw", () => {
    expect(deleteTopLevelMember(DOC, "nope")).toBe(DOC);
  });
});

describe("spliceMembers —— 三條路一次到位", () => {
  it("★ 同一個 patch 裡：改一個、加一個、刪一個", () => {
    const out = spliceMembers(DOC, {
      manaCost: 200.0, // 改（已存在）
      vfxLayers: [{ vfxKey: "a" }], // 加（不存在）
      cooldownSec: null, // 刪
    });
    const doc = JSON.parse(out) as Record<string, unknown>;
    expect(doc["manaCost"]).toBe(200);
    expect(doc["vfxLayers"]).toEqual([{ vfxKey: "a" }]);
    expect("cooldownSec" in doc).toBe(false);
    // 沒被碰到的成員仍然是原本的字面值。
    expect(out).toContain('"name": "43-02 破壞死光"');
  });

  it("GUARD THE GUARD：舊行為沒有被改壞 —— 純取代仍然是純取代", () => {
    const out = spliceMembers(DOC, { manaCost: 400.0 });
    expect(out).toContain('"cooldownSec": 12.0');
    expect(out.split("\n").length).toBe(DOC.split("\n").length);
  });
});

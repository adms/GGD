import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WritePlanStep } from "@ggd/shared/content/editModel";

vi.mock("./api", () => ({
  putOverlayDoc: vi.fn(),
  deleteOverlayDoc: vi.fn(),
}));
import { putOverlayDoc, deleteOverlayDoc } from "./api";
import { saveDocsToOverlay, createDocInOverlay, deleteDocInOverlay } from "./contentOverlayEdit";

/**
 * ⭐⭐ GH#730 批 B —— **寫入端走 durable overlay**。
 *
 * ⭐ 這條守衛釘住**兩件會靜默出錯**的事，⛔ 不是「函式呼叫得到 API」：
 * ① ⭐ **一份失敗不中斷其餘，而且逐份帶著自己的成敗** ——
 *    ⚠️ dev 版是「一串檔案一起寫」，⭐ 而 overlay 是**一份一份 PUT**：
 *    中途停下來會留一個「一半舊一半新」的狀態，⛔ 而使用者看不出來停在哪。
 * ② ⭐ **刪除是 tombstone** —— 走 `deleteOverlayDoc`，⛔ 不是去砍出貨樹的檔。
 */
const step = (id: string): WritePlanStep =>
  ({ collection: "abilities", id, doc: { id }, reason: "edit" }) as WritePlanStep;

describe("GH#730 批B 覆蓋層寫入", () => {
  beforeEach(() => vi.mocked(putOverlayDoc).mockReset());

  it("全部成功 ⇒ ok，且逐份記在 written 裡", async () => {
    vi.mocked(putOverlayDoc).mockResolvedValue({} as never);
    const r = await saveDocsToOverlay([step("a"), step("b")]);
    expect(r.ok).toBe(true);
    expect(r.written.map((w) => w.id)).toEqual(["a", "b"]);
    expect(r.error).toBeNull();
  });

  it("★ ⭐ **一份失敗不中斷其餘** —— 三份都試過，⛔ 而失敗的那一份自己帶原因", async () => {
    vi.mocked(putOverlayDoc)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("拒絕寫入：schema 不合"))
      .mockResolvedValueOnce({} as never);
    const r = await saveDocsToOverlay([step("a"), step("bad"), step("c")]);
    expect(
      vi.mocked(putOverlayDoc).mock.calls.length,
      "⛔ 中途停下來會留一個「一半舊一半新」的狀態，而使用者看不出來停在哪",
    ).toBe(3);
    expect(r.ok).toBe(false);
    expect(r.written.find((w) => w.id === "bad")?.error).toContain("schema 不合");
    // ⭐ 成功的那兩份仍然標成功 —— ⛔ 一句整批的失敗會讓人以為三份都沒進去
    expect(r.written.filter((w) => w.ok).map((w) => w.id)).toEqual(["a", "c"]);
  });

  it("⭐ create 對覆蓋層＝upsert（⛔ 沒有「檔案已存在」這個問題）", async () => {
    vi.mocked(putOverlayDoc).mockResolvedValue({} as never);
    const r = await createDocInOverlay("abilities" as never, "new", { id: "new" });
    expect(r.ok).toBe(true);
    expect(vi.mocked(putOverlayDoc).mock.calls[0]?.[1]).toBe("new");
  });

  it("★ ⭐ 刪除走 **tombstone**，⛔ 不碰出貨樹", async () => {
    vi.mocked(deleteOverlayDoc).mockResolvedValue({} as never);
    const r = await deleteDocInOverlay("items" as never, "x");
    expect(r.ok).toBe(true);
    expect(vi.mocked(deleteOverlayDoc)).toHaveBeenCalledWith("items", "x");
  });
});

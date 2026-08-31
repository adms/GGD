import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WritePlanStep } from "@ggd/shared/content/editModel";

vi.mock("./api", () => ({
  putOverlayDoc: vi.fn(),
  deleteOverlayDoc: vi.fn(),
}));
import { putOverlayDoc, deleteOverlayDoc } from "./api";
import { saveDocsToOverlay, createDocInOverlay, deleteDocInOverlay, decideOverlayWrite } from "./contentOverlayEdit";

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

/**
 * ⭐⭐ GH#730 —— **寫進覆蓋層之前那一道決定**（`decideOverlayWrite`）。
 *
 * ── 它擋的是一句對外承諾了卻沒做的事 ─────────────────────────────────────
 * `packages/shared/src/content/overlay.ts` 的檔頭逐字寫著
 * 「overlay docs are validated … **BY THE ADMIN CONSOLE BEFORE IT EVER WRITES**」。
 * ⛔ 2026-08-31 量到：`validateOverlayDoc` 全 repo **零呼叫端** ⇒ 那句話是假的。
 *
 * ⚠️ 代價具體：`data/content-overlay/overlay.json` **同時**餵給 shard 與**每一個
 * 瀏覽器** ⇒ 一份壞文件讓兩邊一起走退路。⭐ 退路是保險，⛔ 不是驗證。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `decideOverlayWrite` 改成永遠 `{write:true,…}` → 「schema 不過就不寫」紅
 *   · `unvalidatedReason` 改成永遠 `null` → 「沒 schema 的 collection 要出聲」紅
 */
describe("GH#730 decideOverlayWrite —— 寫之前那一道決定", () => {
  const ok = { ok: true as const, validated: true as const };

  it("量尺先自證：它真的把 collection/id/doc 原封傳給驗證器", () => {
    const seen: unknown[] = [];
    decideOverlayWrite("abilities", "a.q", { id: "a.q" }, (c, i, d) => {
      seen.push([c, i, d]);
      return ok;
    });
    expect(seen).toEqual([["abilities", "a.q", { id: "a.q" }]]);
  });

  it("★ ⭐ schema 不過 ⇒ **不寫**，並把訊息交給 UI", () => {
    const d = decideOverlayWrite("abilities", "a.q", {}, () => ({
      ok: false,
      error: "不符合 abilities 的 schema —— name: Required",
    }));
    expect(d.write, "⛔ 壞文件會落進同時餵 shard 與每個瀏覽器的那份檔").toBe(false);
    expect(d.error).toContain("schema");
  });

  it("★ ⭐ 沒有 schema 的 collection ⇒ **寫，但要出聲**（⛔ 靜靜通過與通過長得一樣）", () => {
    const d = decideOverlayWrite("experiments", "x", { id: "x" }, () => ({
      ok: true,
      validated: false,
      reason: "collection「experiments」沒有對應的 schema，這次寫入未經驗證",
    }));
    expect(d.write).toBe(true);
    expect(
      d.unvalidatedReason,
      "⛔ 吞掉這一行 = 操作者以為驗過了（fail-open 沒錯，靜默才是缺陷）",
    ).toContain("未經驗證");
  });

  it("⭐ 驗過了 ⇒ 寫，且**不多印一行雜訊**", () => {
    const d = decideOverlayWrite("abilities", "a.q", { id: "a.q" }, () => ok);
    expect(d).toEqual({ write: true, error: null, unvalidatedReason: null });
  });
});

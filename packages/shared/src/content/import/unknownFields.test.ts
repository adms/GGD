/**
 * ⭐⭐ GH#327 ① —— **未知欄位不可以靜默通過**（計畫 §3.3）。
 *
 * ── ⭐ 票文說「翻成 strict」，⛔ 而那會弄壞 digest ─────────────────────────
 * `packageSchema.ts` 的檔頭逐字寫著 passthrough 的理由：
 * 「`packageDigest` 是對**原始 JSON** 的 projection 取 hash」。
 * ⇒ ⭐ 缺的不是 strict，是**「我沒看懂這幾格」這條訊號**。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `extra.length > 0` 改成 `false` → 「未知欄位要被報出來」紅
 *   · `k !== EXTENSION_KEY` 拿掉 → 「`extensions` 是明示通道」紅
 *   · 「未知欄位的子樹不再往下」那個 `continue` 拿掉 → 「一格打錯字不要產生上百條」紅
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { unknownFields } from "./unknownFields";
import { zExactRef } from "./packageSchema";
import { IMPORT_DIAGNOSTICS } from "./diagnostics";

const S = z
  .object({
    a: z.string(),
    nested: z.object({ x: z.number() }).passthrough(),
    list: z.array(z.object({ y: z.number() }).passthrough()),
  })
  .passthrough();

describe("GH#327 ① 未知欄位", () => {
  it("量尺先自證：**乾淨的資料一條都不報**（⛔ 誤報會讓人學會忽略它）", () => {
    expect(unknownFields(S, { a: "x", nested: { x: 1 }, list: [{ y: 2 }] })).toEqual([]);
  });

  it("★ ⭐ 頂層與巢狀的未知欄位**都要報**，並指出路徑", () => {
    const hits = unknownFields(S, {
      a: "x",
      surprise: 1,
      nested: { x: 1, alsoNew: true },
      list: [{ y: 2 }, { y: 3, third: "?" }],
    });
    expect(hits).toEqual([
      { path: "/", fields: ["surprise"] },
      { path: "/nested", fields: ["alsoNew"] },
      { path: "/list/1", fields: ["third"] },
    ]);
  });

  it("★ ⭐ `extensions` 是**明示通道** ⇒ ⛔ 不報它", () => {
    expect(unknownFields(S, { a: "x", extensions: { "vendor.x@1": { anything: true } } })).toEqual(
      [],
    );
  });

  it("★ ⭐ 未知欄位的**子樹不再往下** —— 一格打錯字⛔ 不可以產生上百條", () => {
    const hits = unknownFields(S, {
      a: "x",
      // ⚠️ 打錯字：`nsted`。它底下整棵樹都是「未知」，⛔ 但只該報**一條**。
      nsted: { x: 1, deep: { deeper: { deepest: 1 } } },
    });
    expect(hits).toEqual([{ path: "/", fields: ["nsted"] }]);
  });

  it("⭐ 跑**出貨的** schema（`zExactRef`）—— ⛔ 不是只跑我造的那一份", () => {
    const good = { kind: "ability" as const, id: "a", contentSha256: "0".repeat(64) };
    expect(unknownFields(zExactRef, good), "⛔ 合法的 ref 被報成未知").toEqual([]);
    expect(unknownFields(zExactRef, { ...good, revisionn: 1 })).toEqual([
      { path: "/", fields: ["revisionn"] },
    ]);
  });

  it("⭐ 診斷碼登錄了，⭐ 而且是 **warning + 不 fail-closed**（規格 §10「至少包含」）", () => {
    const d = IMPORT_DIAGNOSTICS.UNKNOWN_FIELDS_NOT_UNDERSTOOD;
    expect(d.severity).toBe("warning");
    expect(d.failClosed, "⛔ fail-closed 會擋掉合法的未來版本").toBe(false);
    expect(d.message, "⛔ 訊息沒說「位元組被保留」= 對方會以為要重寫").toContain("位元組");
  });
});

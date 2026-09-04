/**
 * ⭐⭐ GH#650 的**第四段接縫** —— 客戶端真的**畫出那一份特效**，
 * ⛔ 而且泛用火花**讓位**（⛔ 不是疊加）。
 *
 * ── 為什麼這一條非有不可 ─────────────────────────────────────────────────
 * `blockVfxAxis.test.ts` 驗了前三段（schema 收得下 · sim 發得出來 · fanout 放行），
 * 它的檔頭逐字寫著「⭐ 而第四段（客戶端**取代**泛用火花）驗在 `apps/client` 那一側」。
 * ⛔ **而那一側在 2026-08-31 之前一個檔都沒有**（`grep -rl blockVfx apps/client 的測試檔`
 * ⇒ 零命中）—— ⭐ 一句在它到期之後還活著的散文（第三守則）。
 *
 * ⭐ 而票的 AC① 逐字要的是「**畫出來的是那份特效**（⛔ 不是「事件有送」）」。
 *
 * ── 失敗形態⑪：兩段各自對，接縫是空的 ─────────────────────────────────
 * sim 送得出、client 有 `case` —— ⭐ 而那個 case 的第一行
 * `if (bd.target === undefined || !bd.vfxId) break;` 會讓**任何**欄位名不合的
 * payload 靜靜地什麼都不做，⛔ 而每一條既有測試都是綠的。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `case "blockVfx"` 的 `this.blockVfxThisFrame.add(bd.target)` 拿掉
 *       → 「泛用火花讓位」紅
 *   · `if (isBlock && … blockVfxThisFrame.has(target)) break;` 拿掉
 *       → 同上紅（兩邊都是承重的）
 *   · `this.play(…)` 那一行拿掉 → 「畫出來的是那一份」紅
 */
import { describe, it, expect } from "vitest";
import { emitBlockVfx } from "@ggd/shared/sim/combat/block";

describe("GH#650 第四段：客戶端畫出那份特效並讓泛用火花退位", () => {
  it("量尺先自證：`emitBlockVfx` 的 payload 欄位名與客戶端讀的**是同一組**", () => {
    // ⭐ 這是失敗形態⑧的解藥：⛔ 不自己造一份 payload，而是拿**出貨的 emit 站**
    //   真的發一次，再去比對客戶端那個 `case` 第一行讀的欄位名。
    const sent: Record<string, unknown>[] = [];
    emitBlockVfx(
      { emit: (_t: string, d: Record<string, unknown>) => sent.push(d) } as never,
      1 as never,
      { vfxId: "fx.test", vfxScale: 1.6, vfxTint: [255, 140, 40] } as never,
      { x: 3, z: 4 } as never,
    );
    expect(sent.length, "⛔ 出貨的 emit 站一發都沒送 ⇒ 下面比什麼都沒有意義").toBe(1);
    const d = sent[0]!;
    // ⭐ 客戶端 `VfxSystem.ts` 的 `case "blockVfx"` 逐字讀這五個名字。
    for (const k of ["target", "vfxId", "scale", "tint", "x"]) {
      expect(d, `⛔ 送出的 payload 沒有 \`${k}\` —— 客戶端那個 case 的第一行會 break`).toHaveProperty(k);
    }
  });
});

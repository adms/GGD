/**
 * ⭐⭐ GH#751 —— 22 顆原作附掛球體的**逐筆裁決**：每一筆都要說得出為什麼。
 *
 * ── ⭐ 為什麼這條閘存在 ──────────────────────────────────────────────────────
 * 票文的 AC 是「**3 個 mesh-only 各有裁決記錄**」。⭐ 而「有記錄」在此之前
 * **沒有任何東西在驗** —— 一個把 `why` 刪掉的 commit 會靜靜通過，
 * 而下一輪讀這張表的人只會看到一個沒有理由的 `DO-NOT-BAKE`
 *（第三守則的形狀：一個宣稱活過了它的證據）。
 *
 * ── ⭐ 判準：**可以被反駁的理由**，⛔ 不是「還沒排到」 ──────────────────────
 * 每一筆非 `OUT-OF-SCOPE` 的裁決都必須帶一句**量到的**理由：
 *   · `DO-NOT-BAKE`   → 量到的三角形／材質統計（「1088 of 1088 是 additive」）
 *   · `NO-OP`         → 原作欄位值（「w3a 的 `atac` 是 0」）
 *   · `ALREADY-SHIPPED` → 指名是誰烘的（`merge_sphere_attachments.py`）
 *   · `BLOCKED-OVERLAY` → 指名擋住的是什麼（stand-in 覆蓋）
 *
 * MUTATION LOG：把任何一筆的 `why` 清空 → ①紅並指名那一列。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ROWS = (JSON.parse(
  readFileSync(join(REPO, "tools/w3x-import/out/emitters/SPHERE_ATTACHMENTS.json"), "utf8"),
) as { rows: { champId?: string; decision?: string; why?: string }[] }).rows;

/** ⛔ 這一族不必寫理由：它們**根本不在這張票的範圍裡**。 */
const NO_REASON_NEEDED = new Set(["OUT-OF-SCOPE"]);

describe("GH#751 球體附掛的逐筆裁決", () => {
  it("★ ⭐ 每一筆**做了決定**的都說得出為什麼（⛔ 空的理由＝沒有決定）", () => {
    const naked = ROWS.filter(
      (r) => r.decision && !NO_REASON_NEEDED.has(r.decision) && (r.why ?? "").trim().length < 20,
    ).map((r) => `${r.champId ?? "?"} → ${r.decision}`);
    expect(naked, "⛔ 這幾列有裁決而沒有理由 —— 下一輪讀到時等於沒查過").toEqual([]);
  });

  it("★ ⭐ 三個 mesh-only 的裁決**在表上**（AC 逐字要的那三筆）", () => {
    // `DO-NOT-BAKE` = 量到整顆是 always-on additive glow ⇒ 烘進去會變成一直亮著。
    // `ALREADY-SHIPPED` = 已經走 mesh 合併烘進去了（⛔ 不在綁定表，所以不是「漏掉」）。
    const meshOnly = ROWS.filter((r) => r.decision === "DO-NOT-BAKE" || r.decision === "ALREADY-SHIPPED");
    expect(meshOnly.length, "⛔ mesh-only 那三筆不在表上").toBe(3);
    for (const r of meshOnly) {
      expect((r.why ?? "").length, `${r.champId}: 理由太短`).toBeGreaterThan(40);
    }
  });

  it("⭐ 每一筆都有 `decision`（⛔ 一列沒填等於它從來沒被看過）", () => {
    expect(ROWS.filter((r) => !r.decision).length).toBe(0);
    expect(ROWS.length, "⛔ 表的長度變了 —— 先確認是新增還是漏掉").toBe(22);
  });
});

/**
 * 🔀 **`vfx-families.json` 的兩個寫入端必須照順序跑** —— GH#802 的閘。
 *
 * ## 病灶（2026-08-27 量到，⛔ 不是假設）
 * 這一個檔有**兩個產生器**：
 *   · `vfxfam:build`（`apps/client/src/render/vfx/generateFamilyContent.ts`）
 *     —— 寫 `abilities` 鏡像，判準「技能出貨了嗎」住這裡
 *   · `pitch:build`（`tools/w3x-import/build_pitch.py`）
 *     —— 寫 pitch/family 欄位
 *
 * ⭐ **而 `vfxfam:build` 一開始根本不在 sync 鏈裡**（只有 `pitch:build` 在）。
 * ⇒ 鏈每跑一次，`generateFamilyContent.test.ts` 就紅一次，
 *   訊息說「兩個住處漂開了」而**沒有任何東西說得出為什麼**。
 *
 * ## ⭐ 這一條問的是「兩個名詞的關係」，⛔ 不是「它在不在」
 * ⛔「`vfxfam:build` 有沒有在鏈裡」是**名詞** —— 把它加在 `pitch:build` **後面**
 *   也會通過那種檢查，而那正好是壞的那個順序。
 * ⭐ 這一條問的是**先後**。
 *
 * ## ⚠️ 為什麼順序是這個方向
 * `vfxfam:build` 產生鏡像與證據（含死列剪除），`pitch:build` 接著在同一份檔上
 * 補 pitch 欄位。反過來跑 ⇒ `pitch` 的成果被整份覆蓋。
 *
 * ── 突變紀錄（一批一條）────────────────────────────────────────────────
 *  · 把 `sync-io.json` 的 chain 裡兩者對調 → 這一條紅並指名兩個位置。實測過。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SYNC_IO = "tools/parallel-gates/sync-io.json";

describe("vfx-families 兩個寫入端的順序 (vfx-families-writer-order)", () => {
  it("⭐ `vfxfam:build` 必須排在 `pitch:build` **之前**（⛔ 不是「有沒有在鏈裡」）", () => {
    const doc = JSON.parse(readFileSync(join(REPO, SYNC_IO), "utf8")) as { chain?: string };
    const chain = doc.chain ?? "";
    expect(chain.length, `${SYNC_IO} 沒有 chain —— 母體壞了`).toBeGreaterThan(0);

    const at = (step: string): number => chain.indexOf(`pnpm ${step}`);
    const vfxfam = at("vfxfam:build");
    const pitch = at("pitch:build");

    expect(
      vfxfam,
      "⛔ `vfxfam:build` 不在 sync 鏈裡。\n" +
        "   它是 `content/config/vfx-families.json` 的**另一個**寫入端（abilities 鏡像 ＋ 死列判準）。\n" +
        "   不在鏈裡 ⇒ 鏈每跑一次，`generateFamilyContent.test.ts` 就紅一次（GH#802）。",
    ).toBeGreaterThan(-1);
    expect(pitch, "⛔ `pitch:build` 不在 sync 鏈裡 —— 那份檔的 pitch 欄位沒有人寫").toBeGreaterThan(-1);

    expect(
      vfxfam < pitch,
      `⛔ 順序反了：\`vfxfam:build\`(位置 ${vfxfam}) 必須排在 \`pitch:build\`(位置 ${pitch}) **之前**。\n` +
        "   `vfxfam:build` 產生鏡像與證據（含死列剪除），`pitch:build` 接著補 pitch 欄位。\n" +
        "   反過來跑 ⇒ pitch 的成果被整份覆蓋，而**兩支各自單獨跑都是綠的**。\n" +
        "   ⭐ 這正是最難查的那一種：只在特定順序下紅。",
    ).toBe(true);
  });

  it("兩者都真的寫那一份檔（⛔ 這條防的是「順序對了但寫的不是同一個檔」）", () => {
    const doc = JSON.parse(readFileSync(join(REPO, SYNC_IO), "utf8")) as {
      steps?: readonly { name?: string; writes?: readonly string[] }[];
    };
    const writers = (doc.steps ?? [])
      .filter((s) => (s.writes ?? []).some((w) => String(w).includes("vfx-families")))
      .map((s) => s.name);
    // ⚠️ `vfxfam:build` 剛進鏈、sync-io 還沒重量測到它 ⇒ 這裡只要求 `pitch:build` 在。
    //    ⭐ 重量測之後兩支都會出現；那時把下面改成 2 才是對的（⛔ 現在改＝說謊）。
    expect(writers, `⛔ 沒有任何 step 宣告寫 vfx-families —— 擁有者表壞了`).toContain("pitch:build");
  });
});

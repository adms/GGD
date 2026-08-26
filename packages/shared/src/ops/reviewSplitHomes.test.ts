/**
 * 🔐 **批核材料與批核結果分署** —— GH#794 的承重守衛。
 *
 * owner 2026-08-27（逐字）：
 * > 「為避免**讀寫混淆**，請將**批核材料跟批核結果分署不同資料夾**，
 * >  用**特定存取script的特定存取權限**來管理**避免錯改**」
 *
 * ## 它問的是**關係**，⛔ 不是名詞
 * ⛔ 「material/ 這個目錄在不在」是名詞 —— 兩個目錄都建好、而登記照樣把裁決寫回去，
 *   那一版是綠的。⭐ 真正的不變量有兩條，兩條都是關係：
 *   ① **欄位互不相交**：材料檔裡不可以有 `verdict`，結果檔裡不可以有 `rollback`。
 *      這一條驗的是**出貨的那兩份檔**（⛔ 不是自己造一份夾具 —— 失敗形態⑤）。
 *   ② **線上寫不動材料**：拿**真的** middleware、發**真的**請求、收**真的** 403。
 *      ⛔ 不是 grep「有沒有 mode === live 這行字」（失敗形態⑥）。
 *
 * ⚠️ 權限那一層（444）刻意**不在這裡驗** —— chmod 在 CI／clone 之後不保證留存，
 *   而一條「在別人機器上會紅」的守衛會被改鬆，然後它就再也不叫了。
 *   那一層歸 `bash scripts/review-access.sh guard`（在本機與部署前跑）。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一條線）──────────────────────────────
 *  · `tools/review/middleware.mjs` 的 `writesMaterial()` 把 `/__review/frame` 拿掉
 *    → 第 ② 條紅（線上可以把 PNG 寫進 :ro 的證據目錄 ⇒ 撞 EACCES 500，
 *      而 owner 看到的是一個沒有人看得懂的錯誤）。實測過。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MATERIAL = "docs/_review/material/batches.json";
const VERDICT_DIR = "docs/_review/verdicts";

/** 出貨的材料檔裡**絕對不可以**出現的字（那是 owner 的那一半）。 */
const VERDICT_WORDS = ["verdict", "verdictAt", "verdictHash"];
/** 出貨的結果檔裡**絕對不可以**出現的字（那是我的那一半）。 */
const MATERIAL_WORDS = ["rollback", "registeredAt", "sequenceDir"];

describe("批核材料/結果分署 (review-split-homes)", () => {
  it("⭐ ① 兩份**出貨的**檔欄位互不相交（登記寫不進裁決，裁決寫不進登記）", () => {
    const mat = JSON.parse(readFileSync(join(REPO, MATERIAL), "utf8")) as {
      batches: Record<string, Record<string, unknown>>;
    };
    const nBatches = Object.keys(mat.batches ?? {}).length;
    expect(nBatches, "材料檔一批都沒有 —— 母體壞了（跑 node tools/review/split-stores.mjs）").toBeGreaterThan(0);

    const bad: string[] = [];
    for (const [id, reg] of Object.entries(mat.batches)) {
      for (const w of VERDICT_WORDS) if (w in reg) bad.push(`📦 材料 ${MATERIAL} 的 ${id} 帶著裁決欄位「${w}」`);
    }
    for (const f of readdirSync(join(REPO, VERDICT_DIR)).filter((f) => f.endsWith(".json"))) {
      const doc = JSON.parse(readFileSync(join(REPO, VERDICT_DIR, f), "utf8")) as {
        verdicts?: Record<string, Record<string, unknown>>;
      };
      for (const [id, v] of Object.entries(doc.verdicts ?? {})) {
        for (const w of MATERIAL_WORDS) if (w in v) bad.push(`🧑‍⚖️ 結果 ${f} 的 ${id} 帶著登記欄位「${w}」`);
      }
    }
    expect(
      bad.join("\n"),
      "⛔ 分署破了 —— 這正是 owner 說的「讀寫混淆」：兩邊的寫入端會互相覆蓋。\n" +
        "⭐ 修法在 `tools/review/stores.mjs`：兩個寫入端各自用 MATERIAL_FIELDS / VERDICT_FIELDS 過濾。\n" +
        "   ⛔ 不要手改那兩份檔（材料是 444）—— 走 `bash scripts/review-access.sh`。",
    ).toBe("");
  });

  it("⭐ ② 線上模式**真的**擋得住寫材料（跑出貨的 middleware，⛔ 不是掃字串）", async () => {
    // ⚠️ 算出來的 specifier：`tools/` 是 .mjs 沒有型別宣告，靜態 import 會 TS7016。
    //    ⭐ 這與 `apps/admin/vite.config.ts` 載同一份模組的形狀一致（⛔ 不是為了繞過檢查
    //    而是那個目錄刻意不進 tsconfig —— 它是給 node 直接跑的工具，不是產品程式碼）。
    const href = new URL("../../../../tools/review/middleware.mjs", import.meta.url).href;
    const mod = (await import(/* @vite-ignore */ href)) as {
      createReviewMiddleware: (
        root: string,
        opts: { mode: string },
      ) => (req: unknown, res: unknown, next: () => void) => void;
    };
    const mw = mod.createReviewMiddleware(REPO, { mode: "live" });
    const hit = async (url: string): Promise<number> =>
      await new Promise((resolve) => {
        const res = {
          statusCode: 0,
          setHeader() {},
          end() {
            resolve(res.statusCode);
          },
        };
        mw({ method: "POST", url }, res, () => resolve(-1));
      });
    // 兩條會寫到**材料**那一側的路 —— 線上都必須 403。
    expect(await hit("/__review/frame"), "線上可以把 PNG 寫進 :ro 的證據目錄").toBe(403);
    expect(await hit("/__review/verdict"), "線上可以改資產裁決帳本（那也是材料側）").toBe(403);
  });
});

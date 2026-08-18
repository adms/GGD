/**
 * ⭐【出貨的 `content/editor-target-profile.json` 必須是最新的】
 *
 * 那份檔是**對外契約**：外部編輯器打
 * `https://ggd.adms.ai/content/editor-target-profile.json` 拿它 pin base。
 * ⛔ 它過期的代價和 `bundle.json` 過期一樣 —— 對方看不到我們的 registry，
 *    **沒有辦法自己發現**，只會照著一份舊事實產出上線就是死的內容。
 *
 * ⭐ GH#389 之後這條比對**整份檔的位元組**。
 * ⚠️ 它原本只比 `profileDigest`，理由寫在這裡：「`generatedAt` 每次執行都不同，
 *    拿整份比會在每一次乾淨重跑都紅」。那個理由是真的 —— 而**代價是這條閘被放寬了**：
 *    digest 只蓋住 `body`，所以任何寫在 body 之外的漂移（欄位順序、縮排、結尾換行、
 *    連 `profileDigest` 自己被手改）都逃得過。⛔ 一條被放寬的閘等於沒有閘。
 *    拿掉時鐘欄位之後，那個放寬的**前提消失了**，所以閘收回原本該有的寬度。
 *
 * 突變紀錄：手改 `content/editor-target-profile.json` 的任一格（例如把
 * `deltaExportAllowed` 改成 true）→ 這一條紅並指名要重跑 `pnpm content:build`。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EDITOR_PROFILE_FILE,
  EDITOR_TARGET_PROFILE_SCHEMA,
  renderEditorTargetProfile,
} from "../../scripts/buildEditorTargetProfile";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SHIPPED = join(REPO, "content", EDITOR_PROFILE_FILE);

describe("外部編輯器的遠端資料契約沒有過期", () => {
  it("⭐ 出貨的那一份逐位元組等於現在重算的 —— ⛔ 手改會在這裡紅", () => {
    expect(
      existsSync(SHIPPED),
      `${EDITOR_PROFILE_FILE} 不存在 —— 跑 \`pnpm content:build\` 產生它。` +
        "⚠️ 它是正式站唯一對外的編輯器契約，少了它編輯器沒有 base 可以 pin。",
    ).toBe(true);

    const shipped = readFileSync(SHIPPED, "utf8");
    expect((JSON.parse(shipped) as { schema: string }).schema).toBe(EDITOR_TARGET_PROFILE_SCHEMA);
    // ⚠️ 訊息裡放 digest 而不是整份 diff —— 整份貼出來沒有人讀得完。
    const short = (t: string) => (JSON.parse(t) as { profileDigest: string }).profileDigest;
    const fresh = renderEditorTargetProfile();
    expect(
      `${short(shipped)}/${shipped.length}`,
      "出貨的編輯器契約過期了（或有人手改）。⛔ 不要改這條測試，也不要手改那份 JSON：\n" +
        "    pnpm content:build && git add content/\n" +
        "⚠️ 它是外部編輯器 pin base 的依據 —— 過期 = 對方照舊事實產內容，而他們發現不了。",
    ).toBe(`${short(fresh)}/${fresh.length}`);
    expect(shipped).toBe(fresh);
  });

  it("⚠️ 誠實欄位：每一個 null 都要在 unavailable[] 有出處", () => {
    const p = JSON.parse(readFileSync(SHIPPED, "utf8")) as {
      deltaExportAllowed: boolean;
      unavailable: { field: string; reason: string }[];
      tagManifest: { matchesEngine: boolean | null };
    };
    // ⛔ `deltaExportAllowed` 是契約不是設定：正式站沒有 authoring store base。
    expect(p.deltaExportAllowed).toBe(false);
    expect(p.unavailable.map((u) => u.field)).toContain("deltaExportAllowed");
    for (const u of p.unavailable) {
      expect(u.reason.length, `${u.field} 的 unavailable 沒有寫原因`).toBeGreaterThan(15);
    }
    // ⭐ 這一格必須真的算過（true / false 都可以，⛔ 不可以是 null 佯裝「沒查」）。
    expect(
      p.tagManifest.matchesEngine,
      "tagManifest.matchesEngine 是 null —— 標籤清單的引擎指紋沒被比對，" +
        "而那正是「這份裁決是不是對舊引擎做的」唯一的訊號",
    ).not.toBeNull();
  });
});

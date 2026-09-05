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

/**
 * ⭐ GH#1004（GH#979 的同族）—— **逐位元組**這件事在此之前有一個只在一種機器上成立的前提：
 * ⑥ 段讀 `data/curation/whitelist.json`（`.gitignore` 掉的平台執行期狀態）去填四格
 * `curation.*` ⇒ 有白名單的機器 championCount 49、乾淨 clone null ⇒ 這條在 CI 上
 * **從來沒有綠過**，於是它曾經是一條「白名單不在就 skip」—— 而一條 skip 的閘等於沒有閘。
 *
 * ⭐ 現在產生器預設 `placeholder`（四格 null ＋ 固定文字指向 liveEndpoint），
 *   契約是 git 的純函數 ⇒ 這條在**每一台機器**上都真的比對，⛔ 沒有 skip。
 *   下面第一條連「模擬沒有白名單」再算一次都做了 —— 兩份位元組要一樣。
 */
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

    /**
     * ⭐ GH#1004 承重的那一條：這台機器**有沒有**白名單，都要算出同一份位元組。
     * 用路徑覆寫模擬「沒有白名單」再算一次（⛔ 不是造一份假 profile 餵進來）。
     * ⚠️ 開了 `GGD_EDITOR_PROFILE_CURATION=live` 這裡會紅 —— 那是開關的代價（位元組跟著
     *    機器走），⛔ 不是缺陷；預設 placeholder 才是出貨的路。
     * 突變紀錄：把產生器的預設翻成 `live` ⇒ 有白名單的機器上 championCount 變 49 ⇒ 紅；
     * 沒有白名單的機器靠下面那條 `GH#1004` 出處紅（live 缺席時的 reason 是另一句）。
     */
    const prev = process.env.GGD_CURATION_WHITELIST;
    process.env.GGD_CURATION_WHITELIST = join(REPO, "data/curation/__no-such-whitelist__.json");
    let absent: string;
    try {
      absent = renderEditorTargetProfile();
    } finally {
      if (prev === undefined) delete process.env.GGD_CURATION_WHITELIST;
      else process.env.GGD_CURATION_WHITELIST = prev;
    }
    expect(
      `${short(absent)}/${absent.length}`,
      "沒有 data/curation/whitelist.json 的機器算出了另一份契約 —— 產生器把機器狀態烘進去了" +
        "（GH#1004）。是不是 GGD_EDITOR_PROFILE_CURATION=live 開著？",
    ).toBe(`${short(fresh)}/${fresh.length}`);
    const curation = (JSON.parse(fresh) as { unavailable: { field: string; reason: string }[] })
      .unavailable.find((u) => u.field === "curation.*");
    expect(curation?.reason ?? "", "curation.* 不是刻意留白的（預設應該是 placeholder）").toContain("GH#1004");
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

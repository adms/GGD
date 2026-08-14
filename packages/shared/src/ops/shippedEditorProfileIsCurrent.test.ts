/**
 * ⭐【出貨的 `content/editor-target-profile.json` 必須是最新的】
 *
 * 那份檔是**對外契約**：外部編輯器打
 * `https://ggd.adms.ai/content/editor-target-profile.json` 拿它 pin base。
 * ⛔ 它過期的代價和 `bundle.json` 過期一樣 —— 對方看不到我們的 registry，
 *    **沒有辦法自己發現**，只會照著一份舊事實產出上線就是死的內容。
 *
 * ⚠️ 比對的是 `profileDigest` 而**不是**整份檔的位元組：`generatedAt` 每次執行都不同，
 *    拿整份比會在每一次乾淨重跑都紅，而一個永遠紅的守衛就是沒有人會看的守衛
 *    （同 `skillRemakeJsonFresh` 排除 `castTimeSec` 的理由）。
 *    `profileDigest` 是**除了 generatedAt 與它自己以外**全部欄位的 sha ⇒
 *    內容一變它就變，時間變它不變。正好是這條要的語意。
 *
 * 突變紀錄：手改 `content/editor-target-profile.json` 的任一格（例如把
 * `deltaExportAllowed` 改成 true）→ 這一條紅並指名要重跑 `pnpm content:build`。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEditorTargetProfile,
  EDITOR_PROFILE_FILE,
  EDITOR_TARGET_PROFILE_SCHEMA,
} from "../../scripts/buildEditorTargetProfile";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SHIPPED = join(REPO, "content", EDITOR_PROFILE_FILE);

describe("外部編輯器的遠端資料契約沒有過期", () => {
  it("⭐ 出貨的 profileDigest 等於現在重算的 —— ⛔ 手改會在這裡紅", () => {
    expect(
      existsSync(SHIPPED),
      `${EDITOR_PROFILE_FILE} 不存在 —— 跑 \`pnpm content:build\` 產生它。` +
        "⚠️ 它是正式站唯一對外的編輯器契約，少了它編輯器沒有 base 可以 pin。",
    ).toBe(true);

    const shipped = JSON.parse(readFileSync(SHIPPED, "utf8")) as {
      schema: string;
      profileDigest: string;
    };
    // generatedAt 給一個固定值：它不參與 digest，這裡只是把介面填滿。
    const fresh = buildEditorTargetProfile({ generatedAt: "1970-01-01T00:00:00.000Z" }) as {
      profileDigest: string;
    };

    expect(shipped.schema).toBe(EDITOR_TARGET_PROFILE_SCHEMA);
    expect(
      shipped.profileDigest,
      "出貨的編輯器契約過期了（或有人手改）。⛔ 不要改這條測試，也不要手改那份 JSON：\n" +
        "    pnpm content:build && git add content/\n" +
        "⚠️ 它是外部編輯器 pin base 的依據 —— 過期 = 對方照舊事實產內容，而他們發現不了。",
    ).toBe(fresh.profileDigest);
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

/**
 * ⭐【GH#534】`ggd-runtime-capabilities@1` 的**棄用政策**真的送得出去嗎。
 *
 * owner 2026-08-22：
 * > 「請記得把這些**透過讀取 JSON 到 script 處理更新到文件、後台設定及 codex 編輯器**也要更新」
 *
 * ⚠️ 這一條守的**不是**「文件上有沒有那句話」—— 散文對外部編輯器是不可讀的。
 * 承重的那一條線是 **{@link DEPRECATED_FIELDS} 有沒有進到 manifest**：
 * 對面拿到的是 `ggd-runtime-capabilities.json`，它照 `effectFields` 那個聯集去填，
 * 而 `flat` **在那個聯集裡**（引擎真的收）。⇒ 少了 `deprecatedFields` 這一格，
 * 對面沒有任何機器讀得到的訊號說「這一格不要再填」，
 * 而它產出的內容會合法、能跑、⛔ 並且在 owner 改公式表的那天不跟著動。
 *
 * ⛔ 這裡刻意**不驗數字**（第二守則：守衛驗機制不驗數字）—— 五級距各是多少住在
 * `config.damage-tiers@1`，抄進斷言就是第四個住處。
 */
import { describe, expect, it } from "vitest";

import { buildCapabilityManifest, DEPRECATED_FIELDS } from "./editorCapabilities";
import { zScaling } from "./schema/common";

describe("deprecated authoring fields reach the outward contract", () => {
  const m = buildCapabilityManifest();

  it("每一筆都指著**真的存在**的欄位 —— 兩個方向", () => {
    expect(DEPRECATED_FIELDS.length).toBeGreaterThan(0);
    const scalingKeys = new Set(Object.keys((zScaling as unknown as { shape: object }).shape));
    for (const d of DEPRECATED_FIELDS) {
      // ① 被棄用的那一格必須**還在**引擎收得下的聯集裡。不在 = 這條政策在對
      //    一個不存在的欄位喊話，而讀它的人會照著繞一條不必要的路。
      expect(m.effectFields, `deprecated field ${d.field}`).toContain(d.field);
      // ② 叫人改填的那一格必須真的填得到。⛔ 一個打錯字的 useInstead 不會有任何
      //    東西紅，而對面照著填會被 Zod 整份拒絕。
      expect(scalingKeys.has(d.useInstead), `useInstead ${d.useInstead}`).toBe(true);
      // ③ 例外要帶判準 ——「還沒收」不算理由（CLAUDE.md 第〇·四守則）。
      expect(d.exceptions.length, `exceptions for ${d.field}`).toBeGreaterThan(0);
      expect(d.issue).toMatch(/^GH#\d+$/);
    }
  });

  it("⭐ 承重：政策真的進到 manifest（＝對面機器讀得到）", () => {
    // ⛔ 突變點：把 `deprecatedFields: DEPRECATED_FIELDS` 從 buildCapabilityManifest()
    //    拿掉，這一條就紅。那正是「文件上寫了、契約裡沒有」那種安靜的失敗。
    expect(m.deprecatedFields).toEqual(DEPRECATED_FIELDS);
  });
});

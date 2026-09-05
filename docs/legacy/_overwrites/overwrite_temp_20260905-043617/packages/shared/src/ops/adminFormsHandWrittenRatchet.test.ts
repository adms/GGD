/**
 * 🪜 後台表單「手寫欄位數」的**棘輪**（GH#992 Scope 1）。
 *
 * 票文的驗收條件之一：「手寫表單欄位數的棘輪基準線寫在測試裡並小於今天」。
 * 這裡的「今天」是**當場量的**（2026-09-05，跑 `handWrittenResidue()` 逐份加總），
 * ⛔ 不是引用票文 —— 票文那一列（「16 份 spec 裡只有 3 份引用 Zod」）已經過期。
 *
 * ⭐ 量到的：**71 份 spec（住 17 個檔）· 963 格手寫標籤 · 1,134 個 schema 純量葉**，
 * 而 963 格**全部**欠 `@zh`（今天沒有任何一份 schema 採用那個指令）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼是**雙向**的（變多紅、變少也紅）
 * ════════════════════════════════════════════════════════════════════════════
 * · **變多 → 紅**：一份新設定文件如果照舊逐格手打標籤，這條就會叫。⭐ 那正是它要
 *   問的問題：「這幾格為什麼不是從 Zod 的 `@zh` 推導的？」——⛔ 而不是默默長大。
 * · **變少 → 也紅**：⭐ 帳單付掉了就要**把基準線降下來**，否則這條棘輪會停在一個
 *   早就還完的數字上，然後在下一次退步時**仍然是綠的**（一條爬不動的棘輪＝沒有棘輪）。
 *
 * ⚠️ 兩個方向都給得出下一步，所以訊息裡逐字寫著要改哪一行。
 *
 * ⚠️ **這條會與正在新增設定頁的 lane 撞車**，而那是刻意的：撞車的內容就是
 * 「你新增的那幾格是手寫的」。收工時把 `BASELINE` 改成新的量值並在 commit 訊息裡
 * 說一句為什麼，⛔ 不要把斷言改成 `toBeLessThanOrEqual`（那會讓「變少不降線」變成綠的）。
 */
import { describe, expect, it } from "vitest";
import { zConfigSpeedGrowthTiersDoc } from "../content/schema/config";
import { CONFIG_DOC_SPECS } from "../../../../apps/admin/src/configForms";
import { handWrittenResidue } from "../../../../apps/admin/src/configForms/schemaToForm";

/** 量到的當下（2026-09-05）。⭐ 只能往下走。 */
const BASELINE = 963;

/** 這一行就是量尺本身 —— 測試與棘輪讀同一支，⛔ 沒有第二份計數邏輯。 */
function totalHandWritten(specs: readonly Parameters<typeof handWrittenResidue>[0][]): number {
  return specs.reduce((n, s) => n + handWrittenResidue(s).length, 0);
}

describe("後台表單手寫欄位棘輪", () => {
  it("⭐ 手寫欄位數只能變少", () => {
    // ⚠️ 母體不可以塌掉：註冊表載不進來時 reduce 會誠實地回 0，而 0 < BASELINE
    // 在單向棘輪底下是「進步」。雙向斷言本來就擋得住，這一行是講清楚為什麼。
    expect(CONFIG_DOC_SPECS.length).toBeGreaterThan(50);
    const now = totalHandWritten(CONFIG_DOC_SPECS);
    expect(
      now,
      now > BASELINE
        ? `手寫標籤從 ${BASELINE} 變成 ${now}：新增的那幾格請改成在 Zod 上寫 ` +
          `\`@zh\` / \`@note\` / \`@opt\`（見 apps/admin/src/configForms/schemaToForm.ts 檔頭），` +
          `真的必須手寫就把本檔的 BASELINE 調成 ${now} 並說明為什麼。`
        : `帳單付掉了（${BASELINE} → ${now}）⇒ 把本檔的 BASELINE 改成 ${now}，` +
          `否則這條棘輪會停在一個還完的數字上，下一次退步時仍然是綠的。`,
    ).toBe(BASELINE);
  });

  it("⭐ 量尺兩個方向都驗過：貼上 @zh 之後那一格真的從欠帳裡消失", () => {
    const spec = CONFIG_DOC_SPECS.find((s) => s.docId === "speed-growth-tiers")!;
    const before = handWrittenResidue(spec);
    // 已知「有欠帳」那一邊：出貨 schema 沒有任何 `@zh`。
    expect(before.find((r) => r.path === "ladder")?.reasons).toContain("zh");

    // 已知「還完了」那一邊：同一顆節點貼上指令 —— 欠帳要**正好少一項**。
    const adopted = {
      ...spec,
      zod: zConfigSpeedGrowthTiersDoc.extend({
        ladder: zConfigSpeedGrowthTiersDoc.shape.ladder.describe(
          "@zh 用哪一把梯子\n@note 兩個候選。\n@opt A A（保守）\n@opt B B（激進）",
        ),
      }),
    };
    const after = handWrittenResidue(adopted);
    expect(after.find((r) => r.path === "ladder")).toBeUndefined();
    expect(after.length).toBe(before.length - 1);
  });
});

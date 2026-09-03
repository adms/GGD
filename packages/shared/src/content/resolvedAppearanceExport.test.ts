/**
 * ⭐⭐ **外觀解析真的被呼叫了，而且它說得出「這是別人」**（GH#934）。
 *
 * owner 逐字：「main 遊戲主程式 是**做出積木供使用**的角色」。
 *
 * ⛔⛔ 動手前量到一件票文沒寫的事：`resolvedAppearance.ts` **已經完整存在**
 * （每個欄位都有，含 `isStandIn` 與 resolver fingerprint），
 * ⭐ 而它有 **零個 production 消費端** —— 失敗形態⑧。
 * ⇒ ⭐ 缺的不是 resolver，是**有人真的去呼叫它，而且把結果交出去**。
 *
 * ⭐⭐ **而接上匯出的當場抓到 resolver 的一個缺陷**：
 * `isStandIn` 只問「這顆模型在替身池嗎」（一個**名詞**的性質），
 * ⛔ 沒問「**這位英雄是不是它的主人**」（兩個名詞的**關係**）
 * ⇒ `sela` 用 `champ.sela`、`thorne` 用 `champ.thorne`——**他們本人**——
 * 也被標成「站在別人身上」（16 位，修好之後是 **14**）。
 * ⚠️ ⭐ 而那種對正確的英雄跳的警告，很快就會被忽略。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `isStandIn` 的第二個條件拿掉（回到只問模型）
 *    → 🔴 ③「本人不可以被標成替身」逐字指名 `sela` 與 `thorne`
 */
import { describe, expect, it } from "vitest";
import MANIFEST from "../../../../docs/editor-contract/ggd-resolved-appearance.json" with { type: "json" };
import { appearanceResolverFingerprint } from "./import/resolvedAppearance";

interface Row {
  championId: string;
  modelKey: string;
  glbPath: string;
  isStandIn: boolean;
  modelDocDigest: string;
}
const ROWS = MANIFEST.appearances as ReadonlyArray<Row>;

describe("外觀解析的匯出（GH#934）", () => {
  it("★★ ⭐ 每一位出貨英雄都解得出來（⛔ 失敗一位 = 編輯器預覽不出那一位）", () => {
    expect(
      MANIFEST.failures as unknown[],
      "⛔ 有英雄解不出外觀 —— 訊息裡的 `kind` 會說是缺 modelKey 還是缺 model 文件",
    ).toEqual([]);
    expect(ROWS.length, "⛔ 匯出是空的 —— 掃描器瞎了，這一支的結論全部作廢").toBeGreaterThan(60);
  });

  it("★★ ⭐ 指紋逐字等於出貨 resolver 現在算出來的（⛔ 過期的契約會讓編輯器對錯）", () => {
    expect(
      MANIFEST.resolverFingerprint,
      "⛔ 契約裡的 resolver 指紋過期 —— 跑 `pnpm appearance:build` 然後 git add",
    ).toBe(appearanceResolverFingerprint());
  });

  it("★★ ⭐⭐ **本人不可以被標成替身**（⛔ 只驗名詞抓不到這個）", () => {
    const wrong = ROWS.filter(
      (r) =>
        r.isStandIn &&
        (r.modelKey.split(".").pop() ?? "") === (r.championId.split(/[.-]/).pop() ?? ""),
    );
    expect(
      wrong.map((r) => `${r.championId} → ${r.modelKey}`),
      "⛔⛔ 一位英雄用著**自己的**模型卻被標成替身 ⇒\n" +
        "  ⭐ 外部編輯器會對正確的角色跳警告，而那種警告很快就會被忽略。\n" +
        "  ⇒ `isStandIn` 要問**兩個**條件：模型在替身池 **且** 這位英雄不是它的主人。",
    ).toEqual([]);
  });

  it("⭐ 而替身**真的存在**（⛔ 全 false 代表那個旗標是死的）", () => {
    const standIns = ROWS.filter((r) => r.isStandIn);
    expect(
      standIns.length,
      "⛔ 一位替身都沒有 —— 那個旗標永遠是 false ⇒ 它與不存在沒有差別",
    ).toBeGreaterThan(0);
    // ⭐ 反方向：也不可以**全部**都是替身。
    expect(standIns.length, "⛔ 每一位都是替身 ⇒ 判準壞了").toBeLessThan(ROWS.length / 2);
  });

  it("⭐ 每一列都帶得走：glb 路徑與 model 文件 digest 都在", () => {
    const bad = ROWS.filter((r) => r.glbPath === "" || (r.modelDocDigest ?? "").length < 8);
    expect(
      bad.map((r) => r.championId),
      "⛔ 少了 glbPath 或 digest ⇒ 編輯器載不到、也不知道自己過期了",
    ).toEqual([]);
  });
});

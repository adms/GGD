/**
 * ⭐⭐ **說明 token 的七色分群**（GH#935）—— 走出貨的 manifest 與出貨的 tokenizer。
 *
 * ⛔⛔ 量到的（2026-09-03）：`descriptionTokens.ts` 的 `PALETTE_OF` 是
 * **26 筆手抄**，而出貨說明裡有 **274 個**不重複 token（2,650 次出現）
 * ⇒ ⭐ 涵蓋率 **9%**。
 *
 * ⚠️ ⭐ 而票文寫的「零個 client 消費端」只對了一半 —— ⭐ 真缺口是**那張手抄表**：
 * 一份算得出來的對照表被烘成 26 行常數（第〇·四守則），
 * 而它會隨著內容長出新 token 而**靜靜地愈來愈不準**。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 產生器的 `stripQuotes` 換成 `s => s`（＝不剝角色台詞）
 *    → 🔴 ④「台詞裡的 `[…]` 不可以進 manifest」逐字指名混進來的那幾個
 * M2 `RULES` 的 scaling 那兩條搬到最後（＝ `AP加成` 會先被別群吃掉）
 *    → 🔴 ②「七群都要有 token」仍綠而 ③「已知分類」FAIL 並指名 `AP加成`
 *    ⭐ 那正是為什麼②一條不夠 —— 它對「全部塞進一群」也會過。
 */
import { describe, expect, it } from "vitest";
import MANIFEST from "../../../../docs/editor-contract/ggd-presentation-token-manifest.json" with { type: "json" };
import { tokenizeDescription, PALETTE_HEX, PALETTE_IDS } from "./import/descriptionTokens";

interface Row {
  token: string;
  uses: number;
  group: string;
}
const TOKENS = MANIFEST.tokens as ReadonlyArray<Row>;

describe("說明 token 的七色分群（GH#935）", () => {
  it("★★ ⭐ 每個 token **恰好一群**（⛔ 不是「至少一群」）", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const t of TOKENS) {
      const prev = seen.get(t.token);
      if (prev !== undefined && prev !== t.group) dupes.push(`${t.token}: ${prev} vs ${t.group}`);
      seen.set(t.token, t.group);
    }
    expect(dupes, "⛔ 同一個 token 分到兩群 ⇒ 卡面上同一個字會有兩種顏色").toEqual([]);
    const unknown = TOKENS.filter((t) => !(PALETTE_IDS as readonly string[]).includes(t.group));
    expect(unknown.map((t) => t.token), "⛔ 有 token 落在七群之外").toEqual([]);
  });

  it("★★ ⭐ **七群都有** token，而且每一群都有色碼（票文的 AC）", () => {
    const byGroup = new Map<string, number>();
    for (const t of TOKENS) byGroup.set(t.group, (byGroup.get(t.group) ?? 0) + 1);
    const empty = PALETTE_IDS.filter((g) => (byGroup.get(g) ?? 0) === 0);
    expect(empty, "⛔ 有一群沒有任何 token ⇒ 那個顏色永遠不會出現在畫面上").toEqual([]);
    const noHex = PALETTE_IDS.filter((g) => !/^#[0-9A-Fa-f]{6}$/.test(PALETTE_HEX[g] ?? ""));
    expect(noHex, "⛔ 有一群沒有合法色碼").toEqual([]);
  });

  it("⭐ 已知分類：規則的**順序**是承重的（`AP加成` 是係數，⛔ 不是效果）", () => {
    const g = (t: string): string | undefined => TOKENS.find((x) => x.token === t)?.group;
    expect(g("AP加成"), "⛔ `AP加成` 被別群吃掉了 —— 規則順序錯了").toBe("scaling");
    expect(g("被動"), "⛔ `被動` 應該是 activation").toBe("activation");
    expect(g("範圍"), "⛔ `範圍` 應該是 cast").toBe("cast");
    expect(g("普攻時"), "⛔ `普攻時` 應該是 event").toBe("event");
  });

  it("★★ ⭐⭐ **角色台詞裡的 `[…]` 不可以進 manifest**（第〇·六守則）", () => {
    // ⭐⭐ 量到的實例（2026-09-03）：把 `stripQuotes` 拿掉，manifest 從 274 變 275,
    //   ⭐ 多出來的**正好是** `[普攻觸發]` —— 它只出現在一句**角色台詞**裡。
    //
    // ⚠️⚠️ ⭐ 第一版的斷言問的是「有沒有標點開頭的 token」——⛔ 而那個猜測是錯的:
    //   台詞裡的方括號長得跟真 token **一模一樣**。
    //   ⇒ ⭐ 突變（拿掉剝台詞）**照樣綠** —— 一把只驗過自己想像的尺。
    //   ⇒ ⭐ 所以改成**逐字釘住那一個**：它進來了就代表剝台詞那一步壞了。
    expect(
      TOKENS.map((t) => t.token),
      "⛔⛔ `[普攻觸發]` 進了 manifest —— 它**只**出現在一句角色台詞裡\n" +
        "  ⇒ ⭐ `tools/presentation-tokens/gen.ts` 的 `stripQuotes` 那一步壞了（第〇·六守則）。",
    ).not.toContain("普攻觸發");
  });

  it("⭐ 反方向：出貨 tokenizer **真的用這份 manifest**（⛔ 不是各自一份）", () => {
    const sample = TOKENS.find((t) => t.group === "scaling")!;
    const nodes = tokenizeDescription(`造成 [${sample.token}] 點傷害`);
    const tok = nodes.find((n) => n.kind === "token");
    expect(tok, "⛔ tokenizer 認不出 manifest 裡的 token ⇒ 兩份走散了").toBeTruthy();
    expect(
      (tok as { palette: string }).palette,
      `⛔ tokenizer 給 \`${sample.token}\` 的群與 manifest 不一致`,
    ).toBe(sample.group);
  });

  it("⭐ 母體沒有縮水（棘輪：⛔ 少於 250 個代表掃描器瞎了）", () => {
    expect(
      TOKENS.length,
      "⛔ manifest 裡的 token 掉到 250 以下 —— 去看掃描器是不是漏了某個目錄",
    ).toBeGreaterThanOrEqual(250);
  });
});

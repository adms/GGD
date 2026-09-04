/**
 * ⭐⭐ 【`status` 是宣告，`expand()` 是事實】—— 兩者對不上就紅（GH#916）。
 *
 * Codex 編輯器 2026-09-04 的 handback 逐字要的東西：
 * > 「提供**機器可讀 capability／receipt**，讓 Editor 能 **fail-closed** 判斷。」
 *
 * ⭐ 外部編輯器挑一個 type 之前，唯一看得到的訊號是 `template@1.status`。
 * ⛔ 而 `status` 只是文件裡的一個字串 —— 它與「引擎有沒有這一族的展開路徑」
 *    （`templates/expand.ts` 的 `FAMILIES`）之間**沒有任何東西在對帳**。
 *
 * ── ⚠️ 而它壞掉的樣子是**最難查的那一種** ─────────────────────────────
 * `templateFailSoft.test.ts` 證明了系統是 **fail-soft**：一個展開不了的
 * `template.ref` **只降級那一支**，而那一支「技能還在，但**沒有模板效果**」。
 * ⇒ 一份 `status:"enabled"` 卻沒有 `FAMILIES` 條目的模板，出貨之後長成
 *   **一支靜靜地什麼都不做的技能** —— ⛔ 而編輯器那一側看到的是綠色 badge。
 * ⇒ ⭐ 這正是第一·五守則（卡片上不可以有「說了但不會發生」的字）
 *   ＋ fail-open 靜默（「選擇 fail-open 的同時要有東西 fail-loud」）的合流。
 *
 * ── ⭐ 它問的是**關係**，⛔ 不是名詞 ──────────────────────────────────
 * ⛔ 「`FAMILIES` 裡有幾個鍵」是名詞。
 * ⭐ 「**這一份模板拿自己的 defaults 去跑，展不展得開**」是關係 ——
 *    而部署／出貨正是那兩個獨立版本化的東西（模板文件 · expand.ts）相遇的那一刻。
 *
 * ── ⚠️ 它擋不住什麼（⛔ 誠實）────────────────────────────────────────
 * · ⛔ 驗不了「展開出來的效果**對不對**」—— 那是各家族自己的守衛。
 * · ⛔ 驗不了 `spawnModelFx.preset` 那條路（節點級，走 `modelFxPreset.ts`，
 *   ⭐ 它**不經過** `expand()`）—— 那一半由 `ggd-type-catalog.json` 的
 *   `params[*].fillsVia` 揭露，⛔ 這裡不重複。
 *
 * MUTATION LOG（落地前實跑，見 commit 訊息）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expand } from "./templates/expand";
import type { TemplateDoc } from "./schema/template";

const TPL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../content/ability-templates");

function templates(): TemplateDoc[] {
  return readdirSync(TPL_DIR)
    .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(TPL_DIR, f), "utf8")) as TemplateDoc)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** ⭐ 拿模板**自己的 defaults** 真的跑一次 —— ⛔ 不讀任何欄位下結論。 */
function expandsWithOwnDefaults(t: TemplateDoc): boolean {
  const params: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(t.params ?? {})) {
    if ((s as { default?: unknown })?.default !== undefined) params[k] = (s as { default?: unknown }).default;
  }
  try {
    expand(t, params);
    return true;
  } catch {
    return false;
  }
}

describe("template@1 的 status 是不是誠實的（GH#916）", () => {
  it("⭐ 量尺先自證：至少一份展得開、至少一份展不開 —— ⛔ 否則這把尺是瞎的", () => {
    const all = templates();
    expect(all.length, "⛔ 掃不到 content/ability-templates —— 掃描器壞了").toBeGreaterThan(20);
    const ok = all.filter(expandsWithOwnDefaults);
    // ⭐ 兩個方向都要量得到（CLAUDE.md：「一把只驗過單邊的尺，不算自證過」）
    expect(ok.length, "⛔ 一份都展不開 ⇒ 判準壞了，⛔ 不是內容壞了").toBeGreaterThan(10);
    expect(
      all.length - ok.length,
      "⛔ 每一份都展得開 ⇒ 這把尺量不出『展不開』，它的結論全部作廢",
    ).toBeGreaterThan(0);
  });

  it("★★ ⭐⭐ 宣告 `enabled` 的每一份，都要真的展得開", () => {
    const liars = templates()
      .filter((t) => t.status === "enabled")
      .filter((t) => !expandsWithOwnDefaults(t))
      .map((t) => `${t.id}（family="${t.family}"）`);

    expect(
      liars,
      [
        `⛔⛔ 這 ${liars.length} 份模板對外宣告 \`status: "enabled"\`，⭐ 而 \`expand()\` 拿它們`,
        "   自己的 defaults 跑就擲例外 ⇒ **`FAMILIES` 沒有這一族的展開路徑**。",
        "",
        "⚠️ ⭐ 它出貨之後的樣子，⛔ 不是「炸掉」：",
        "   系統是 **fail-soft**（`templateFailSoft.test.ts`）⇒ **只降級那一支** ⇒",
        "   ⭐ 那一支「技能還在，但**一個模板效果都沒有**」——",
        "   ⛔ 而外部編輯器看到的是一個綠色的 badge，玩家看到的是一招什麼都不做的技能。",
        "",
        "⇒ ⭐ 兩條出路（⛔ 沒有第三條）：",
        "   ① 補 `packages/shared/src/content/templates/expand.ts` 的 `FAMILIES` 條目 —— ⭐ 正解",
        '   ② 把這份模板改回 `"status": "draft"` —— 誠實，但它就不在編輯器的可挑清單上',
        "",
        "⛔ **不要改這條測試。**",
      ].join("\n"),
    ).toEqual([]);
  });

  it("★ ⭐ 反方向：宣告 `draft` 的**不可以**已經展得開（那是一塊藏起來的積木）", () => {
    // ⚠️ ⭐ 這一條是失敗形態⑫（只從一頭掃就結構上失明）的另一頭。
    // ⭐ 它抓的正是 owner 說的「做完沒收斂」：分析做完、參數寫好、引擎也接了，
    //    ⛔ 而 `status` 還停在 draft ⇒ **編輯器一輩子看不到它**。
    const hidden = templates()
      .filter((t) => t.status === "draft")
      .filter(expandsWithOwnDefaults)
      .map((t) => `${t.id}（${Object.keys(t.params ?? {}).length} 格參數）`);

    expect(
      hidden,
      [
        `⭐⭐ 這 ${hidden.length} 份模板**引擎已經接得起來了**，而它們還掛著 \`draft\` ⇒`,
        "   ⛔ 外部編輯器的可挑清單上看不到它們 ＝ owner 逐字說的",
        "   「特效分析製作完**沒有收斂成果變成積木重複使用**」。",
        "",
        '⇒ ⭐ 把 `"status"` 改成 `"enabled"` 然後 `pnpm typecat:build`。',
      ].join("\n"),
    ).toEqual([]);
  });
});

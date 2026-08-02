/**
 * expandedEffects.ts — 讀「技能真正會做什麼」，而不是「文件裡打了什麼」。
 *
 * ── 為什麼需要這個 (2026-08-02) ───────────────────────────────────────────
 *
 * 2026-08-02 有 143 支技能改用模板（`template: {ref, params}`），它們的
 * `effects` 陣列因此變成 `[]` —— 行為改由 {@link expandStackOrThrow} 在註冊時
 * 展開產生，逐位元與原本的手寫陣列相同。
 *
 * 這件事**沒有改變任何遊戲行為，卻讓三條靜態普查測試變紅**，因為它們是
 * 直接 `doc.effects.length` 掃原始 JSON 的：
 *
 *   · abilityScaling.test.ts   帶 amount 的效果 248 → 208
 *   · projectileElement.test.ts 會發射彈道的技能 53 → 48
 *
 * 那正是 CLAUDE.md 第二守則的失敗形態 ⑦：**掃屬性代替掃行為**。
 * 技能照樣發射彈道，只是「彈道長在模板裡」而不是「長在技能文件裡」。
 *
 * ── 為什麼這不是把門檻改低 ───────────────────────────────────────────────
 *
 * 修法是讓普查改讀**展開後**的形狀，而門檻**一個數字都不動**。
 * 所以那些數字回到 248 / 53 / 16 這件事本身，就是「模板轉換行為等價」的證明：
 * 少一支都代表某個模板的參數綁錯了。
 *
 * ⚠️ 不要在這裡 catch 展開失敗然後回傳 `[]` —— 那會讓一個綁壞的模板
 * 靜默降級成「這支技能本來就沒效果」，剛好是這個檔案要抓的東西。
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { expandStackOrThrow, normalizeTemplateBinding } from "../src/content/templates/expand";
import { zTemplateDoc, type TemplateDoc } from "../src/content/schema/template";

const CONTENT = fileURLToPath(new URL("../../../content/", import.meta.url));

/** 出貨的模板文件，以 id 索引。 */
export const TEMPLATES: ReadonlyMap<string, TemplateDoc> = (() => {
  const dir = join(CONTENT, "ability-templates");
  const m = new Map<string, TemplateDoc>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
    const doc = zTemplateDoc.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    m.set(doc.id, doc);
  }
  return m;
})();

/** 一份技能文件（獨立檔或英雄卡裡嵌的那一份）需要的最小形狀。 */
export interface EffectsBearing {
  readonly id?: string;
  readonly template?: unknown;
  readonly effects?: unknown;
}

/**
 * 這支技能**在遊戲裡真的會跑**的 effects 樹。
 *
 * 綁了模板就展開模板（原始 `effects` 依約定是 `[]`，展開的結果才是真的）；
 * 沒綁就回傳手寫的那一份。
 */
export function effectsOf(doc: EffectsBearing | undefined | null): unknown[] {
  if (!doc) return [];
  if (doc.template == null) return (doc.effects as unknown[]) ?? [];
  const binding = normalizeTemplateBinding(doc.template);
  const cards = binding.cards.map((c) => {
    const tpl = TEMPLATES.get(c.ref);
    if (!tpl) {
      throw new Error(
        `${doc.id ?? "<unknown ability>"} 綁的模板 ${c.ref} 不存在於 content/ability-templates/`,
      );
    }
    return { template: tpl, params: c.params };
  });
  return expandStackOrThrow(cards, binding.onConflict).effects as unknown[];
}

/** 綁了模板的技能有幾支（GUARD THE GUARD 用：0 代表這個解析器根本沒被用到）。 */
export function templateBoundCount(docs: readonly EffectsBearing[]): number {
  return docs.filter((d) => d.template != null).length;
}

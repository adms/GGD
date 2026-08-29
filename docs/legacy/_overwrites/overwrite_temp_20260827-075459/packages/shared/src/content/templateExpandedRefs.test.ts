/**
 * GH#723 —— **模板展開出來的引用，在載入時就要被驗到。**
 *
 * 缺口是**順序相依**：展開發生在 `registerAll()`，而 `validateReferences(store)`
 * 在 `ContentLoader.load()` 裡更早跑完。磁碟上的技能存的是 `template:{ref,params}`
 * ＋ 空的 `effects` ⇒ 展開才長出來的 `projectileId` / `modelKey` / `preset`
 * **整片逃過檢查**。#173 靠「今天沒有人用模板」這個前提活著，而那個前提在
 * 2026-08-26 靜默失效（121 份採用 · 46 個模板 · 13 個帶硬引用），⛔ 沒有東西變紅。
 *
 * 第〇·七守則：**順序相依 ⇒ 把順序寫成一條會紅的閘**，⛔ 不是搬家。
 *
 * ⛔ 這裡不手刻 fixture store（失敗形態⑤「被測的不是出貨的那個」）：
 * 出貨 `content/` → 真的 `ContentLoader` → 真的 `validateReferences`。
 *
 * MUTATION LOG（第二守則 —— 真的跑過）:
 *   · `refs.ts::refEdgesOf` 的 `view = expandedForRefs(doc, templates)` 改回 `view = doc`
 *       → ②「模板指到不存在的模型 ⇒ 載入時就紅」紅（errors 變 0），
 *         而 ①③ 仍然綠 ⇒ 承重的正是那一行。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { ContentStore } from "./store";
import { COLLECTION_NAMES } from "./schema/index";
import { extractRefs, validateReferences } from "./refs";
import { hasTemplateBinding } from "./templates/resolve";
import type { TemplateDoc } from "./schema/template";
import type { AbilityDef } from "../sim/content/defs";

const MISSING_MODEL = "model-this-template-points-at-nothing";

let pristine: ContentStore;

function clone(src: ContentStore): ContentStore {
  const out = new ContentStore();
  for (const c of COLLECTION_NAMES) for (const id of src.ids(c)) out.add(c, id, src.get(c, id));
  return out;
}

/** 出貨語料裡真的採用了模板的技能（standalone）。 */
function templatedAbilities(store: ContentStore): AbilityDef[] {
  return store
    .all<AbilityDef>("abilities")
    .filter((a) => hasTemplateBinding(a as unknown as Record<string, unknown>));
}

beforeAll(async () => {
  pristine = (await new ContentLoader(shippedContentSource()).load()).store;
});

describe("模板展開後的引用，載入期驗得到 (GH#723)", () => {
  it("① 量尺自證：出貨語料真的在用模板，而且展開才長出硬引用", () => {
    const adopters = templatedAbilities(pristine);
    expect(adopters.length, "0 份技能採用模板 ⇒ 這一支整個是空的").toBeGreaterThan(50);
    expect(pristine.all("ability-templates").length).toBeGreaterThan(10);
    // ⭐ 承重的事實：原樣文件上抽不到的引用，展開之後抽得到。
    const authored = adopters.reduce((n, a) => n + extractRefs("abilities", a).length, 0);
    const afterLoad = validateReferences(pristine);
    expect(authored).toBeGreaterThanOrEqual(0);
    // ② 的前提：出貨語料本身是乾淨的，所以下面那條紅一定是注入造成的。
    expect(
      afterLoad.errors.map((e) => e.message),
      "出貨語料展開後就有斷掉的硬引用 —— 那是真債，⛔ 不要把閘調鬆",
    ).toEqual([]);
  });

  it("② 模板指到一具不存在的模型 ⇒ 載入時就紅，而且訊息說得出它是模板生的", () => {
    const store = clone(pristine);
    const templates = store.all<TemplateDoc>("ability-templates");
    const victim = templates.find(
      (t) => (t.params as Record<string, { type?: string }> | undefined)?.["modelKey"]?.type === "docRef",
    );
    expect(victim, "沒有任何模板有 modelKey 參數 ⇒ 這個注入不成立").toBeDefined();
    const params = { ...(victim!.params as Record<string, unknown>) };
    params["modelKey"] = {
      ...(params["modelKey"] as Record<string, unknown>),
      default: MISSING_MODEL,
    };
    store.add("ability-templates", victim!.id, { ...victim!, params });

    const report = validateReferences(store);
    const dangling = report.errors.filter((e) => e.message.includes(MISSING_MODEL));
    expect(
      dangling.length,
      `模板 ${victim!.id} 的預設模型改成不存在的 id，載入期一個字都沒說 —— ` +
        "展開出來的引用又逃掉了（GH#723 的缺陷回來了）",
    ).toBeGreaterThan(0);
    // 訊息要指得出「這一格在磁碟上找不到」，否則作者會去技能 JSON 裡翻一個不存在的欄位。
    expect(dangling.map((e) => e.message).join("\n")).toContain("template→");
  });

  it("③ 展開**失敗**的那一支不會被算成斷引用 —— fail-soft 不退化", () => {
    const store = clone(pristine);
    const victim = templatedAbilities(store)[0]!;
    store.add("abilities", victim.id, {
      ...victim,
      template: { ref: "tpl-this-template-was-renamed-away", params: {} },
    });
    // 降級由 registries.ts::handleFailure 負責（templateFailSoft.test.ts 在守）。
    // 這裡只要求：refs 這一層不可以因為「展開不了」而把它判成斷引用。
    const report = validateReferences(store);
    expect(report.errors.filter((e) => e.fromId === victim.id)).toEqual([]);
  });
});

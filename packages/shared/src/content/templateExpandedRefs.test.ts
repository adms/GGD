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
import type { ParamSlot, TemplateDoc } from "./schema/template";
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
  it("① 量尺自證：出貨語料真的在用模板，而且它今天是乾淨的", () => {
    const adopters = templatedAbilities(pristine);
    expect(adopters.length, "0 份技能採用模板 ⇒ 這一支整個是空的").toBeGreaterThan(50);
    expect(pristine.all("ability-templates").length).toBeGreaterThan(10);
    // ② 的前提：出貨語料本身是乾淨的，所以下面那條紅一定是注入造成的。
    // ⚠️ 2026-08-27 量到的實況：出貨的 88 份 template 技能只引用了 **8** 個模板，
    //    而帶硬引用（modelKey/preset）的那 13 個**一個都還沒被採用** ⇒ 今天的
    //    真實斷引用是 0。⭐ 這正是「引信已點燃但還沒炸」的樣子，⛔ 不是「沒事」：
    //    ②注入的就是「有人採用了那 13 個裡的一個」這件必然會發生的事。
    expect(
      validateReferences(pristine).errors.map((e) => e.message),
      "出貨語料展開後就有斷掉的硬引用 —— 那是真債，⛔ 不要把閘調鬆",
    ).toEqual([]);
  });

  it("② 一支技能採用出貨模板、而模板參數指到不存在的模型 ⇒ 載入期就紅", () => {
    // ⭐ 受害的模板是**出貨的那 13 個帶 modelKey 的**其中一個，⛔ 不是自己編一個 ——
    //   自己編的模板只證明夾具會展開（失敗形態⑤）。
    const hasModelKeySlot = (t: TemplateDoc): boolean =>
      (t.params as Record<string, ParamSlot | undefined>)["modelKey"]?.type === "docRef";
    const candidates = pristine.all<TemplateDoc>("ability-templates").filter(hasModelKeySlot);
    expect(candidates.length, "沒有任何出貨模板帶 modelKey docRef 參數 ⇒ 注入不成立").toBeGreaterThan(
      0,
    );
    // 拿一支**沒有**模板綁定的真技能來當採用者（磁碟上它一個 modelKey 都沒有）。
    const plain = pristine
      .all<AbilityDef>("abilities")
      .find((a) => !hasTemplateBinding(a as unknown as Record<string, unknown>))!;
    expect(
      extractRefs("abilities", plain).some((e) => e.targetCollection === "models"),
      "挑到的技能磁碟上就有 models 引用 ⇒ 證不了「展開才長出來」",
    ).toBe(false);

    const tried: string[] = [];
    let dangling: string[] = [];
    for (const t of candidates) {
      const store = clone(pristine);
      store.add("abilities", plain.id, {
        ...plain,
        template: { ref: t.id, params: { modelKey: MISSING_MODEL } },
      });
      const hits = validateReferences(store)
        .errors.filter((e) => e.fromId === plain.id && e.message.includes(MISSING_MODEL))
        .map((e) => e.message);
      tried.push(`${t.id}:${hits.length}`);
      if (hits.length > 0) {
        dangling = hits;
        break;
      }
    }
    expect(
      dangling.length,
      "採用了出貨模板、把 modelKey 填成不存在的 id，而載入期一個字都沒說 —— " +
        `展開出來的引用又逃過 validateReferences 了（GH#723 的缺陷回來了）。試過：${tried.join(" ")}`,
    ).toBeGreaterThan(0);
    // 訊息要指得出「這一格在磁碟上找不到」，否則作者會去技能 JSON 裡翻一個不存在的欄位。
    expect(dangling.join("\n")).toContain("template→");
    expect(dangling.join("\n")).toContain("models/" + MISSING_MODEL);
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

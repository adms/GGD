/**
 * 社群鑄造 MVP 的**採用契約** —— 「出貨社群配方宣告的能力，目標真的做得到嗎」(GH#1159)
 *
 * ⚠️ ⛔ **這裡刻意不寫配方份數。** GH#1159 的票文通篇寫「81 名／486 槽」，而那是
 * 已經關掉的 PR #1135／#1153 的數字；2026-09-19 實際數 heroForge 的三份來源
 * （EXAMPLES ＋ ACQUIRED ＋ LOL_BATCH2）是 **52 份**。⇒ 把票上的數字抄進程式，
 * 就是 CLAUDE.md 記過的那個形狀：**一個沒有量過的統計，讀起來跟真的一模一樣**。
 * ⭐ 份數是 {@link CommunityAdoptionCensus.recipeCount} 的**輸出**，⛔ 不是這裡的註解。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 這個檔為什麼存在：同一個問題**在兩個地方各被回答一次**，而兩個答案不一樣
 * ---------------------------------------------------------------------------
 * 一份社群配方的每一格，`capabilityIds` 逐字就是它所引用模板的 `requires`
 * （`communityExamples.ts` 的 `capabilityIds: [...template.requires]`）。那串 id
 * 之後會被**兩個**互不相識的判定各讀一次：
 *
 *   ① `retrieval.ts` —— 決定哪些模板進得了 AI 候選、哪些 id 進得了
 *      `legalCapabilityIds`。它在此之前有一份私有的 `capabilityAvailable()`。
 *   ② `validation.ts` —— 決定一份回來的 proposal 要不要被擋。它在此之前有一份
 *      私有的 `capabilityState()`。
 *
 * ⚠️ 兩份是**分開寫的**，所以它們在三個地方不一致：
 *
 *   | 情形                          | ① 舊的 retrieval | ② 舊的 validation |
 *   |-------------------------------|------------------|-------------------|
 *   | `effect.dash@1`（點號拼法）    | 不可用（只認冒號）| supported         |
 *   | `knownBroken` 又在 sim 表裡    | 不可用（先看壞的）| supported（後看） |
 *   | 表上**沒有**的裸名字           | 不可用（安靜濾掉）| `unknown`（會喊） |
 *
 * ⭐ 最後一列是這張票真正的病：`retrieval` 把一個它不認得的 id **安靜地從
 * `legalCapabilityIds` 濾掉**，於是它永遠走不到 `validation` 那句會喊的
 * `capability-unknown`。⇒ 作者的「機制」分頁少了一格能力、AI 叫不出它的名字，
 * ⛔ 而沒有任何東西是紅的。CLAUDE.md 逐字：**fail-open 沒錯，靜默才是缺陷。**
 *
 * ⇒ 所以這裡只有**一個**判定 {@link capabilityAdoption}，兩邊都叫它。
 *   第〇·四守則：一個事實只有一個住處。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 合併時取**兩者中較嚴的那一邊**（fail-closed）
 * ---------------------------------------------------------------------------
 * 「這一格說不能用」與「那一格說能用」打架時，答案是**不能用** —— 因為把一個
 * 其實做不到的能力擺進候選，代價是作者做出一支**上線就是死的**內容
 * （第〇·五守則對外契約那條紅線）；反過來只是少一個選項。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 這個檔**不判斷 `content/` 有沒有採用**
 * ---------------------------------------------------------------------------
 * 那是 `content/fieldAdoption.ts` 的工作（S8「機制上線、內容 0 筆」）。這裡問的
 * 是上游的另一題：**社群配方宣告的能力，出貨目標認不認得**。兩者互補 ——
 * 一個問「有沒有人用」，一個問「用了的人會不會被擋在門外」。
 */
import type { RuntimeCapabilityManifest } from "../editorCapabilities";
import type { TemplateDoc } from "../schema/template";
import { HERO_SLOTS } from "./constants";
import type { CommunityHeroExample } from "./communityExamples";

/**
 * 判定只需要 manifest 的這六格。⛔ 刻意收窄成 `Pick<>`：測試用的假 manifest
 * （`HERO_FORGE_TEST_MANIFEST`）本來就只有這六格，收窄讓兩種呼叫端共用同一支。
 */
export type AdoptionCapabilityManifest = Pick<
  RuntimeCapabilityManifest,
  "effectKinds" | "hookEvents" | "simCapabilities" | "planned" | "unsupported" | "knownBroken"
>;

/**
 * `supported` 出貨目標做得到 · `unsupported` 明確做不到 · `unknown` 這個名字
 * 出貨目標**沒聽過**。
 *
 * ⚠️ `unknown` 與 `unsupported` 要分開報：前者多半是拼錯或一個還沒登記的新能力
 * （修法是去補登記），後者是一個已知的缺口（修法是去實作）。⛔ 合成一個
 * 「false」就是把這兩件事的差別丟掉 —— 而那正是舊 `capabilityAvailable()` 做的事。
 */
export type CapabilityAdoptionState = "supported" | "unsupported" | "unknown";

const EFFECT_ID = /^effect[.:]([^@]+)(?:@1)?$/;
const HOOK_ID = /^hook[.:]([^@]+)(?:@1)?$/;

/**
 * ⭐ **唯一**的能力判定。`retrieval` 與 `validation` 都必須走這一支。
 *
 * 順序是刻意的，由嚴到寬：
 *  1. 明確壞掉／明確不支援 → `unsupported`（⛔ 先問這個，fail-closed）
 *  2. 計畫表登記過 → 照它登記的狀態
 *  3. sim 能力表有這個鍵 → 照它的 `available`
 *  4. `effect:` / `hook:`（兩種拼法都收）→ 看出貨註冊表認不認得
 *  5. 都不是 → `unknown`
 */
export function capabilityAdoption(id: string, manifest: AdoptionCapabilityManifest): CapabilityAdoptionState {
  if (manifest.unsupported.includes(id)) return "unsupported";
  if (manifest.knownBroken.some((entry) => entry.token === id)) return "unsupported";
  const planned = manifest.planned.find((entry) => entry.key === id);
  if (planned) return planned.state === "unsupported" ? "unsupported" : "supported";
  const sim = manifest.simCapabilities[id];
  if (sim) return sim.available ? "supported" : "unsupported";
  const effect = EFFECT_ID.exec(id)?.[1];
  if (effect !== undefined) return manifest.effectKinds.includes(effect) ? "supported" : "unknown";
  const hook = HOOK_ID.exec(id)?.[1];
  if (hook !== undefined) return manifest.hookEvents.includes(hook) ? "supported" : "unknown";
  return "unknown";
}

/** `capabilityAdoption(...) === "supported"` 的簡寫，給只要 boolean 的呼叫端。 */
export function capabilityAvailable(id: string, manifest: AdoptionCapabilityManifest): boolean {
  return capabilityAdoption(id, manifest) === "supported";
}

/** 一個被社群配方宣告過的能力，加上出貨目標對它的回答。 */
export interface CommunityAdoptionRow {
  readonly capabilityId: string;
  readonly state: CapabilityAdoptionState;
  /** 宣告它的配方格，`<recipeId>.<slot>`，已排序。⭐ 有出處才叫契約。 */
  readonly declaredBy: readonly string[];
  /** 帶著這個 `requires` 的出貨模板 id，已排序。 */
  readonly templates: readonly string[];
}

/** 一格引用了目錄裡沒有、或不是 `enabled` 的模板 —— 那一格永遠建不出包。 */
export interface CommunityAdoptionBrokenRef {
  readonly recipeId: string;
  readonly slot: string;
  readonly templateRef: string;
  readonly reason: "missing" | "disabled";
}

export interface CommunityAdoptionCensus {
  readonly recipeCount: number;
  /** 逐能力一列，依 id 排序。 */
  readonly rows: readonly CommunityAdoptionRow[];
  /** `state !== "supported"` 的那幾列 —— ⭐ 這就是「宣告了但目標做不到」。 */
  readonly unadopted: readonly CommunityAdoptionRow[];
  readonly brokenRefs: readonly CommunityAdoptionBrokenRef[];
}

/**
 * 逐格走過每一份社群配方，量出它**實際宣告**的能力集合。
 *
 * ⛔ 這裡不寫死任何能力清單 —— 需求側來自配方引用的模板，供給側來自出貨的
 * manifest，兩邊都是呼叫時才算的（第〇·四守則）。清單是**輸出**，不是輸入。
 *
 * ⚠️ 它刻意用模板的 `requires` 推導，而**沒有**去跑一次
 * `createCommunityHeroRecipe()`：那一支每份要做 JSON 深拷貝、sha256 與整棵 zod
 * 解析，整個母體跑下來是分鐘級。⇒ 代價是這份普查可能與真正出貨的那條路漂掉，
 * 所以守衛那一端會**抽一份真的建出來**比對（見 `adoptionContract.test.ts`）。
 */
export function communityAdoptionCensus(
  recipes: readonly CommunityHeroExample[],
  templates: readonly TemplateDoc[],
  manifest: AdoptionCapabilityManifest,
): CommunityAdoptionCensus {
  const catalog = new Map(templates.map((template) => [template.id, template]));
  const declaredBy = new Map<string, Set<string>>();
  const carriedBy = new Map<string, Set<string>>();
  const brokenRefs: CommunityAdoptionBrokenRef[] = [];
  for (const recipe of recipes) {
    for (const slot of HERO_SLOTS) {
      const ref = recipe.moves[slot].ref;
      const template = catalog.get(ref);
      if (!template) {
        brokenRefs.push({ recipeId: recipe.id, slot, templateRef: ref, reason: "missing" });
        continue;
      }
      if (template.status !== "enabled") {
        brokenRefs.push({ recipeId: recipe.id, slot, templateRef: ref, reason: "disabled" });
        continue;
      }
      for (const id of template.requires) {
        if (!declaredBy.has(id)) declaredBy.set(id, new Set());
        if (!carriedBy.has(id)) carriedBy.set(id, new Set());
        declaredBy.get(id)!.add(`${recipe.id}.${slot}`);
        carriedBy.get(id)!.add(template.id);
      }
    }
  }
  const rows: CommunityAdoptionRow[] = [...declaredBy.keys()].sort().map((capabilityId) => ({
    capabilityId,
    state: capabilityAdoption(capabilityId, manifest),
    declaredBy: [...declaredBy.get(capabilityId)!].sort(),
    templates: [...carriedBy.get(capabilityId)!].sort(),
  }));
  return {
    recipeCount: recipes.length,
    rows,
    unadopted: rows.filter((row) => row.state !== "supported"),
    brokenRefs: brokenRefs.sort((a, b) => a.recipeId.localeCompare(b.recipeId) || a.slot.localeCompare(b.slot)),
  };
}
